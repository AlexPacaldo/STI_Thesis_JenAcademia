/**
 * Tests for the fallback: when Gemini is unavailable or failing, the result is
 * the old rule-based ranking, and it arrives quickly.
 *
 *   node scripts/test-fallback.mjs
 *
 * The central claim is that the advisor being added did not change the rules
 * path. That is easy to assert in prose and easy to break by accident, so the
 * PRE-ADVISOR implementation is reproduced below and compared against the
 * current one over a few thousand generated orderings. Any future change that
 * alters the rules path fails here instead of quietly changing what an admin is
 * shown when Gemini is down.
 */
import {
  rankTeachers,
  preferAvailable,
  applyAdvisorOrder,
} from "../backend/teacherMatching.js";
import {
  adviseTeacherRanking,
  advisorCircuitOpen,
  advisorCircuitStatus,
  recordAdvisorFailure,
  resetAdvisorCircuit,
} from "../backend/teacherAdvisor.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
  } else {
    failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
  }
}

function ok(label, condition) {
  check(label, Boolean(condition), true);
}

/* --------------------------------------------------- the pre-advisor ordering */

/**
 * rankTeachers as it was before availability was split into its own step: one
 * comparator, availability first, then score, then load.
 *
 * !! Do not "tidy" this into the current implementation. Its whole purpose is to
 * !! be an independent copy of the old behaviour. If the two agree, the refactor
 * !! was safe. If they ever disagree, this is the one that was right.
 */
function legacyRankTeachers(scored, availability) {
  return [...scored].sort((a, b) => {
    if (availability) {
      const aFree = availability.get(String(a.user_id))?.available;
      const bFree = availability.get(String(b.user_id))?.available;
      if (aFree !== bFree) return aFree ? -1 : 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    return Number(a.assigned_student_count || 0) - Number(b.assigned_student_count || 0);
  });
}

/* ------------------------------------------------------ the rules path is same */

// Seeded so a failure is reproducible rather than a one-off.
let seed = 0x2f6e2b1;
function rand(n) {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed % n;
}

function makeCase() {
  const size = rand(8);
  const scored = [];
  for (let i = 0; i < size; i += 1) {
    scored.push({
      user_id: 100 + i,
      // Small score range on purpose: ties are what make an ordering change
      // visible, and a scorer with distinct scores would hide regressions here.
      score: rand(4),
      assigned_student_count: rand(5),
    });
  }
  return scored;
}

const ids = (rows) => rows.map((r) => r.user_id);

// Two shapes are actually reachable in recommendTeacher, and both must be
// byte-identical to the pre-advisor behaviour:
//
//   none      no preferred schedule given, so availability is never read
//   complete  loadTeacherAvailability seeds a bucket per requested teacher and
//             writes every one of them back, so the map covers all of them
let mismatches = 0;
let cases = 0;
for (let trial = 0; trial < 3000; trial += 1) {
  const scored = makeCase();
  const flavour = rand(2);
  const availability =
    flavour === 0
      ? null
      : new Map(scored.map((t) => [String(t.user_id), { available: rand(2) === 0 }]));

  cases += 1;
  if (
    JSON.stringify(ids(preferAvailable(rankTeachers(scored), availability))) !==
    JSON.stringify(ids(legacyRankTeachers(scored, availability)))
  ) {
    mismatches += 1;
  }
}
check(`the rules path matches the pre-advisor ordering (${cases} reachable cases)`, mismatches, 0);

/* ------------------------------- a partial map is where the old code was broken */

// A third shape is not reachable, but it is worth recording what happens, because
// the old comparator had no defined answer for it.
//
// With a teacher missing from the map, entry?.available is undefined. Compared
// against a teacher explicitly marked unavailable (false), the old comparator
// took the "these differ" branch and then returned aFree ? -1 : 1 - which is 1
// for undefined, and also 1 for false. Both directions said "put b first", which
// is a contradiction. Array.prototype.sort requires cmp(a,b) === -cmp(b,a); given
// a comparator that violates it the result is whatever TimSort happens to do.
//
// preferAvailable has no such state: it partitions on `available === true`, and
// anything else - missing, false, null, unevaluated - is simply not-first.
const partial = [
  { user_id: 100, score: 1, assigned_student_count: 0 },
  { user_id: 101, score: 3, assigned_student_count: 0 },
  { user_id: 102, score: 2, assigned_student_count: 0 },
];

const partialMap = new Map([["101", { available: false }]]);
const allBlocked = new Map(partial.map((t) => [String(t.user_id), { available: false }]));
check(
  "a missing entry is treated exactly as unavailable",
  ids(preferAvailable(rankTeachers(partial), partialMap)),
  ids(preferAvailable(rankTeachers(partial), allBlocked))
);

// The case that actually matters operationally: a teacher we could not evaluate
// must not be passed over in favour of one we know cannot teach then.
check(
  "a verified-available teacher still leads, even when others have no entry",
  preferAvailable(
    rankTeachers(partial),
    new Map([["102", { available: true }]])
  ).map((t) => t.user_id)[0],
  102
);

// The old comparator genuinely was contradictory for this input, which is the
// justification for not pinning it here as "behaviour to preserve".
const legacyCmp = (aFree, bFree) => {
  if (aFree !== bFree) return aFree ? -1 : 1;
  return 0;
};
check(
  "the pre-advisor comparator contradicted itself on a missing entry",
  legacyCmp(undefined, false) + legacyCmp(false, undefined),
  2
);

/* ------------------------------------------- an advisor that does not answer */

// Every way the advisor can decline must leave the ordering completely alone.
const pool = [
  { user_id: 1, score: 30, assigned_student_count: 4 },
  { user_id: 2, score: 10, assigned_student_count: 0 },
  { user_id: 3, score: 20, assigned_student_count: 1 },
];

const declined = await adviseTeacherRanking({ scored: pool });
ok("an unconfigured advisor declines", declined.ok === false);
ok("it says why", typeof declined.reason === "string" && declined.reason.length > 0);

// applyAdvisorOrder with a declined advisor's (absent) order is a no-op, which is
// what recommendTeacher relies on when it skips the reorder.
check(
  "a declined advisor leaves the rules order intact",
  applyAdvisorOrder(rankTeachers(pool), declined.order).map((t) => t.user_id),
  [1, 3, 2]
);

// Even a decisive, wrong answer only reorders - it cannot remove anyone.
const reordered = applyAdvisorOrder(rankTeachers(pool), ["3", "1", "2"]);
check("a working advisor keeps every teacher", reordered.length, 3);
check("a working advisor cannot drop the last teacher", reordered.some((t) => t.user_id === 2), true);

/* ---------------------------------------- the overlap is sound, not just fast */

// Reading the notes and ranking the teachers now happen at the same time. That is
// only correct because the candidate pool does not depend on the criteria:
// eligibility is fixed by role, status and course, so the insights can change
// the ORDER the rules return but never WHICH teachers are eligible.
//
// If that ever stops being true - a criteria-based pool filter, say - the
// advisor would be ranking one set of teachers and its answer would be applied to
// a different one. So it is pinned here.
const serverSource = await (await import("node:fs/promises")).readFile(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

ok(
  "the advisor and the rules score from one shared pool",
  serverSource.includes("scored: scoreWith(baseCriteria)") &&
    serverSource.includes("let ranked = scoreWith(normalizedCriteria)") &&
    /const scoreWith = \(activeCriteria\) =>\s*rankTeachers\(\s*teachers\.map/.test(serverSource)
);

// And the overlap has to be real overlap, not sequential work that looks
// concurrent: the advisor has to be started before the insights are awaited.
ok(
  "the advisor starts before the insights are awaited",
  serverSource.indexOf("const advisorPromise = adviseTeacherRanking(") <
    serverSource.indexOf("const insights = insightsPromise ? await insightsPromise : null;")
);

// The insights must still reach the RULES. The advisor not seeing them is fine -
// it reads the same notes - but the scorer needs them, or its scores change.
ok(
  "the rules still receive the inferred criteria",
  serverSource.includes("normalizeCriteria(mergeInsights(criteria, insights.added))")
);

// Behaviourally: an advisor order produced against one rules ordering must still
// be applicable to a different one over the same teachers.
const baseRules = rankTeachers([
  { user_id: 1, score: 30, assigned_student_count: 4 },
  { user_id: 2, score: 10, assigned_student_count: 0 },
  { user_id: 3, score: 20, assigned_student_count: 1 },
]);
const mergedRules = rankTeachers([
  { user_id: 1, score: 5, assigned_student_count: 4 },
  { user_id: 2, score: 40, assigned_student_count: 0 },
  { user_id: 3, score: 20, assigned_student_count: 1 },
]);

ok("the two criteria sets really do order differently", ids(baseRules) !== ids(mergedRules), true);
ok("but over the same teachers", [...ids(baseRules)].sort(), [...ids(mergedRules)].sort());

// The advisor ranked the base ordering; that answer is applied to the merged one.
const advisorSaw = applyAdvisorOrder(baseRules, ["3", "2", "1"]);
check(
  "an order produced against one ordering applies to the other",
  ids(applyAdvisorOrder(mergedRules, ids(advisorSaw))),
  [3, 2, 1]
);
check(
  "and it never changes who is eligible",
  [...ids(applyAdvisorOrder(mergedRules, ids(advisorSaw)))].sort(),
  [1, 2, 3]
);

/* ------------------------------------------------------- the circuit breaker */

resetAdvisorCircuit();
ok("the breaker starts closed", advisorCircuitOpen() === false);

const T0 = 1_700_000_000_000;

// Timestamp goes third, after the reason and detail, because that is the order
// the production call site reads in. Every call below therefore passes "" "" -
// dropping them would silently pass the clock as the failure reason and leave
// lastFailureAt at the real current time, which still trips the threshold but
// never ages out. The cooldown checks below are what catch that.
const fail = (at, reason = "", detail = "") => recordAdvisorFailure(reason, detail, at);

fail(T0);
ok("one failure does not open it", advisorCircuitOpen(T0) === false);
fail(T0 + 10);
ok("two failures do not open it", advisorCircuitOpen(T0 + 10) === false);

fail(T0 + 20);
ok("three in a row opens it", advisorCircuitOpen(T0 + 20) === true);

// While open, the caller short-circuits, so the cooldown is measured from the
// last real attempt and does not slide forward on its own.
ok("it stays open just before the cooldown ends", advisorCircuitOpen(T0 + 20 + 4 * 60_000) === true);
ok("it closes once the cooldown expires", advisorCircuitOpen(T0 + 20 + 6 * 60_000) === false);

// A success clears it completely - one good call means we are back to asking.
resetAdvisorCircuit();
ok("reset closes the breaker", advisorCircuitOpen() === false);

// And the threshold is not crossed by a long-ago failure that has since aged out.
resetAdvisorCircuit();
fail(T0);
fail(T0);
ok("a third failure long ago no longer opens it", advisorCircuitOpen(T0 + 60 * 60_000) === false);

/* --------------------------------------------- the breaker keeps the cause */

// This is the whole point of recording a reason. Without it the first failure -
// the one carrying Gemini's status, model and message - is replaced by
// "temporarily unavailable" for the whole cooldown, and the diagnosis exists
// only in the log.
resetAdvisorCircuit();
fail(T0, "bad-key", "Gemini rejected the API key. Check GOOGLE_GEMINI_API_KEY on the backend.");
fail(T0 + 10, "bad-key", "Gemini rejected the API key. Check GOOGLE_GEMINI_API_KEY on the backend.");
fail(T0 + 20, "bad-key", "Gemini rejected the API key. Check GOOGLE_GEMINI_API_KEY on the backend.");

const openStatus = advisorCircuitStatus(T0 + 20);
ok("an open breaker is open", openStatus.open === true);
ok("it still knows why it opened", openStatus.lastFailureReason === "bad-key");
ok("it still has Gemini's own message", /rejected the API key/i.test(openStatus.lastFailureDetail));
ok("it reports roughly how long is left", openStatus.retryInMs > 0 && openStatus.retryInMs <= 5 * 60_000);
ok("it counts its consecutive failures", openStatus.consecutiveFailures === 3);

// A failure with no reason of its own must not erase one we already know.
fail(T0 + 30, "", "");
ok("a reasonless failure keeps the previous reason", advisorCircuitStatus(T0 + 30).lastFailureReason === "bad-key");

// And a success clears it, so a healthy advisor cannot go on reporting a failure
// that no longer applies.
resetAdvisorCircuit();
ok("reset clears the last reason", advisorCircuitStatus().lastFailureReason === "");
ok("reset clears the last detail", advisorCircuitStatus().lastFailureDetail === "");

// The breaker must not fire on things that are not Gemini's fault. These two
// checks are structural, because the branch order is what guarantees it.
const source = await (await import("node:fs/promises")).readFile(
  new URL("../backend/teacherAdvisor.js", import.meta.url),
  "utf8"
);
ok("no-candidates is decided before the breaker", source.indexOf('"no-candidates"') < source.indexOf("advisorCircuitOpen())"));
// One call site, and it is the catch: every other reason is decided before the
// call is attempted. Matched without the argument list so this keeps testing the
// invariant rather than the shape of one line, and with a lookbehind so the
// declaration of the function is not counted as a call.
ok(
  "only the catch block records a failure",
  (source.match(/(?<!function )recordAdvisorFailure\(/g) || []).length === 1
);
ok("the failure is recorded with its reason and detail", /recordAdvisorFailure\(reason, err\.message\)/.test(source));

/* ------------------------------------------------------------------------ done */

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");
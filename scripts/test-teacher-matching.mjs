/**
 * Runnable check for the teacher <-> student matcher.
 *
 * There is no test framework in this repo, so this is a plain script:
 *   node scripts/test-teacher-matching.mjs
 *
 * It covers the pure scoring/selection logic plus the contract between the
 * frontend option catalogues and the backend mapping tables. If someone renames
 * an option value on one side, this fails.
 */

import {
  FOCUS_AREA_TO_SPECIALIZATION,
  LEARNING_GOAL_TO_SPECIALIZATION,
  MIN_EXPERIENCE_BY_LEVEL,
  parseSpecialization,
  parseTeacherProfileTags,
  rankTeachers,
  scoreTeacherForStudent,
  selectTeacherFromRanking,
  assessMatchStrength,
  TEACHER_BALANCE_LIMIT,
} from "../backend/teacherMatching.js";
import {
  STUDENT_CRITERIA_OPTIONS,
  TEACHER_CRITERIA_OPTIONS,
  toggleValue,
} from "../frontend/src/utils/matchingCriteria.js";
import {
  IDEAL_STUDENT_PACE_OPTIONS,
  normalizeParsedProfile,
  specializationValuesForCourses,
  SPECIALIZATION_OPTIONS,
  TEACHING_STYLE_OPTIONS,
} from "../backend/teacherResumeParser.js";

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`)
  );
}

const values = (options) => options.map(([value]) => value);

const teacher = (overrides = {}) => ({
  user_id: overrides.user_id ?? 1,
  first_name: "Test",
  last_name: "Teacher",
  bio: "",
  specialization: "",
  experience_years: 0,
  assigned_student_count: 0,
  selected_course_match: 0,
  ...overrides,
});

const bioWith = (style = [], pace = []) =>
  [
    "Ten years teaching.",
    "",
    "AI matching profile:",
    style.length ? `Teaching style: ${style.join(", ")}` : "",
    pace.length ? `Best student pace: ${pace.join(", ")}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

// ---------------------------------------------------------------- catalogues
console.log("=== option catalogues line up with the backend mapping tables ===");

check(
  "every student focusArea has a specialization mapping",
  values(STUDENT_CRITERIA_OPTIONS.focusArea).filter((v) => !FOCUS_AREA_TO_SPECIALIZATION[v]),
  []
);
check(
  "every student learningGoal has a specialization mapping",
  values(STUDENT_CRITERIA_OPTIONS.learningGoal).filter((v) => !LEARNING_GOAL_TO_SPECIALIZATION[v]),
  []
);
const knownSpecializations = new Set(values(TEACHER_CRITERIA_OPTIONS.specialization));
check(
  "focus area mappings only reference real specializations",
  [...new Set(Object.values(FOCUS_AREA_TO_SPECIALIZATION).flat())].filter(
    (v) => !knownSpecializations.has(v)
  ),
  []
);
check(
  "learning goal mappings only reference real specializations",
  [...new Set(Object.values(LEARNING_GOAL_TO_SPECIALIZATION).flat())].filter(
    (v) => !knownSpecializations.has(v)
  ),
  []
);

// Exact-overlap criteria require an IDENTICAL vocabulary on both sides.
check(
  "student learningStyle vocabulary == teacher teachingStyle vocabulary",
  values(STUDENT_CRITERIA_OPTIONS.learningStyle).sort(),
  values(TEACHER_CRITERIA_OPTIONS.teachingStyle).sort()
);
check(
  "student pace vocabulary == teacher best student pace vocabulary",
  values(STUDENT_CRITERIA_OPTIONS.pace).sort(),
  values(TEACHER_CRITERIA_OPTIONS.idealStudentPace).sort()
);
check(
  "every stored level has an experience requirement",
  ["novice-low", "intermediate-low", "intermediate-mid", "intermediate-high", "advanced"].filter(
    (l) => MIN_EXPERIENCE_BY_LEVEL[l] === undefined
  ),
  []
);

// ------------------------------------------------------------------ parsing
console.log("\n=== parsing ===");

const parsed = parseTeacherProfileTags(bioWith(["structured", "visual"], ["slow"]));
check("parses teaching style", parsed.teachingStyle, ["structured", "visual"]);
check("parses best pace", parsed.idealStudentPace, ["slow"]);
check("recognises the block", parsed.hasProfileBlock, true);
check("free text excludes the block", parsed.freeText, "Ten years teaching.");

// A bio written before "Teacher strength" was removed must still parse, with
// the stale tag ignored rather than crashing.
const stale = parseTeacherProfileTags(
  "Ten years teaching.\n\nAI matching profile:\nTeaching style: structured\nTeacher strength: patient and supportive\nBest student pace: slow"
);
check("stale Teacher strength tag is ignored", stale.teachingStyle, ["structured"]);
check("stale bio still yields the pace", stale.idealStudentPace, ["slow"]);
check("stale bio exposes no strength key", stale.teacherStrength, undefined);

const legacy = parseTeacherProfileTags("I focus on conversational practice.");
check("legacy bio has no block", legacy.hasProfileBlock, false);
check("legacy bio is all free text", legacy.freeText, "I focus on conversational practice.");

check("parses comma-joined specialization column", parseSpecialization("grammar and writing, exam preparation"), [
  "grammar and writing",
  "exam preparation",
]);
check("parses array specialization", parseSpecialization(["speaking and conversation"]), [
  "speaking and conversation",
]);

// ------------------------------------------------------------------ scoring
console.log("\n=== scoring ===");

const baseCriteria = { learningGoal: [], learningStyle: [], focusArea: [], pace: [] };
const score = (t, c = baseCriteria, course = null, level = "") =>
  scoreTeacherForStudent(t, c, "", course, level).score;

// Exact structural match should beat no match.
const strong = teacher({
  user_id: 10,
  bio: bioWith(["structured"], ["slow"]),
  specialization: "grammar and writing",
  experience_years: 6,
  selected_course_match: 1,
});
const weak = teacher({ user_id: 11, bio: "I teach a bit of everything." });

check(
  "a matching profile outscores an empty one",
  score(strong, {
    ...baseCriteria,
    focusArea: ["grammar"],
    learningStyle: ["structured"],
    pace: ["slow"],
  }, 1, "intermediate-high") > score(weak, baseCriteria, 1, "intermediate-high"),
  true
);

// A word-boundary bug guard: "breeding" must not satisfy "reading".
const nameOnly = teacher({ user_id: 12, bio: "", specialization: "" });
check(
  "substring false positives are gone",
  score(nameOnly, { ...baseCriteria, focusArea: ["reading"] }) -
    score(nameOnly, baseCriteria) <= 0,
  true
);

// Trial notes are identical for every candidate, so they must not move the score.
const withNotes = scoreTeacherForStudent(weak, baseCriteria, "needs help with grammar and pronunciation", null, "");
const withoutNotes = scoreTeacherForStudent(weak, baseCriteria, "", null, "");
check("trial notes do not affect the score", withNotes.score, withoutNotes.score);

// Proficiency level now gates on experience, in both directions.
const novice = teacher({ user_id: 13, experience_years: 0, bio: bioWith([], []) });
const seasoned = teacher({ user_id: 14, experience_years: 9, bio: bioWith([], []) });
check(
  "an advanced student favours the experienced teacher",
  score(seasoned, baseCriteria, null, "advanced") > score(novice, baseCriteria, null, "advanced"),
  true
);
check(
  "an advanced student penalises the inexperienced teacher",
  score(novice, baseCriteria, null, "advanced") < score(novice, baseCriteria, null, "novice-low"),
  true
);

// Load is penalised.
const busy = teacher({ user_id: 15, bio: bioWith(["structured"], []), assigned_student_count: 3 });
const idle = teacher({ user_id: 16, bio: bioWith(["structured"], []) });
check("a loaded teacher scores lower", score(busy, baseCriteria) < score(idle, baseCriteria), true);

// A teacher always has at least one reason.
check(
  "every teacher gets a reason",
  scoreTeacherForStudent(weak, baseCriteria, "", null, "").reasons.length > 0,
  true
);

// Focus areas that share a specialization both register.
const grammarWriter = teacher({ user_id: 17, specialization: "grammar and writing" });
const bothFocus = score(grammarWriter, { ...baseCriteria, focusArea: ["grammar", "writing"] });
const oneFocus = score(grammarWriter, { ...baseCriteria, focusArea: ["grammar"] });
check("two focus areas on one specialization score higher", bothFocus > oneFocus, true);

// ----------------------------------------------------------------- selection
console.log("\n=== selection policy ===");

const ranked = rankTeachers([
  scoreTeacherForStudent(teacher({ user_id: 1, assigned_student_count: 0, bio: "generic" }), baseCriteria, "", null, ""),
  scoreTeacherForStudent(teacher({ user_id: 2, assigned_student_count: 0, bio: "generic too" }), baseCriteria, "", null, ""),
  scoreTeacherForStudent(teacher({ user_id: 3, assigned_student_count: 5, bio: "generic also" }), baseCriteria, "", null, ""),
]);

const picked = selectTeacherFromRanking(ranked, null);
check(
  "an under-limit teacher is preferred over an overloaded one",
  picked.assigned.assigned_student_count < TEACHER_BALANCE_LIMIT,
  true
);
check("no least-loaded fallback when someone is under the cap", picked.usedLeastLoadedFallback, false);

const allBusy = rankTeachers([
  scoreTeacherForStudent(teacher({ user_id: 4, assigned_student_count: 4 }), baseCriteria, "", null, ""),
  scoreTeacherForStudent(teacher({ user_id: 5, assigned_student_count: 2 }), baseCriteria, "", null, ""),
]);
const fallback = selectTeacherFromRanking(allBusy, null);
check("least-loaded fallback kicks in when everyone is at the cap", fallback.usedLeastLoadedFallback, true);
check("fallback picks the lightest load", fallback.assigned.assigned_student_count, 2);

const withPreference = selectTeacherFromRanking(ranked, "3");
check(
  "a manual pick is honoured only while under the cap",
  withPreference.assigned.user_id,
  ranked.find((t) => t.assigned_student_count < TEACHER_BALANCE_LIMIT).user_id
);

const preferredFree = selectTeacherFromRanking(ranked, "1");
check("a valid manual pick is respected", preferredFree.assigned.user_id, 1);

// ---------------------------------------------------------------- utilities
console.log("\n=== multi-select helper ===");
check("toggles on", toggleValue([], "a"), ["a"]);
check("toggles off", toggleValue(["a", "b"], "a"), ["b"]);
check("appends without duplicates", toggleValue(["a"], "b"), ["a", "b"]);

// ------------------------------------------------------- resume auto-fill
// The resume reader has its own copy of the option vocabulary so it can build
// the model's response schema. That copy is worthless if it drifts from the
// frontend: the model would emit values no chip can hold and the matcher would
// score nothing. Same rule as the checks above.
console.log("\n=== resume auto-fill vocabulary ===");

const parserOptions = { specialization: SPECIALIZATION_OPTIONS, teachingStyle: TEACHING_STYLE_OPTIONS, idealStudentPace: IDEAL_STUDENT_PACE_OPTIONS };
for (const [group, options] of Object.entries(parserOptions)) {
  check(
    `resume parser ${group} vocabulary == the Create Teacher form`,
    options.map((option) => option.value).sort(),
    values(TEACHER_CRITERIA_OPTIONS[group]).sort()
  );
}
check(
  "resume parser course allowlists == the Create Teacher form",
  SPECIALIZATION_OPTIONS.map((option) => [option.value, option.courses]),
  TEACHER_CRITERIA_OPTIONS.specialization.map(([value, , allowedCourses]) => [value, allowedCourses])
);

check(
  "specializations are filtered by the selected courses",
  specializationValuesForCourses(["IELTS"]),
  ["grammar and writing", "reading and vocabulary", "listening and pronunciation", "exam preparation"]
);
check("every specialization is allowed when no course is picked yet", specializationValuesForCourses([]).length, values(TEACHER_CRITERIA_OPTIONS.specialization).length);

console.log("\n=== resume auto-fill normalization ===");
const parsedProfile = normalizeParsedProfile(
  {
    bio: "  Ten years teaching English.\n\nStrong with exam prep.  AI matching profile:\nTeaching style: structured  ",
    specialization: ["Exam Preparation", "news discussion", "underwater basket weaving", "exam preparation"],
    teachingStyle: ["Structured", "conversational", "telepathic"],
    idealStudentPace: "fast-paced",
    experienceYears: "7.6",
  },
  { courseNames: ["IELTS"] }
);
check("bio is collapsed to a single line and the profile marker stripped", parsedProfile.bio, "Ten years teaching English. Strong with exam prep.");
check("invented and out-of-scope values are dropped and duplicates collapsed", parsedProfile.specialization, ["exam preparation"]);
check("unknown teaching styles are dropped", parsedProfile.teachingStyle, ["structured", "conversational"]);
check("an option label is accepted as an alias of its value", parsedProfile.idealStudentPace, ["fast"]);
check("experience years are rounded", parsedProfile.experienceYears, 8);
check("a missing experience is null, not zero", normalizeParsedProfile({}).experienceYears, null);
check("garbage input yields empty arrays", normalizeParsedProfile(null).specialization, []);

// --- the matcher must always return somebody -----------------------------
//
// The admin's requirement: recommend the closest match, not only a perfect one.
// The bug this guards against is the candidate pool being filtered down to
// nothing, which surfaced as "No teacher found for this student" however many
// teachers existed. Selection itself has to make a pick from anything it is
// given; only an empty pool may yield nothing.

const thinTeacher = {
  user_id: 1,
  first_name: "Thin",
  last_name: "Profile",
  bio: "",
  specialization: [],
  experience_years: null,
  assigned_student_count: 0,
  selected_course_match: 1,
};
const wellMatchedTeacher = {
  user_id: 2,
  first_name: "Good",
  last_name: "Match",
  bio: "Teaches exam preparation for IELTS.",
  specialization: ["exam preparation"],
  experience_years: 8,
  assigned_student_count: 0,
  selected_course_match: 1,
};

const rankedBoth = rankTeachers([
  scoreTeacherForStudent(thinTeacher, { learningGoal: ["exam-prep"] }, "", 1, "intermediate-mid"),
  scoreTeacherForStudent(wellMatchedTeacher, { learningGoal: ["exam-prep"] }, "", 1, "intermediate-mid"),
]);
check("a better-documented teacher outranks a thin one", rankedBoth[0].user_id, 2);

const thinOnly = rankTeachers([
  scoreTeacherForStudent(thinTeacher, { learningGoal: ["exam-prep"] }, "", 1, "intermediate-mid"),
]);
check("a thin profile is still ranked, not discarded", thinOnly.length, 1);

// The guarantee: one teacher in, one teacher out.
check(
  "a single candidate is still selected",
  selectTeacherFromRanking(thinOnly, null).assigned?.user_id,
  1
);
check(
  "selection prefers a strong match when both exist",
  selectTeacherFromRanking(rankedBoth, null).assigned?.user_id,
  2
);

// Nobody is over the balance limit here, so this is not the least-loaded path.
check("the least-loaded fallback is not reported", selectTeacherFromRanking(thinOnly, null).usedLeastLoadedFallback, false);

// Only an empty pool may return nothing - that is the case the route now
// distinguishes into "no teachers" and "none for this course".
const emptyPick = selectTeacherFromRanking([], null);
check("an empty pool selects nobody", emptyPick.assigned, null);
check("an empty pool reports no fallback", emptyPick.usedLeastLoadedFallback, false);

// Even when every teacher is at the balance limit, one is still returned.
const allAtLimit = [0, 1, 2].map((n) => ({ ...thinTeacher, user_id: 10 + n, assigned_student_count: TEACHER_BALANCE_LIMIT }));
const atLimitPick = selectTeacherFromRanking(rankTeachers(allAtLimit), null);
check("every teacher over the limit still yields one", atLimitPick.assigned !== null, true);
check("and it reports the least-loaded fallback", atLimitPick.usedLeastLoadedFallback, true);

// --- the import list in server.js must match what this module exports ------
//
// This catches the bug of adding a symbol to the import list that does not
// exist (a ReferenceError on the first call) or using one that was never
// imported. Both are invisible to `node --check`, which only parses.
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const serverSource = readFileSync(join(here, "../backend/server.js"), "utf8");
  // [^{}]* so the match cannot run past its own closing brace into an earlier
  // import block, which is what a lazy [\s\S]*? did.
  const block = serverSource.match(/import \{([^{}]*)\} from "\.\/teacherMatching\.js";/);
  check("teacherMatching import block found in server.js", Boolean(block), true);
  if (block) {
    const imported = block[1].split(",").map((s) => s.trim()).filter(Boolean);
    const exportedHere = Object.keys(await import("../backend/teacherMatching.js"));
    for (const name of imported) {
      check(`server.js imports an exported symbol: ${name}`, exportedHere.includes(name), true);
    }
    // The reverse direction matters more: TEACHER_BALANCE_LIMIT was used by the
    // new fit-check route while only existing in this module, which parses fine
    // and throws at runtime.
    for (const name of ["TEACHER_BALANCE_LIMIT", "evaluateAvailability", "AVAILABILITY_HORIZON_DAYS"]) {
      check(`server.js imports the symbol it needs: ${name}`, imported.includes(name), true);
    }
  }
}


/* --------------------------------- how good a match is this, honestly */

/**
 * The rule: if there is no perfect teacher, find the closest possible one - and
 * say that is what happened, rather than presenting the closest available as
 * though it were the right one.
 *
 * Selection already did that part. This covers the telling.
 */

// Coverage counts only what the admin actually asked for. An unstated criterion
// is not a miss.
const nobody = teacher({ user_id: 90, specialization: "business english" });
const scoredNobody = scoreTeacherForStudent(nobody, baseCriteria, "", null, "");
check("no criteria set means nothing to miss", scoredNobody.criterionTotal, 0);
check("so nothing is counted as matched", scoredNobody.criterionMatched, 0);

const partialCriteria = {
  learningGoal: ["exam-prep"],
  focusArea: ["grammar"],
  learningStyle: ["structured"],
  pace: ["slow"],
};
const partialTeacher = teacher({
  user_id: 91,
  specialization: "exam preparation",
  bio: bioWith(["structured"], []),
});
const partialScore = scoreTeacherForStudent(partialTeacher, partialCriteria, "", null, "");
check("only stated criteria are counted", partialScore.criterionTotal, 4);
check("the ones that matched are counted", partialScore.criterionMatched, 2);

// A form with one criterion must not look worse than a form with four, so the
// denominator is always the stated criteria and nothing else.
const oneOnly = scoreTeacherForStudent(
  teacher({ user_id: 92, specialization: "exam preparation" }),
  { learningGoal: ["exam-prep"] },
  "",
  null,
  ""
);
check("a single-criterion form counts as one", oneOnly.criterionTotal, 1);
check("and it matched", oneOnly.criterionMatched, 1);

// --- the verdicts ---------------------------------------------------------

check("nothing stated is unknown, not weak", assessMatchStrength({ criterionMatched: 0, criterionTotal: 0 }).level, "unknown");
check("all covered is strong", assessMatchStrength({ criterionMatched: 4, criterionTotal: 4 }).level, "strong");
check("half covered is partial", assessMatchStrength({ criterionMatched: 2, criterionTotal: 4 }).level, "partial");
check("under half is weak", assessMatchStrength({ criterionMatched: 1, criterionTotal: 4 }).level, "weak");
check("none covered is weak", assessMatchStrength({ criterionMatched: 0, criterionTotal: 3 }).level, "weak");
check("one of one is strong", assessMatchStrength({ criterionMatched: 1, criterionTotal: 1 }).level, "strong");
check("zero of one is weak", assessMatchStrength({ criterionMatched: 0, criterionTotal: 1 }).level, "weak");

// The counts travel with the verdict, so the card can state them.
const verdict = assessMatchStrength({ criterionMatched: 1, criterionTotal: 4 });
check("the verdict carries what matched", verdict.matched, 1);
check("the verdict carries what was asked", verdict.total, 4);

// Missing or junk input must not throw or invent a judgement.
check("no argument at all is unknown", assessMatchStrength().level, "unknown");
check("a negative count does not go below zero", assessMatchStrength({ criterionMatched: -3, criterionTotal: 4 }).matched, 0);

// The empty-reasons fallback must not read as a compliment. It used to say
// "balanced match based on teacher profile and current load", which described a
// teacher who matched nothing the admin asked for.
check(
  "the no-match reason is not flattering",
  /none of the stated criteria matched/i.test(
    scoreTeacherForStudent(nobody, partialCriteria, "", null, "").reasons.join(" ")
  ),
  true
);



/* ----------------------------------------------- free-text "Others" criteria */

/**
 * An "Others" value is slugged free text. It matches no catalogue entry by
 * construction, so the structured half of the scorer gives it nothing. The only
 * rule-side signal left is a whole-word hit in the teacher's own prose.
 *
 * That is precisely why coverage must count it: an "Others" value that IS in the
 * bio has been satisfied, and reporting it as a miss would fire "closest
 * available, not a strong match" on matches the advisor got exactly right.
 */

const prose = "I run sessions for adults who freeze when asked to speak. Public speaking drills.";

const proseTeacher = teacher({
  user_id: 95,
  bio: prose,
  specialization: "business english",
});

const customFocus = scoreTeacherForStudent(
  proseTeacher,
  { focusArea: ["public-speaking"], learningGoal: [], learningStyle: [], pace: [] },
  "",
  null,
  ""
);
check("a stated custom criterion still counts", customFocus.criterionTotal, 1);
check("free text found in the bio counts as covering it", customFocus.criterionMatched, 1);
check("so it is not reported as a weak match", assessMatchStrength(customFocus).level, "strong");

// Not in the bio: no rule-side signal exists at all. Still counted as a miss,
// because pretending otherwise would be inventing a match the rules never found.
const noProseTeacher = teacher({
  user_id: 96,
  bio: "Ten years teaching.",
  specialization: "business english",
});
const unmatchedCustom = scoreTeacherForStudent(
  noProseTeacher,
  { focusArea: ["public-speaking"], learningGoal: [], learningStyle: [], pace: [] },
  "",
  null,
  ""
);
check("a stated custom criterion still counts", unmatchedCustom.criterionTotal, 1);
check("a custom criterion nothing matches is a miss", unmatchedCustom.criterionMatched, 0);
check("and that reads as weak", assessMatchStrength(unmatchedCustom).level, "weak");

// The structured signal must not be undone by the free-text pass. A criterion
// matched on a specialisation stays matched even though the free-text loop runs
// later and reports no hit for it.
const structured = scoreTeacherForStudent(
  teacher({ user_id: 97, specialization: "exam preparation", bio: "Ten years teaching." }),
  { learningGoal: ["exam-prep"], focusArea: [], learningStyle: [], pace: [] },
  "",
  null,
  ""
);
check("a structured match survives the free-text pass", structured.criterionMatched, 1);

// A whole-word match only. Substring would let "read" match "reading" and
// inflate coverage on prose it never really covered.
const substringOnly = scoreTeacherForStudent(
  teacher({ user_id: 98, bio: "Bread making is a hobby of mine.", specialization: "" }),
  { focusArea: ["read"], learningGoal: [], learningStyle: [], pace: [] },
  "",
  null,
  ""
);
check("a substring in prose is not a match", substringOnly.criterionMatched, 0);

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All good.");

import {
  EXPIRY_SOON_DAYS,
  describeContractBalance,
  describeContractExpiry,
} from "../frontend/src/utils/contractExpiry.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

const NOW = new Date("2026-06-15T12:00:00.000Z");
const inDays = (n) => new Date(NOW.getTime() + n * 86400000);

/* --------------------------------------------------------- nothing to say */

check("no deadline says nothing", describeContractExpiry(null, NOW).state, "none");
check("and has no label", describeContractExpiry(null, NOW).label, "");
check("an empty string is also nothing", describeContractExpiry("", NOW).state, "none");
check("garbage is nothing, not a wrong number", describeContractExpiry("soon", NOW).state, "none");

/* -------------------------------------------------------------- long gone */

const gone = describeContractExpiry(inDays(-10), NOW);
check("the past is expired", gone.state, "expired");
check("and says so", gone.label, "Expired");
check("with a negative count", gone.daysLeft, -10);
check("and a danger tone", gone.tone, "danger");

/* ---------------------------------------------------------------- boundary */

check("the last hour still counts as a day", describeContractExpiry(inDays(0.01), NOW).daysLeft, 1);
check("exactly now is today", describeContractExpiry(NOW, NOW).state, "today");
check("tomorrow is one day", describeContractExpiry(inDays(1), NOW).label, "1 day left");
check("no stray plural on one", describeContractExpiry(inDays(1), NOW).label, "1 day left");
check("two days", describeContractExpiry(inDays(2), NOW).label, "2 days left");

/* ------------------------------------------------------------- soon window */

check("the warning window is 14 days", EXPIRY_SOON_DAYS, 14);
check("14 days is soon", describeContractExpiry(inDays(14), NOW).state, "soon");
check("15 days is not soon", describeContractExpiry(inDays(15), NOW).state, "ok");
check("soon is amber", describeContractExpiry(inDays(14), NOW).tone, "warn");
check("not soon is calm", describeContractExpiry(inDays(15), NOW).tone, "ok");

/* ----------------------------------------------------------------- far off */

const far = describeContractExpiry(inDays(80), NOW);
check("a long contract is fine", far.state, "ok");
check("and still reports a count", far.label, "80 days left");
check("and carries the date for the tooltip", far.detail.startsWith("Contract ends"), true);

/* ---------------------------------------------------------------- balance */

// The two limits are independent. This is the case a bare "classes left" or a
// bare day count hides: one class, one day, both facts needed.
const tight = describeContractBalance({ classesLeft: 1, expiresAt: inDays(1), now: NOW });
check("one class left", tight.classesLeft, 1);
check("which is at risk", tight.atRisk, true);
check("and the note says both", tight.note.includes("1 class"), true);
check("and the deadline", tight.note.includes("ends in 1 day"), true);

check("no plural on one class", describeContractBalance({ classesLeft: 1, expiresAt: inDays(1), now: NOW }).note.includes("1 class left"), true);
check("plural on two", describeContractBalance({ classesLeft: 2, expiresAt: inDays(1), now: NOW }).note.includes("2 classes"), true);

// Plenty of time: no nagging note.
const relaxed = describeContractBalance({ classesLeft: 10, expiresAt: inDays(60), now: NOW });
check("a relaxed contract is not at risk", relaxed.atRisk, false);
check("and says nothing extra", relaxed.note, "");

// Classes already gone: nothing to lose, so no warning even if the term is short.
const spent = describeContractBalance({ classesLeft: 0, expiresAt: inDays(1), now: NOW });
check("a spent contract is not at risk", spent.atRisk, false);

// Contract over, classes remaining: the worst case, and it must speak up.
const lapsed = describeContractBalance({ classesLeft: 4, expiresAt: inDays(-2), now: NOW });
check("a lapsed contract with classes left is at risk", lapsed.atRisk, true);
check("and says the contract has ended", lapsed.note.includes("has ended"), true);

/* ------------------------------------------------------------- bad numbers */

check("a missing balance is zero", describeContractBalance({}, NOW).classesLeft, 0);
check("a negative balance clamps", describeContractBalance({ classesLeft: -5 }, NOW).classesLeft, 0);
check("a string number still works", describeContractBalance({ classesLeft: "3" }, NOW).classesLeft, 3);

/* ------------------------------------------------------------------ done */

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");
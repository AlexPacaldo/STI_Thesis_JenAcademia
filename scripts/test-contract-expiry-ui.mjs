import {
  EXPIRY_SOON_DAYS,
  describeContractBalance,
  describeContractExpiry,
  describeContractExpiryForStudent,
  describeCanReRequest,
  describeExtensionEligibility,
  describeStudentContract,
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
check("and says so, in the admin's words", gone.label, "Expired");
check("with a negative count", gone.daysLeft, -10);
check("and a danger tone", gone.tone, "danger");

/* ------------------------------------------------- the student's wording */

// !! Two voices, and the admin's screen must keep the one it had. The badge
// !! is on the admin's Contracts page, the teacher's list and the student's
// !! pages, and changing the admin's wording to match the student's was the
// !! wrong call - it is their working screen.
check(
  "the student hears it in their own words",
  describeContractExpiryForStudent(inDays(-10), NOW).label,
  "Ended"
);
check(
  "and the date reads as a plan",
  describeContractExpiryForStudent(inDays(-10), NOW).detail.startsWith("Your plan ended on"),
  true
);
check(
  "the admin still hears 'contract'",
  describeContractExpiry(inDays(-10), NOW).detail.startsWith("Contract ended"),
  true
);
check(
  "and the student still hears the same number of days",
  describeContractExpiryForStudent(inDays(5), NOW).label,
  describeContractExpiry(inDays(5), NOW).label
);
check(
  "and the same state",
  describeContractExpiryForStudent(inDays(5), NOW).state,
  describeContractExpiry(inDays(5), NOW).state
);

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

/* --------------------------------------------------- the whole contract object */

// describeStudentContract exists because the status can contradict the date, and
// deciding that per page means deciding it differently per page. These are the
// combinations that made the account page able to say a cancelled contract had a
// deadline it was never going to keep to.

check(
  "no package at all is its own state",
  describeStudentContract({}, NOW).state,
  "none"
);
check(
  "no package reports no numbers",
  describeStudentContract({}, NOW).left,
  null
);
check(
  "a package with no expiry date is still a package",
  describeStudentContract({ packageId: 1 }, NOW).state,
  "ok"
);

check(
  "active with time left",
  describeStudentContract({ packageId: 1, status: "active", expiresAt: inDays(60) }, NOW).state,
  "ok"
);
check(
  "active inside the warning window",
  describeStudentContract({ packageId: 1, status: "active", expiresAt: inDays(9) }, NOW).state,
  "soon"
);
check(
  "ending today reads as soon, not as a third state to handle",
  describeStudentContract({ packageId: 1, status: "active", expiresAt: inDays(0.2) }, NOW).state,
  "soon"
);

// The server's sweep normally prevents an active package whose date has passed,
// but if it happens the date is the truth and the student is told.
check(
  "active with a deadline already past reads as expired",
  describeStudentContract({ packageId: 1, status: "active", expiresAt: inDays(-3) }, NOW).state,
  "expired"
);

// Status wins over the date. Marked early or otherwise, an expired package must
// not tell a student they have time they do not have.
check(
  "expired wins over a future deadline",
  describeStudentContract({ packageId: 1, status: "expired", expiresAt: inDays(60) }, NOW).state,
  "expired"
);

// A cancelled contract's deadline is not something to plan around, so the number
// of days is dropped rather than merely styled down.
check(
  "cancelled is its own state",
  describeStudentContract({ packageId: 1, status: "cancelled", expiresAt: inDays(60) }, NOW).state,
  "cancelled"
);
check(
  "a cancelled contract claims no days left on the clock",
  describeStudentContract({ packageId: 1, status: "cancelled", expiresAt: inDays(60) }, NOW).expiry.daysLeft,
  null
);
check(
  "and no classes left to book",
  describeStudentContract({ packageId: 1, status: "cancelled", totalClasses: 10, classesUsed: 4 }, NOW).left,
  null
);

// The two class counts, which are independent of the date.
check(
  "classes left is derived when not stored",
  describeStudentContract({ packageId: 1, totalClasses: 12, classesUsed: 5 }, NOW).left,
  7
);
check(
  "a stored classes_left wins over the derived figure",
  describeStudentContract({ packageId: 1, totalClasses: 12, classesUsed: 5, classesLeft: 2 }, NOW).left,
  2
);
check(
  "an expired contract still reports what was left",
  describeStudentContract({ packageId: 1, status: "expired", totalClasses: 6, classesUsed: 0 }, NOW).left,
  6
);
check(
  "a negative classes_left cannot go negative",
  describeStudentContract({ packageId: 1, classesLeft: -4 }, NOW).left,
  0
);
check(
  "unknown totals stay unknown rather than becoming zero",
  describeStudentContract({ packageId: 1, classesUsed: 3 }, NOW).total,
  null
);

// A status the database should never hold falls back to reading the date rather
// than throwing or pretending.
check(
  "an unrecognised status falls back to the date",
  describeStudentContract({ packageId: 1, status: "paused", expiresAt: inDays(60) }, NOW).state,
  "ok"
);
check(
  "a missing status is treated as active",
  describeStudentContract({ packageId: 1, expiresAt: inDays(-1) }, NOW).state,
  "expired"
);

/* --------------------------------------------- what a student should be offered */

// The rule the client asked for. Every "extend" case below is a contract that
// ended with classes still on it - a situation that previously satisfied "no
// active package" and so offered only a NEW contract, which discards the balance
// on approval.

const live = { classes_left: 12 };
const endedWithBalance = { classes_left: 6, status: "expired" };
const endedSpent = { classes_left: 0, status: "expired" };

check(
  "a live contract with classes left offers nothing",
  describeExtensionEligibility({ activePackage: live, latestPackage: live }),
  "none"
);

check(
  "an ended contract with classes left offers an EXTENSION",
  describeExtensionEligibility({ activePackage: null, latestPackage: endedWithBalance }),
  "extend"
);
check(
  "...and never a new contract, which would discard those classes",
  describeExtensionEligibility({ activePackage: null, latestPackage: endedWithBalance }) === "new",
  false
);

check(
  "an ended contract fully used offers a new contract",
  describeExtensionEligibility({ activePackage: null, latestPackage: endedSpent }),
  "new"
);

check(
  "no package at all offers a new contract",
  describeExtensionEligibility({}),
  "new"
);

check(
  "a live contract with nothing left offers a new contract",
  describeExtensionEligibility({ activePackage: { classes_left: 0 }, latestPackage: { classes_left: 0 } }),
  "new"
);

// Exactly one of the two asks, never both.
const offers = (state) => {
  const ask = describeExtensionEligibility(state);
  return [ask === "extend", ask === "new"];
};
check("extend and new are never offered together (ended with balance)", offers({ activePackage: null, latestPackage: endedWithBalance }), [true, false]);
check("extend and new are never offered together (fully spent)", offers({ activePackage: null, latestPackage: endedSpent }), [false, true]);
check("extend and new are never offered together (live)", offers({ activePackage: live, latestPackage: live }), [false, false]);

// A stale classes_left must not offer an extension for a spent contract.
check(
  "a package reporting no classes left is not extended",
  describeExtensionEligibility({ activePackage: null, latestPackage: { classes_left: 0 } }),
  "new"
);
check(
  "a null classes_left is not treated as a balance",
  describeExtensionEligibility({ activePackage: null, latestPackage: { classes_left: null } }),
  "new"
);

/* ------------------------------------------------- what a resolved request allows */

// A decline must not be a dead end, and an approval must not offer more to ask
// for. Anything else is either a student stuck with nowhere to go, or the UI
// inviting a request that has nothing left to request.

check("no request yet means there is nothing resolved", describeCanReRequest(null), {
  showOutcome: false, canReRequest: false, canRequestNewContract: false,
});

check("a pending request is still being decided", describeCanReRequest({ status: "pending" }), {
  showOutcome: true, canReRequest: false, canRequestNewContract: false,
});

check("a declined request can be asked again", describeCanReRequest({ status: "declined" }), {
  showOutcome: true, canReRequest: true, canRequestNewContract: true,
});

check("an approved request has nothing left to ask for", describeCanReRequest({ status: "approved" }), {
  showOutcome: true, canReRequest: false, canRequestNewContract: false,
});

check("an unrecognised status is not treated as a decline", describeCanReRequest({ status: "withdrawn" }), {
  showOutcome: true, canReRequest: false, canRequestNewContract: false,
});

// Both routes appear together on a decline, because that is the only moment the
// student has a genuine choice to make.
const declined = describeCanReRequest({ status: "declined" });
check("a decline offers both routes at once", [declined.canReRequest, declined.canRequestNewContract], [true, true]);

check("an approval never opens the new-contract route", describeCanReRequest({ status: "approved" }).canRequestNewContract, false);

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");
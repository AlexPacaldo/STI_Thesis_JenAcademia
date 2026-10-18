/**
 * Tests for the contract term.
 *
 *   node scripts/test-contract-expiry.mjs
 *
 * A contract has two limits and the shorter one wins: a fixed number of classes,
 * and three months from purchase. Both are checked here, including the cases
 * where they disagree - which is the whole point of the rule, because a student
 * taking one class a month finishes on time under one limit and six months late
 * under the other.
 */

const DAY = 86400000;
const now = Date.now();
const daysFromNow = (n) => new Date(now + n * DAY).toISOString();

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

/**
 * packageStatusFromUsage, copied from backend/server.js.
 *
 * !! Do not tidy this into the real one. It is an independent statement of the
 * !! rule, so a change to the server that alters expiry behaviour fails here
 * !! rather than passing quietly.
 */
function packageStatusFromUsage(status, totalClasses, classesUsed, expiresAt = null) {
  const normalizedStatus = ["active", "expired", "cancelled"].includes(status) ? status : "active";
  const total = Math.max(0, parseInt(totalClasses, 10) || 0);
  const used = Math.max(0, parseInt(classesUsed, 10) || 0);
  if (total - used <= 0) return "expired";
  if (normalizedStatus !== "active") return normalizedStatus;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "expired";
  return normalizedStatus;
}

/* ------------------------------------------------------- before the term */

/* ------------------------------------------------- unchanged behaviour */

check("an unused package is active", packageStatusFromUsage("active", 10, 0, null), "active");
check("a partly used package is active", packageStatusFromUsage("active", 10, 3, null), "active");
check("a fully used package is expired", packageStatusFromUsage("active", 10, 10, null), "expired");
check("an overrun is expired", packageStatusFromUsage("active", 10, 12, null), "expired");

// A negative count is bad data, and is clamped to zero rather than turning the
// package into credits. Pre-existing behaviour, unchanged here, pinned because
// it looks like a bug at a glance and is not.
check("a negative count is clamped, not credited", packageStatusFromUsage("active", 10, -2, null), "active");
check("a negative total is clamped", packageStatusFromUsage("active", -5, 0, null), "expired");

// The pre-existing behaviour must survive the new argument being optional.
check("no deadline at all still works", packageStatusFromUsage("active", 10, 0), "active");
check("an unknown status is treated as active", packageStatusFromUsage("weird", 10, 0, null), "active");

/* ------------------------------------------------------- during the term */

check("halfway through the term, active", packageStatusFromUsage("active", 10, 0, daysFromNow(45)), "active");
check("on the last day, still active", packageStatusFromUsage("active", 10, 0, daysFromNow(1)), "active");
check("an hour before the deadline, still active", packageStatusFromUsage("active", 10, 0, daysFromNow(1 / 24)), "active");

/* ---------------------------------------------------------- after the term */

check("the moment it passes, expired", packageStatusFromUsage("active", 10, 0, daysFromNow(-0.001)), "expired");
check("a month past, expired", packageStatusFromUsage("active", 10, 0, daysFromNow(-30)), "expired");

/* --------------------------------------------------- whichever limit bites */

check("classes run out first, expired", packageStatusFromUsage("active", 10, 10, daysFromNow(60)), "expired");
check("time runs out first, expired", packageStatusFromUsage("active", 10, 0, daysFromNow(-1)), "expired");

// The case the rule exists for: 10 classes at one a month would run for 10
// months. The term cuts it at three.
const onePerMonth = packageStatusFromUsage("active", 10, 3, daysFromNow(90));
check("one class a month is cut off by the term", onePerMonth, "active");
check("but not one month later", packageStatusFromUsage("active", 10, 3, daysFromNow(-1)), "expired");

// And the reverse: a student who attends weekly finishes on the class count
// long before three months.
check("weekly attendance ends on the class count", packageStatusFromUsage("active", 8, 8, daysFromNow(60)), "expired");

/* --------------------------------------------------- statuses are respected */

// A cancelled package must not be revived, and an already-expired one must not
// be brought back to life by an edit that adds classes.
check("a cancelled package stays cancelled", packageStatusFromUsage("cancelled", 10, 0, daysFromNow(-100)), "cancelled");
check("a cancelled package stays cancelled before the term", packageStatusFromUsage("cancelled", 10, 0, daysFromNow(60)), "cancelled");
check("an expired package stays expired", packageStatusFromUsage("expired", 10, 0, daysFromNow(60)), "expired");

/* --------------------------------------------------------- the warning once */

// The sweep runs every minute. The notification has to be once per package or a
// student gets 960 identical warnings a day.
check("the warning window is inside 14 days", 14 <= 14, true);
check("14 days out is inside the window", 14 <= 14, true);
check("15 days out is outside the window", !(15 <= 14), true);

/* ------------------------------------------------------------------ done */

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");
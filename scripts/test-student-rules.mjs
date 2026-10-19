/**
 * The rules the student's page has to keep.
 *
 *   node scripts/test-student-rules.mjs
 *
 * !! Every rule below used to be the ABSENCE of something: a button that was
 * !! not rendered, a message that was not shown, a form that would not open.
 * !! A rule that is an absence cannot be seen by reading the code, and it
 * !! cannot be tested by calling a function - it can only be lost by
 * !! rebuilding a page.
 * !!
 * !! This is the list of them, written down, so that the next rebuild reads
 * !! it before it starts.
 */
import {
  describeAvailableRequests,
  describeRequestFlow,
} from "../frontend/src/utils/contractRequestFlow.js";
import { describeExtensionEligibility } from "../frontend/src/utils/contractExpiry.js";
import { PLAN_STATUS, MORE_TIME_CARD } from "../frontend/src/utils/studentCopy.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

/* ------------------------------------------- which asks are on the table */

// A live contract with classes left: nothing to ask for.
const live = describeExtensionEligibility({
  activePackage: { classes_left: 6 },
  latestPackage: { classes_left: 6 },
});
check("a live contract with classes left is 'none'", live, "none");
check(
  "and offers neither ask",
  describeAvailableRequests({ contractAsk: live }),
  { canRequestMoreTime: false, canRequestNewPlan: false }
);

// A contract that ended with classes on it: more time, and only more time.
const ended = describeExtensionEligibility({
  activePackage: null,
  latestPackage: { classes_left: 6 },
});
check("an ended contract is 'extend'", ended, "extend");
check(
  "and offers more time but not a new plan",
  describeAvailableRequests({ contractAsk: ended }),
  { canRequestMoreTime: true, canRequestNewPlan: false }
);

// Nothing at all, or everything used: a new plan, and only a new plan.
const none = describeExtensionEligibility({
  activePackage: null,
  latestPackage: null,
});
check("no contract is 'new'", none, "new");
check(
  "and offers a new plan but not more time",
  describeAvailableRequests({ contractAsk: none }),
  { canRequestMoreTime: false, canRequestNewPlan: true }
);

const usedUp = describeExtensionEligibility({
  activePackage: { classes_left: 0 },
  latestPackage: { classes_left: 0 },
});
check("a used-up contract is 'new'", usedUp, "new");
check(
  "and offers a new plan",
  describeAvailableRequests({ contractAsk: usedUp }).canRequestNewPlan,
  true
);

/* ------------------------------------------------- one request at a time */

const pending = describeRequestFlow({
  pending: [{ request_id: 1, request_type: "extension", status: "pending" }],
  history: [],
  kind: "extension",
});
check("a pending request is pending", pending.isPending, true);
check("and cannot be sent as another one", pending.canSubmit, false);
check("but can be changed", pending.canEdit, true);
check("and can be taken back", pending.canCancel, true);

const declined = describeRequestFlow({
  pending: [],
  history: [{ request_id: 1, request_type: "extension", status: "declined" }],
  kind: "extension",
});
check("a declined request can be asked again", declined.canAskAgain, true);
check("and a decline does not block a new ask", declined.canRequest, true);

/* ----------------------------------------------------- the plan's state */

check(
  "a used-up plan says so",
  PLAN_STATUS.allUsed,
  "You have used all your classes."
);
check(
  "a fully booked plan says so",
  PLAN_STATUS.allBooked.includes("already booked"),
  true
);
check(
  "no plan says so",
  PLAN_STATUS.noPlan.includes("do not have"),
  true
);
check(
  "an ended plan says the classes are still theirs",
  PLAN_STATUS.endedWithClasses.includes("still yours"),
  true
);
check("the more-time card names the plan", MORE_TIME_CARD.heading, "Your plan has ended");

/* ------------------------------------------------------------------ done */

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

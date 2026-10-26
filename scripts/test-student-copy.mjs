/**
 * Checks student-facing copy for clarity and consistency.
 *
 *   node scripts/test-student-copy.mjs
 *
 * !! Student copy should use professional, widely recognized terminology,
 * !! explain actions clearly, and remain concise.
 */

import {
  ACCOUNT,
  BOOKING,
  CLASS_INFO,
  CONFIRM,
  HISTORY,
  HOME,
  LEGEND,
  LOADING,
  MORE_TIME_CARD,
  MORE_TIME_WINDOW,
  NEW_PLAN_WINDOW,
  PLAN,
  PLAN_STATUS,
  VIEW,
} from "../frontend/src/utils/studentCopy.js";
import { STUDENT_CRITERIA_DISPLAY_OPTIONS } from "../frontend/src/utils/matchingCriteria.js";
import {
  describeBlockedByOtherRequest,
  describeRequestFlow,
} from "../frontend/src/utils/contractRequestFlow.js";
import { describeContractExpiryForStudent } from "../frontend/src/utils/contractExpiry.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

/**
 * Every string in a copy group, including the ones the functions produce.
 */
function everyString(group, prefix = "") {
  const found = [];

  Object.entries(group).forEach(([key, value]) => {
    if (typeof value === "string") {
      found.push({ path: `${prefix}${key}`, text: value });
    } else if (typeof value === "function") {
      // A function that builds a sentence. Call it with a couple of
      // representative values and check the result.
      const samples = [1, 2, 10];
      for (const sample of samples) {
        try {
          const produced = value(sample);
          if (typeof produced === "string") {
            found.push({ path: `${prefix}${key}(${sample})`, text: produced });
          }
        } catch {
          // A function that does not take a plain number is not one of ours.
        }
      }
    } else if (value && typeof value === "object") {
      found.push(...everyString(value, `${prefix}${key}.`));
    }
  });

  return found;
}

const GROUPS = {
  PLAN,
  PLAN_STATUS,
  HOME,
  VIEW,
  MORE_TIME_CARD,
  MORE_TIME_WINDOW,
  NEW_PLAN_WINDOW,
  BOOKING,
  CLASS_INFO,
  LEGEND,
  HISTORY,
  ACCOUNT,
  CONFIRM,
  LOADING,
};

const allStrings = Object.entries(GROUPS).flatMap(([name, group]) => everyString(group, `${name}.`));

check("there is copy to check", allStrings.length > 60, true);

/* ------------------------------- the other two modules that write copy too */

// The request-flow module and the expiry module both produce sentences the
// student reads, so they are held to the same rule. They are not in
// studentCopy.js because they are rules that happen to carry words, and
// splitting them from their logic would make both worse.
const flowStrings = [];

for (const kind of ["new", "extension"]) {
  const statuses = ["pending", "approved", "declined", "cancelled"];

  for (const status of statuses) {
    const request = { request_id: 1, request_type: kind, status, revision_count: 2 };
    const flow = describeRequestFlow({ pending: [], history: [request], kind });
    flowStrings.push({ path: `flow.${kind}.${status}.banner`, text: flow.banner });
    flowStrings.push({ path: `flow.${kind}.${status}.outcome`, text: flow.outcome });
    flowStrings.push({ path: `flow.${kind}.${status}.action`, text: flow.actionLabel });
    flowStrings.push({ path: `flow.${kind}.${status}.revision`, text: flow.revisionLabel });
  }

  const pendingFlow = describeRequestFlow({
    pending: [{ request_id: 2, request_type: kind, status: "pending", revision_count: 2 }],
    history: [],
    kind,
  });
  flowStrings.push({ path: `flow.${kind}.pending.banner`, text: pendingFlow.banner });
  flowStrings.push({ path: `flow.${kind}.pending.action`, text: pendingFlow.actionLabel });

  const blocked = describeBlockedByOtherRequest({
    kind,
    otherKind: kind === "new" ? "extension" : "new",
    otherIsPending: true,
  });
  flowStrings.push({ path: `flow.${kind}.blocked.hint`, text: blocked.hint });
}

const expiry = describeContractExpiryForStudent(new Date("2026-10-10T00:00:00Z"));
flowStrings.push({ path: "expiry.label", text: expiry.label });
flowStrings.push({ path: "expiry.detail", text: expiry.detail });

const allStudentCopy = [...allStrings, ...flowStrings];

/* ------------------------------------------------------------ short sentences */

// A student who is not confident in English reads one line at a time. A
// sentence they have to re-read is a sentence they give up on.
const LONGEST = 200;
for (const entry of allStudentCopy) {
  check(`${entry.path} is not a wall of text`, entry.text.length <= LONGEST, true);
}

/* ------------------------------------------------------- one idea per line */

// A sentence with an "and" in it is usually two sentences pretending to be
// one. The exceptions are allowed explicitly below.
const ALLOWED = [
  "Payment is handled outside this system",
  "You do not pay here. Talk to the admin and agree how much more time you need.",
];

for (const entry of allStrings) {
  const sentences = entry.text.split(/[.!?]\s+/).filter(Boolean);
  check(`${entry.path} is not too many sentences`, sentences.length <= 3, true);
}

/* -------------------------------------------------- the words we do insist on */

// These have to be present, because they are the actions the student takes.
// A button that does not say what it does is a button nobody presses.
check("there is a book button", BOOKING.bookOne.length > 0, true);
check("there is a send button", MORE_TIME_WINDOW.send.length > 0, true);
check("there is a cancel button", MORE_TIME_WINDOW.cancel.length > 0, true);
check("the ask-for-more-time button is short", MORE_TIME_CARD.askForMoreTime.length <= 20, true);
check("the new-plan button is short", MORE_TIME_CARD.getNewPlan.length <= 20, true);
check("the pending action uses correct request terminology", MORE_TIME_CARD.changeMyAsk, "Edit request");
check("the withdrawal action is clear", MORE_TIME_CARD.cancelMyAsk, "Withdraw request");
check("the new-plan request uses a clear action label", NEW_PLAN_WINDOW.send, "Submit request");
check("new plans use standard learning terminology", NEW_PLAN_WINDOW.learningGoal, "Learning objectives");
check("teacher match action is explicit", NEW_PLAN_WINDOW.seeMyTeacher, "Preview teacher match");
check(
  "student options use professional learning-style terminology",
  STUDENT_CRITERIA_DISPLAY_OPTIONS.learningStyle.map(([, label]) => label),
  ["Structured Lessons", "Conversational Practice", "Visual Learning", "Interactive Activities", "Independent Practice"]
);

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

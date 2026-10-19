/**
 * Checks the words the student sees.
 *
 *   node scripts/test-student-copy.mjs
 *
 * !! A lot of the students on this app are children, and a lot of them are
 * !! not confident readers of English. The words on the Calendar are the
 * !! difference between a student understanding what to press and a student
 * !! guessing - so the language is a rule, not a preference.
 * !!
 * !! It is checked here rather than left to review, because the pressure to
 * !! use the system's vocabulary is constant: the database says "contract",
 * !! the API says "contract", the admin's screen says "contract", and the
 * !! next screen the student touches says "contract" too. Each one of those
 * !! is individually reasonable. Together they are a screen a twelve-year-old
 * !! cannot read.
 */

import {
  BANNED_STUDENT_WORDS,
  BOOKING,
  CLASS_INFO,
  CONFIRM,
  LEGEND,
  LOADING,
  MORE_TIME_CARD,
  MORE_TIME_WINDOW,
  NEW_PLAN_WINDOW,
  PLAN,
  PLAN_STATUS,
} from "../frontend/src/utils/studentCopy.js";
import {
  describeBlockedByOtherRequest,
  describeRequestFlow,
} from "../frontend/src/utils/contractRequestFlow.js";
import { describeContractExpiry } from "../frontend/src/utils/contractExpiry.js";

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
  MORE_TIME_CARD,
  MORE_TIME_WINDOW,
  NEW_PLAN_WINDOW,
  BOOKING,
  CLASS_INFO,
  LEGEND,
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

const expiry = describeContractExpiry(new Date("2026-10-10T00:00:00Z"));
flowStrings.push({ path: "expiry.label", text: expiry.label });
flowStrings.push({ path: "expiry.detail", text: expiry.detail });

const allStudentCopy = [...allStrings, ...flowStrings];

/* --------------------------------------------- no word a student may not know */

for (const entry of allStudentCopy) {
  const lower = entry.text.toLowerCase();
  for (const word of BANNED_STUDENT_WORDS) {
    // A whole word only, so "session" does not trip on "session" inside
    // another word, and the check reads as a word rather than a fragment.
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    check(`${entry.path} does not say "${word}"`, pattern.test(lower), false);
  }
}

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

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

import test from "node:test";
import assert from "node:assert/strict";
import {
  blockingReason,
  dormancyThresholdDays,
  evaluateDormancy,
  STUDENT_DORMANT_DAYS_AFTER_CONTRACT,
  STUDENT_DORMANT_DAYS_NO_CONTRACT,
  TEACHER_DORMANT_DAYS,
} from "./accountDormancy.js";
import { CONTRACT_TERM_MONTHS } from "./contractTerms.js";

const NOW = new Date("2026-10-18T00:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

/** A candidate with nothing blocking it - the baseline each test then perturbs. */
const student = (overrides = {}) => ({
  role: "student",
  has_contract: 1,
  unused_classes: 0,
  pending_contract_requests: 0,
  pending_reschedule_requests: 0,
  future_classes: 0,
  future_availability: 0,
  paying_students: 0,
  last_activity: daysAgo(10),
  ...overrides,
});

test("the student threshold is one full contract term, not a magic number", () => {
  assert.equal(STUDENT_DORMANT_DAYS_AFTER_CONTRACT, CONTRACT_TERM_MONTHS * 30);
  assert.equal(STUDENT_DORMANT_DAYS_AFTER_CONTRACT, 90);
  assert.equal(STUDENT_DORMANT_DAYS_NO_CONTRACT, 180);
  assert.ok(TEACHER_DORMANT_DAYS < STUDENT_DORMANT_DAYS_AFTER_CONTRACT, "teachers churn faster");
});

test("a student with a contract is judged on the contract, one without on sign-up", () => {
  assert.equal(dormancyThresholdDays({ role: "student", has_contract: 1 }), 90);
  assert.equal(dormancyThresholdDays({ role: "student", has_contract: 0 }), 180);
});

test("quiet inside a live contract is not churn", () => {
  // 80 days of silence, contract still running. This is a working adult, not a
  // lapsed customer, and archiving them would end classes they have paid for.
  const result = evaluateDormancy(student({ last_activity: daysAgo(80) }), NOW);
  assert.equal(result.eligible, false);
  assert.match(result.reason, /needs 90/);
});

test("paid classes block archiving outright, however long the silence", () => {
  // The case that actually matters: two years quiet, one class still on the
  // package. Time is not what makes this safe or unsafe - the balance is.
  const result = evaluateDormancy(student({ unused_classes: 6, last_activity: daysAgo(730) }), NOW);
  assert.equal(result.eligible, false);
  assert.equal(blockingReason({ unused_classes: 6 }), "has paid classes left to use");
});

test("an open request blocks archiving - the person may simply be waiting", () => {
  assert.equal(
    evaluateDormancy(student({ pending_contract_requests: 1, last_activity: daysAgo(400) }), NOW).eligible,
    false
  );
  assert.equal(
    evaluateDormancy(student({ pending_reschedule_requests: 1, last_activity: daysAgo(400) }), NOW).eligible,
    false
  );
});

test("an upcoming class blocks archiving", () => {
  assert.equal(
    evaluateDormancy(student({ future_classes: 1, last_activity: daysAgo(400) }), NOW).eligible,
    false
  );
});

test("a student past the contract end with nothing left IS archived", () => {
  const result = evaluateDormancy(
    student({ unused_classes: 0, last_activity: daysAgo(95), has_contract: 1 }),
    NOW
  );
  assert.equal(result.eligible, true);
  assert.equal(result.quietDays, 95);
  assert.match(result.reason, /contract ended/);
});

test("the boundary is inclusive of the threshold day, not one past it", () => {
  assert.equal(evaluateDormancy(student({ last_activity: daysAgo(90) }), NOW).eligible, true);
  assert.equal(evaluateDormancy(student({ last_activity: daysAgo(89) }), NOW).eligible, false);
});

test("a teacher is archived sooner, but not while a student is still paying them", () => {
  const idle = { role: "teacher", last_activity: daysAgo(70), paying_students: 0 };
  assert.equal(evaluateDormancy(idle, NOW).eligible, true);

  // Still teaching someone mid-contract. Archiving strands that student.
  const stillNeeded = { ...idle, paying_students: 2 };
  assert.equal(evaluateDormancy(stillNeeded, NOW).eligible, false);
  assert.equal(blockingReason(stillNeeded), "still teaches students with an active contract");
});

test("a teacher who marked future availability is not dormant", () => {
  const result = evaluateDormancy(
    { role: "teacher", last_activity: daysAgo(200), future_availability: 1, paying_students: 0 },
    NOW
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "has marked future availability");
});

test("admins are never candidates", () => {
  const result = evaluateDormancy({ role: "admin", last_activity: daysAgo(9999) }, NOW);
  assert.equal(result.eligible, false);
});

test("an account with no readable activity is left alone rather than guessed at", () => {
  assert.equal(evaluateDormancy(student({ last_activity: null }), NOW).eligible, false);
  assert.equal(evaluateDormancy(student({ last_activity: "not-a-date" }), NOW).eligible, false);
});

test("a mysql2 Date and an ISO string decide the same way", () => {
  const fromDate = evaluateDormancy(student({ last_activity: daysAgo(200) }), NOW);
  const fromString = evaluateDormancy(student({ last_activity: daysAgo(200).toISOString() }), NOW);
  assert.equal(fromDate.eligible, fromString.eligible);
  assert.equal(fromDate.quietDays, fromString.quietDays);
});
import test from "node:test";
import assert from "node:assert/strict";
import {
  DECLINE_REASON_MAX_LENGTH,
  DECLINE_REASON_MIN_LENGTH,
  buildOtherPartyDeclineMessage,
  buildRequesterDeclineMessage,
  normalizeDeclineReason,
} from "./rescheduleRequestFlow.js";

/* ------------------------------------------------------- the reason text */

test("a reason of a few words is accepted", () => {
  const { value, error } = normalizeDeclineReason("I have a conflict that day");
  assert.equal(value, "I have a conflict that day");
  assert.equal(error, null);
});

test("an empty reason is refused with a message that says what is wrong", () => {
  const { value, error } = normalizeDeclineReason("");
  assert.equal(value, "");
  assert.match(error, /at least 5 characters/);
});

test("a reason that is only whitespace counts as no reason", () => {
  const { value, error } = normalizeDeclineReason("   \n\t  ");
  assert.equal(value, "");
  assert.ok(error);
});

test("a too-short reason is refused", () => {
  const { value, error } = normalizeDeclineReason("busy");
  assert.equal(value, "");
  assert.ok(error);
});

test("a reason exactly on the minimum length is accepted", () => {
  const reason = "a".repeat(DECLINE_REASON_MIN_LENGTH);
  const { value, error } = normalizeDeclineReason(reason);
  assert.equal(value, reason);
  assert.equal(error, null);
});

test("a reason exactly on the maximum length is accepted", () => {
  const reason = "b".repeat(DECLINE_REASON_MAX_LENGTH);
  const { value, error } = normalizeDeclineReason(reason);
  assert.equal(value.length, DECLINE_REASON_MAX_LENGTH);
  assert.equal(error, null);
});

test("a reason over the maximum length is refused", () => {
  const reason = "c".repeat(DECLINE_REASON_MAX_LENGTH + 1);
  const { value, error } = normalizeDeclineReason(reason);
  assert.equal(value, "");
  assert.match(error, /too long/);
});

test("line breaks in the reason are collapsed so the notification stays one block", () => {
  const { value } = normalizeDeclineReason("first line\nsecond line\r\nthird line");
  assert.equal(value, "first line second line third line");
  assert.ok(!value.includes("\n"));
});

test("a reason with surrounding spaces is trimmed", () => {
  const { value } = normalizeDeclineReason("   booked a test   ");
  assert.equal(value, "booked a test");
});

/* -------------------------------------------------------- the messages */

test("the requester is told why their request was declined", () => {
  const message = buildRequesterDeclineMessage(
    "Conversational English",
    "I already have a class booked that day",
    "Alex Pacaido"
  );

  assert.match(message, /Alex Pacaido declined your reschedule request/);
  assert.match(message, /Conversational English/);
  // The panel styles a line that starts with "Reason:" - it has to be its own
  // line for that styling to apply.
  assert.ok(message.split("\n")[1].startsWith("Reason: "));
  assert.match(message, /Reason: I already have a class booked that day/);
});

test("the requester message still reads well without a decliner name", () => {
  const message = buildRequesterDeclineMessage("Conversational English", "Schedule conflict", "");
  assert.match(message, /Your reschedule request for "Conversational English" has been declined/);
  assert.match(message, /Reason: Schedule conflict/);
});

test("the other party is told the decline and the reason too", () => {
  const message = buildOtherPartyDeclineMessage(
    "Conversational English",
    "Schedule conflict",
    "Alex Pacaido"
  );

  assert.match(message, /Alex Pacaido declined the reschedule request for "Conversational English"/);
  assert.ok(message.split("\n")[1].startsWith("Reason: "));
});

test("the other party message falls back when the decliner is unknown", () => {
  const message = buildOtherPartyDeclineMessage("Conversational English", "Schedule conflict", "");
  assert.match(message, /declined the reschedule request for "Conversational English"/);
  assert.match(message, /Reason: Schedule conflict/);
});

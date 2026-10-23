import test from "node:test";
import assert from "node:assert/strict";
import {
  createVerificationCode,
  hashCode,
  hashesMatch,
  isCodeExpired,
  toSemaphoreNumber,
  PHONE_CODE_TTL_MS,
} from "./phoneVerification.js";

test("a code is always six digits, including when it starts with zero", () => {
  assert.equal(createVerificationCode(() => 0), "000000");
  assert.equal(createVerificationCode(() => 7), "000007");
  assert.equal(createVerificationCode(() => 123456), "123456");
});

test("the same code and secret produce the same hash", () => {
  assert.equal(hashCode("123456", "secret"), hashCode("123456", "secret"));
});

test("a different secret makes the hash different, so a leaked row is useless", () => {
  assert.notEqual(hashCode("123456", "secret-a"), hashCode("123456", "secret-b"));
});

test("hash comparison accepts the matching digest and refuses others", () => {
  const expected = hashCode("123456", "secret");
  assert.equal(hashesMatch(expected, expected), true);
  assert.equal(hashesMatch(expected, hashCode("123457", "secret")), false);
  assert.equal(hashesMatch(expected, ""), false);
  assert.equal(hashesMatch("", expected), false);
});

test("a code expires after its ten-minute window", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  const expiresAt = new Date(now + PHONE_CODE_TTL_MS);
  assert.equal(isCodeExpired(new Date(now + PHONE_CODE_TTL_MS - 1), now), false);
  assert.equal(isCodeExpired(expiresAt, now + PHONE_CODE_TTL_MS), true);
  assert.equal(isCodeExpired("not a date", now), true);
});

test("a +63 number becomes the local form Semaphore documents", () => {
  assert.equal(toSemaphoreNumber("+639785344325"), "09785344325");
});

test("a number that is not a Philippine mobile is refused", () => {
  for (const phone of ["+14155552671", "09785344325", "639785344325", ""]) {
    assert.equal(toSemaphoreNumber(phone), null, `${phone} should not convert`);
  }
});

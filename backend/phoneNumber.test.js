import test from "node:test";
import assert from "node:assert/strict";
import { digitsOnly, normalizePhoneNumber } from "./phoneNumber.js";

test("a Philippine mobile number written the local way becomes one number", () => {
  const result = normalizePhoneNumber("0917 123 4567");
  assert.deepEqual(result, { ok: true, value: "+639171234567" });
});

test("the same number with a country code is stored identically", () => {
  for (const written of [
    "09171234567",
    "+63 917 123 4567",
    "+639171234567",
    "639171234567",
    "(0917) 123-4567",
  ]) {
    const result = normalizePhoneNumber(written);
    assert.equal(result.ok, true, `${written} should be accepted`);
    assert.equal(result.value, "+639171234567", `${written} should normalise`);
  }
});

test("an international number keeps its country code", () => {
  assert.deepEqual(normalizePhoneNumber("+1 415 555 2671"), {
    ok: true,
    value: "+14155552671",
  });
});

test("a number with no country code is not invented", () => {
  assert.deepEqual(normalizePhoneNumber("9171234567"), {
    ok: true,
    value: "9171234567",
  });
});

test("an empty phone number is refused", () => {
  assert.equal(normalizePhoneNumber("   ").ok, false);
  assert.equal(normalizePhoneNumber(null).ok, false);
});

test("letters and markup are refused rather than stored", () => {
  for (const bad of ["call me", "0917 123 4567 <script>", "0917-abc-4567"]) {
    assert.equal(normalizePhoneNumber(bad).ok, false, `${bad} should be refused`);
  }
});

test("a number that is too short is refused", () => {
  assert.equal(normalizePhoneNumber("12345").ok, false);
});

test("a placeholder number made of one repeated digit is refused", () => {
  // !! This was real data: 99999999999 passed every length check and meant
  // !! the school had a contact number that could never be called.
  assert.equal(normalizePhoneNumber("99999999999").ok, false);
  assert.equal(normalizePhoneNumber("00000000000").ok, false);
});

test("a real number that happens to repeat is still accepted", () => {
  assert.equal(normalizePhoneNumber("09991234567").ok, true);
});

test("digitsOnly removes the separators people type", () => {
  assert.equal(digitsOnly(" +63 (917) 123-4567 "), "+639171234567");
});

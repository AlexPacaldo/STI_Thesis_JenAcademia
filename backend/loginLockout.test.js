import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLoginLockoutDuration,
  getLoginLockoutSeconds,
} from "./loginLockout.js";

test("login lockout starts after five failed attempts", () => {
  for (let attempt = 1; attempt < 5; attempt += 1) {
    assert.equal(getLoginLockoutSeconds(attempt), null);
  }
  assert.equal(getLoginLockoutSeconds(5), 30);
});

test("login lockout increases every three more failures and caps at five minutes", () => {
  assert.equal(getLoginLockoutSeconds(6), null);
  assert.equal(getLoginLockoutSeconds(7), null);
  assert.equal(getLoginLockoutSeconds(8), 45);
  assert.equal(getLoginLockoutSeconds(11), 60);
  assert.equal(getLoginLockoutSeconds(14), 180);
  assert.equal(getLoginLockoutSeconds(17), 300);
  assert.equal(getLoginLockoutSeconds(20), 300);
});

test("login lockout durations are reported in readable units", () => {
  assert.equal(formatLoginLockoutDuration(30), "30 seconds");
  assert.equal(formatLoginLockoutDuration(60), "1 minute");
  assert.equal(formatLoginLockoutDuration(180), "3 minutes");
});

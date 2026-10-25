import test from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstileToken } from "./turnstile.js";

test("Turnstile verification fails closed when the secret is missing", async () => {
  assert.deepEqual(await verifyTurnstileToken({ token: "token" }), { status: "misconfigured" });
});

test("Turnstile verification rejects a missing or oversized token without calling Cloudflare", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ success: true, action: "contact" }) };
  };

  assert.deepEqual(await verifyTurnstileToken({ token: "", secret: "secret", fetchImpl }), { status: "invalid" });
  assert.deepEqual(
    await verifyTurnstileToken({ token: "x".repeat(2049), secret: "secret", fetchImpl }),
    { status: "invalid" }
  );
  assert.equal(calls, 0);
});

test("Turnstile verification sends the secret and token to Siteverify", async () => {
  let request;
  const result = await verifyTurnstileToken({
    token: "challenge-token",
    secret: "site-secret",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ success: true, action: "contact" }) };
    },
  });

  assert.deepEqual(result, { status: "verified" });
  assert.equal(request.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.deepEqual([...request.options.body.entries()], [
    ["secret", "site-secret"],
    ["response", "challenge-token"],
  ]);
  assert.ok(request.options.signal instanceof AbortSignal);
});

test("Turnstile verification rejects unsuccessful or wrong-action tokens", async () => {
  for (const result of [
    { success: false, "error-codes": ["invalid-input-response"] },
    { success: true, action: "login" },
    { success: true },
  ]) {
    assert.deepEqual(
      await verifyTurnstileToken({
        token: "challenge-token",
        secret: "site-secret",
        fetchImpl: async () => ({ ok: true, json: async () => result }),
      }),
      { status: "invalid" }
    );
  }
});

test("Turnstile verification reports an unavailable service separately from an invalid token", async () => {
  assert.deepEqual(
    await verifyTurnstileToken({
      token: "challenge-token",
      secret: "site-secret",
      fetchImpl: async () => ({ ok: false }),
    }),
    { status: "unavailable" }
  );
  assert.deepEqual(
    await verifyTurnstileToken({
      token: "challenge-token",
      secret: "site-secret",
      fetchImpl: async () => {
        throw new Error("network failure");
      },
    }),
    { status: "unavailable" }
  );
  assert.deepEqual(
    await verifyTurnstileToken({
      token: "challenge-token",
      secret: "site-secret",
      fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("invalid JSON"); } }),
    }),
    { status: "unavailable" }
  );
});

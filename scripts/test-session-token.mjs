/**
 * Runnable check for the session token.
 *
 * There is no test framework in this repo, so this is a plain script like
 * scripts/test-teacher-matching.mjs:
 *   node scripts/test-session-token.mjs
 *
 * This is the whole of the app's authentication, so the cases that matter most
 * are the ones where a token must be REFUSED: a forged signature, a tampered
 * payload, an expired token, and a token signed with a different secret.
 */

import { readBearerToken, signSessionToken, verifySessionToken } from "../backend/sessionToken.js";

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`)
  );
}

const SECRET = "a-long-random-test-secret-value";
const NOW = 1_700_000_000_000;
const options = { secret: SECRET, now: NOW };

console.log("=== round trip ===");

const token = signSessionToken({ userId: 7, role: "admin" }, { ...options, ttlMs: 60_000 });
check("verifies a freshly signed token", verifySessionToken(token, options)?.sub, 7);
check("carries the role", verifySessionToken(token, options)?.role, "admin");
check("expires at issue time plus the ttl", verifySessionToken(token, options)?.exp, NOW + 60_000);
check("a string user id is coerced", verifySessionToken(signSessionToken({ userId: "9", role: "teacher" }, options), options)?.sub, 9);
check("token contains no readable role marker beyond the payload", token.split(".").length, 2);

console.log("\n=== must be refused ===");

// The scenario the whole module exists for: claiming to be an admin without a
// signature the server did not produce.
const forgedPayload = Buffer.from(JSON.stringify({ sub: 1, role: "admin", exp: NOW + 60_000 })).toString("base64url");
check("a hand-made admin token is refused", verifySessionToken(`${forgedPayload}.bogus`, options), null);

const [payloadPart, signature] = token.split(".");
check("a token signed with another secret is refused", verifySessionToken(token, { secret: "a-different-secret", now: NOW }), null);
check("no secret means no trust", verifySessionToken(token, { secret: "", now: NOW }), null);
check("an expired token is refused", verifySessionToken(token, { secret: SECRET, now: NOW + 60_001 }), null);
check("it is valid right up to its expiry", verifySessionToken(token, { secret: SECRET, now: NOW + 59_999 })?.sub, 7);
check("a tampered payload is refused", verifySessionToken(`${Buffer.from(JSON.stringify({ sub: 8, role: "admin", exp: NOW + 60_000 })).toString("base64url")}.${signature}`, options), null);
check("an empty token is refused", verifySessionToken("", options), null);
check("a token with no signature is refused", verifySessionToken(payloadPart, options), null);
check("a token with extra segments is refused", verifySessionToken(`${token}.extra`, options), null);
check("garbage is refused", verifySessionToken("not-a-token", options), null);
check("a non-string token is refused", verifySessionToken(undefined, options), null);
check("a truncated signature is refused", verifySessionToken(`${payloadPart}.${signature.slice(0, -2)}`, options), null);
check("a payload that is not an object is refused", verifySessionToken(`${Buffer.from('"hello"').toString("base64url")}.${signature}`, options), null);
check("a payload with no expiry is refused", verifySessionToken(`${Buffer.from(JSON.stringify({ sub: 1, role: "admin" })).toString("base64url")}.${signature}`, options), null);
check("a payload with a user id of zero is refused", verifySessionToken(`${Buffer.from(JSON.stringify({ sub: 0, role: "admin", exp: NOW + 60_000 })).toString("base64url")}.${signature}`, options), null);

console.log("\n=== issuing ===");

check("refuses to sign without a secret", (() => {
  try {
    signSessionToken({ userId: 1, role: "admin" }, { secret: "" });
    return "no throw";
  } catch (err) {
    return err.message;
  }
})(), "signSessionToken needs a secret");
check("refuses to sign without a user id", (() => {
  try {
    signSessionToken({ role: "admin" }, options);
    return "no throw";
  } catch (err) {
    return err.message;
  }
})(), "signSessionToken needs a positive userId");

console.log("\n=== header parsing ===");

check("reads a bearer header", readBearerToken({ headers: { authorization: "Bearer abc.def" } }), "abc.def");
check("is case insensitive about the scheme", readBearerToken({ headers: { authorization: "bearer abc.def" } }), "abc.def");
check("ignores a missing header", readBearerToken({ headers: {} }), null);
check("ignores a header with no token", readBearerToken({ headers: { authorization: "Bearer" } }), null);
check("ignores a non-bearer scheme", readBearerToken({ headers: { authorization: "Basic abc" } }), null);

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All good.");
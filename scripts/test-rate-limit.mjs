/**
 * Runnable check for the per-client rate limiter.
 *
 * There is no test framework in this repo, so this is a plain script like
 * scripts/test-teacher-matching.mjs:
 *   node scripts/test-rate-limit.mjs
 *
 * The window arithmetic is the part worth pinning down: an off-by-one here
 * either locks a real admin out or lets the limiter be walked straight through.
 */

import { clientKey, createRateLimiter } from "../backend/rateLimit.js";

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

/** Minimal req/res doubles: enough for the middleware and nothing more. */
function fakeExchange(ip) {
  const res = {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
    },
  };
  return { req: { ip, socket: {} }, res };
}

function send(limiter, ip) {
  const { req, res } = fakeExchange(ip);
  let passed = false;
  limiter(req, res, () => {
    passed = true;
  });
  return { passed, res };
}

console.log("=== limiting ===");

const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
check("allows requests up to the limit", [1, 2, 3].map((n) => send(limiter, "1.1.1.1").passed), [true, true, true]);
check("rejects the request past the limit", send(limiter, "1.1.1.1").passed, false);
check("rejection is a 429 with a message", send(limiter, "1.1.1.1").res.statusCode, 429);
check("remaining count reaches zero at the limit", send(limiter, "1.1.1.1").res.headers["RateLimit-Remaining"], "0");
check("rejection still carries RateLimit-Limit", send(limiter, "1.1.1.1").res.headers["RateLimit-Limit"], "3");
check("a different client has its own bucket", send(limiter, "2.2.2.2").passed, true);

console.log("\n=== window expiry ===");

let clock = 1_000_000;
const realNow = Date.now;
Date.now = () => clock;
try {
  const rolling = createRateLimiter({ windowMs: 10_000, max: 2 });
  check("exhausts the budget", [send(rolling, "3.3.3.3").passed, send(rolling, "3.3.3.3").passed], [true, true]);
  check("then blocks", send(rolling, "3.3.3.3").passed, false);

  clock += 9_000;
  check("still blocked just before the window closes", send(rolling, "3.3.3.3").passed, false);

  clock += 2_000;
  check("allowed again once the window has passed", send(rolling, "3.3.3.3").passed, true);
  check("budget restarts, it does not carry over", send(rolling, "3.3.3.3").passed, true);
  check("and runs out again", send(rolling, "3.3.3.3").passed, false);
} finally {
  Date.now = realNow;
}

console.log("\n=== misc ===");

check("clientKey falls back to the socket address", clientKey({ socket: { remoteAddress: "4.4.4.4" } }), "4.4.4.4");
check("clientKey tolerates a missing address", clientKey({ socket: {} }), "unknown");
check("rejects a nonsensical config", (() => {
  try {
    createRateLimiter({ windowMs: 0, max: 5 });
    return "no throw";
  } catch (err) {
    return err.message;
  }
})(), "createRateLimiter needs a positive windowMs and max");

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All good.");
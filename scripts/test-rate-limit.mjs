/**
 * Runnable check for the rate limiter and its counter stores.
 *
 * There is no test framework in this repo, so this is a plain script like
 * scripts/test-teacher-matching.mjs:
 *   node scripts/test-rate-limit.mjs
 *
 * The window arithmetic is the part worth pinning down: an off-by-one here
 * either locks a real admin out or lets the limiter be walked straight through.
 */

import { clientKey, createMemoryStore, createRateLimiter } from "../backend/rateLimit.js";
import { createDbStore, ensureRateLimitsTable } from "../backend/dbRateLimit.js";

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

async function send(limiter, ip) {
  const { req, res } = fakeExchange(ip);
  let passed = false;
  await limiter(req, res, () => {
    passed = true;
  });
  return { passed, res };
}

// ---------------------------------------------------------------- limiting

console.log("=== limiting ===");

const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
check(
  "allows requests up to the limit",
  [await send(limiter, "1.1.1.1"), await send(limiter, "1.1.1.1"), await send(limiter, "1.1.1.1")].map((r) => r.passed),
  [true, true, true]
);
check("rejects the request past the limit", (await send(limiter, "1.1.1.1")).passed, false);
check("rejection is a 429 with a message", (await send(limiter, "1.1.1.1")).res.statusCode, 429);
check("remaining count reaches zero at the limit", (await send(limiter, "1.1.1.1")).res.headers["RateLimit-Remaining"], "0");
check("rejection still carries RateLimit-Limit", (await send(limiter, "1.1.1.1")).res.headers["RateLimit-Limit"], "3");
check("a different client has its own bucket", (await send(limiter, "2.2.2.2")).passed, true);

// ------------------------------------------------------------- window expiry

console.log("\n=== window expiry ===");

let clock = 1_000_000;
const realNow = Date.now;
Date.now = () => clock;
try {
  const rolling = createRateLimiter({ windowMs: 10_000, max: 2 });
  check(
    "exhausts the budget",
    [(await send(rolling, "3.3.3.3")).passed, (await send(rolling, "3.3.3.3")).passed],
    [true, true]
  );
  check("then blocks", (await send(rolling, "3.3.3.3")).passed, false);

  clock += 9_000;
  check("still blocked just before the window closes", (await send(rolling, "3.3.3.3")).passed, false);

  clock += 2_000;
  check("allowed again once the window has passed", (await send(rolling, "3.3.3.3")).passed, true);
  check("budget restarts, it does not carry over", (await send(rolling, "3.3.3.3")).passed, true);
  check("and runs out again", (await send(rolling, "3.3.3.3")).passed, false);
} finally {
  Date.now = realNow;
}

// ------------------------------------------------------------ shared counter

console.log("\n=== shared (mysql) store ===");

/** Records every statement and returns a canned hit count for the SELECT. */
function fakePool({ hitCount = 1, failOn = null } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, params) {
      const flat = sql.replace(/\s+/g, " ").trim();
      statements.push({ sql: flat, params });
      if (failOn && flat.includes(failOn)) throw new Error("database is down");
      if (flat.startsWith("SELECT hit_count")) return [[{ hit_count: hitCount }]];
      return [{ affectedRows: 1 }];
    },
  };
}

const sharedPool = fakePool({ hitCount: 4 });
const shared = createDbStore({ pool: sharedPool });
const sharedResult = await shared.hit("1.2.3.4", 60_000, 1_000_000);
check("returns the count the database reports", sharedResult.count, 4);
// now=1,000,000 falls in the window that runs 960,000 -> 1,020,000, because
// the grid is aligned so every replica buckets the same instant identically.
check("reset is the end of the aligned window", sharedResult.resetAt, 1_020_000);
check(
  "records the hit with an atomic upsert",
  sharedPool.statements[0].sql.includes("ON DUPLICATE KEY UPDATE hit_count = hit_count + 1"),
  true
);
check("upsert carries the bucket and window", sharedPool.statements[0].params, ["1.2.3.4", 960_000]);
check(
  "windows align to a fixed grid so replicas agree",
  sharedPool.statements[0].params[1] % 60_000,
  0
);
check("reads the count back", sharedPool.statements[1].sql.startsWith("SELECT hit_count"), true);

const longKey = "x".repeat(400);
const truncating = createDbStore({ pool: sharedPool });
await truncating.hit(longKey, 60_000, 1_000_000);
check("an over-long key is truncated to the column width", sharedPool.statements.at(-2).params[0].length, 191);

console.log("\n=== shared store housekeeping and failure ===");

const cleanupPool = fakePool();
const cleaning = createDbStore({ pool: cleanupPool, cleanupEvery: 3 });
for (let i = 0; i < 3; i += 1) await cleaning.hit("5.5.5.5", 60_000, 1_000_000);
check("expired windows are swept every N hits", cleanupPool.statements.filter((s) => s.sql.startsWith("DELETE")).length, 1);

const brokenPool = fakePool({ failOn: "INSERT" });
// The "store unavailable, allowing request" warning on stderr below is expected
// output from this case, not a test failure.
const broken = createRateLimiter({
  windowMs: 60_000,
  max: 1,
  store: createDbStore({ pool: brokenPool }),
});
check("a store failure lets the request through", (await send(broken, "6.6.6.6")).passed, true);
check("and says so via a header", (await send(broken, "6.6.6.6")).res.headers["RateLimit-Degraded"], "1");
check("and does not report a zero remaining", (await send(broken, "6.6.6.6")).res.headers["RateLimit-Remaining"], "1");

const tablePool = fakePool();
await ensureRateLimitsTable(tablePool);
check("migration creates the counter table", tablePool.statements[0].sql.startsWith("CREATE TABLE IF NOT EXISTS api_rate_limits"), true);

// -------------------------------------------------------------------- misc

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
check("the default store is per-process memory", createMemoryStore().name, "memory");

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All good.");
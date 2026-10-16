// dbRateLimit.js
/**
 * MySQL-backed rate limit counters.
 *
 * The in-memory store in rateLimit.js only works for a single process. On
 * Railway the app runs several replicas behind a load balancer, so each one
 * counted independently and the effective limit was the per-process limit times
 * the replica count. Keeping the counters in the database makes the limit mean
 * the same thing no matter how many instances are serving.
 *
 * The write is one indexed UPSERT on a two-column table, which is negligible
 * next to the external Gemini call the guarded route then makes.
 */

export const RATE_LIMIT_TABLE = "api_rate_limits";

// VARCHAR(191) keeps bucket_key + window_start inside the InnoDB index limit.
// Client addresses are far shorter, so the truncate in hit() is only a guard
// against an unexpected value, never something that fires in normal use.
const MAX_KEY_LENGTH = 191;

const alignedWindowStart = (now, windowMs) => Math.floor(now / windowMs) * windowMs;

export async function ensureRateLimitsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      bucket_key VARCHAR(191) NOT NULL,
      window_start BIGINT UNSIGNED NOT NULL,
      hit_count INT UNSIGNED NOT NULL DEFAULT 1,
      PRIMARY KEY (bucket_key, window_start)
    )
  `);
}

/**
 * @param {Object} options
 * @param {import('mysql2/promise').Pool} options.pool
 * @param {string} [options.table]
 * @param {number} [options.cleanupEvery]  Expired-window deletes per N hits.
 */
export function createDbStore({ pool, table = RATE_LIMIT_TABLE, cleanupEvery = 25 }) {
  let sinceCleanup = 0;

  // Windows are on a fixed grid, so every instance agrees on the boundaries and
  // a row is only ever valid for one window. Dropping anything older than the
  // previous window keeps the table tiny without pulling state out from under a
  // request that is still in flight.
  const maybeCleanup = async (now, windowMs) => {
    sinceCleanup += 1;
    if (sinceCleanup < cleanupEvery) return;
    sinceCleanup = 0;
    try {
      await pool.query(`DELETE FROM ${table} WHERE window_start < ?`, [
        alignedWindowStart(now - windowMs, windowMs),
      ]);
    } catch (err) {
      // Housekeeping only. Never let it affect a request.
      console.warn("Rate limit cleanup skipped:", err.message);
    }
  };

  return {
    name: "mysql",
    async hit(key, windowMs, now) {
      const windowStart = alignedWindowStart(now, windowMs);
      const bucketKey = String(key || "unknown").slice(0, MAX_KEY_LENGTH);

      await maybeCleanup(now, windowMs);

      // Atomic increment. The primary key on (bucket_key, window_start) makes
      // this safe when two replicas record a hit at the same moment.
      await pool.query(
        `INSERT INTO ${table} (bucket_key, window_start, hit_count)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE hit_count = hit_count + 1`,
        [bucketKey, windowStart]
      );

      const [rows] = await pool.query(
        `SELECT hit_count FROM ${table} WHERE bucket_key = ? AND window_start = ? LIMIT 1`,
        [bucketKey, windowStart]
      );

      return {
        count: Number(rows?.[0]?.hit_count ?? 1),
        resetAt: windowStart + windowMs,
      };
    },
  };
}
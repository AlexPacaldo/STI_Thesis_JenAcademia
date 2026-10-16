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
 *
 * !! The bucket key is stored as a SHA-256 hash, not the raw client address,
 * !! and that is load-bearing rather than cosmetic. A VARCHAR column in a
 * !! composite primary key is measured in bytes against the InnoDB index limit
 * !! (767 on older configurations, 3072 on DYNAMIC), so a utf8mb4 VARCHAR key
 * !! can fail the CREATE outright. When it did, the startup migration exited
 * !! the process and took every replica offline. BINARY(32) is a fixed 32 bytes
 * !! whatever the column type or collation, so no key-length limit applies.
 */

export const RATE_LIMIT_TABLE = "api_rate_limits";

const alignedWindowStart = (now, windowMs) => Math.floor(now / windowMs) * windowMs;

export async function ensureRateLimitsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      bucket_hash BINARY(32) NOT NULL,
      window_start BIGINT UNSIGNED NOT NULL,
      hit_count INT UNSIGNED NOT NULL DEFAULT 1,
      PRIMARY KEY (bucket_hash, window_start)
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
      const bucketKey = String(key == null ? "unknown" : key);

      await maybeCleanup(now, windowMs);

      // Atomic increment. The primary key on (bucket_hash, window_start) makes
      // this safe when two replicas record a hit at the same moment.
      await pool.query(
        `INSERT INTO ${table} (bucket_hash, window_start, hit_count)
         VALUES (UNHEX(SHA2(?, 256)), ?, 1)
         ON DUPLICATE KEY UPDATE hit_count = hit_count + 1`,
        [bucketKey, windowStart]
      );

      const [rows] = await pool.query(
        `SELECT hit_count FROM ${table}
         WHERE bucket_hash = UNHEX(SHA2(?, 256)) AND window_start = ? LIMIT 1`,
        [bucketKey, windowStart]
      );

      return {
        count: Number(rows?.[0]?.hit_count ?? 1),
        resetAt: windowStart + windowMs,
      };
    },
  };
}
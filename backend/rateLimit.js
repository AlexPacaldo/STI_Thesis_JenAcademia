// rateLimit.js
/**
 * Fixed-window rate limiting.
 *
 * Plain module (no Express import) so it can be unit tested directly, matching
 * how teacherMatching.js is kept separate from server.js.
 *
 * Scope, stated plainly: this is ABUSE MITIGATION, NOT AUTHENTICATION. It
 * bounds how much work one client can queue in a window; it does not know who
 * the caller is and must never be described as if it did.
 *
 * Counting state lives in a "store" so it can be shared between processes. The
 * default in-memory store is only correct for a single instance - behind a load
 * balancer every process keeps its own counter and the effective limit becomes
 * the per-process limit multiplied by the process count. Use createDbStore from
 * dbRateLimit.js when more than one instance is running.
 *
 * Known and accepted: this is a FIXED window, so a caller can spend a full
 * budget just before a boundary and another immediately after, briefly
 * doubling the burst. That is the standard trade for fixed-window counting and
 * is fine for bounding a runaway loop; a sliding window would remove it at the
 * cost of considerably more bookkeeping.
 */

/**
 * Read a client address for bucketing.
 *
 * `CF-Connecting-IP` is preferred when present. Cloudflare, which fronts
 * Railway, sets it to the real client and replaces anything the client sent, so
 * unlike a forwarded header it cannot be forged to mint extra buckets.
 *
 * `req.ip` is the fallback, and it is why this function is not simply `req.ip`.
 * Measured in production, req.ip resolved to two different addresses across
 * consecutive requests from one browser, because Express unwinds to an
 * intermediate hop and the edge's address varies. That client landed in two
 * buckets, so its real allowance was the per-bucket limit doubled.
 *
 * The leftmost X-Forwarded-For entry is deliberately NOT used: clients can set
 * that themselves, which would hand an attacker a fresh bucket per request.
 */
export const clientKey = (req) => {
  // Trim before testing, not after: a whitespace-only header is truthy in
  // JavaScript, so checking first would return an empty bucket key and quietly
  // merge every such caller into one bucket.
  const connectingIp = String(req?.headers?.["cf-connecting-ip"] || "").trim();
  if (connectingIp) return connectingIp;
  return req?.ip || req?.socket?.remoteAddress || "unknown";
};

/**
 * Per-process counters. Correct for a single instance; see the note above.
 * Entries are swept on a window boundary, so the map stays bounded by the
 * number of distinct clients seen within one window rather than growing for the
 * lifetime of the process.
 */
export function createMemoryStore() {
  const hits = new Map();
  let lastSweepAt = 0;

  return {
    name: "memory",
    async hit(key, windowMs, now) {
      if (now - lastSweepAt >= windowMs) {
        for (const [sweptKey, entry] of hits) {
          if (entry.resetAt <= now) hits.delete(sweptKey);
        }
        lastSweepAt = now;
      }

      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return { count: entry.count, resetAt: entry.resetAt };
    },
  };
}

/**
 * @param {Object} options
 * @param {number} options.windowMs  Length of the counting window.
 * @param {number} options.max        Requests allowed per window. The N+1th is rejected.
 * @param {string} [options.message]  JSON body sent with a 429.
 * @param {(req: any) => string} [options.keyFn]  Bucket key; defaults to client IP.
 * @param {{ hit: Function, name?: string }} [options.store]  Shared counter state.
 * @returns {(req: any, res: any, next: Function) => Promise<void>} Express middleware.
 */
export function createRateLimiter({ windowMs, max, message, keyFn = clientKey, store = createMemoryStore() }) {
  if (!(windowMs > 0) || !(max > 0)) {
    throw new Error("createRateLimiter needs a positive windowMs and max");
  }

  return async function rateLimit(req, res, next) {
    const now = Date.now();

    let outcome;
    try {
      outcome = await store.hit(keyFn(req), windowMs, now);
    } catch (err) {
      // Fail OPEN. This is a cost guard on an optional convenience feature, so
      // a database blip must not stop an admin from creating a teacher. Worth
      // being explicit: while the store is down the route is effectively
      // unlimited, so this trades availability for the protection.
      console.warn(`Rate limiter store "${store.name || "unknown"}" unavailable, allowing request:`, err.message);
      outcome = { count: 0, resetAt: now + windowMs, degraded: true };
    }

    const count = Number(outcome?.count) || 0;
    const resetAt = Number(outcome?.resetAt) || now + windowMs;
    const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - count)));
    res.setHeader("RateLimit-Reset", String(retryAfter));
    if (outcome?.degraded) res.setHeader("RateLimit-Degraded", "1");

    if (count > max) {
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ message: message || "Too many requests. Please try again shortly." });
      return;
    }
    next();
  };
}
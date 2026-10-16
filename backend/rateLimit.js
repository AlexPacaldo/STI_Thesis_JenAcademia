// rateLimit.js
/**
 * Fixed-window, per-client rate limiting.
 *
 * Plain module (no Express import) so it can be unit tested directly, matching
 * how teacherMatching.js is kept separate from server.js.
 *
 * Scope, stated plainly: this is ABUSE MITIGATION, NOT AUTHENTICATION. It
 * bounds how much work one client can queue in a window; it does not know who
 * the caller is and must never be described as if it did.
 */

/** Read a client address, falling back when Express cannot determine one. */
export const clientKey = (req) => req.ip || req.socket?.remoteAddress || "unknown";

/**
 * @param {Object} options
 * @param {number} options.windowMs  Length of the counting window.
 * @param {number} options.max        Requests allowed per window. The N+1th is rejected.
 * @param {string} [options.message]  JSON body sent with a 429.
 * @param {(req: any) => string} [options.keyFn]  Bucket key; defaults to client IP.
 * @returns {(req: any, res: any, next: Function) => void} Express middleware.
 */
export function createRateLimiter({ windowMs, max, message, keyFn = clientKey }) {
  if (!(windowMs > 0) || !(max > 0)) {
    throw new Error("createRateLimiter needs a positive windowMs and max");
  }

  // key -> { count, resetAt }. Entries are removed by the sweep below, so the
  // map stays bounded by the number of distinct clients seen within one window
  // rather than growing for the lifetime of the process.
  const hits = new Map();
  let lastSweepAt = 0;

  const sweep = (now) => {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
    lastSweepAt = now;
  };

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (now - lastSweepAt >= windowMs) sweep(now);

    const key = keyFn(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.setHeader("RateLimit-Reset", String(retryAfter));

    if (entry.count > max) {
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ message: message || "Too many requests. Please try again shortly." });
      return;
    }
    next();
  };
}
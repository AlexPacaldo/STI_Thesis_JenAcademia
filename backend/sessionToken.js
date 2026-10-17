// sessionToken.js
/**
 * Stateless signed session tokens.
 *
 * !! Why this exists at all: /api/login returned no token. The user object was
 * !! kept in the browser and every later request simply stated which user_id it
 * !! was, which the backend believed. Nothing on the server proved identity, so
 * !! any caller could act as any account.
 *
 * The token is a signed payload rather than server-side session state, which
 * matters for this deployment specifically: the app runs on several Railway
 * replicas, and a session held in one process's memory would not be recognised
 * by the others. A signature verifies everywhere with no shared store.
 *
 * The payload still has to be corroborated against the database before an
 * action is allowed, because a token is valid until it expires even if the
 * account is archived in the meantime.
 */

import crypto from "crypto";

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

const base64url = (buffer) => Buffer.from(buffer).toString("base64url");

/**
 * HMAC over the encoded payload. Both sides are derived from the same secret,
 * so a mismatch means a different secret or a forged token.
 */
function sign(payloadEncoded, secret) {
  return crypto.createHmac("sha256", secret).update(payloadEncoded).digest("base64url");
}

/**
 * @returns {string} `payload.signature`, both base64url.
 * @throws if the user id is missing, because a token that cannot identify a
 *         caller is never useful.
 */
export function signSessionToken({ userId, role }, { secret, ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) {
  if (!secret) throw new Error("signSessionToken needs a secret");
  const sub = Number(userId);
  if (!Number.isInteger(sub) || sub <= 0) throw new Error("signSessionToken needs a positive userId");

  const payloadEncoded = base64url(
    JSON.stringify({ sub, role: String(role || ""), exp: now + ttlMs })
  );
  return `${payloadEncoded}.${sign(payloadEncoded, secret)}`;
}

/**
 * @returns {{sub: number, role: string, exp: number}|null} null for anything
 *   that is not a well-formed, correctly signed, unexpired token.
 */
export function verifySessionToken(token, { secret, now = Date.now() } = {}) {
  if (!secret || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadEncoded, signature] = parts;
  if (!payloadEncoded || !signature) return null;

  // Compare as buffers so the length check cannot leak through timing, and so
  // a malformed signature cannot throw inside timingSafeEqual.
  const expected = Buffer.from(sign(payloadEncoded, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return null;
  if (!crypto.timingSafeEqual(expected, provided)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  const sub = Number(payload.sub);
  if (!Number.isInteger(sub) || sub <= 0) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= now) return null;

  return { sub, role: String(payload.role || ""), exp: payload.exp };
}

/** Read a single cookie off the request, or null. Avoids a cookie-parser dependency. */
export function readCookie(req, name) {
  const header = req?.headers?.cookie;
  if (!header) return null;

  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

/** Pull a bearer token off the Authorization header, or null. */
export function readBearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : null;
}
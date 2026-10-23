// phoneVerification.js
/**
 * The parts of phone verification that can be reasoned about on their own:
 * making a code, hashing it, deciding whether it has expired, and turning a
 * stored +63 number into the local form Semaphore expects.
 *
 * !! The code is never stored. Only an HMAC of it is, and the secret is a
 * !! server environment variable. A six-digit code has a million possible
 * !! values, so a plain hash in the database would be reversible in a second
 * !! on any machine; the secret is what makes a leaked row useless.
 */

import crypto from "crypto";

export const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
export const PHONE_CODE_MAX_ATTEMPTS = 5;
export const PHONE_CODE_LENGTH = 6;

/**
 * @param {(min: number, max: number) => number} [randomInt] injectable so a
 *   test can be deterministic.
 */
export function createVerificationCode(randomInt = crypto.randomInt) {
  return String(randomInt(0, 1_000_000)).padStart(PHONE_CODE_LENGTH, "0");
}

export function hashCode(code, secret) {
  if (!secret) throw new Error("hashCode needs a secret");
  return crypto.createHmac("sha256", secret).update(String(code)).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function hashesMatch(expectedHex, providedHex) {
  const expected = Buffer.from(String(expectedHex || ""), "hex");
  const provided = Buffer.from(String(providedHex || ""), "hex");
  if (expected.length === 0 || expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

export function isCodeExpired(expiresAt, now = Date.now()) {
  const time = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return !Number.isFinite(time) || time <= now;
}

/**
 * Semaphore's examples use the local 09XXXXXXXXX form. Our stored numbers are
 * +63XXXXXXXXXX after normalisation, so this is the one place the conversion
 * happens.
 *
 * @returns {string|null} null for anything that is not a Philippine mobile.
 */
export function toSemaphoreNumber(phone) {
  const match = /^\+63(\d{10})$/.exec(String(phone || ""));
  return match ? `0${match[1]}` : null;
}

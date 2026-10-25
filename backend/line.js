// line.js
/**
 * LINE Messaging API client for class reminders and reschedule updates.
 *
 * !! LINE is not SMS. There is no way to send a message to a phone number: a
 * !! push needs the recipient's LINE user id (the "U..." id LINE assigns), and
 * !! that id only exists after the person has added the school's Official
 * !! Account as a friend. The linking flow in server.js exists for exactly that
 * !! reason - the student opens Account, gets a six-digit code, adds the
 * !! Official Account, and sends the code to the chat. This module only handles
 * !! the transport and the signature check; the linking rules live next to the
 * !! routes that use them.
 *
 * !! LINE Notify, which used to be the "just send a message" option, was
 * !! discontinued in 2025. The Messaging API is the replacement, and it is what
 * !! this file talks to.
 *
 * !! The channel access token is a bearer credential for the whole Official
 * !! Account: anyone holding it can message every friend of the account. It is
 * !! read from the environment on every call and never logged, stored, or
 * !! returned to the browser.
 */

import crypto from "crypto";
import { createVerificationCode, hashCode } from "./phoneVerification.js";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_BOT_INFO_URL = "https://api.line.me/v2/bot/info";
const LINE_PROFILE_URL = "https://api.line.me/v2/bot/profile";
const SEND_TIMEOUT_MS = 12_000;
const BOT_INFO_TTL_MS = 5 * 60 * 1000;

export const LINE_TEXT_MAX_LENGTH = 5000;
export const LINE_LINK_CODE_TTL_MS = 10 * 60 * 1000;

export class LineError extends Error {
  constructor(message, { cause, status = 502, retryable = true } = {}) {
    super(message);
    this.name = "LineError";
    this.status = status;
    this.retryable = retryable;
    this.cause = cause;
  }
}

function channelAccessToken() {
  return String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();
}

function channelSecret() {
  return String(process.env.LINE_CHANNEL_SECRET || "").trim();
}

export function isLineConfigured() {
  return Boolean(channelAccessToken());
}

export function isLineWebhookConfigured() {
  return Boolean(channelSecret());
}

/**
 * The id a person can search for or scan to find the Official Account.
 *
 * It is the "Basic ID" on the Messaging API channel, e.g. "@123abcde". The
 * "@" is optional in the environment because people paste it both ways.
 */
export function lineBasicId() {
  const value = String(process.env.LINE_BOT_BASIC_ID || "").trim();
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
}

/**
 * A link that opens the Official Account's "add friend" screen in LINE.
 *
 * LINE_BOT_ADD_FRIEND_URL wins when set, because a deployed account may use a
 * custom link. Otherwise the standard line.me redirect is built from the Basic
 * ID. An empty string means "we do not know", and the UI falls back to telling
 * the person to search for the account in LINE.
 */
export function lineAddFriendUrl(basicIdOverride = "") {
  const explicit = String(process.env.LINE_BOT_ADD_FRIEND_URL || "").trim();
  if (explicit) return explicit;

  const basicId = String(basicIdOverride || "").trim() || lineBasicId();
  if (!basicId) return "";

  // Keep the @ readable in the URL; LINE's own links use the plain form.
  const safe = basicId.replace(/[^\w@-]/g, "");
  return safe ? `https://line.me/R/ti/p/${safe}` : "";
}

/** LINE user ids are "U" followed by 32 hex characters. */
export function normalizeLineUserId(value) {
  const text = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(text) ? text : "";
}

/**
 * LINE text messages have a hard 5000-character ceiling. Truncating here means
 * a long class name or a pasted reason cannot make the whole send fail.
 */
export function truncateLineText(text) {
  const value = String(text ?? "");
  if (value.length <= LINE_TEXT_MAX_LENGTH) return value;
  return `${value.slice(0, LINE_TEXT_MAX_LENGTH - 3)}...`;
}

export function buildLineTextMessage(text) {
  return { type: "text", text: truncateLineText(text) };
}

/**
 * Verify the `x-line-signature` header LINE sends with every webhook request.
 *
 * !! This is the only thing that proves a webhook call really came from LINE.
 * !! The endpoint is public, so without this check anyone could POST a fake
 * !! message event and link their own LINE account to somebody else's student
 * !! record.
 *
 * The signature is base64(HMAC-SHA256(channelSecret, rawBody)). The raw bytes
 * matter, not the parsed JSON: re-serialising the body can reorder keys or
 * change whitespace, and the signature would no longer match.
 */
export function verifyLineSignature(rawBody, signature) {
  const secret = channelSecret();
  if (!secret) return false;

  const provided = String(signature || "").trim();
  if (!provided) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/** Create a six-digit code for the "send this code to the bot" linking flow. */
export function createLineLinkCode(randomInt = crypto.randomInt) {
  return createVerificationCode(randomInt);
}

/**
 * Hash a linking code for storage.
 *
 * A six-digit code is one million possibilities, so a plain hash would be
 * reversible in seconds. The HMAC secret is what makes a leaked row useless.
 */
export function hashLineLinkCode(code, secret) {
  if (!secret) throw new Error("hashLineLinkCode needs a secret");
  return hashCode(code, secret);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function lineFailure(response, payload, action) {
  const status = response.status;
  // 429 is "slow down", 5xx is "LINE had a problem": both are worth retrying.
  // 400/401/403/404 mean the request or the recipient is wrong, and retrying
  // the same request every minute only fills the log.
  const retryable = status === 429 || status >= 500;
  const detail = payload?.message || payload?.error_description || payload?.error || "";
  return new LineError(
    `LINE ${action} failed (${status})${detail ? `: ${detail}` : ""}`,
    { status, retryable }
  );
}

async function lineFetch(url, { body, action }) {
  if (!isLineConfigured()) {
    throw new LineError(
      "LINE reminders are not configured yet. Set LINE_CHANNEL_ACCESS_TOKEN on the server.",
      { status: 503, retryable: false }
    );
  }

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channelAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LineError(`Could not reach LINE while trying to ${action}.`, {
      cause: err,
      status: 502,
      retryable: true,
    });
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw lineFailure(response, payload, action);
  }

  return payload;
}

/**
 * Push a text message to one LINE user.
 *
 * @param {string} to the recipient's LINE user id (starts with "U")
 * @param {string} text the message, truncated to LINE's limit
 * @returns {Promise<{ ok: true }>}
 */
export async function pushLineText(to, text) {
  const userId = normalizeLineUserId(to);
  if (!userId) {
    throw new LineError("That LINE user id is not valid.", { status: 400, retryable: false });
  }

  await lineFetch(LINE_PUSH_URL, {
    action: "send a message",
    body: { to: userId, messages: [buildLineTextMessage(text)] },
  });

  return { ok: true };
}

/**
 * Reply to a webhook event using its reply token.
 *
 * Replies are the right way to answer a linking code: they are included in the
 * free plan's allowance and do not consume the monthly push quota.
 */
export async function replyLineText(replyToken, text) {
  const token = String(replyToken || "").trim();
  if (!token) {
    throw new LineError("That LINE reply token is missing.", { status: 400, retryable: false });
  }

  await lineFetch(LINE_REPLY_URL, {
    action: "reply to a message",
    body: { replyToken: token, messages: [buildLineTextMessage(text)] },
  });

  return { ok: true };
}

let botInfoCache = { value: null, expiresAt: 0 };

/**
 * Read the Official Account's basic profile, cached for five minutes.
 *
 * Used to show the student the account name and add-friend link without asking
 * the admin to copy the Basic ID into another environment variable. Best effort:
 * a failure returns null rather than breaking the account page.
 */
export async function getLineBotInfo() {
  if (!isLineConfigured()) return null;
  if (botInfoCache.expiresAt > Date.now()) return botInfoCache.value;

  try {
    const response = await fetch(LINE_BOT_INFO_URL, {
      headers: { Authorization: `Bearer ${channelAccessToken()}` },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      botInfoCache = { value: null, expiresAt: Date.now() + 60_000 };
      return null;
    }

    botInfoCache = { value: payload, expiresAt: Date.now() + BOT_INFO_TTL_MS };
    return payload;
  } catch {
    botInfoCache = { value: null, expiresAt: Date.now() + 60_000 };
    return null;
  }
}

/**
 * Read the LINE display name for a user, for the "Connected as ..." line.
 * Best effort; LINE does not require it for pushes.
 */
export async function fetchLineDisplayName(lineUserId) {
  const userId = normalizeLineUserId(lineUserId);
  if (!userId || !isLineConfigured()) return "";

  try {
    const response = await fetch(`${LINE_PROFILE_URL}/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${channelAccessToken()}` },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const payload = await readJson(response);
    if (!response.ok) return "";
    return String(payload?.displayName || "").trim().slice(0, 100);
  } catch {
    return "";
  }
}

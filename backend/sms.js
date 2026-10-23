// sms.js
/**
 * Verification text messages, sent through Semaphore.
 *
 * Why Semaphore: the school is in the Philippines, Semaphore delivers to Globe,
 * Smart, Sun and DITO without the sender-ID registration that international
 * gateways now require for PH destinations, and it has a dedicated OTP route so
 * a verification is not stuck behind marketing traffic.
 *
 * !! This is the one feature that cannot work without an account the school
 * !! owns. There is no free SMS gateway: every delivered text costs the
 * !! provider money. When the environment is not configured the route that
 * !! calls this refuses the change, which is deliberate - silently saving an
 * !! unverified number is exactly what this feature exists to stop.
 */

import { toSemaphoreNumber } from "./phoneVerification.js";

const SEMAPHORE_OTP_URL = "https://api.semaphore.co/api/v4/otp";
const SEND_TIMEOUT_MS = 12_000;

export class SmsError extends Error {
  constructor(message, { cause, status = 502 } = {}) {
    super(message);
    this.name = "SmsError";
    this.status = status;
    this.cause = cause;
  }
}

function apiKey() {
  return String(process.env.SEMAPHORE_API_KEY || "").trim();
}

function senderName() {
  return String(process.env.SEMAPHORE_SENDER_NAME || "").trim();
}

export function isPhoneVerificationConfigured() {
  return Boolean(apiKey() && senderName());
}

/**
 * Ask Semaphore to generate and send a code, then hand the code back so the
 * caller can store its hash.
 *
 * !! The code comes from the response, not from a generator here. That is what
 * !! guarantees the six digits in the text are the six digits being checked; a
 * !! locally generated code and a provider-generated one would silently drift
 * !! apart on the first mismatch.
 *
 * @returns {Promise<{ providerMessageId: unknown, code: string, status: string }>}
 * @throws {SmsError} with a message that is safe to show the user.
 */
export async function sendPhoneVerificationCode({ phone }) {
  if (!isPhoneVerificationConfigured()) {
    throw new SmsError(
      "Phone verification is not set up yet. Please contact JEN Academia to change your number.",
      { status: 503 }
    );
  }

  const number = toSemaphoreNumber(phone);
  if (!number) {
    throw new SmsError(
      "We can only text Philippine mobile numbers right now. Please use a +63 number.",
      { status: 400 }
    );
  }

  const body = new URLSearchParams({
    apikey: apiKey(),
    number,
    message: "Your JEN Academia code is {otp}. It expires in 10 minutes. Do not share it.",
    sendername: senderName(),
  });

  let response;
  try {
    response = await fetch(SEMAPHORE_OTP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (err) {
    throw new SmsError("We could not reach the text message service. Try again in a moment.", {
      cause: err,
    });
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // Handled below as an unusable response.
  }

  const item = Array.isArray(payload) ? payload[0] : payload;
  const providerCode = item?.code == null ? "" : String(item.code).trim();
  const failedStatus = typeof item?.status === "string" && /failed|refunded/i.test(item.status);

  if (!response.ok || !item || !providerCode || failedStatus) {
    // Never log the whole response: a successful one carries the code itself.
    console.error(
      "Semaphore verification send failed:",
      response.status,
      failedStatus ? item.status : "no usable code in response"
    );
    throw new SmsError(
      "We could not send the code. Check the number and try again, or contact JEN Academia if it keeps failing.",
      { status: 502 }
    );
  }

  return {
    providerMessageId: item.message_id,
    code: providerCode.padStart(6, "0"),
    status: String(item.status || "queued"),
  };
}

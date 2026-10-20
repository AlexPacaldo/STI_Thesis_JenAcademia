/**
 * Rules for declining a reschedule request.
 *
 * Declining without a reason leaves the requester guessing, so a reason is
 * mandatory. The decliner writes it, the reason is stored on the request row,
 * and the requester is told why in their notification.
 *
 * The rules live here rather than inline in the route so the API and the tests
 * agree on the same wording and the same limits.
 */

export const DECLINE_REASON_MIN_LENGTH = 5;
export const DECLINE_REASON_MAX_LENGTH = 500;

/**
 * Normalise what the decliner typed.
 *
 * Whitespace is collapsed so a multi-line paste cannot break the one-line
 * "Reason: ..." block the notification panel renders.
 *
 * @param {unknown} reason
 * @returns {{ value: string, error: string|null }} `value` is "" whenever the
 *   input is unusable, so a half-typed reason can never be stored.
 */
export function normalizeDeclineReason(reason) {
  const text = String(reason ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < DECLINE_REASON_MIN_LENGTH) {
    return {
      value: "",
      error: `Please give a reason of at least ${DECLINE_REASON_MIN_LENGTH} characters for declining this request.`,
    };
  }

  if (text.length > DECLINE_REASON_MAX_LENGTH) {
    return {
      value: "",
      error: `The reason is too long. Please keep it under ${DECLINE_REASON_MAX_LENGTH} characters.`,
    };
  }

  return { value: text, error: null };
}

/**
 * The message the requester reads when their own request was declined.
 *
 * The "Reason: " prefix is what the notification panel looks for to render
 * the reason as a highlighted block, so it must stay at the start of its line.
 */
export function buildRequesterDeclineMessage(className, reason, declinerName) {
  const who = String(declinerName || "").trim();
  const headline = who
    ? `${who} declined your reschedule request for "${className}"`
    : `Your reschedule request for "${className}" has been declined`;

  return `${headline}\nReason: ${reason}`;
}

/**
 * The message the other party (teacher/student) reads about the same decline.
 */
export function buildOtherPartyDeclineMessage(className, reason, declinerName) {
  const who = String(declinerName || "").trim() || "The other party";

  return `${who} declined the reschedule request for "${className}"\nReason: ${reason}`;
}

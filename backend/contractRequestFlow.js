/**
 * The rules of a contract request, kept out of the route handler.
 *
 * !! This exists because the request lifecycle grew and the route handler grew
 * !! with it, and the parts that decide things were buried among the parts that
 * !! do things. "Is this request still pending", "what does a revision look
 * !! like", "may the student still change their mind" are decisions, not
 * !! plumbing, and a decision that cannot be read on its own cannot be tested.
 *
 * !! The rule that matters most is the one in the comment at the top of
 * !! POST /api/student/contract-requests: a student has at most ONE PENDING
 * !! REQUEST PER KIND. Asking again is not a second request, it is a revision
 * !! of the first one. The database enforces that with a unique key over a
 * !! generated column, and the functions here are what the two ends of the flow
 * !! agree on about what a revision is.
 *
 * No database access in this file, on purpose. It is imported by the route
 * handler, by the tests, and it can be read in one sitting.
 */

/** The kinds of contract request. 'new' buys classes, 'extension' buys time. */
export const CONTRACT_REQUEST_KINDS = Object.freeze(["new", "extension"]);

/**
 * The lifecycle of a request.
 *
 * 'cancelled' is the fourth state because a student who sent a request by
 * mistake has to be able to withdraw it. Without it the only way out was to
 * wait for an admin to decline it, which is a decision somebody else has to
 * make for you - and it left a request sitting in the queue that the student
 * no longer wanted.
 */
export const CONTRACT_REQUEST_STATUSES = Object.freeze([
  "pending",
  "approved",
  "declined",
  "cancelled",
]);

/**
 * How many earlier versions of a request are kept.
 *
 * Ten is generous for a form a student fills in twice, and it bounds the
 * column. The cap matters because this is a TEXT column on a row the admin
 * reads, and an unbounded history would grow with every keystroke-driven
 * submission.
 */
export const MAX_REVISIONS_KEPT = 10;

/**
 * What kind of request is this?
 *
 * Anything unrecognised is 'new'. A client that has not been updated yet sends
 * a plain contract request, and rejecting it because of a column it knows
 * nothing about would break a flow that works.
 */
export function normalizeRequestType(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "extension"
    ? "extension"
    : "new";
}

/** What state is this request in? */
export function normalizeRequestStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();
  return CONTRACT_REQUEST_STATUSES.includes(status) ? status : "pending";
}

/**
 * May the student still change their mind about this request?
 *
 * Only while it is pending. Once an admin has approved or declined it, it is a
 * decision, and a decision is not a draft - the student asks again with a new
 * request instead, which is what leaves the old one readable as history.
 */
export function canCancelRequest(request) {
  // Compared against the raw value, not through normalizeRequestStatus. That
  // helper defaults an unknown status to 'pending' because that is what the
  // column defaults to, which is the right answer when writing a status and the
  // wrong answer here: a row whose status we cannot read is not a request we
  // have been told is pending, so it is not one we withdraw.
  return String(request?.status || "")
    .trim()
    .toLowerCase() === "pending";
}

/**
 * One version of a request, as it will be archived when the student revises it.
 *
 * The snapshot is taken from the row as it stands, so it holds the values the
 * admin would have acted on - not the ones the student is about to send.
 *
 * `revised_at` is when the version was superseded, which is not the same as
 * `requested_at` (when the version was first sent). Both are kept because the
 * admin reads a history: "you said this on Tuesday, then this on Thursday" is
 * a different claim from "you said this on Tuesday".
 */
export function buildRevisionSnapshot(row, { revisedAt = null } = {}) {
  return {
    revision: Math.max(1, Number(row?.revision_count ?? 1) || 1),
    request_type: normalizeRequestType(row?.request_type),
    course_id: row?.course_id ?? null,
    requested_classes: Math.max(0, Number(row?.requested_classes ?? 0) || 0),
    class_duration: Math.max(1, Number(row?.class_duration ?? 50) || 50),
    trial_notes: row?.trial_notes ?? null,
    ai_criteria: row?.ai_criteria ?? null,
    preferred_days: row?.preferred_days ?? null,
    preferred_start: row?.preferred_start ?? null,
    preferred_end: row?.preferred_end ?? null,
    package_id: row?.package_id ?? null,
    classes_left_at_request: row?.classes_left_at_request ?? null,
    requested_at: row?.requested_at ?? null,
    revised_at: revisedAt,
  };
}

/**
 * Read a stored history back.
 *
 * Tolerant on purpose: a history that cannot be parsed is a history nobody can
 * read, and it must not take the current request down with it. An empty
 * history is a valid state - most requests are never revised.
 */
export function parseRevisionHistory(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Archive the version that is about to be replaced.
 *
 * The history grows by one and the oldest is dropped once the cap is reached.
 * Returns the JSON string to store, or null when there was nothing to archive
 * (a request that has never been revised has no history).
 */
export function appendRevision(history, snapshot, maxRevisions = MAX_REVISIONS_KEPT) {
  const existing = parseRevisionHistory(history);
  if (!existing.length && !snapshot) return null;

  const next = [...existing, snapshot].filter(Boolean);
  const capped = next.slice(Math.max(0, next.length - Math.max(1, maxRevisions)));

  return JSON.stringify(capped);
}

/**
 * How many times has this request been changed, and what did it say before?
 *
 * `count` is the number of versions, so a request sent once has a count of 1
 * and has never been revised. The label counts the CHANGES, because "Revised
 * 1 time" is what a reader understands; "version 2 of 2" is what a database
 * understands.
 */
export function describeRevisions(request) {
  const count = Math.max(1, Number(request?.revision_count ?? 1) || 1);
  const history = parseRevisionHistory(request?.request_history);
  const changes = Math.max(0, count - 1);

  return {
    count,
    changes,
    isRevised: changes > 0,
    history,
    label: changes > 0 ? `Revised ${changes} time${changes === 1 ? "" : "s"}` : "",
  };
}

/**
 * The key the database uses to enforce one pending request per kind.
 *
 * The database computes the same thing in a generated column, so this is not
 * used to write anything. It is here so the rule has one written form that the
 * tests can check against the SQL, rather than living only inside an ALTER
 * TABLE.
 */
export function pendingKey(studentId, requestType) {
  return `${Number(studentId) || 0}:${normalizeRequestType(requestType)}`;
}

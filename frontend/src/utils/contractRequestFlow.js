/**
 * What the student may do about a contract request, given what they have
 * already asked for.
 *
 * !! The rules live here rather than in the component because the component
 * !! was deciding them inline, and it was deciding them wrong in one place.
 * !! The pending check ran against the last five requests - a history, not a
 * !! fact - so a student with more than five requests in their history was
 * !! told they had never asked, while the admin was holding a request from
 * !! them. A fact about what is pending is not something to be derived from a
 * !! window of what happened to be sent.
 *
 * The pending list comes from the server as its own field, with no limit on
 * it, so the "am I waiting for an answer" question has one answer.
 */

import { describeCanReRequest } from "./contractExpiry.js";

export const REQUEST_KIND_NEW = "new";
export const REQUEST_KIND_EXTENSION = "extension";

/** The kind of a request row, defensively. Anything unknown is a new contract. */
export function requestKindOf(request) {
  return String(request?.request_type || "").toLowerCase() === "extension"
    ? REQUEST_KIND_EXTENSION
    : REQUEST_KIND_NEW;
}

/** The request of this kind that is still waiting for an answer. */
export function findPendingRequest(requests, kind) {
  if (!Array.isArray(requests)) return null;

  return (
    requests.find(
      (request) =>
        request &&
        requestKindOf(request) === kind &&
        String(request.status || "").toLowerCase() === "pending"
    ) || null
  );
}

/** The most recent request of this kind that has been answered, in any way. */
export function findResolvedRequest(requests, kind) {
  if (!Array.isArray(requests)) return null;

  return (
    requests.find(
      (request) =>
        request &&
        requestKindOf(request) === kind &&
        String(request.status || "").toLowerCase() !== "pending"
    ) || null
  );
}

/**
 * What the card should say and offer, for one kind of request.
 *
 * The three states a student can be in, and what each one means:
 *
 *   nothing sent      They have not asked for anything yet. One clear action.
 *   pending           The admin has it. The student can change their mind
 *                     (revise) or change it entirely (withdraw). Both are
 *                     offered, because a request the student can only wait on
 *                     is a request they cannot take back.
 *   answered          The admin decided. The decision is stated, and a decline
 *                     can be asked again - a decision is not a dead end.
 */
export function describeRequestFlow({ pending = [], history = [], kind = REQUEST_KIND_NEW } = {}) {
  const isExtension = kind === REQUEST_KIND_EXTENSION;

  const pendingRequest = findPendingRequest(pending, kind);
  const resolvedRequest = findResolvedRequest(history, kind);

  const noun = isExtension ? "extension request" : "contract request";

  if (pendingRequest) {
    const revisionCount = Math.max(1, Number(pendingRequest.revision_count ?? 1) || 1);
    const changes = revisionCount - 1;

    return {
      kind,
      pendingRequest,
      resolvedRequest,
      isPending: true,
      canSubmit: false,
      canEdit: true,
      canCancel: true,
      canAskAgain: false,
      banner: changes > 0
        ? `Your ${noun} is with the admin. You have changed it ${changes} time${changes === 1 ? "" : "s"} since you first sent it, and the admin sees the latest version.`
        : `Your ${noun} is with the admin. You will be notified when it is answered.`,
      revisionLabel: changes > 0 ? `Revised ${changes} time${changes === 1 ? "" : "s"}` : "",
      actionLabel: "Update your request",
      outcome: "",
    };
  }

  if (resolvedRequest) {
    const outcome = describeOutcome(resolvedRequest, { isExtension });
    const reRequest = describeCanReRequest(resolvedRequest);

    return {
      kind,
      pendingRequest: null,
      resolvedRequest,
      isPending: false,
      canSubmit: true,
      canEdit: false,
      canCancel: false,
      // A decline can be asked again. An approval has nothing left to ask for.
      canAskAgain: reRequest.canReRequest,
      banner: "",
      revisionLabel: "",
      actionLabel: reRequest.canReRequest ? "Ask again" : outcome.actionLabel,
      outcome: outcome.text,
    };
  }

  return {
    kind,
    pendingRequest: null,
    resolvedRequest: null,
    isPending: false,
    canSubmit: true,
    canEdit: false,
    canCancel: false,
    canAskAgain: false,
    banner: "",
    revisionLabel: "",
    actionLabel: isExtension ? "Request an extension" : "Request a new contract",
    outcome: "",
  };
}

/**
 * How an answered request reads.
 *
 * Silence after a decision is the same as never having asked, so the outcome
 * is always stated - including when the student withdrew it themselves, which
 * is not a decision anybody else made and should not read like one.
 */
function describeOutcome(request, { isExtension }) {
  const status = String(request?.status || "").toLowerCase();
  const response = request?.admin_response ? `: ${request.admin_response}` : "";

  if (status === "approved") {
    return {
      text: isExtension
        ? `Your extension request was approved${response}.`
        : `Your contract request was approved${response}.`,
      actionLabel: "Request another contract",
    };
  }

  if (status === "declined") {
    return {
      text: isExtension
        ? `Your last extension request was declined${response}. Your unused classes remain on the expired contract.`
        : `Your last contract request was declined${response}.`,
      actionLabel: "Ask again",
    };
  }

  if (status === "cancelled") {
    return {
      text: "You withdrew this request, so there is nothing waiting for the admin.",
      actionLabel: isExtension ? "Request an extension" : "Request a new contract",
    };
  }

  return {
    text: `Your last request was ${status}${response}.`,
    actionLabel: isExtension ? "Request an extension" : "Request a new contract",
  };
}

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

  const requestName = isExtension ? "request for more time" : "new plan request";

  if (pendingRequest) {
    const revisionCount = Math.max(1, Number(pendingRequest.revision_count ?? 1) || 1);
    const changes = revisionCount - 1;

    return {
      kind,
      pendingRequest,
      resolvedRequest,
      isPending: true,
      canSubmit: false,
      // There is one in flight. The student changes it or takes it back -
      // they do not send a second one.
      canRequest: false,
      canEdit: true,
      canCancel: true,
      canAskAgain: false,
      banner: changes > 0
        ? `Your ${requestName} is under review. You have updated it ${changes} time${changes === 1 ? "" : "s"}. The administrator will review the latest version.`
        : `Your ${requestName} is under review. We will notify you when a decision has been made.`,
      revisionLabel: changes > 0 ? `Updated ${changes} time${changes === 1 ? "" : "s"}` : "",
      actionLabel: "Edit request",
      outcome: "",
    };
  }

  if (resolvedRequest) {
    const outcome = describeOutcome(resolvedRequest, { isExtension });
    const reRequest = describeCanReRequest(resolvedRequest);
    const status = String(resolvedRequest.status || "").toLowerCase();

    // A withdrawal is not an answer.
    //
    // !! The student withdrew the request BECAUSE they wanted to ask for
    // !! something else - and it left them with no way to ask for it. The
    // !! button was gated on "has this student ever had a request", so a
    // !! withdrawn request stood in the way exactly like a declined one, and
    // !! the way out of a withdrawal was to have a second withdrawal first.
    // !!
    // !! Nothing was decided, so nothing blocks the next question.
    //
    // An approved extension is the one thing that does close the road: the
    // contract runs again, and there is nothing left to extend - the server
    // would say so. An approved new contract does not, because a student who
    // has used all their classes can always ask for more.
    const withdrawn = status === "cancelled";
    const approved = status === "approved";

    return {
      kind,
      pendingRequest: null,
      resolvedRequest,
      isPending: false,
      canSubmit: true,
      // Is there a button to press? Yes for a withdrawal and for a decline
      // (ask again). No for an approved extension - that is the thing they
      // asked for, and there is nothing left to ask for.
      canRequest: !(isExtension && approved),
      canEdit: false,
      canCancel: false,
      // A decline can be asked again. An approval has nothing left to ask for.
      canAskAgain: reRequest.canReRequest,
      banner: "",
      revisionLabel: "",
      actionLabel: reRequest.canReRequest
        ? "Submit another request"
        : withdrawn
          ? isExtension
            ? "Request more time"
            : "Request a new plan"
          : outcome.actionLabel,
      outcome: outcome.text,
    };
  }

  return {
    kind,
    pendingRequest: null,
    resolvedRequest: null,
    isPending: false,
    canSubmit: true,
    canRequest: true,
    canEdit: false,
    canCancel: false,
    canAskAgain: false,
    banner: "",
    revisionLabel: "",
    actionLabel: isExtension ? "Request more time" : "Request a new plan",
    outcome: "",
  };
}

/**
 * What a student can ask for right now.
 *
 * !! THE RULE, and it is the rule the old page had.
 * !!
 * !! "Ask for more time" - only when the contract has ENDED and there are
 * !! classes on it to keep. The server refuses it otherwise ("This contract
 * !! has not ended yet, so there is nothing to extend"), and offering a
 * !! button that can only fail is a button that teaches a student that the
 * !! screen does not know what it is talking about.
 * !!
 * !! "Get a new plan" - only when there is no live contract, or every class
 * !! on it has been used. A student with twelve unused classes must NOT be
 * !! offered a new contract: approving one expires the contract they are on
 * !! and starts a fresh one at zero used, so the twelve classes they paid
 * !! for are thrown away. The old page had this rule in its LAYOUT - the
 * !! buttons simply were not there - and it was lost when the page was
 * !! rebuilt with three permanent buttons.
 * !!
 * !! The states come from describeExtensionEligibility, which already knows
 * !! whether the contract is live, has ended, or is used up. A decline of an
 * !! extension is the one case where a student may ask again.
 *
 * @param {object} options
 * @param {"extend"|"new"|"none"} options.contractAsk what the contract state allows
 * @param {boolean} [options.canAskAgain] their last extension was declined
 */
export function describeAvailableRequests({ contractAsk, canAskAgain = false } = {}) {
  return {
    canRequestMoreTime: contractAsk === "extend" || canAskAgain,
    canRequestNewPlan: contractAsk === "new",
  };
}

/**
 * The other kind of request, and whether it is in the way.
 *
 * The two kinds contradict each other: a new contract replaces the contract
 * the unused classes are on, so approving one undoes what the other is
 * asking to preserve. They cannot both be granted, and there is no version
 * of them that can both be in flight and mean what the student says they
 * mean.
 *
 * So the other route is closed while one of them is with the admin, and the
 * student is told how to open it again: withdraw the one they already sent.
 *
 * @param {object} options
 * @param {string} options.kind the kind the student is trying to ask for
 * @param {string} options.otherKind the kind already in flight
 * @param {boolean} options.otherIsPending whether it is
 */
export function describeBlockedByOtherRequest({ kind, otherKind, otherIsPending }) {
  if (!otherIsPending) {
    return { isBlocked: false, hint: "" };
  }

  const askedFor = kind === REQUEST_KIND_EXTENSION ? "additional time" : "a new plan";
  const waitingFor =
    otherKind === REQUEST_KIND_EXTENSION ? "additional time" : "a new plan";

  return {
    isBlocked: true,
    hint: `You already have a request for ${waitingFor} under review. Withdraw it before submitting a request for ${askedFor}.`,
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
        ? `Your request for additional time was approved${response}.`
        : `Your new plan request was approved${response}.`,
      // An approved extension is the end of the road for that kind of
      // request - the plan runs again, and there is nothing left to extend.
      // An approved new plan is not: a student who has used all their
      // classes can always ask for more.
      actionLabel: isExtension ? "" : "Request another plan",
    };
  }

  if (status === "declined") {
    return {
      text: isExtension
        ? `Your request for additional time was declined${response}. Your unused classes remain on your current plan.`
        : `Your new plan request was declined${response}.`,
      actionLabel: "Submit another request",
    };
  }

  if (status === "cancelled") {
    return {
      text: "You withdrew this request. The administrator will not take further action on it.",
      actionLabel: isExtension ? "Request more time" : "Request a new plan",
    };
  }

  return {
    text: `Your most recent request was ${status}${response}.`,
    actionLabel: isExtension ? "Request more time" : "Request a new plan",
  };
}

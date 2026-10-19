/**
 * Tests for the contract request flow.
 *
 *   node scripts/test-contract-request-flow.mjs
 *
 * The question these answer is the one a student actually has: "I asked for
 * something, and the admin has not answered yet. What can I do?"
 *
 * The answers are decided in one place - contractRequestFlow.js - so they are
 * decided once and can be checked here, rather than re-derived in a component
 * where a wrong answer is invisible until a student is misled by it.
 */

import {
  REQUEST_KIND_EXTENSION,
  REQUEST_KIND_NEW,
  describeRequestFlow,
  findPendingRequest,
  findResolvedRequest,
  requestKindOf,
} from "../frontend/src/utils/contractRequestFlow.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

/* ----------------------------------------------------------- the helpers */

check("a request with no type is a new contract", requestKindOf({}), REQUEST_KIND_NEW);
check("an extension is an extension", requestKindOf({ request_type: "extension" }), REQUEST_KIND_EXTENSION);
check("rubbish is a new contract", requestKindOf({ request_type: "nonsense" }), REQUEST_KIND_NEW);

const pendingExtension = { request_id: 1, request_type: "extension", status: "pending" };
const pendingNew = { request_id: 2, request_type: "new", status: "pending" };
const declinedExtension = { request_id: 3, request_type: "extension", status: "declined" };
const approvedNew = { request_id: 4, request_type: "new", status: "approved" };
const cancelledNew = { request_id: 5, request_type: "new", status: "cancelled" };

check(
  "the pending extension is found among the pending requests",
  findPendingRequest([pendingNew, pendingExtension], REQUEST_KIND_EXTENSION)?.request_id,
  1
);
check(
  "the pending new contract is found among the pending requests",
  findPendingRequest([pendingNew, pendingExtension], REQUEST_KIND_NEW)?.request_id,
  2
);
check("a pending request of the other kind is not found", findPendingRequest([pendingNew], REQUEST_KIND_EXTENSION), null);
check("nothing pending is null", findPendingRequest([], REQUEST_KIND_NEW), null);
check("a missing list is null", findPendingRequest(null, REQUEST_KIND_NEW), null);

check(
  "the resolved request is found",
  findResolvedRequest([pendingExtension, declinedExtension], REQUEST_KIND_EXTENSION)?.request_id,
  3
);
check(
  "a pending request is not a resolved one",
  findResolvedRequest([pendingExtension], REQUEST_KIND_EXTENSION),
  null
);

/* ------------------------------------------------------- nothing sent yet */

const fresh = describeRequestFlow({ pending: [], history: [], kind: REQUEST_KIND_NEW });
check("a student who has asked nothing may ask", fresh.canSubmit, true);
check("and is not waiting on anything", fresh.isPending, false);
check("and is shown the plain action", fresh.actionLabel, "Request a new contract");
check("and is told nothing", fresh.banner, "");

const freshExtension = describeRequestFlow({ pending: [], history: [], kind: REQUEST_KIND_EXTENSION });
check("the extension asks for an extension", freshExtension.actionLabel, "Request an extension");

/* --------------------------------------------------------- still pending */

const waiting = describeRequestFlow({
  pending: [pendingExtension],
  history: [pendingExtension],
  kind: REQUEST_KIND_EXTENSION,
});

check("a pending request is pending", waiting.isPending, true);
check("and cannot be sent again as a new one", waiting.canSubmit, false);
check("but it can be changed", waiting.canEdit, true);
check("and it can be taken back", waiting.canCancel, true);
check("and there is nothing to ask again about", waiting.canAskAgain, false);
check("the banner says it is with the admin", waiting.banner.includes("with the admin"), true);
check("the action is to update it", waiting.actionLabel, "Update your request");
check("the revision count is not mentioned for a first request", waiting.revisionLabel, "");

// The bug this whole thing exists for: the pending check used to run against
// the last five requests, so a pending request could fall out of the window
// and the card would offer to ask again.
const buried = describeRequestFlow({
  pending: [pendingExtension],
  history: [pendingExtension, { request_id: 9, request_type: "new", status: "approved" }],
  kind: REQUEST_KIND_EXTENSION,
});
check("a pending request is pending even among a full history", buried.isPending, true);
check("and still cannot be sent again", buried.canSubmit, false);

/* ------------------------------------------------------- revised requests */

const revised = describeRequestFlow({
  pending: [{ ...pendingExtension, revision_count: 3 }],
  history: [{ ...pendingExtension, revision_count: 3 }],
  kind: REQUEST_KIND_EXTENSION,
});

check("a revised request says so", revised.revisionLabel, "Revised 2 times");
check("and the banner says the admin sees the latest", revised.banner.includes("latest version"), true);

const revisedOnce = describeRequestFlow({
  pending: [{ ...pendingExtension, revision_count: 2 }],
  history: [{ ...pendingExtension, revision_count: 2 }],
  kind: REQUEST_KIND_EXTENSION,
});
check("one change is singular", revisedOnce.revisionLabel, "Revised 1 time");

/* ------------------------------------------------------------ answered */

const declined = describeRequestFlow({
  pending: [],
  history: [declinedExtension],
  kind: REQUEST_KIND_EXTENSION,
});

check("a decline is not pending", declined.isPending, false);
check("and can be asked again", declined.canAskAgain, true);
check("the action is to ask again", declined.actionLabel, "Ask again");
check("the outcome is stated", declined.outcome.includes("declined"), true);
check("and says the classes are still there", declined.outcome.includes("unused classes remain"), true);

const approved = describeRequestFlow({
  pending: [],
  history: [approvedNew],
  kind: REQUEST_KIND_NEW,
});

check("an approval opens nothing", approved.canAskAgain, false);
check("but it is stated", approved.outcome.includes("approved"), true);

const withdrawn = describeRequestFlow({
  pending: [],
  history: [cancelledNew],
  kind: REQUEST_KIND_NEW,
});

check("a withdrawn request is not pending", withdrawn.isPending, false);
check("and says so", withdrawn.outcome.includes("withdrew"), true);
check("and offers the request again", withdrawn.canSubmit, true);
check("a withdrawn request is not a decline", withdrawn.canAskAgain, false);

// The bug this exists for: the button was gated on "has this student ever
// had a request", so withdrawing a request left the student with no way to
// ask for the thing they withdrew it in order to ask for.
check("and there is a button to press", withdrawn.canRequest, true);
check("which asks for the request", withdrawn.actionLabel, "Request a new contract");

const withdrawnExtension = describeRequestFlow({
  pending: [],
  history: [{ request_id: 6, request_type: "extension", status: "cancelled" }],
  kind: REQUEST_KIND_EXTENSION,
});

check("a withdrawn extension can be asked for again", withdrawnExtension.canRequest, true);
check("and the button says so", withdrawnExtension.actionLabel, "Request an extension");
check("and it is not an approval", withdrawnExtension.canAskAgain, false);

// An approval is the one thing that closes the road, and only for the
// extension: the contract runs again, so there is nothing left to extend.
const approvedExtension = describeRequestFlow({
  pending: [],
  history: [{ request_id: 7, request_type: "extension", status: "approved" }],
  kind: REQUEST_KIND_EXTENSION,
});
check("an approved extension has nothing left to ask for", approvedExtension.canRequest, false);

// A new contract is a purchase. Running out of classes is not the end of
// the road for asking for more.
const approvedNewContract = describeRequestFlow({
  pending: [],
  history: [{ request_id: 8, request_type: "new", status: "approved" }],
  kind: REQUEST_KIND_NEW,
});
check("but an approved new contract can be asked for again", approvedNewContract.canRequest, true);

/* ------------------------------------------------- the two kinds are apart */

// The bug the kind column exists for: a pending extension must not make a
// new-contract request look answered, and the other way round.
const bothPending = describeRequestFlow({
  pending: [pendingExtension, pendingNew],
  history: [pendingExtension, pendingNew],
  kind: REQUEST_KIND_NEW,
});
check("a pending new contract is pending", bothPending.isPending, true);
check("and it is a new contract that is pending", bothPending.pendingRequest?.request_id, 2);

const extensionStillWaiting = describeRequestFlow({
  pending: [pendingExtension, pendingNew],
  history: [pendingExtension, pendingNew],
  kind: REQUEST_KIND_EXTENSION,
});
check("and the extension is still waiting too", extensionStillWaiting.isPending, true);
check("on its own request", extensionStillWaiting.pendingRequest?.request_id, 1);

/* ------------------------------------------------------------------ done */

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

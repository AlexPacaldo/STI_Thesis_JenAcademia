import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_REQUEST_KINDS,
  CONTRACT_REQUEST_STATUSES,
  MAX_REVISIONS_KEPT,
  appendRevision,
  buildRevisionSnapshot,
  canCancelRequest,
  describeRevisions,
  normalizeRequestStatus,
  normalizeRequestType,
  parseRevisionHistory,
  pendingKey,
} from "./contractRequestFlow.js";

/* ------------------------------------------------------------ the kinds */

test("the two kinds are the only two", () => {
  assert.deepEqual([...CONTRACT_REQUEST_KINDS], ["new", "extension"]);
});

test("an unrecognised kind is a new contract, never a rejected request", () => {
  // A client that has not been updated yet sends a plain contract request.
  // Failing it over a column it knows nothing about breaks a flow that works.
  assert.equal(normalizeRequestType("extension"), "extension");
  assert.equal(normalizeRequestType("EXTENSION"), "extension");
  assert.equal(normalizeRequestType(" Extension "), "extension");
  assert.equal(normalizeRequestType("new"), "new");
  assert.equal(normalizeRequestType(undefined), "new");
  assert.equal(normalizeRequestType(null), "new");
  assert.equal(normalizeRequestType("nonsense"), "new");
  assert.equal(normalizeRequestType(42), "new");
});

/* --------------------------------------------------------- the statuses */

test("cancelled is a state a request can be in", () => {
  assert.ok(CONTRACT_REQUEST_STATUSES.includes("cancelled"));
  assert.equal(normalizeRequestStatus("cancelled"), "cancelled");
  assert.equal(normalizeRequestStatus("PENDING"), "pending");
  assert.equal(normalizeRequestStatus("nonsense"), "pending");
});

test("only a pending request can be withdrawn", () => {
  assert.equal(canCancelRequest({ status: "pending" }), true);
  assert.equal(canCancelRequest({ status: "approved" }), false);
  assert.equal(canCancelRequest({ status: "declined" }), false);
  assert.equal(canCancelRequest({ status: "cancelled" }), false);
  assert.equal(canCancelRequest({}), false);
  assert.equal(canCancelRequest(null), false);
});

/* --------------------------------------------------------- the snapshot */

test("a snapshot holds the version the admin would have acted on", () => {
  const snapshot = buildRevisionSnapshot(
    {
      revision_count: 1,
      request_type: "extension",
      course_id: null,
      requested_classes: 0,
      class_duration: 50,
      trial_notes: "illness delayed my lessons",
      ai_criteria: null,
      preferred_days: null,
      preferred_start: null,
      preferred_end: null,
      package_id: 12,
      classes_left_at_request: 6,
      requested_at: "2026-10-01 09:00:00",
    },
    { revisedAt: "2026-10-05 11:00:00" }
  );

  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.request_type, "extension");
  assert.equal(snapshot.trial_notes, "illness delayed my lessons");
  assert.equal(snapshot.package_id, 12);
  assert.equal(snapshot.classes_left_at_request, 6);
  assert.equal(snapshot.requested_at, "2026-10-01 09:00:00");
  assert.equal(snapshot.revised_at, "2026-10-05 11:00:00");
});

test("a snapshot of a row with nothing in it is still a snapshot", () => {
  const snapshot = buildRevisionSnapshot({});
  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.request_type, "new");
  assert.equal(snapshot.requested_classes, 0);
  assert.equal(snapshot.class_duration, 50);
  assert.equal(snapshot.trial_notes, null);
});

/* ----------------------------------------------------------- the history */

test("a request that was never revised has no history", () => {
  assert.deepEqual(parseRevisionHistory(null), []);
  assert.deepEqual(parseRevisionHistory(""), []);
  assert.deepEqual(parseRevisionHistory("not json"), []);
  assert.deepEqual(parseRevisionHistory("{}"), []);
});

test("a history that is already an array is read as it is", () => {
  assert.deepEqual(parseRevisionHistory([{ revision: 1 }]), [{ revision: 1 }]);
});

test("archiving a version keeps the one it replaced", () => {
  const first = buildRevisionSnapshot({ revision_count: 1, trial_notes: "the first note" });
  const history = appendRevision(null, first);

  const read = parseRevisionHistory(history);
  assert.equal(read.length, 1);
  assert.equal(read[0].trial_notes, "the first note");
});

test("archiving a second version keeps both, in order", () => {
  const first = buildRevisionSnapshot({ revision_count: 1, trial_notes: "the first note" });
  const second = buildRevisionSnapshot({ revision_count: 2, trial_notes: "the second note" });

  const history = appendRevision(appendRevision(null, first), second);
  const read = parseRevisionHistory(history);

  assert.equal(read.length, 2);
  assert.equal(read[0].trial_notes, "the first note");
  assert.equal(read[1].trial_notes, "the second note");
});

test("the history is capped, and it keeps the newest versions", () => {
  let history = null;
  for (let i = 1; i <= MAX_REVISIONS_KEPT + 5; i += 1) {
    history = appendRevision(history, buildRevisionSnapshot({ trial_notes: `note ${i}` }));
  }

  const read = parseRevisionHistory(history);
  assert.equal(read.length, MAX_REVISIONS_KEPT);
  assert.equal(read[0].trial_notes, `note ${MAX_REVISIONS_KEPT + 5 - MAX_REVISIONS_KEPT + 1}`);
  assert.equal(read[read.length - 1].trial_notes, `note ${MAX_REVISIONS_KEPT + 5}`);
});

test("a corrupt history does not take the request down with it", () => {
  // It must not throw, and the request that carries it must still be readable.
  assert.deepEqual(parseRevisionHistory("{not json"), []);
  assert.doesNotThrow(() => appendRevision("{not json", buildRevisionSnapshot({})));
});

/* -------------------------------------------------------- the revision */

test("a request sent once has not been revised", () => {
  const described = describeRevisions({ revision_count: 1 });
  assert.equal(described.isRevised, false);
  assert.equal(described.changes, 0);
  assert.equal(described.label, "");
});

test("a revised request says how many times", () => {
  assert.equal(describeRevisions({ revision_count: 2 }).label, "Revised 1 time");
  assert.equal(describeRevisions({ revision_count: 3 }).label, "Revised 2 times");
  assert.equal(describeRevisions({ revision_count: 2 }).isRevised, true);
});

test("a request with no revision column is treated as unrevised", () => {
  // Every row that existed before this column did has never been revised.
  assert.equal(describeRevisions({}).isRevised, false);
  assert.equal(describeRevisions({}).count, 1);
});

/* ------------------------------------------------------------- the key */

test("the pending key is one per student per kind", () => {
  assert.equal(pendingKey(69, "new"), "69:new");
  assert.equal(pendingKey(69, "extension"), "69:extension");
  assert.equal(pendingKey("69", "EXTENSION"), "69:extension");
});

test("a new request and an extension are different keys", () => {
  // The whole reason the two kinds live in separate columns of the same rule:
  // one pending request of each kind at a time, never two of one kind.
  assert.notEqual(pendingKey(69, "new"), pendingKey(69, "extension"));
});

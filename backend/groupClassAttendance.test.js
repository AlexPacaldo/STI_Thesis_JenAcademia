import test from "node:test";
import assert from "node:assert/strict";
import { endGroupParticipants, groupRecordingConsentReady, shareGroupEvidence, startGroupParticipants } from "./groupClassAttendance.js";

const peer = { class_id: 20, teacher_id: 1, student_id: 3, duration: 25 };
function database({ grouped = true, joinedWithoutConsent = [] } = {}) {
  const calls = [];
  return { calls, async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("FROM classes source JOIN classes peer")) return [grouped ? [peer] : []];
    if (sql.includes("SELECT teacher_started_at, teacher_recording_consent_at")) return [[{ teacher_started_at: "start", teacher_recording_consent_at: "consent" }]];
    if (sql.includes("SELECT class_id FROM class_attendance_logs")) return [joinedWithoutConsent.map(class_id => ({ class_id }))];
    return [{ affectedRows: 1 }];
  } };
}
test("starting one group class starts each participant without confirming student attendance", async () => {
  const db = database();
  await startGroupParticipants(db, 10, "recording");
  const write = db.calls.find(call => call.sql.includes("INSERT INTO class_attendance_logs"));
  assert.deepEqual(write.params, [20, 1, 3, "recording", "start", "consent"]);
  assert(!/student_joined_at\s*=/.test(write.sql));
  assert.match(write.sql, /WHEN student_joined_at IS NOT NULL THEN 'student_confirmed'/);
  assert(!write.sql.includes("student_recording_consent_at"));
});
test("individual classes have no peer attendance side effects", async () => {
  const db = database({ grouped: false });
  await startGroupParticipants(db, 10, "recording");
  await shareGroupEvidence(db, 10, ["recording_started_at"]);
  assert(db.calls.every(call => !/INSERT|UPDATE/.test(call.sql)));
  assert.equal(await groupRecordingConsentReady(db, 10), true);
});
test("group recording permits absent students but requires consent from joined students", async () => {
  const noneJoined = database();
  assert.equal(await groupRecordingConsentReady(noneJoined, 10), true);
  const query = noneJoined.calls.find(call => call.sql.includes("SELECT class_id FROM class_attendance_logs"));
  assert.match(query.sql, /student_joined_at IS NOT NULL AND student_recording_consent_at IS NULL/);
  assert.deepEqual(query.params, [[10, 20]]);
  assert.equal(await groupRecordingConsentReady(database({ joinedWithoutConsent: [] }), 10), true);
  assert.equal(await groupRecordingConsentReady(database({ joinedWithoutConsent: [20] }), 10), false);
});
test("shared evidence never overwrites a student's consent, private remarks, or attendance", async () => {
  const db = database();
  const peers = await shareGroupEvidence(db, 10, ["recording_url", "recording_duration_seconds"]);
  assert.deepEqual(peers, [peer]);
  const write = db.calls.find(call => call.sql.includes("UPDATE class_attendance_logs"));
  assert.deepEqual(write.params, [10, [20]]);
  assert(!write.sql.includes("student_joined_at"));
  await assert.rejects(shareGroupEvidence(db, 10, ["student_joined_at"]), /Unsupported/);
  await assert.rejects(shareGroupEvidence(db, 10, ["summary"]), /Unsupported/);
});
test("ending a group independently verifies each attendee and never verifies an absent student", async () => {
  for (const attended of [true, false]) {
    const db = database();
    const source = { teacher_ended_at: new Date("2026-01-01T10:25:00Z"), summary: "We practiced asking clear questions.", proof_url: null, review_reason: null };
    const log = { teacher_started_at: new Date("2026-01-01T10:00:00Z"), student_joined_at: attended ? new Date("2026-01-01T10:00:00Z") : null,
      evidence_mode: "recording", recording_url: "/private-uploads/group.webm", recording_duration_seconds: 1500 };
    await endGroupParticipants(db, 10, { getVerification: async (_db, classId) => classId === 10 ? source : log,
      requiredMinutes: duration => duration, encrypt: value => value, evidenceAccepted: true });
    const write = db.calls.find(call => call.sql.includes("UPDATE class_attendance_logs"));
    assert.equal(write.params[6], attended ? "verified" : "needs_review");
    assert(!db.calls.some(call => /UPDATE classes|student_class_packages/.test(call.sql)));
  }
});


test("a group student joining only for the final minute needs review", async () => {
  const db = database();
  const log = { teacher_started_at: new Date("2026-11-09T10:00:00Z"), student_joined_at: new Date("2026-11-09T10:24:00Z"),
    evidence_mode: "screenshots", start_proof_url: "/start.png", start_proof_uploaded_at: new Date("2026-11-09T10:24:30Z") };
  const source = { teacher_ended_at: new Date("2026-11-09T10:25:00Z"), proof_url: "/end.png", summary: "A complete lesson." };
  await endGroupParticipants(db, 10, { getVerification: async (_db, classId) => classId === 10 ? source : log,
    requiredMinutes: () => 15, encrypt: value => value, evidenceAccepted: true });
  const write = db.calls.find(call => call.sql.includes("UPDATE class_attendance_logs"));
  assert.equal(write.params[1], 1);
  assert.equal(write.params[6], "needs_review");
});

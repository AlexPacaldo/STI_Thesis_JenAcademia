import test from "node:test";
import assert from "node:assert/strict";
import { endGroupParticipants, groupRecordingConsentReady, shareGroupEvidence, startGroupParticipants } from "./groupClassAttendance.js";

const peer = { class_id: 20, teacher_id: 1, student_id: 3, duration: 25 };
function database({ grouped = true, consenting = [10, 20] } = {}) {
  const calls = [];
  return { calls, async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("FROM classes source JOIN classes peer")) return [grouped ? [peer] : []];
    if (sql.includes("SELECT class_id FROM class_attendance_logs")) return [consenting.map(class_id => ({ class_id }))];
    return [{ affectedRows: 1 }];
  } };
}
test("starting one group class starts each participant without confirming student attendance", async () => {
  const db = database();
  await startGroupParticipants(db, 10, "recording");
  const write = db.calls.find(call => call.sql.includes("INSERT INTO class_attendance_logs"));
  assert.deepEqual(write.params, [20, 1, 3, "recording", 10]);
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
test("a group recording requires separate consent and attendance from both students", async () => {
  assert.equal(await groupRecordingConsentReady(database({ consenting: [10] }), 10), false);
  assert.equal(await groupRecordingConsentReady(database({ consenting: [10, 20] }), 10), true);
});
test("shared evidence never overwrites a student's consent, private remarks, or attendance", async () => {
  const db = database();
  await shareGroupEvidence(db, 10, ["recording_url", "recording_duration_seconds"]);
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

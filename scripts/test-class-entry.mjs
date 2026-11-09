import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { classEntryError } from "../backend/classSession.js";
import { zonedWallClockToInstant } from "../backend/lineReminders.js";

// Exercise the real start/join handlers without starting the API or using MySQL.
const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const start = source.indexOf('app.post("/api/calendar/classes/:class_id/start",');
const join = source.indexOf('app.post("/api/calendar/classes/:class_id/join",');
const end = source.indexOf("\napp.", join);
assert(start >= 0 && join > start && end > join);
const handlers = {};
let log;
let tick = Date.now();
const now = new Date();
const classInfo = { class_id: 1, teacher_id: 2, student_id: 3, status: "scheduled", duration: 25,
  scheduled_date: now.toISOString().slice(0, 10), start_time: now.toISOString().slice(11, 19), teacher_timezone: "UTC" };
const db = {
  async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
  async query(sql, params) {
    if (sql.includes("FROM classes")) return [[classInfo]];
    if (sql.includes("FROM users")) return [[{ user_id: 2 }, { user_id: 3 }]];
    if (sql.includes("INSERT INTO class_attendance_logs")) {
      assert.deepEqual(Array.from(params).slice(0, 3), [1, 2, 3]);
      log ??= { teacher_started_at: null, student_joined_at: null };
      if (sql.includes("VALUES (?, ?, ?, NOW(), NOW(), 'student_confirmed')")) {
        // A repeat join must retain the first attendance and consent timestamps.
        assert.match(sql, /student_joined_at = COALESCE\(student_joined_at, NOW\(\)\)/);
        assert.match(sql, /student_recording_consent_at = COALESCE\(student_recording_consent_at, NOW\(\)\)/);
        log.student_joined_at ??= new Date(++tick);
        log.student_recording_consent_at ??= new Date(++tick);
        log.verification_status = "student_confirmed";
      } else {
        assert.match(sql, /WHEN student_joined_at IS NOT NULL THEN 'student_confirmed'/);
        log.teacher_started_at ??= new Date(++tick);
        log.verification_status = log.student_joined_at ? "student_confirmed" : "in_progress";
      }
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  },
};
vm.runInNewContext(source.slice(start, end), {
  app: { post(path, ...callbacks) { handlers[path.split("/").at(-1)] = callbacks.at(-1); } },
  pool: { ...db, getConnection: async () => db }, classEntryError, zonedWallClockToInstant,
  requireSession() {}, requireClassAccess: () => () => {}, sessionMayActFor: () => true,
  groupClassSchemaReady: false, broadcastCalendarChange() {},
  getClassVerification: async (_db, _id, locked) => { if (locked) assert.equal(_db, db); return log ? { ...log } : null; }, console,
});
async function request(action, overrides = {}) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handlers[action]({ params: { class_id: 1 }, body: {
    teacher_id: 2, student_id: 3, recording_consent: true, evidence_mode: "recording", ...overrides,
  } }, res);
  return res;
}
for (const order of [["join", "start"], ["start", "join"]]) {
  log = undefined;
  for (const action of order) {
    assert.equal((await request(action)).code, 200);
    if (action === "join" && !log.teacher_started_at) assert.equal(log.teacher_started_at, null);
  }
  assert(log.teacher_started_at && log.student_joined_at && log.student_recording_consent_at);
  assert.equal(log.verification_status, "student_confirmed");
  const firstAttendance = { ...log };
  assert.equal((await request("join")).code, 200);
  assert.deepEqual(log, firstAttendance);
}
assert.equal((await request("join", { student_id: 4 })).code, 403);
assert.equal((await request("join", { recording_consent: false })).code, 400);
classInfo.status = "no-show";
assert.equal((await request("join")).code, 400);
console.log("Students can join before or after the teacher; repeat attendance, consent and class access checks pass.");

classInfo.status = "scheduled";
log = { teacher_ended_at: new Date(), teacher_started_at: new Date() };
assert.equal((await request("join")).code, 409);
assert.equal((await request("start")).code, 409);
log = undefined;
classInfo.scheduled_date = "2099-01-01";
assert.equal((await request("join")).code, 200);
assert(log.student_joined_at);
log = undefined;
classInfo.scheduled_date = "2020-01-01";
assert.equal((await request("join")).code, 409);
log = { teacher_started_at: new Date(), student_joined_at: null };
assert.equal((await request("join")).code, 200);
console.log("Closed/expired sessions reject entry; scheduled and ongoing sessions permit joining.");

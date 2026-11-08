// Exercise the real route with an in-memory transactional database double.
// This verifies route behavior; production MySQL concurrency needs integration QA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { normalizeTime, timeToMinutes } from "../frontend/src/utils/classTime.js";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const routeStart = source.indexOf('app.post("/api/calendar/class",');
const routeEnd = source.indexOf('\n// ', routeStart);
const helperStart = source.indexOf("const ALLOWED_CLASS_DURATIONS");
const helperEnd = source.indexOf("async function getStudentPackageAvailability", helperStart);
let handler;
let classes = [];
let availability;
let releasePrevious = Promise.resolve();
let inserted = 0;

const pool = {
  async getConnection() {
    let unlock;
    const finish = async () => { unlock?.(); unlock = null; };
    return {
      beginTransaction: async () => {}, commit: finish, rollback: finish, release() {},
      async query(sql, params = []) {
        if (sql.includes("FROM users") && sql.includes("WHERE user_id IN")) {
          assert.match(sql, /ORDER BY user_id FOR UPDATE/);
          const previous = releasePrevious;
          releasePrevious = new Promise(resolve => { unlock = resolve; });
          await previous;
          return [[{ user_id: params[0], role: "teacher", status: "active", profile_completed: 1 },
            { user_id: params[1], role: "student", status: "active", profile_completed: 1 }]];
        }
        if (sql.includes("FROM student_class_packages")) return [[{
          package_id: 1, total_classes: 10, classes_left: 10, class_duration: 25, created_at: "2026-01-01",
        }]];
        if (sql.includes("COUNT(*)")) return [[{ booked_count: 0 }]];
        if (sql.includes("FROM teacher_availability")) {
          assert.match(sql, /FOR UPDATE/);
          return [[availability]];
        }
        if (sql.includes("FROM classes")) {
          assert.match(sql, /FOR UPDATE/);
          return [classes];
        }
        if (sql.includes("INSERT INTO classes")) {
          inserted++;
          classes.push({ class_id: inserted, teacher_id: params[1], student_id: params[2], start_time: params[4], duration: params[6] });
          return [{ insertId: inserted }];
        }
        if (sql.includes("SELECT first_name")) return [[{ first_name: "Test", last_name: "Student" }]];
        return [{ affectedRows: 1 }];
      },
    };
  },
};
vm.runInNewContext(source.slice(helperStart, helperEnd) + source.slice(routeStart, routeEnd), {
  app: { post: (_path, ...callbacks) => { handler = callbacks.at(-1); } },
  groupClassSchemaReady: true, groupHoldConflict: async () => false, zonedWallClockToInstant: () => {},
  pool, requireSession() {}, requireClassBookingScope: () => () => {},
  timeToMinutes, normalizeTimeKey: normalizeTime, pad: value => String(value).padStart(2, "0"),
  autoMarkPastClassesAsNoShow: async () => {},
  getStudentPackageAvailability: async () => ({ package: null }),
  generateJitsiMeetingLink: () => "test-meeting", encryptNullableText: value => value,
  broadcastCalendarChange() {}, console,
});
async function book(time, student = 2) {
  const result = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: { class_name: "English", teacher_id: 1, student_id: student,
    scheduled_date: "2027-01-05", start_time: time, duration: 25 } }, result);
  return result;
}
function reset(overrides = {}) {
  classes = []; inserted = 0;
  availability = { status: "available", start_time: "08:00", end_time: "17:00", break_start: "11:15", break_end: "11:30", ...overrides };
}
reset(); assert.equal((await book("11:00")).code, 400); assert.equal(inserted, 0);
reset(); assert.equal((await book("10:50")).code, 201);
reset(); assert.equal((await book("16:40")).code, 400);
reset({ status: "unavailable" }); assert.equal((await book("12:00")).code, 400);
reset({ start_time: null }); assert.equal((await book("12:00")).code, 400);
reset(); classes = [{ class_id: 90, start_time: "12:00", duration: 25 }];
assert.equal((await book("12:30")).code, 409); // Five-minute gap is too short.
assert.equal((await book("12:35")).code, 201);
reset();
const simultaneous = await Promise.all([book("12:00", 2), book("12:10", 3)]);
assert.deepEqual(simultaneous.map(result => result.code).sort(), [201, 409]);
assert.equal(inserted, 1);
console.log("Booking route rejects breaks, blocked hours, short buffers, and simultaneous overlapping requests.");

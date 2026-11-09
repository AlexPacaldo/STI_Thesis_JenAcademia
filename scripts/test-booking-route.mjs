// Exercise the real route with an in-memory transactional database double.
// This verifies route behavior; production MySQL concurrency needs integration QA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { scheduleWindow, futureScheduleError, contractScheduleError, classScheduleConflict } from "../backend/scheduling.js";
import { zonedWallClockToInstant } from "../backend/lineReminders.js";
import { normalizeTime, timeToMinutes } from "../frontend/src/utils/classTime.js";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const routeStart = source.indexOf('app.post("/api/calendar/class",');
const routeEnd = source.indexOf('\n// ', routeStart);
const helperStart = source.indexOf("const ALLOWED_CLASS_DURATIONS");
const helperEnd = source.indexOf("async function getStudentPackageAvailability", helperStart);
const bookingDate = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
let handler;
let classes = [];
let availability;
let packageOverrides = {};
let participantTimezone = "UTC";
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
          return [[{ user_id: params[0], role: "teacher", timezone: participantTimezone, status: "active", profile_completed: 1 },
            { user_id: params[1], role: "student", status: "active", profile_completed: 1 }]];
        }
        if (sql.includes("FROM student_class_packages")) return [[{
          package_id: 1, total_classes: 10, classes_left: 10, class_duration: 25, created_at: "2020-01-01", status: "active", expires_at: "2099-12-31", ...packageOverrides,
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
          classes.push({ scheduled_date: params[3], teacher_timezone: "UTC", class_id: inserted, teacher_id: params[1], student_id: params[2], start_time: params[4], duration: params[6] });
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
  groupClassSchemaReady: true, groupHoldConflict: async () => false, zonedWallClockToInstant, scheduleWindow, futureScheduleError, contractScheduleError, classScheduleConflict,
  pool, requireSession() {}, requireClassBookingScope: () => () => {},
  timeToMinutes, normalizeTimeKey: normalizeTime, pad: value => String(value).padStart(2, "0"),
  getStudentPackageAvailability: async () => ({ package: null }),
  generateJitsiMeetingLink: () => "test-meeting", encryptNullableText: value => value,
  broadcastCalendarChange() {}, console,
});
async function book(time, student = 2, overrides = {}) {
  const result = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: { class_name: "English", teacher_id: 1, student_id: student,
    scheduled_date: bookingDate, start_time: time, duration: 25, ...overrides } }, result);
  return result;
}
function reset(overrides = {}) {
  classes = []; inserted = 0; packageOverrides = {}; participantTimezone = "UTC";
  availability = { status: "available", start_time: "08:00", end_time: "17:00", break_start: "11:15", break_end: "11:30", ...overrides };
}
reset(); assert.equal((await book("11:00")).code, 400); assert.equal(inserted, 0);
reset(); assert.equal((await book("10:50")).code, 201);
reset(); assert.equal((await book("16:40")).code, 400);
reset({ status: "unavailable" }); assert.equal((await book("12:00")).code, 400);
reset({ start_time: null }); assert.equal((await book("12:00")).code, 400);
reset(); classes = [{ scheduled_date: bookingDate, teacher_timezone: "UTC", class_id: 90, start_time: "12:00", duration: 25 }];
assert.equal((await book("12:20")).code, 409); // The requested lesson overlaps.
assert.equal((await book("12:25")).code, 201); // It starts as soon as the existing lesson ends.
reset();
const simultaneous = await Promise.all([book("12:00", 2), book("12:10", 3)]);
assert.deepEqual(simultaneous.map(result => result.code).sort(), [201, 409]);
assert.equal(inserted, 1);
console.log("Booking route rejects breaks, blocked hours, overlapping and simultaneous requests.");

const accessStart = source.indexOf("async function sessionMayReadTeacherAvailability(");
const accessEnd = source.indexOf("function requireTeacherAvailabilityScope(", accessStart);
const conflictsStart = source.indexOf('app.get("/api/calendar/teacher-booking-conflicts"');
const conflictsEnd = source.indexOf('\napp.get("/api/calendar/classes-by-date"', conflictsStart);
assert(accessStart >= 0 && accessEnd > accessStart && conflictsStart >= 0 && conflictsEnd > conflictsStart);
let conflictsHandler;
let assignedTeacherId = 1;
let conflictQueryCount = 0;
const conflictsPool = {
  async query(sql, params) {
    if (sql.includes("FROM student_profiles")) return [[{ assigned_teacher_id: assignedTeacherId }]];
    conflictQueryCount++;
    assert.match(sql, /SELECT c\.class_id, c\.teacher_id/);
    assert.doesNotMatch(sql, /student_name|student_email|profile_image|first_name|last_name/i);
    assert.equal(params[0], "1");
    assert.equal(params[1], "2026-11-09");
    return [[{ class_id: 90, teacher_id: 1, scheduled_date: "2026-11-09", start_time: "20:00:00",
      end_time: "20:25:00", duration: 25, teacher_timezone: "Asia/Manila" }]];
  },
};
vm.runInNewContext(source.slice(accessStart, accessEnd) + source.slice(conflictsStart, conflictsEnd), {
  app: { get: (_path, ...callbacks) => { conflictsHandler = callbacks.at(-1); } },
  requireSession() {}, pool: conflictsPool, groupClassSchemaReady: true,
  groupProposalHolds: async (_db, options) => {
    assert.equal(options.teacherId, "1");
    assert.equal(options.date, "2026-11-09");
    return [{ class_id: "group-hold-1", is_group_hold: true, scheduled_date: "2026-11-09", start_time: "21:00" }];
  },
  console,
});
async function getConflicts(session, query) {
  const result = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await conflictsHandler({ session, query }, result);
  return result;
}
const visibleConflicts = await getConflicts({ userId: 2, role: "student" }, { teacher_id: "1", scheduled_date: "2026-11-09" });
assert.equal(visibleConflicts.code, 200);
assert.equal(visibleConflicts.body.classes.map(row => row.start_time).join(","), "20:00:00,21:00");
assert.equal(JSON.stringify(visibleConflicts.body).includes("student"), false);
assert.equal(conflictQueryCount, 1);
assignedTeacherId = 9;
const privateSchedule = await getConflicts({ userId: 2, role: "student" }, { teacher_id: "1", scheduled_date: "2026-11-09" });
assert.equal(privateSchedule.code, 403);
assert.equal(conflictQueryCount, 1);
const invalidDate = await getConflicts({ userId: 2, role: "student" }, { teacher_id: "1", scheduled_date: "2026-02-30" });
assert.equal(invalidDate.code, 400);
console.log("Assigned students can check minimal teacher booking conflicts; unrelated schedules remain private.");


reset(); assert.equal((await book("10:00", 2, { scheduled_date: "2000-01-01" })).code, 400); assert.equal(inserted, 0);
reset(); assert.equal((await book("10:00", 2, { scheduled_date: "2100-01-01" })).code, 400); assert.equal(inserted, 0);
reset(); packageOverrides = { expires_at: `${bookingDate}T10:24:59Z` };
assert.equal((await book("10:00")).code, 400); assert.equal(inserted, 0);
reset(); packageOverrides = { expires_at: `${bookingDate}T10:25:00Z` };
assert.equal((await book("10:00")).code, 201);
reset({ end_time: "20:00" }); participantTimezone = "Asia/Manila";
classes = [{ class_id: 90, scheduled_date: bookingDate, start_time: "10:00", duration: 25, teacher_timezone: "UTC" }];
assert.equal((await book("18:00")).code, 409); assert.equal(inserted, 0);
assert.equal((await book("10:00")).code, 201);
console.log("Booking API rejects past dates, lessons extending past contract expiry and real-time overlaps across teacher timezones.");

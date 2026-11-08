import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { timeToMinutes, normalizeTime, humanTime } from "../frontend/src/utils/classTime.js";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const routes = new Map();
const saved = [];
const bookedClasses = [{ class_id: 1, teacher_id: 10, start_time: "10:00", end_time: "10:25" }];
const originalClasses = structuredClone(bookedClasses);
let commits = 0;
const pool = {
  async getConnection() {
    return {
      async beginTransaction() {}, async commit() { commits++; }, async rollback() {}, release() {},
      async query(sql, params) {
        assert(!/\b(UPDATE|DELETE FROM|INSERT INTO) classes\b/i.test(sql), "Availability must not modify classes");
        if (sql.includes("FROM classes")) return [bookedClasses];
        if (sql.includes("FROM users") && sql.includes("role = 'teacher'")) {
          assert.match(sql, /FOR UPDATE/);
          return [[{ user_id: 10, first_name: "Teacher", last_name: "Test" }]];
        }
        if (sql.includes("INSERT INTO teacher_availability")) {
          saved.push(params);
          return [{ insertId: 1 }];
        }
        if (sql.includes("SELECT availability_id")) return [[{ availability_id: 1 }]];
        if (sql.includes("SELECT first_name")) return [[{ first_name: "Teacher", last_name: "Test" }]];
        return [[]];
      },
    };
  },
};
const pad = value => String(value).padStart(2, "0");
for (const name of ["set-availability", "set-availability-bulk"]) {
  const start = source.indexOf(`app.post("/api/calendar/${name}",`);
  const end = source.indexOf("\n});", start) + 4;
  vm.runInNewContext(source.slice(start, end), {
    app: { post: (path, ...callbacks) => routes.set(path, callbacks.at(-1)) },
    pool, requireSession() {}, requireBodyIdentity: () => () => {}, console,
    SCHEDULE_WINDOW_MONTHS: 3, pad, timeToMinutes, normalizeTimeKey: normalizeTime,
    addMonthsClamped: (date, months) => new Date(date.getFullYear(), date.getMonth() + months, date.getDate()),
    humanTime, humanDate: value => value, encryptNullableText: value => value, broadcastCalendarChange() {},
  });
}
const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
const date = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01`;
async function save(name, overrides = {}) {
  const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await routes.get(`/api/calendar/${name}`)({ body: {
    teacher_id: 10, available_date: date,
    year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1,
    weekdays: [nextMonth.getDay()], status: "available",
    start_time: "07:35", end_time: "18:10", break_start: "12:10", break_end: "12:35",
    ...overrides,
  } }, response);
  return response;
}
assert.equal((await save("set-availability")).code, 200);
assert.equal(saved[0][3], "07:35");
assert.equal((await save("set-availability", { status: "unavailable" })).code, 200);
const bulk = await save("set-availability-bulk");
assert.equal(bulk.code, 200);
assert(bulk.body.saved_dates.includes(date));
assert(!bulk.body.skipped_dates.some(day => day.reason === "has_booked_class"));
assert.equal((await save("set-availability", { end_time: "06:00" })).code, 400);
assert.equal((await save("set-availability", { break_end: "19:00" })).code, 400);
assert.equal(commits, 3);
assert.deepEqual(bookedClasses, originalClasses);

// Exercise the UI validator with a class inside the edited availability window.
const frontend = readFileSync(new URL("../frontend/src/pages/Calendar.jsx", import.meta.url), "utf8");
const start = frontend.indexOf("  const validateAvailabilityInputs =");
const end = frontend.indexOf("  const getAvailabilityFieldError", start);
const context = vm.createContext({
  availabilityDate: date, availabilityStatus: "available", availabilityStartTime: "07:35", availabilityEndTime: "18:10",
  availabilityBreakStart: "12:10", availabilityBreakEnd: "12:35", localUserId: 10,
  classesCache: { [date]: bookedClasses }, viewerToday: new Date(), viewerTodayKey: "2000-01-01",
  scheduleWindowEndKey: "2099-12-31", SCHEDULE_WINDOW_MONTHS: 3,
  fmtDate: value => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
});
vm.runInContext(frontend.slice(start, end) + "globalThis.validate = validateAvailabilityInputs;", context);
assert.equal(context.validate(), "");
assert.equal(context.validate({ availabilityEndTime: "06:00" }), "End time must be after start time");
console.log("Availability edits and weekly patterns work on booked days; classes stay intact and time validation remains enforced.");

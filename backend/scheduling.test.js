import test from "node:test";
import assert from "node:assert/strict";
import { scheduleWindow, futureScheduleError, contractScheduleError, hasAbsoluteClassConflict } from "./scheduling.js";
import { attendanceMinutes } from "./classSession.js";
import { attendanceMinutes as uiAttendanceMinutes } from "../frontend/src/utils/classSession.js";

test("schedules reject past instants, invalid dates and nonexistent DST times", () => {
  const window = scheduleWindow("2026-11-09", "18:00", 25, "Asia/Manila");
  assert.equal(window.start, Date.parse("2026-11-09T10:00:00Z"));
  assert(futureScheduleError(window, window.start));
  assert.equal(futureScheduleError(window, window.start - 1), "");
  for (const [date, time] of [["2026-02-30", "10:00"], ["2026-11-09", "24:00"], ["2026-11-09", "10:60"], ["2026-03-08", "02:30"]]) {
    assert.equal(scheduleWindow(date, time, 25, "America/New_York"), null);
  }
});

test("the complete lesson must fit its original active contract", () => {
  const window = scheduleWindow("2026-11-09", "18:00", 25, "Asia/Manila");
  const contract = { status: "active", classes_left: 1, class_duration: 25, created_at: "2026-01-01", expires_at: new Date(window.end) };
  assert.equal(contractScheduleError(contract, window, 25), "");
  assert(contractScheduleError({ ...contract, expires_at: new Date(window.end - 1) }, window, 25));
  assert(contractScheduleError({ ...contract, status: "expired" }, window, 25));
  assert(contractScheduleError({ ...contract, classes_left: 0 }, window, 25));
  assert(contractScheduleError({ ...contract, class_duration: 50 }, window, 25));
  assert(contractScheduleError(null, window, 25));
  assert(contractScheduleError({ ...contract, expires_at: null }, window, 25));
  const monthEnd = { ...contract, created_at: "2026-01-31T10:00:00Z", expires_at: null };
  assert.equal(contractScheduleError(monthEnd, scheduleWindow("2026-04-30", "09:35", 25, "UTC"), 25), "");
  assert(contractScheduleError(monthEnd, scheduleWindow("2026-04-30", "09:36", 25, "UTC"), 25));
});

test("conflicts use real instants across teacher timezones and date boundaries", () => {
  const busy = [{ class_id: 1, scheduled_date: "2026-11-09", start_time: "10:00", duration: 25, teacher_timezone: "UTC" }];
  assert.equal(hasAbsoluteClassConflict(busy, scheduleWindow("2026-11-09", "18:00", 25, "Asia/Manila")), true);
  assert.equal(hasAbsoluteClassConflict(busy, scheduleWindow("2026-11-09", "10:00", 25, "Asia/Manila")), false);
  assert.equal(hasAbsoluteClassConflict(busy, scheduleWindow("2026-11-09", "18:25", 25, "Asia/Manila")), false);
  const previousDay = [{ ...busy[0], start_time: "23:50" }];
  assert.equal(hasAbsoluteClassConflict(previousDay, scheduleWindow("2026-11-10", "08:00", 25, "Asia/Manila")), true);
  assert.throws(() => hasAbsoluteClassConflict([{ ...busy[0], start_time: null }], scheduleWindow("2026-11-09", "18:00", 25, "Asia/Manila")));
});

test("attendance measures time shared by both participants, in either joining order", () => {
  for (const policy of [attendanceMinutes, uiAttendanceMinutes]) {
    const log = { teacher_started_at: "2026-11-09T10:00:00Z", student_joined_at: "2026-11-09T10:24:00Z", teacher_ended_at: "2026-11-09T10:25:00Z" };
    assert.equal(policy(log), 1);
    assert.equal(policy({ ...log, teacher_started_at: log.student_joined_at, student_joined_at: log.teacher_started_at }), 1);
    assert.equal(policy({ ...log, student_joined_at: null }), 0);
    assert.equal(policy({ ...log, teacher_ended_at: "2026-11-09T09:00:00Z" }), 0);
  }
});

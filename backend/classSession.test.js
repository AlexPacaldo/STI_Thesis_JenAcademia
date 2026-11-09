import test from "node:test";
import assert from "node:assert/strict";
import * as apiPolicy from "./classSession.js";
import * as uiPolicy from "../frontend/src/utils/classSession.js";
import { isClassJoinable, isClassPast } from "../frontend/src/utils/classEntry.js";
import { zonedWallClockToInstant } from "./lineReminders.js";

const start = Date.parse("2026-11-09T10:00:00Z");
const scheduled = { status: "scheduled", duration: 25 };
for (const [name, policy] of [["API", apiPolicy], ["Calendar", uiPolicy]]) {
  test(`${name}: entry is available before the scheduled start without a teacher`, () => {
    assert.equal(policy.classEntryError(scheduled, null, start, start - 60 * 60_000), "");
    assert.equal(policy.classEntryError(scheduled, null, start, start - 1), "");
    assert.equal(policy.classEntryError(scheduled, null, start, start + 20 * 60_000), "");
    assert(policy.classEntryError(scheduled, null, start, start + 25 * 60_000));
  });
  test(`${name}: a late ongoing class stays open until the teacher ends it`, () => {
    const log = { teacher_started_at: new Date(start + 20 * 60_000) };
    assert.equal(policy.classEntryError(scheduled, log, start, start + 40 * 60_000), "");
    assert(policy.classEntryError(scheduled, { ...log, teacher_ended_at: new Date(start + 45 * 60_000) }, start, start + 46 * 60_000));
    assert(policy.classEntryError(scheduled, { ...log, verification_status: "incomplete" }, start));
    for (const status of ["completed", "no-show", "cancelled"]) {
      assert(policy.classEntryError({ ...scheduled, status }, log, start));
    }
  });
  test(`${name}: early student attendance alone does not extend an unstarted class`, () => {
    assert(policy.classEntryError(scheduled, { student_joined_at: new Date(start) }, start, start + 30 * 60_000));
  });
}

test("UI entry handles formatted times, midnight and a separate verification response", () => {
  const date = "2026-11-09";
  const lesson = { ...scheduled, time: "10:00 AM" };
  assert.equal(isClassJoinable(lesson, date, new Date(2026, 10, 9, 9, 0).getTime()), true);
  assert.equal(isClassJoinable(lesson, date, new Date(2026, 10, 9, 10, 20).getTime()), true);
  assert.equal(isClassJoinable(lesson, date, new Date(2026, 10, 9, 10, 25).getTime()), false);
  assert.equal(isClassJoinable(lesson, date, new Date(2026, 10, 9, 10, 40).getTime(), { teacher_started_at: new Date(start) }), true);
  assert.equal(isClassJoinable({ ...scheduled, start_time: "00:10" }, date, new Date(2026, 10, 8, 23, 40).getTime()), true);
});

test("teacher timezone determines the API entry window, independent of host timezone", () => {
  const instant = zonedWallClockToInstant("2026-11-09", "18:00:00", "Asia/Manila");
  assert.equal(new Date(instant).getTime(), start);
  assert.equal(apiPolicy.classEntryError(scheduled, null, instant, start), "");
  assert.equal(apiPolicy.classEntryError(scheduled, null, instant, start - 31 * 60_000), "");
});

test("API and UI policies agree for attendance, screenshot and entry edge cases", () => {
  for (const log of [null, {}, { teacher_started_at: new Date(start) },
    { student_joined_at: new Date(start) }, { teacher_ended_at: new Date(start) },
    { teacher_started_at: "invalid", student_joined_at: null },
    { teacher_started_at: new Date(start), student_joined_at: new Date(start - 20 * 60_000), start_proof_uploaded_at: new Date(start + 60_000) }]) {
    assert.equal(apiPolicy.hasClassAttendance(log), uiPolicy.hasClassAttendance(log));
    assert.equal(apiPolicy.attendanceReadyAt(log), uiPolicy.attendanceReadyAt(log));
    assert.equal(apiPolicy.isStartScreenshotTimely(log), uiPolicy.isStartScreenshotTimely(log));
    for (const status of ["scheduled", "no-show", "completed", "cancelled"]) {
      for (const now of [start - 31 * 60_000, start, start + 40 * 60_000]) {
        assert.equal(apiPolicy.classEntryError({ ...scheduled, status }, log, start, now), uiPolicy.classEntryError({ ...scheduled, status }, log, start, now));
      }
    }
  }
});


test("Calendar entry and no-show timing use the profile timezone, not the device timezone", () => {
  const lesson = { ...scheduled, time: "6:00 PM", viewer_timezone: "Asia/Manila" };
  assert.equal(isClassJoinable(lesson, "2026-11-09", start), true);
  assert.equal(isClassJoinable(lesson, "2026-11-09", start - 60 * 60_000), true);
  assert.equal(isClassPast(lesson, "2026-11-09", start + 24 * 60_000), false);
  assert.equal(isClassPast(lesson, "2026-11-09", start + 25 * 60_000), true);
  const converted = { ...lesson, time: "2:00 AM", source_scheduled_date: "2026-11-09", source_start_time: "18:00", source_timezone: "Asia/Manila" };
  assert.equal(isClassJoinable(converted, "2026-11-10", start), true);
  assert.equal(apiPolicy.hasScheduledClassEnded(scheduled, start, start + 25 * 60_000), true);
});

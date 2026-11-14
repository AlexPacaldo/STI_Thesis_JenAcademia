import test from "node:test";
import assert from "node:assert/strict";
import { availabilityNotificationView } from "./availabilityNotification.js";

const options = { todayKey: "2026-11-14", endKey: "2027-02-14", viewerTimezone: "Asia/Manila" };
const record = { available_date: "2026-11-30", start_time: "23:00", end_time: "23:55", teacher_timezone: "UTC", status: "available" };

test("availability links open the schedule month and date in the student's timezone", () => {
  assert.deepEqual(availabilityNotificationView(record, options), {
    year: 2026, month: 11, date: "2026-12-01", message: "",
  });
});

test("old or deleted availability falls back to current dates with an explanation", () => {
  for (const row of [null, { ...record, available_date: "2026-10-01" }, { ...record, available_date: "2027-03-01" }]) {
    const result = availabilityNotificationView(row, options);
    assert.equal(result.year, 2026);
    assert.equal(result.month, 10);
    assert.equal(result.date, "");
    assert.match(result.message, /changed|booking window/);
  }
});

test("unavailable or incomplete records do not preselect a day without times", () => {
  for (const row of [{ ...record, status: "unavailable" }, { ...record, start_time: null }, { ...record, end_time: null }]) {
    const result = availabilityNotificationView(row, options);
    assert.equal(result.date, "");
    assert.match(result.message, /no available times/);
  }
});

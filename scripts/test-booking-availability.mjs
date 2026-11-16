import assert from "node:assert/strict";
import { bookableSlots, bookingDayAvailability } from "../frontend/src/utils/bookingAvailability.js";

const day = "2026-11-16";
const record = { available_date: day, teacher_timezone: "Asia/Manila", status: "available", start_time: "08:00", end_time: "09:00" };
const options = { duration: 25, now: Date.parse("2026-11-01T00:00:00Z"), viewerTimezone: "Asia/Manila" };
const reservation = { class_id: 1, teacher_id: 9, scheduled_date: day, start_time: "08:00", duration: 25, teacher_timezone: "Asia/Manila", status: "scheduled" };
const times = (row = record, overrides = {}) => bookableSlots(row, { ...options, ...overrides }).map(slot => slot.time);

assert(times().includes("08:00"));
const reserved = times(record, { occupied: [reservation] });
assert(!reserved.includes("08:00"));
assert(!reserved.includes("08:20"));
assert(reserved.includes("08:25")); // An adjacent lesson fits exactly.
assert.deepEqual(times(record, { occupied: [{ ...reservation, duration: 60 }] }), []);
assert.deepEqual(times(record, { duration: 50, occupied: [reservation] }), []);
assert(times(record, { duration: 25, occupied: [reservation] }).length > 0);
assert(times(record, { occupied: [{ ...reservation, status: "cancelled" }] }).includes("08:00"));
assert(times(record, { occupied: [reservation], excludeClassId: "1" }).includes("08:00"));
assert.deepEqual(times(record, { occupied: [{ ...reservation, start_time: null }] }), []);
assert.deepEqual(times({ ...record, start_time: null }), []);
assert.deepEqual(times({ ...record, status: "unavailable" }), []);
assert.deepEqual(times({ ...record, end_time: "08:20" }), []);
assert.deepEqual(times({ ...record, break_start: "08:00", break_end: "09:00" }), []);
assert.deepEqual(times({ ...record, break_start: "08:20", break_end: "08:40" }), []);
assert.deepEqual(times(record, { now: Date.parse("2026-11-16T00:36:00Z") }), []);
assert.deepEqual(times(record, { expiresAt: "2026-11-16T00:24:59Z" }), []);
assert.deepEqual(times(record, { expiresAt: "2026-11-16T00:25:00Z" }), ["08:00"]);
assert.deepEqual(times(record, { endKey: "2026-11-15" }), []);

// A viewer's next day may have availability and conflicts on a source month boundary.
const boundary = { ...record, available_date: "2026-10-31", start_time: "23:30", end_time: "23:59", teacher_timezone: "UTC" };
const boundaryOptions = { ...options, now: Date.parse("2026-10-01T00:00:00Z") };
const boundarySlots = bookableSlots(boundary, boundaryOptions);
assert(boundarySlots.length > 0);
assert(boundarySlots.every(slot => slot.date === "2026-11-01"));
const conflicting = { ...reservation, scheduled_date: "2026-10-31", teacher_timezone: "UTC", start_time: "23:30", duration: 25 };
assert.deepEqual(bookableSlots(boundary, { ...boundaryOptions, occupied: [conflicting] }), []);
const convertedRecord = { ...boundary, source_available_date: "2026-10-31", source_start_time: "23:30", source_end_time: "23:59", source_timezone: "UTC", available_date: "2026-11-01", start_time: "07:30", end_time: "07:59" };
assert.deepEqual(bookableSlots(convertedRecord, boundaryOptions), boundarySlots);

// Restrict work to the selected viewer day without losing cross-midnight slots.
for (const row of [boundary, convertedRecord, {
  ...record, start_time: "15:30", end_time: "17:00", teacher_timezone: "UTC",
}]) {
  const allSlots = bookableSlots(row, boundaryOptions);
  for (const targetDate of ["2026-10-31", "2026-11-01", "2026-11-16", "2026-11-17"]) {
    assert.deepEqual(bookableSlots(row, { ...boundaryOptions, targetDate }),
      allSlots.filter(slot => slot.date === targetDate));
  }
}

// Cached timezone formatters must still reject local times skipped by DST.
const springDay = { ...record, available_date: "2026-03-08", teacher_timezone: "America/New_York",
  start_time: "01:00", end_time: "04:00" };
const springOptions = { ...options, now: Date.parse("2026-03-01T00:00:00Z"), viewerTimezone: "America/New_York" };
const springSlots = bookableSlots(springDay, springOptions);
assert(springSlots.some(slot => slot.time === "01:00"));
assert(springSlots.some(slot => slot.time === "03:00"));
assert(springSlots.every(slot => !slot.time.startsWith("02:")));
assert.deepEqual(bookableSlots(springDay, { ...springOptions, targetDate: "2026-03-08" }), springSlots);

const days = [{ key: day }, { key: "2026-11-17" }];
assert.deepEqual(bookingDayAvailability(days, bookableSlots(record, options)), { [day]: "available", "2026-11-17": "unavailable" });
assert.deepEqual(bookingDayAvailability(days, bookableSlots(record, { ...options, occupied: [{ ...reservation, duration: 60 }] })), { [day]: "unavailable", "2026-11-17": "unavailable" });
assert.equal(bookingDayAvailability([{ key: "2026-11-01" }], boundarySlots)["2026-11-01"], "available");
console.log("Day availability and selectable slots agree for reservations, breaks, duration, rescheduling, expiry and timezone boundaries.");

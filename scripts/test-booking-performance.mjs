import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

// Count expensive formatter construction rather than depending on machine speed.
const NativeDateTimeFormat = Intl.DateTimeFormat;
let formatterCount = 0;
Intl.DateTimeFormat = class extends NativeDateTimeFormat {
  constructor(...args) {
    super(...args);
    formatterCount++;
  }
};

try {
  const { bookableSlots } = await import("../frontend/src/utils/bookingAvailability.js");
  const started = performance.now();
  const options = { duration: 50, viewerTimezone: "Asia/Manila", now: Date.parse("2026-11-01T00:00:00Z") };
  let count = 0;
  for (const day of ["2026-11-16", "2026-11-17", "2026-11-18"]) {
    const slots = bookableSlots({ available_date: day, teacher_timezone: "Asia/Manila",
      status: "available", start_time: "08:00", end_time: "18:00" }, options);
    assert(slots.length > 100);
    assert.equal(slots[0].time, "08:00");
    assert.equal(slots.at(-1).time, "17:10");
    count += slots.length;
  }
  console.log(`${count} slots: ${(performance.now() - started).toFixed(1)} ms; ${formatterCount} formatter constructions.`);
  assert(formatterCount < 100, "Slot generation must reuse timezone formatters instead of rebuilding them for every candidate.");
} finally {
  Intl.DateTimeFormat = NativeDateTimeFormat;
}

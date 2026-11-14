import { availableRanges, candidateSlotMinutes } from "./bookingTimes.js";
import { minutesToTime, timeToMinutes } from "./classTime.js";
import { DEFAULT_TIMEZONE, convertDateTime, zonedDateTimeToDate } from "./timezone.js";

// Accept API records and records already converted for display. Reservations
// are compared as instants so lessons crossing a viewer's midnight still block.
export function bookableSlots(record, {
  duration, occupied = [], viewerTimezone = DEFAULT_TIMEZONE,
  now = Date.now(), endKey = "", expiresAt = null, excludeClassId = null,
} = {}) {
  if (record?.status !== "available" || !Number.isFinite(duration) || duration <= 0) return [];
  const date = record.source_available_date || record.available_date;
  const zone = record.source_timezone || record.teacher_timezone || DEFAULT_TIMEZONE;
  const start = timeToMinutes(record.source_start_time || record.start_time);
  const end = timeToMinutes(record.source_end_time || record.end_time);
  const breakStart = timeToMinutes(record.source_break_start || record.break_start);
  const breakEnd = timeToMinutes(record.source_break_end || record.break_end);
  const midnight = zonedDateTimeToDate(date, "00:00", zone)?.getTime();
  if (!Number.isFinite(midnight)) return [];
  const busy = [];
  for (const cls of occupied) {
    if (excludeClassId != null && String(cls.id || cls.class_id) === String(excludeClassId)) continue;
    if (cls.status && cls.status !== "scheduled") continue;
    const sourceDate = cls.source_scheduled_date || cls.scheduled_date;
    const sourceTime = cls.source_start_time || cls.start_time;
    const sourceZone = cls.source_timezone || cls.teacher_timezone || DEFAULT_TIMEZONE;
    if (timeToMinutes(sourceTime) == null) return [];
    const instant = zonedDateTimeToDate(sourceDate, sourceTime, sourceZone);
    let length = Number(cls.duration);
    if (!(length > 0)) {
      length = timeToMinutes(cls.source_end_time || cls.end_time) - timeToMinutes(sourceTime);
      if (length < 0) length += 1440;
    }
    // Fail closed when a reserved range cannot be interpreted.
    if (!Number.isFinite(instant?.getTime()) || !Number.isFinite(length) || length <= 0) return [];
    const converted = convertDateTime(sourceDate, sourceTime, sourceZone, zone);
    const offset = (Date.parse(converted.date) - Date.parse(date)) / 86400000;
    const minute = timeToMinutes(converted.time) + offset * 1440;
    busy.push({ start: minute, end: minute + length, instant: instant.getTime(), length });
  }
  const expiry = expiresAt ? new Date(expiresAt).getTime() : Infinity;
  return availableRanges(start, end, breakStart, breakEnd).flatMap(range =>
    candidateSlotMinutes(range.start, range.end, duration, busy).flatMap(minute => {
      const time = minutesToTime(minute);
      const instant = zonedDateTimeToDate(date, time, zone)?.getTime();
      const finish = instant + duration * 60000;
      // The server rejects local times skipped by a daylight-saving change.
      const local = convertDateTime(date, time, zone, zone);
      if (local.date !== date || local.time !== time) return [];
      const converted = convertDateTime(date, time, zone, viewerTimezone);
      if (!Number.isFinite(instant) || instant <= now || finish > expiry
        || (endKey && converted.date > endKey)
        || busy.some(range => instant < range.instant + range.length * 60000 && finish > range.instant)) return [];
      return [{ date: converted.date, time: converted.time, teacher_timezone: zone }];
    })
  );
}

export function bookingDayAvailability(days, slots) {
  const statuses = Object.fromEntries(days.map(day => [day.key, "unavailable"]));
  for (const slot of slots) {
    if (Object.hasOwn(statuses, slot.date)) statuses[slot.date] = "available";
  }
  return statuses;
}

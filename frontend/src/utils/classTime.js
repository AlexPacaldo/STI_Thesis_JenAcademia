/**
 * The time words a student reads.
 *
 * !! These used to live inside the Calendar page, where they were readable but
 * !! not reusable. The booking wizard is its own component now, and it has to
 * !! say the same things the page says - "8:03 AM", not "08:03:00" - or the
 * !! two screens will disagree about what time it is.
 * !!
 * !! They are here so there is one answer to "what does this time look like
 * !! to a student", and so a test can reach it.
 */

import { BOOKING } from "./studentCopy.js";

/**
 * "08:03:00" -> "8:03 AM".
 *
 * Also takes a full date-time, because some rows in the database carry one.
 *
 * !! And it takes a time that is ALREADY in words - "7:50 AM" - and gives
 * !! it back as "7:50 AM".
 * !!
 * !! That sounds fussy, and it is not. `getEndTime` hands back a time in
 * !! words, and the code that shows the class wrapped it in `humanTime`
 * !! again - which turned "7:50 AM" into "7:50 AM AM". The bug is only
 * !! visible in the one place a class shows its own end time, which is the
 * !! student's list of classes, so it sat there for a while. Making this
 * !! function idempotent fixes it wherever it is called from, and the extra
 * !! "AM" cannot come back.
 */
export function humanTime(t24) {
  if (!t24) return "";
  const trimmed = String(t24).trim();
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (isoMatch) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      let hour = date.getHours();
      const mins = String(date.getMinutes()).padStart(2, "0");
      const ampm = hour >= 12 ? "PM" : "AM";
      if (hour > 12) hour -= 12;
      if (hour === 0) hour = 12;
      return `${hour}:${mins} ${ampm}`;
    }
  }

  // A time that already says AM or PM.
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    const hour = parseInt(ampmMatch[1], 10);
    const mins = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();
    if (!Number.isFinite(hour)) return "";
    return `${hour % 12 || 12}:${mins} ${period}`;
  }

  const [h, m] = trimmed.split(":");
  let hour = parseInt(h, 10);
  const mins = m || "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mins} ${ampm}`;
}

/**
 * Anything -> "HH:MM".
 *
 * Returns "" when it cannot make sense of the value, so a caller can tell
 * "no time" from "midnight".
 */
export function normalizeTime(timeStr) {
  if (!timeStr) return "";
  const t = String(timeStr).trim();
  const isoMatch = t.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (isoMatch) {
    const date = new Date(t);
    if (!isNaN(date.getTime())) {
      const hour = String(date.getHours()).padStart(2, "0");
      const mins = String(date.getMinutes()).padStart(2, "0");
      return `${hour}:${mins}`;
    }
  }

  const ampmMatch = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const mins = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${mins}`;
  }
  const plainMatch = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (plainMatch) {
    const hour = String(parseInt(plainMatch[1], 10)).padStart(2, "0");
    const mins = plainMatch[2];
    return `${hour}:${mins}`;
  }
  return "";
}

/** "08:03" -> 483. Null when there is no time. */
export function timeToMinutes(timeStr) {
  const normalized = normalizeTime(timeStr);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/** 483 -> "08:03". */
export function minutesToTime(minutes) {
  const safeMinutes = ((Number(minutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * How far a suggested time is from the one that was asked for.
 *
 * The words are a student's: "12 min later", not "12 minutes after".
 */
export function describeTimeDistance(requestedTime, suggestedTime) {
  const requestedMinutes = timeToMinutes(requestedTime);
  const suggestedMinutes = timeToMinutes(suggestedTime);
  if (requestedMinutes == null || suggestedMinutes == null) return "";
  const diff = suggestedMinutes - requestedMinutes;
  if (diff === 0) return "Exact match";
  const absDiff = Math.abs(diff);
  return `${absDiff} min ${diff > 0 ? "later" : "earlier"}`;
}

/**
 * "2026-10-21" -> "Wednesday, October 21, 2026".
 *
 * The whole day, in words, because a student should not have to work out
 * which month a number belongs to.
 */
export function formatLongDate(dateKey) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "long",
  });
}

/**
 * The name of the part of the day a time falls in.
 *
 * A student who cannot tell 8:03 AM from 17:03 needs the words, not the
 * clock, so the big time buttons carry this under the time.
 */
export function describeTimeOfDay(timeStr) {
  const minutes = timeToMinutes(timeStr);
  if (minutes == null) return "";
  if (minutes < 12 * 60) return BOOKING.morning;
  if (minutes < 17 * 60) return BOOKING.afternoon;
  return BOOKING.evening;
}

/**
 * The parts of the day, and the times in each one.
 *
 * !! "Morning", "afternoon" and "evening" are the words a student uses, and
 * !! they are also the words that let a screen ask for a whole part of the
 * !! day instead of one minute of it. A child cannot read a clock face yet;
 * !! he can very well say "morning".
 */
export const PART_OF_DAY = {
  morning: { start: 0, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 17 * 60 },
  evening: { start: 17 * 60, end: 24 * 60 },
};

/** Is this the name of a part of the day, rather than a time? */
export function isPartOfDay(value) {
  return Boolean(value && PART_OF_DAY[value]);
}

/** Is this time inside this part of the day? */
export function isTimeInPart(timeStr, part) {
  const minutes = timeToMinutes(timeStr);
  const range = PART_OF_DAY[part];
  if (minutes == null || !range) return false;
  return minutes >= range.start && minutes < range.end;
}

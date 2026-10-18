import { readStoredUser } from "./sessionUser.js";

export const DEFAULT_TIMEZONE = "Asia/Manila";

const TIMEZONE_OPTIONS = [
  "Asia/Manila",
  "Asia/Ho_Chi_Minh",
  "Asia/Taipei",
  "Asia/Seoul",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Pacific/Pago_Pago",
];

const TIMEZONE_LABELS = {
  "Asia/Manila": "Philippines - Asia/Manila",
  "Asia/Ho_Chi_Minh": "Vietnam - Asia/Ho_Chi_Minh",
  "Asia/Taipei": "Taiwan - Asia/Taipei",
  "Asia/Seoul": "Korea - Asia/Seoul",
  "America/New_York": "US Eastern - America/New_York",
  "America/Chicago": "US Central - America/Chicago",
  "America/Denver": "US Mountain - America/Denver",
  "America/Los_Angeles": "US Pacific - America/Los_Angeles",
  "Pacific/Pago_Pago": "Pacific/Pago_Pago (SST)",
};

export function formatTimezoneLabel(timezone) {
  return TIMEZONE_LABELS[timezone] || timezone;
}

export function getTimezoneOptions() {
  return TIMEZONE_OPTIONS.filter(isValidTimezone);
}

export function getUserTimezone(user, fallback = DEFAULT_TIMEZONE) {
  const timezone = user?.timezone || user?.time_zone || user?.timezoneName;
  return isValidTimezone(timezone) ? timezone : fallback;
}

export function getStoredUserTimezone(fallback = DEFAULT_TIMEZONE) {
  return getUserTimezone(readStoredUser() || {}, fallback);
}

export function isValidTimezone(timezone) {
  if (!timezone || typeof timezone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeDateKey(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateInTimezone(date, DEFAULT_TIMEZONE);
}

export function normalizeTimeKey(value) {
  if (!value) return "";
  const text = String(value).trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function zonedDateTimeToDate(dateValue, timeValue, sourceTimezone = DEFAULT_TIMEZONE) {
  const dateKey = normalizeDateKey(dateValue);
  const timeKey = normalizeTimeKey(timeValue) || "00:00";
  if (!dateKey) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const timezone = isValidTimezone(sourceTimezone) ? sourceTimezone : DEFAULT_TIMEZONE;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimezoneOffsetMs(utcGuess, timezone);
  let instant = new Date(utcGuess.getTime() - offset);

  const parts = getZonedParts(instant, timezone);
  const delta = Date.UTC(year, month - 1, day, hour, minute, 0)
    - Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  if (delta) instant = new Date(instant.getTime() + delta);
  return instant;
}

export function convertDateTime(dateValue, timeValue, sourceTimezone, targetTimezone) {
  const instant = zonedDateTimeToDate(dateValue, timeValue, sourceTimezone);
  if (!instant) return { date: normalizeDateKey(dateValue), time: normalizeTimeKey(timeValue), instant: null };

  const timezone = isValidTimezone(targetTimezone) ? targetTimezone : DEFAULT_TIMEZONE;
  return {
    date: formatDateInTimezone(instant, timezone),
    time: formatTimeInTimezone(instant, timezone),
    instant,
  };
}

export function formatDateInTimezone(date, timezone = DEFAULT_TIMEZONE, options) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatTimeInTimezone(date, timezone = DEFAULT_TIMEZONE) {
  const parts = getZonedParts(date, timezone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * Parse a timestamp the database wrote with CURRENT_TIMESTAMP.
 *
 * These columns (created_at, submitted_at, sent_at, requested_at) come back
 * through DATE_FORMAT as a naive string with no offset - "2026-10-18 13:56" -
 * and they are UTC: the columns default to CURRENT_TIMESTAMP, the pool sets no
 * session timezone, and Railway's MySQL runs in UTC.
 *
 * new Date("2026-10-18T13:56") parses that as *browser-local*, which quietly
 * reinterprets a UTC instant as local wall-clock and shifts it by the
 * difference. For a user in Asia/Manila this moved an assignment posted at
 * 9:56 PM to 1:56 PM - eight hours wrong, and wrong by exactly the UTC offset,
 * which is what made it look like a bad stored value rather than a formatting
 * bug.
 *
 * Appending Z states what the string already means.
 *
 * Do NOT use this for wall-clock columns - a due date, due time, class start or
 * end. Those are the user's local intent, not instants, and shifting them would
 * be the mirror-image error. They go through zonedDateTimeToDate.
 *
 * @returns {Date|null} null rather than an Invalid Date, so callers do not each
 *   have to remember to check.
 */
export function parseServerTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();

  // Already carries an offset, or is a full ISO string with a zone. Let Date
  // deal with it rather than reinterpreting what it already states.
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    );
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Render a database timestamp in a user's timezone.
 *
 * The counterpart to parseServerTimestamp, for the display of "when did this
 * happen". Kept here so the UTC reading and the formatting cannot drift apart
 * the way two independent formatters did.
 */
export function formatServerTimestamp(value, timezone = DEFAULT_TIMEZONE, options) {
  const instant = parseServerTimestamp(value);
  if (!instant) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...options,
  }).format(instant);
}

export function humanDate(dateValue, timezone = DEFAULT_TIMEZONE) {
  const dateKey = normalizeDateKey(dateValue);
  if (!dateKey) return "";
  const date = zonedDateTimeToDate(dateKey, "00:00", timezone);
  if (!date) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function humanTime(timeValue) {
  const timeKey = normalizeTimeKey(timeValue);
  if (!timeKey) return "";
  const [hourText, minute] = timeKey.split(":");
  let hour = Number(hourText);
  const period = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`;
}

function getTimezoneOffsetMs(date, timezone) {
  const parts = getZonedParts(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function getZonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === "24" ? 0 : Number(values.hour);
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour,
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

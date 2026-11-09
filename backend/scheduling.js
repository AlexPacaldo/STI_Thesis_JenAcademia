import { zonedWallClockToInstant, normalizeTimezone } from "./lineReminders.js";
import { CONTRACT_TERM_MONTHS } from "./contractTerms.js";

export function scheduleWindow(date, time, duration, timezone) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = String(time || "").match(/^([01]?\d|2[0-3]):([0-5]\d)(?::00)?$/);
  const minutes = Number(duration);
  if (!match || !clock || !Number.isFinite(minutes) || minutes <= 0) return null;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (day.toISOString().slice(0, 10) !== date) return null;
  const zone = normalizeTimezone(timezone);
  const start = zonedWallClockToInstant(date, `${clock[1].padStart(2, "0")}:${clock[2]}`, zone)?.getTime();
  if (!Number.isFinite(start)) return null;
  // Refuse nonexistent wall-clock times during a daylight-saving transition.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(start)).map(part => [part.type, part.value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== date
    || Number(parts.hour) !== Number(clock[1]) || parts.minute !== clock[2]) return null;
  return { start, end: start + minutes * 60_000 };
}

export function futureScheduleError(window, now = Date.now()) {
  if (!window) return "Enter a valid class date, time, and duration.";
  return window.start <= now ? "Choose a future class date and time." : "";
}

export function contractScheduleError(contract, window, duration) {
  if (!contract || contract.status !== "active" || !Number.isFinite(Number(contract.classes_left)) || Number(contract.classes_left) <= 0) {
    return "The original contract must be active and have remaining class allowance.";
  }
  if (!window) return "Enter a valid class schedule.";
  if (Number(contract.class_duration) !== Number(duration)) return "Class duration must match its contract.";
  const created = new Date(contract.created_at).getTime();
  if (!Number.isFinite(created) || window.start < created) return "The class must fall within its contract period.";
  // Legacy/newly created rows may not yet have had their deadline backfilled.
  // Use the same three-calendar-month term as MySQL DATE_ADD, including clamping.
  const purchased = new Date(created);
  const month = purchased.getUTCMonth() + CONTRACT_TERM_MONTHS;
  const lastDay = new Date(Date.UTC(purchased.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const defaultExpiry = Date.UTC(purchased.getUTCFullYear(), month, Math.min(purchased.getUTCDate(), lastDay),
    purchased.getUTCHours(), purchased.getUTCMinutes(), purchased.getUTCSeconds(), purchased.getUTCMilliseconds());
  const expires = contract.expires_at ? new Date(contract.expires_at).getTime() : defaultExpiry;
  if (!Number.isFinite(expires) || window.end > expires) return "The entire class must finish before its contract expires.";
  return "";
}

export async function readBookingContract(db, studentId, bookedAt, lock = false) {
  const [rows] = await db.query(`SELECT package_id, status, classes_left, class_duration, created_at, expires_at
    FROM student_class_packages WHERE student_id = ? AND created_at <= ?
    ORDER BY created_at DESC, package_id DESC LIMIT 1${lock ? " FOR UPDATE" : ""}`, [studentId, bookedAt]);
  return rows[0] || null;
}

export function hasAbsoluteClassConflict(rows, window) {
  return rows.some(row => {
    const busy = scheduleWindow(row.scheduled_date, row.start_time, row.duration, row.teacher_timezone);
    // An unreadable existing reservation must not silently become a free slot.
    if (!busy) throw new Error(`Invalid schedule for booked class ${row.class_id}`);
    return window.start < busy.end && window.end > busy.start;
  });
}

export async function classScheduleConflict(db, { teacherId, studentId, date, window, excludeClassId = 0, lock = true }) {
  const [rows] = await db.query(`SELECT c.class_id, c.teacher_id, c.student_id,
      DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
      TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time, c.duration, tea.timezone AS teacher_timezone
    FROM classes c JOIN users tea ON tea.user_id = c.teacher_id
    WHERE c.status = 'scheduled' AND c.class_id <> ?
      AND c.scheduled_date BETWEEN DATE_SUB(?, INTERVAL 2 DAY) AND DATE_ADD(?, INTERVAL 2 DAY)
      AND (c.teacher_id = ? OR c.student_id = ?)
    ORDER BY c.class_id${lock ? " FOR UPDATE" : ""}`,
  [excludeClassId, date, date, teacherId, studentId]);
  return hasAbsoluteClassConflict(rows, window);
}

import { classEntryError, hasScheduledClassEnded } from "./classSession.js";
import { timeToMinutes, normalizeTime } from "./classTime.js";
import { zonedDateTimeToDate } from "./timezone.js";

function scheduledStart(classInfo, selectedDate) {
  if (classInfo.source_scheduled_date && classInfo.source_start_time && classInfo.source_timezone) {
    return zonedDateTimeToDate(classInfo.source_scheduled_date, classInfo.source_start_time, classInfo.source_timezone)?.getTime() ?? NaN;
  }
  const date = selectedDate instanceof Date ? selectedDate : new Date(`${String(selectedDate).slice(0, 10)}T00:00:00`);
  const time = normalizeTime(classInfo.time || classInfo.start_time);
  if (timeToMinutes(time) == null) return NaN;
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const timezone = classInfo.viewer_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zonedDateTimeToDate(dateKey, time, timezone)?.getTime() ?? NaN;
}

// Calendar dates/times have already been converted to the viewer's timezone.
export function classEntryIssue(classInfo, selectedDate, now = Date.now(), attendance = classInfo) {
  if (!classInfo || !selectedDate) return "Please select a class first.";
  return classEntryError({ ...classInfo, duration: classInfo.duration || 50 }, attendance, scheduledStart(classInfo, selectedDate), Number(now));
}

export function isClassJoinable(classInfo, selectedDate, now = Date.now(), attendance = classInfo) {
  return !classEntryIssue(classInfo, selectedDate, now, attendance);
}

export function isClassPast(classInfo, selectedDate, now = Date.now()) {
  if (!classInfo || !selectedDate) return false;
  const start = scheduledStart(classInfo, selectedDate);
  return hasScheduledClassEnded({ ...classInfo, duration: classInfo.duration || 50 }, start, Number(now));
}

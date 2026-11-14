import { convertDateTime, DEFAULT_TIMEZONE } from "./timezone.js";

export function availabilityNotificationView(record, { todayKey, endKey, viewerTimezone }) {
  const converted = record ? convertDateTime(record.available_date, record.start_time || "00:00",
    record.teacher_timezone || DEFAULT_TIMEZONE, viewerTimezone) : null;
  const date = converted?.date || todayKey;
  const inWindow = date >= todayKey && (!endKey || date <= endKey);
  const target = inWindow ? date : todayKey;
  let message = "";
  if (!record || !inWindow) message = "This availability has changed or is no longer within your booking window. Choose another day.";
  else if (record.status !== "available" || !record.start_time || !record.end_time) {
    message = "Your teacher has no available times set for this date. Choose another day.";
  }
  const [year, month] = target.split("-").map(Number);
  return { year, month: month - 1, date: message ? "" : date, message };
}

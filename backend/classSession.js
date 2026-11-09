// Keep this pure policy in sync with frontend/src/utils/classSession.js.
// Each deployment has its own copy; parity is covered by classSession.test.js.
const timestamp = value => value == null || value === "" ? NaN : new Date(value).getTime();

export function attendanceReadyAt(log) {
  const teacher = timestamp(log?.teacher_started_at);
  const student = timestamp(log?.student_joined_at);
  return Number.isFinite(teacher) && Number.isFinite(student) ? Math.max(teacher, student) : NaN;
}

export function isStartScreenshotTimely(log) {
  const ready = attendanceReadyAt(log);
  const uploaded = timestamp(log?.start_proof_uploaded_at);
  return Number.isFinite(ready) && Number.isFinite(uploaded)
    && uploaded >= ready && uploaded - ready <= 5 * 60_000;
}

export function hasClassAttendance(log) {
  return Boolean(log?.teacher_started_at || log?.student_joined_at || log?.teacher_ended_at);
}

// A scheduled class opens 30 minutes early. Once the teacher starts, entry
// stays open until they end the session, including when the lesson runs late.
export function classEntryError(classInfo, log, scheduledStart, now = Date.now()) {
  if (classInfo?.status !== "scheduled") return "Only scheduled classes can be joined.";
  if (log?.teacher_ended_at || log?.verification_status === "incomplete") return "This class session has ended.";
  if (Number.isFinite(timestamp(log?.teacher_started_at))) return "";
  const start = timestamp(scheduledStart);
  const duration = Number(classInfo.duration);
  if (!Number.isFinite(start) || !Number.isFinite(now) || !Number.isFinite(duration) || duration <= 0) {
    return "This class has an invalid schedule. Please contact the administrator.";
  }
  if (now < start - 30 * 60_000) return "You can join 30 minutes before the class starts.";
  if (now >= start + duration * 60_000) return "This class has passed its scheduled end time. Please arrange a reschedule or contact the administrator.";
  return "";
}

export function hasScheduledClassEnded(classInfo, scheduledStart, now = Date.now()) {
  const start = timestamp(scheduledStart);
  const duration = Number(classInfo?.duration);
  return Number.isFinite(start) && Number.isFinite(now) && duration > 0
    && now >= start + duration * 60_000;
}

export function attendanceMinutes(log, endedAt = log?.teacher_ended_at) {
  const ready = attendanceReadyAt(log);
  const end = timestamp(endedAt);
  return Number.isFinite(ready) && Number.isFinite(end) ? Math.max(0, Math.floor((end - ready) / 60_000)) : 0;
}

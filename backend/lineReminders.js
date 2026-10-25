// lineReminders.js
/**
 * The reminder rules and the once-a-minute sweep behind LINE notifications.
 *
 * Everything in this file is deliberately separate from server.js:
 *
 *   - the time-zone maths and the message wording can be tested without a
 *     database, a LINE token, or a running server;
 *   - the sweep takes its database and its sender as arguments, so a test can
 *     hand it a fake and watch exactly which messages would have gone out.
 *
 * !! Class dates and times are wall-clock values in the *teacher's* time zone.
 * !! The database stores "2026-10-26 14:30" with no offset, so comparing it to
 * !! the server clock with SQL's NOW() is wrong for any student or teacher in a
 * !! different zone. zonedWallClockToInstant is the one place that turns those
 * !! two fields into a real instant; the message is then rendered again in the
 * !! recipient's own zone.
 */

const DEFAULT_TIMEZONE = "Asia/Manila";
const DEFAULT_CLASS_REMINDER_MINUTES = [30, 10];
const DEFAULT_PENDING_NUDGE_MINUTES = 120;
const DEFAULT_CONTRACT_EXPIRY_DAYS = 7;

export function normalizeDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function normalizeTimeKey(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function normalizeTimezone(value) {
  const timezone = String(value || "").trim();
  if (!timezone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getZonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimezone(timezone),
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

function getTimezoneOffsetMs(date, timezone) {
  const parts = getZonedParts(date, timezone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    date.getTime()
  );
}

/**
 * Turn a wall-clock date/time in a named zone into a real instant.
 *
 * The two-pass adjustment is what makes this survive a DST boundary: the first
 * guess uses the offset at the guessed instant, which can be the offset on the
 * wrong side of a spring-forward or fall-back; the second pass measures the
 * result and corrects by the difference.
 *
 * @returns {Date|null} null for an unusable date or time, so callers do not
 *   each have to remember to check.
 */
export function zonedWallClockToInstant(dateValue, timeValue, timezone = DEFAULT_TIMEZONE) {
  const dateKey = normalizeDateKey(dateValue);
  const timeKey = normalizeTimeKey(timeValue) || "00:00";
  if (!dateKey) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const zone = normalizeTimezone(timezone);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  if (Number.isNaN(utcGuess.getTime())) return null;

  const offset = getTimezoneOffsetMs(utcGuess, zone);
  let instant = new Date(utcGuess.getTime() - offset);

  const parts = getZonedParts(instant, zone);
  const delta =
    Date.UTC(year, month - 1, day, hour, minute, 0) -
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  if (delta) instant = new Date(instant.getTime() + delta);
  return instant;
}

/** "Oct 26, 2026, 2:30 PM" in the recipient's zone. */
export function formatMomentInTimezone(instant, timezone = DEFAULT_TIMEZONE) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimezone(timezone),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}

/** "October 26, 2026" in the recipient's zone. */
export function formatDateInTimezone(instant, timezone = DEFAULT_TIMEZONE) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimezone(timezone),
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(instant);
}

/**
 * Read a CURRENT_TIMESTAMP column as an instant.
 *
 * mysql2 normally hands back a Date for TIMESTAMP columns. If a deployment
 * enables dateStrings, the value arrives as "2026-11-02 10:00:00" with no
 * offset; this treats that as UTC, matching the database and the frontend's
 * parseServerTimestamp. Getting this wrong shifts the expiry date by the
 * server's offset, which is exactly the kind of off-by-eight-hours bug that
 * looks like bad data.
 */
function parseServerDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value || "").trim();
  if (!text) return null;
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
 * Read a comma-separated list of "minutes before class" offsets.
 *
 * Sorting ascending is what lets chooseClassReminderOffset pick the nearest
 * window. Values that are not whole minutes between 1 and 1440 are dropped.
 */
export function parseReminderMinutes(value, fallback = DEFAULT_CLASS_REMINDER_MINUTES) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const parsed = raw
    .map((item) => Number.parseInt(String(item).trim(), 10))
    .filter((minutes) => Number.isFinite(minutes) && minutes > 0 && minutes <= 24 * 60);
  const unique = [...new Set(parsed)].sort((a, b) => a - b);
  return unique.length ? unique : [...fallback];
}

/**
 * Which reminder window does a class fall into right now?
 *
 * The smallest configured offset that the class has already entered wins, so a
 * class 9 minutes away gets the 10-minute message and not the 30-minute one.
 * The one-minute grace below the smallest offset stops a sweep that arrives at
 * 10.4 minutes from sending a very late "30 minutes" notice and then the real
 * 10-minute one a minute later.
 *
 * @returns {number|null} the offset in minutes, or null when the class is more
 *   than the longest configured offset away (or already started).
 */
export function chooseClassReminderOffset(minutesUntil, offsets = DEFAULT_CLASS_REMINDER_MINUTES) {
  if (!Number.isFinite(minutesUntil) || minutesUntil <= 0) return null;

  const sorted = parseReminderMinutes(offsets);
  if (!sorted.length) return null;

  const smallest = sorted[0];
  if (minutesUntil <= smallest + 1) return smallest;

  const entered = sorted.filter((offset) => minutesUntil <= offset);
  return entered.length ? entered[0] : null;
}

/**
 * Reserve the right to send one reminder.
 *
 * !! The INSERT is the lock. A sweep that runs twice, or two app instances
 * !! behind a load balancer, both call this before sending; only the one whose
 * !! INSERT reports a new row gets to send. Doing the check with a SELECT and
 * !! then an INSERT has a gap between them, which is how a student gets the
 * !! same reminder twice.
 *
 * @returns {Promise<boolean>} true when this caller reserved it, false when it
 *   was already sent (or is being sent by another instance).
 */
export async function reserveLineReminder(
  db,
  { userId, reminderType, relatedId, occurrenceKey = "" }
) {
  const [result] = await db.query(
    `INSERT IGNORE INTO line_reminder_log
       (user_id, reminder_type, related_id, occurrence_key)
     VALUES (?, ?, ?, ?)`,
    [userId, reminderType, relatedId, occurrenceKey]
  );

  return Number(result?.affectedRows || 0) > 0;
}

/** Give the reservation back after a retryable send failure. */
export async function releaseLineReminder(
  db,
  { userId, reminderType, relatedId, occurrenceKey = "" }
) {
  await db.query(
    `DELETE FROM line_reminder_log
     WHERE user_id = ? AND reminder_type = ? AND related_id = ? AND occurrence_key = ?`,
    [userId, reminderType, relatedId, occurrenceKey]
  );
}

function lineRemindersEnabled(value) {
  if (value === null || value === undefined) return true;
  return Boolean(Number(value));
}

function fullName(firstName, lastName, fallback) {
  return `${firstName || ""} ${lastName || ""}`.trim() || fallback;
}

function pluralMinutes(minutes) {
  const value = Math.max(1, Math.round(minutes));
  return value === 1 ? "1 minute" : `${value} minutes`;
}

function appendAction(lines, actionUrl, label) {
  if (actionUrl) lines.push("", `${label}: ${actionUrl}`);
  return lines;
}

export function buildClassReminderMessage({
  minutesUntil,
  className,
  startMoment,
  otherPartyName,
  isTeacher = false,
  actionUrl = "",
}) {
  const lines = [
    `⏰ Class starts in about ${pluralMinutes(minutesUntil)}`,
    "",
    `📚 ${className || "Your class"}`,
    `🕒 ${startMoment || "See your calendar"}`,
  ];

  if (otherPartyName) {
    lines.push(`${isTeacher ? "Student" : "Teacher"}: ${otherPartyName}`);
  }

  return appendAction(lines, actionUrl, "Open your calendar").join("\n");
}

export function buildRescheduleRequestMessage({
  requesterName,
  className,
  originalMoment,
  requestedMoment,
  reason,
  actionUrl = "",
}) {
  const lines = [
    "🔄 Reschedule request",
    "",
    `${requesterName || "Someone"} wants to move "${className || "a class"}".`,
    `Now: ${originalMoment || "see your calendar"}`,
    `Proposed: ${requestedMoment || "see your calendar"}`,
  ];

  if (reason) lines.push(`Reason: ${reason}`);

  return appendAction(lines, actionUrl, "Review it in JEN Academia").join("\n");
}

export function buildRescheduleApprovedMessage({
  className,
  newMoment,
  actionUrl = "",
}) {
  const lines = [
    "✅ Reschedule approved",
    "",
    `"${className || "Your class"}" has been moved to ${newMoment || "the new time"}.`,
  ];

  return appendAction(lines, actionUrl, "Open your calendar").join("\n");
}

export function buildRescheduleDeclinedMessage({
  className,
  declinerName,
  reason,
  actionUrl = "",
}) {
  const lines = [
    "❌ Reschedule declined",
    "",
    `${declinerName || "The other party"} declined the reschedule request for "${className || "your class"}".`,
  ];

  if (reason) lines.push(`Reason: ${reason}`);

  return appendAction(lines, actionUrl, "Open JEN Academia").join("\n");
}

export function buildPendingRescheduleMessage({
  requesterName,
  className,
  originalMoment,
  requestedMoment,
  minutesUntil,
  actionUrl = "",
}) {
  const lines = [
    "⏳ A reschedule request is waiting for you",
    "",
    `${requesterName || "The other party"} asked to move "${className || "a class"}".`,
    `Now: ${originalMoment || "see your calendar"}`,
    `Proposed: ${requestedMoment || "see your calendar"}`,
    `The class is in about ${pluralMinutes(minutesUntil)}.`,
  ];

  return appendAction(lines, actionUrl, "Approve or decline").join("\n");
}

export function buildContractExpiryMessage({
  expiresOn,
  classesLeft,
  totalClasses,
  actionUrl = "",
}) {
  const lines = [
    "📅 Your contract expires soon",
    "",
    `It ends on ${expiresOn || "a date very soon"}.`,
    `You have ${Math.max(0, Number(classesLeft) || 0)} of ${Math.max(0, Number(totalClasses) || 0)} classes left to book.`,
    "Book them before it ends or they will be lost.",
  ];

  return appendAction(lines, actionUrl, "Book a class").join("\n");
}

async function sendReservedReminder({
  db,
  sendText,
  logger,
  reservation,
  lineUserId,
  message,
}) {
  try {
    await sendText(lineUserId, message);
    return true;
  } catch (err) {
    // A rate limit or a LINE outage is worth another try next minute. A blocked
    // friend or a bad token is not: retrying it every minute fills the log with
    // the same permanent error and never succeeds.
    if (err?.retryable !== false) {
      try {
        await releaseLineReminder(db, reservation);
      } catch (releaseError) {
        logger?.error?.("[line] Could not release a reminder reservation:", releaseError?.message || releaseError);
      }
    }

    logger?.error?.(
      `[line] Could not send a ${reservation.reminderType} message to user ${reservation.userId}:`,
      err?.message || err
    );
    return false;
  }
}

/**
 * Run every LINE reminder once.
 *
 * The three sections share one sweep but reserve each message before sending,
 * so a failure in one section is retried next minute without repeating any
 * message that already went out. One blocked recipient never stops the rest of
 * the loop.
 *
 * @returns {Promise<{classReminders: number, pendingNudges: number, contractExpiries: number}>}
 */
export async function runLineReminderSweep({
  db,
  sendText,
  now = new Date(),
  actionUrl = "",
  classReminderMinutes = process.env.LINE_CLASS_REMINDER_MINUTES,
  pendingNudgeMinutes = process.env.LINE_PENDING_NUDGE_MINUTES,
  contractExpiryWarningDays = DEFAULT_CONTRACT_EXPIRY_DAYS,
  logger = console,
}) {
  const counts = { classReminders: 0, pendingNudges: 0, contractExpiries: 0 };
  if (!db || typeof sendText !== "function") return counts;

  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) return counts;

  const reminderOffsets = parseReminderMinutes(classReminderMinutes);
  const nudgeMinutes = Math.max(
    1,
    Number.parseInt(String(pendingNudgeMinutes ?? DEFAULT_PENDING_NUDGE_MINUTES), 10) ||
      DEFAULT_PENDING_NUDGE_MINUTES
  );
  const expiryDays = Math.max(
    1,
    Number.parseInt(String(contractExpiryWarningDays ?? DEFAULT_CONTRACT_EXPIRY_DAYS), 10) ||
      DEFAULT_CONTRACT_EXPIRY_DAYS
  );

  // ---- class reminders -------------------------------------------------
  const [classRows] = await db.query(
    `SELECT c.class_id,
            c.class_name,
            DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
            TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
            tea.user_id AS teacher_id,
            tea.first_name AS teacher_first_name,
            tea.last_name AS teacher_last_name,
            tea.timezone AS teacher_timezone,
            tea.line_user_id AS teacher_line_user_id,
            tea.line_reminders_enabled AS teacher_line_reminders_enabled,
            stu.user_id AS student_id,
            stu.first_name AS student_first_name,
            stu.last_name AS student_last_name,
            stu.timezone AS student_timezone,
            stu.line_user_id AS student_line_user_id,
            stu.line_reminders_enabled AS student_line_reminders_enabled
       FROM classes c
       JOIN users tea ON tea.user_id = c.teacher_id
        AND tea.status = 'active'
       JOIN users stu ON stu.user_id = c.student_id
        AND stu.status = 'active'
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
      WHERE c.status = 'scheduled'
        AND c.scheduled_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                                 AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)
        AND cal.teacher_started_at IS NULL
        AND cal.student_joined_at IS NULL
        AND (tea.line_user_id IS NOT NULL OR stu.line_user_id IS NOT NULL)`
  );

  for (const row of classRows) {
    const teacherTimezone = normalizeTimezone(row.teacher_timezone);
    const startInstant = zonedWallClockToInstant(row.scheduled_date, row.start_time, teacherTimezone);
    if (!startInstant) continue;

    const minutesUntil = (startInstant.getTime() - nowDate.getTime()) / 60000;
    const offset = chooseClassReminderOffset(minutesUntil, reminderOffsets);
    if (offset === null) continue;

    const occurrenceKey = `${row.scheduled_date}T${normalizeTimeKey(row.start_time)}`;
    const reminderType = `class_${offset}m`;
    const studentName = fullName(row.student_first_name, row.student_last_name, "your student");
    const teacherName = fullName(row.teacher_first_name, row.teacher_last_name, "your teacher");
    const recipients = [
      {
        userId: row.student_id,
        lineUserId: row.student_line_user_id,
        enabled: lineRemindersEnabled(row.student_line_reminders_enabled),
        timezone: normalizeTimezone(row.student_timezone),
        otherPartyName: teacherName,
        isTeacher: false,
      },
      {
        userId: row.teacher_id,
        lineUserId: row.teacher_line_user_id,
        enabled: lineRemindersEnabled(row.teacher_line_reminders_enabled),
        timezone: teacherTimezone,
        otherPartyName: studentName,
        isTeacher: true,
      },
    ];

    for (const recipient of recipients) {
      if (!recipient.lineUserId || !recipient.enabled) continue;

      const reservation = {
        userId: recipient.userId,
        reminderType,
        relatedId: row.class_id,
        occurrenceKey,
      };

      if (!(await reserveLineReminder(db, reservation))) continue;

      const message = buildClassReminderMessage({
        minutesUntil,
        className: row.class_name,
        startMoment: formatMomentInTimezone(startInstant, recipient.timezone),
        otherPartyName: recipient.otherPartyName,
        isTeacher: recipient.isTeacher,
        actionUrl,
      });

      if (
        await sendReservedReminder({
          db,
          sendText,
          logger,
          reservation,
          lineUserId: recipient.lineUserId,
          message,
        })
      ) {
        counts.classReminders += 1;
      }
    }
  }

  // ---- pending reschedule requests ------------------------------------
  const [pendingRows] = await db.query(
    `SELECT rr.request_id,
            rr.requested_by_id,
            DATE_FORMAT(rr.requested_date, '%Y-%m-%d') AS requested_date,
            TIME_FORMAT(rr.requested_time, '%H:%i:%s') AS requested_time,
            c.class_id,
            c.class_name,
            c.teacher_id,
            c.student_id,
            DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
            TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
            tea.timezone AS teacher_timezone,
            tea.line_user_id AS teacher_line_user_id,
            tea.line_reminders_enabled AS teacher_line_reminders_enabled,
            tea.first_name AS teacher_first_name,
            tea.last_name AS teacher_last_name,
            stu.timezone AS student_timezone,
            stu.line_user_id AS student_line_user_id,
            stu.line_reminders_enabled AS student_line_reminders_enabled,
            stu.first_name AS student_first_name,
            stu.last_name AS student_last_name,
            req.first_name AS requester_first_name,
            req.last_name AS requester_last_name
       FROM reschedule_requests rr
       JOIN classes c ON c.class_id = rr.class_id
       JOIN users tea ON tea.user_id = c.teacher_id
        AND tea.status = 'active'
       JOIN users stu ON stu.user_id = c.student_id
        AND stu.status = 'active'
       JOIN users req ON req.user_id = rr.requested_by_id
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
      WHERE rr.status = 'pending'
        AND c.status = 'scheduled'
        AND c.scheduled_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                                 AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)
        AND cal.teacher_started_at IS NULL
        AND cal.student_joined_at IS NULL`
  );

  for (const row of pendingRows) {
    const teacherTimezone = normalizeTimezone(row.teacher_timezone);
    const startInstant = zonedWallClockToInstant(row.scheduled_date, row.start_time, teacherTimezone);
    if (!startInstant) continue;

    const minutesUntil = (startInstant.getTime() - nowDate.getTime()) / 60000;
    if (minutesUntil <= 5 || minutesUntil > nudgeMinutes) continue;

    const teacherIsRequester = String(row.requested_by_id) === String(row.teacher_id);
    const approver = teacherIsRequester
      ? {
          userId: row.student_id,
          lineUserId: row.student_line_user_id,
          enabled: lineRemindersEnabled(row.student_line_reminders_enabled),
          timezone: normalizeTimezone(row.student_timezone),
        }
      : {
          userId: row.teacher_id,
          lineUserId: row.teacher_line_user_id,
          enabled: lineRemindersEnabled(row.teacher_line_reminders_enabled),
          timezone: teacherTimezone,
        };

    if (!approver.lineUserId || !approver.enabled) continue;

    const reservation = {
      userId: approver.userId,
      reminderType: "reschedule_pending",
      relatedId: row.request_id,
      occurrenceKey: "",
    };
    if (!(await reserveLineReminder(db, reservation))) continue;

    const requesterName = fullName(
      row.requester_first_name,
      row.requester_last_name,
      "The other party"
    );
    const originalMoment = formatMomentInTimezone(startInstant, approver.timezone);
    const requestedInstant = zonedWallClockToInstant(
      row.requested_date,
      row.requested_time,
      teacherTimezone
    );
    const requestedMoment = formatMomentInTimezone(requestedInstant, approver.timezone);

    const message = buildPendingRescheduleMessage({
      requesterName,
      className: row.class_name,
      originalMoment,
      requestedMoment,
      minutesUntil,
      actionUrl,
    });

    if (await sendReservedReminder({ db, sendText, logger, reservation, lineUserId: approver.lineUserId, message })) {
      counts.pendingNudges += 1;
    }
  }

  // ---- contracts about to expire --------------------------------------
  const [contractRows] = await db.query(
    `SELECT p.package_id,
            p.student_id,
            p.total_classes,
            p.classes_used,
            p.expires_at,
            u.timezone AS student_timezone,
            u.line_user_id,
            u.line_reminders_enabled
       FROM student_class_packages p
       JOIN users u ON u.user_id = p.student_id
      WHERE p.status = 'active'
        AND p.expires_at IS NOT NULL
        AND p.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
        AND u.status = 'active'
        AND u.line_user_id IS NOT NULL`,
    [expiryDays]
  );

  for (const row of contractRows) {
    if (!lineRemindersEnabled(row.line_reminders_enabled)) continue;

    const reservation = {
      userId: row.student_id,
      reminderType: "contract_expiry",
      relatedId: row.package_id,
      occurrenceKey: "",
    };
    if (!(await reserveLineReminder(db, reservation))) continue;

    const expiry = parseServerDate(row.expires_at);
    const message = buildContractExpiryMessage({
      expiresOn: formatDateInTimezone(expiry, row.student_timezone),
      classesLeft: Number(row.total_classes || 0) - Number(row.classes_used || 0),
      totalClasses: row.total_classes,
      actionUrl,
    });

    if (await sendReservedReminder({ db, sendText, logger, reservation, lineUserId: row.line_user_id, message })) {
      counts.contractExpiries += 1;
    }
  }

  return counts;
}

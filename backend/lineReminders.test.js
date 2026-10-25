import test from "node:test";
import assert from "node:assert/strict";
import { LineError } from "./line.js";
import {
  buildClassReminderMessage,
  buildContractExpiryMessage,
  buildPendingRescheduleMessage,
  buildRescheduleApprovedMessage,
  buildRescheduleDeclinedMessage,
  buildRescheduleRequestMessage,
  chooseClassReminderOffset,
  formatDateInTimezone,
  formatMomentInTimezone,
  parseReminderMinutes,
  releaseLineReminder,
  reserveLineReminder,
  runLineReminderSweep,
  zonedWallClockToInstant,
} from "./lineReminders.js";

test("a wall-clock class time becomes the right instant in each zone", () => {
  const manila = zonedWallClockToInstant("2026-10-26", "14:30", "Asia/Manila");
  assert.equal(manila.toISOString(), "2026-10-26T06:30:00.000Z");

  // DST on both sides of the same zone: July is UTC-4, December is UTC-5.
  const summer = zonedWallClockToInstant("2026-07-01", "09:00", "America/New_York");
  assert.equal(summer.toISOString(), "2026-07-01T13:00:00.000Z");

  const winter = zonedWallClockToInstant("2026-12-01", "09:00", "America/New_York");
  assert.equal(winter.toISOString(), "2026-12-01T14:00:00.000Z");
});

test("an unusable date or time returns null instead of an Invalid Date", () => {
  assert.equal(zonedWallClockToInstant("", "09:00", "Asia/Manila"), null);
  assert.equal(zonedWallClockToInstant("not-a-date", "09:00", "Asia/Manila"), null);
});

test("moments are rendered in the recipient's zone", () => {
  const instant = zonedWallClockToInstant("2026-10-26", "14:30", "Asia/Manila");

  const manila = formatMomentInTimezone(instant, "Asia/Manila");
  assert.match(manila, /Oct 26, 2026/);
  assert.match(manila, /2:30/);

  const newYork = formatMomentInTimezone(instant, "America/New_York");
  assert.match(newYork, /Oct 26, 2026/);
  assert.match(newYork, /2:30 AM/);

  assert.equal(formatMomentInTimezone(null, "Asia/Manila"), "");
});

test("a date-only expiry is rendered without a time", () => {
  const expiry = new Date("2026-11-02T00:00:00.000Z");
  assert.equal(formatDateInTimezone(expiry, "Asia/Manila"), "November 2, 2026");
  assert.equal(formatDateInTimezone(null, "Asia/Manila"), "");
});

test("reminder offsets are parsed, deduplicated and sorted", () => {
  assert.deepEqual(parseReminderMinutes("30, 10, 30, nope, 0, 2000"), [10, 30]);
  assert.deepEqual(parseReminderMinutes(""), [30, 10]);
  assert.deepEqual(parseReminderMinutes("15"), [15]);
  assert.deepEqual(parseReminderMinutes([45, 5]), [5, 45]);
});

test("the nearest reminder window wins, and a late sweep does not send two", () => {
  assert.equal(chooseClassReminderOffset(31, [30, 10]), null);
  assert.equal(chooseClassReminderOffset(30, [30, 10]), 30);
  assert.equal(chooseClassReminderOffset(25, [30, 10]), 30);
  assert.equal(chooseClassReminderOffset(12, [30, 10]), 30);
  assert.equal(chooseClassReminderOffset(10.5, [30, 10]), 10);
  assert.equal(chooseClassReminderOffset(9, [30, 10]), 10);
  assert.equal(chooseClassReminderOffset(1, [30, 10]), 10);
  assert.equal(chooseClassReminderOffset(0, [30, 10]), null);
  assert.equal(chooseClassReminderOffset(-5, [30, 10]), null);
  assert.equal(chooseClassReminderOffset(25, [10]), null);
});

test("class reminder text names the class, the time and the other person", () => {
  const message = buildClassReminderMessage({
    minutesUntil: 25,
    className: "Conversational English",
    startMoment: "Oct 26, 2026, 2:30 PM",
    otherPartyName: "Ms. Cruz",
    isTeacher: false,
    actionUrl: "https://example.com/Calendar",
  });

  assert.match(message, /about 25 minutes/);
  assert.match(message, /Conversational English/);
  assert.match(message, /2:30 PM/);
  assert.match(message, /Teacher: Ms\. Cruz/);
  assert.match(message, /https:\/\/example\.com\/Calendar/);
});

test("reschedule messages carry the reason and the new time", () => {
  const request = buildRescheduleRequestMessage({
    requesterName: "Alex Pacaldo",
    className: "Conversational English",
    originalMoment: "Oct 26, 2026, 2:30 PM",
    requestedMoment: "Oct 27, 2026, 4:00 PM",
    reason: "I have an exam.",
    actionUrl: "https://example.com/Calendar",
  });
  assert.match(request, /Alex Pacaldo/);
  assert.match(request, /Oct 27, 2026, 4:00 PM/);
  assert.match(request, /Reason: I have an exam\./);

  const approved = buildRescheduleApprovedMessage({
    className: "Conversational English",
    newMoment: "Oct 27, 2026, 4:00 PM",
  });
  assert.match(approved, /Reschedule approved/);
  assert.match(approved, /Oct 27, 2026, 4:00 PM/);

  const declined = buildRescheduleDeclinedMessage({
    className: "Conversational English",
    declinerName: "Ms. Cruz",
    reason: "That slot is already booked.",
  });
  assert.match(declined, /Ms\. Cruz declined/);
  assert.match(declined, /That slot is already booked\./);

  const pending = buildPendingRescheduleMessage({
    requesterName: "Alex Pacaldo",
    className: "Conversational English",
    originalMoment: "Oct 26, 2026, 2:30 PM",
    requestedMoment: "Oct 27, 2026, 4:00 PM",
    minutesUntil: 60,
  });
  assert.match(pending, /waiting for you/);
  assert.match(pending, /about 60 minutes/);
});

test("the contract expiry message says how many classes would be lost", () => {
  const message = buildContractExpiryMessage({
    expiresOn: "November 2, 2026",
    classesLeft: 3,
    totalClasses: 10,
  });
  assert.match(message, /November 2, 2026/);
  assert.match(message, /3 of 10 classes/);
});

function createFakeDb({ classRows = [], pendingRows = [], contractRows = [] } = {}) {
  const calls = [];
  const reservations = new Set();

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (sql.includes("FROM classes c")) return [classRows];
      if (sql.includes("FROM reschedule_requests rr")) return [pendingRows];
      if (sql.includes("FROM student_class_packages p")) return [contractRows];

      if (sql.includes("INSERT IGNORE INTO line_reminder_log")) {
        const key = params.join("|");
        if (reservations.has(key)) return [{ affectedRows: 0 }];
        reservations.add(key);
        return [{ affectedRows: 1 }];
      }

      if (sql.includes("DELETE FROM line_reminder_log")) {
        reservations.delete(params.join("|"));
        return [{ affectedRows: 1 }];
      }

      return [{ affectedRows: 0 }];
    },
  };
}

const classRow = {
  class_id: 7,
  class_name: "Conversational English",
  scheduled_date: "2026-10-26",
  start_time: "14:30:00",
  teacher_id: 67,
  teacher_first_name: "Maria",
  teacher_last_name: "Cruz",
  teacher_timezone: "Asia/Manila",
  teacher_line_user_id: "U" + "t".repeat(32),
  teacher_line_reminders_enabled: 1,
  student_id: 69,
  student_first_name: "Alex",
  student_last_name: "Pacaldo",
  student_timezone: "Asia/Manila",
  student_line_user_id: "U" + "s".repeat(32),
  student_line_reminders_enabled: 1,
};

test("a sweep sends one class reminder to each linked side and reserves both", async () => {
  const db = createFakeDb({ classRows: [classRow] });
  const sends = [];
  const now = new Date("2026-10-26T06:05:00.000Z"); // 25 minutes before 14:30 Manila

  const counts = await runLineReminderSweep({
    db,
    sendText: async (to, text) => sends.push({ to, text }),
    now,
    actionUrl: "https://example.com/Calendar",
    classReminderMinutes: "30,10",
  });

  assert.deepEqual(counts, { classReminders: 2, pendingNudges: 0, contractExpiries: 0 });
  assert.equal(sends.length, 2);
  assert.equal(sends[0].to, classRow.student_line_user_id);
  assert.match(sends[0].text, /Teacher: Maria Cruz/);
  assert.match(sends[0].text, /about 25 minutes/);
  assert.equal(sends[1].to, classRow.teacher_line_user_id);
  assert.match(sends[1].text, /Student: Alex Pacaldo/);

  const reservations = db.calls.filter((call) =>
    call.sql.includes("INSERT IGNORE INTO line_reminder_log")
  );
  assert.equal(reservations.length, 2);
  assert.equal(reservations[0].params[1], "class_30m");
});

test("the same reminder is not sent twice when the sweep runs again", async () => {
  const db = createFakeDb({ classRows: [classRow] });
  const sends = [];
  const now = new Date("2026-10-26T06:05:00.000Z");

  await runLineReminderSweep({
    db,
    sendText: async (to, text) => sends.push({ to, text }),
    now,
    classReminderMinutes: "30,10",
  });
  const second = await runLineReminderSweep({
    db,
    sendText: async (to, text) => sends.push({ to, text }),
    now,
    classReminderMinutes: "30,10",
  });

  assert.equal(sends.length, 2);
  assert.deepEqual(second, { classReminders: 0, pendingNudges: 0, contractExpiries: 0 });
});

test("a retryable send failure releases the reservation for the next minute", async () => {
  const db = createFakeDb({ classRows: [classRow] });
  const now = new Date("2026-10-26T06:05:00.000Z");
  let attempts = 0;

  const counts = await runLineReminderSweep({
    db,
    sendText: async () => {
      attempts += 1;
      throw new LineError("LINE is rate limited", { status: 429, retryable: true });
    },
    now,
    classReminderMinutes: "30,10",
    logger: { error() {} },
  });

  assert.equal(counts.classReminders, 0);
  assert.equal(attempts, 2);
  const releases = db.calls.filter((call) => call.sql.includes("DELETE FROM line_reminder_log"));
  assert.equal(releases.length, 2);
});

test("a permanent send failure keeps the reservation so it is not retried forever", async () => {
  const db = createFakeDb({ classRows: [classRow] });
  const now = new Date("2026-10-26T06:05:00.000Z");

  await runLineReminderSweep({
    db,
    sendText: async () => {
      throw new LineError("The user blocked the bot", { status: 403, retryable: false });
    },
    now,
    classReminderMinutes: "30,10",
    logger: { error() {} },
  });

  const releases = db.calls.filter((call) => call.sql.includes("DELETE FROM line_reminder_log"));
  assert.equal(releases.length, 0);
});

test("a pending request nudges the approver, not the requester", async () => {
  const db = createFakeDb({
    pendingRows: [
      {
        request_id: 11,
        requested_by_id: 67, // the teacher asked
        requested_date: "2026-10-27",
        requested_time: "16:00:00",
        class_id: 7,
        class_name: "Conversational English",
        teacher_id: 67,
        student_id: 69,
        scheduled_date: "2026-10-26",
        start_time: "14:30:00",
        teacher_timezone: "Asia/Manila",
        teacher_line_user_id: classRow.teacher_line_user_id,
        teacher_line_reminders_enabled: 1,
        teacher_first_name: "Maria",
        teacher_last_name: "Cruz",
        student_timezone: "Asia/Manila",
        student_line_user_id: classRow.student_line_user_id,
        student_line_reminders_enabled: 1,
        student_first_name: "Alex",
        student_last_name: "Pacaldo",
        requester_first_name: "Maria",
        requester_last_name: "Cruz",
      },
    ],
  });
  const sends = [];
  const now = new Date("2026-10-26T05:30:00.000Z"); // 60 minutes before the class

  const counts = await runLineReminderSweep({
    db,
    sendText: async (to, text) => sends.push({ to, text }),
    now,
    pendingNudgeMinutes: 120,
  });

  assert.deepEqual(counts, { classReminders: 0, pendingNudges: 1, contractExpiries: 0 });
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, classRow.student_line_user_id);
  assert.match(sends[0].text, /Maria Cruz asked to move/);
  assert.match(sends[0].text, /Oct 27, 2026, 4:00 PM/);
});

test("a contract expiring inside the warning window sends one message", async () => {
  const db = createFakeDb({
    contractRows: [
      {
        package_id: 40,
        student_id: 69,
        total_classes: 10,
        classes_used: 7,
        expires_at: new Date("2026-11-02T00:00:00.000Z"),
        student_timezone: "Asia/Manila",
        line_user_id: classRow.student_line_user_id,
        line_reminders_enabled: 1,
      },
    ],
  });
  const sends = [];

  const counts = await runLineReminderSweep({
    db,
    sendText: async (to, text) => sends.push({ to, text }),
    now: new Date("2026-10-26T06:05:00.000Z"),
    contractExpiryWarningDays: 7,
  });

  assert.deepEqual(counts, { classReminders: 0, pendingNudges: 0, contractExpiries: 1 });
  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /3 of 10 classes/);
  assert.match(sends[0].text, /November 2, 2026/);
});

test("reserve and release use the log table as a lock", async () => {
  const db = createFakeDb();
  const reservation = {
    userId: 69,
    reminderType: "class_10m",
    relatedId: 7,
    occurrenceKey: "2026-10-26T14:30",
  };

  assert.equal(await reserveLineReminder(db, reservation), true);
  assert.equal(await reserveLineReminder(db, reservation), false);

  await releaseLineReminder(db, reservation);
  assert.equal(await reserveLineReminder(db, reservation), true);
});

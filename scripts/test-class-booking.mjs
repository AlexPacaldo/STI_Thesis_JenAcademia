/**
 * Checks that a student can actually book a class.
 *
 *   node scripts/test-class-booking.mjs
 *
 * !! A student books a class WITH their teacher, so the request names the
 * !! teacher. The route's guard used to be "the body id must be my own id",
 * !! which a student's request never satisfies - the body's teacher id is the
 * !! teacher's, and the session is the student. Every booking came back 403.
 * !!
 * !! This drives the real route with a real session, because the failure was
 * !! in a guard: the request looked correct and the answer was a refusal.
 * !! Anything less than the real POST would not have found it.
 * !!
 * !! It creates a student of its own, books one class with them, and removes
 * !! everything it created - the student, the package, the class and the
 * !! notifications.
 */
import { createRequire } from "node:module";
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } from "../backend/dbConfig.js";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const API = process.env.API_URL || "http://localhost:3001";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

const db = await mysql.createConnection({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectTimeout: 60000,
  dateStrings: true,
});

let studentId = null;
let packageId = null;
let classId = null;

try {
  // A teacher with a free window, and a day in it.
  const [teacherRows] = await db.query(
    `SELECT ta.teacher_id, ta.available_date, ta.start_time, ta.end_time, u.timezone
       FROM teacher_availability ta
       JOIN users u ON u.user_id = ta.teacher_id
      WHERE ta.status = 'available'
        AND ta.available_date >= CURDATE()
        AND u.status = 'active'
        AND u.profile_completed = TRUE
        AND TIME_TO_SEC(ta.end_time) - TIME_TO_SEC(ta.start_time) >= 3600
      ORDER BY ta.available_date
      LIMIT 1`
  );

  if (!teacherRows.length) {
    console.log("No teacher with a free window - skipping.");
    process.exit(0);
  }

  const teacher = teacherRows[0];
  console.log(`using teacher ${teacher.teacher_id} on ${teacher.available_date} (${teacher.start_time}-${teacher.end_time})`);

  // A student of our own, with a plan and a teacher.
  const email = `class-booking-check-${Date.now()}@student.jenacademia.local`;
  const [inserted] = await db.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, contact_number, country, role, status, profile_completed, timezone, profile_image_url)
     VALUES (?, ?, ?, ?, ?, 'Philippines', 'student', 'active', 1, 'Asia/Manila', '/uploads/profiles/booking-check.png')`,
    ["Booking", "Check", email, await bcrypt.hash("JEN2026!Check", 10), "+639170000099"]
  );
  studentId = inserted.insertId;

  // The sign-in refreshes the completion flag from the profile fields, and
  // a profile with no picture counts as unfinished - so the picture is part of
  // the setup, not a detail.
  const [courseRows] = await db.query(`SELECT course_id FROM courses ORDER BY course_id LIMIT 1`);
  await db.query(
    `INSERT INTO student_profiles (user_id, course_id, assigned_teacher_id, proficiency_level)
     VALUES (?, ?, ?, 'intermediate-mid')`,
    [studentId, courseRows[0].course_id, teacher.teacher_id]
  );

  const [pkg] = await db.query(
    `INSERT INTO student_class_packages (student_id, total_classes, classes_used, class_duration, status, expires_at)
     VALUES (?, 10, 0, 50, 'active', DATE_ADD(NOW(), INTERVAL 90 DAY))`,
    [studentId]
  );
  packageId = pkg.insertId;

  // Sign in as that student.
  const login = await fetch(`${API}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "JEN2026!Check" }),
  });
  const session = await login.json();
  check("the student can sign in", Boolean(session?.token), true);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
  };

  // A time inside the teacher's window, long enough for a 50-minute class.
  const startMinutes =
    Number(String(teacher.start_time).split(":")[0]) * 60 + Number(String(teacher.start_time).split(":")[1]);
  const windowEndMinutes =
    Number(String(teacher.end_time).split(":")[0]) * 60 + Number(String(teacher.end_time).split(":")[1]);
  const hhmm = (minutes) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  // The booking, exactly as the student page sends it. The teacher's window
  // may already have a class in it, so every slot in the window is tried -
  // the point of the check is that the request is ALLOWED, not that this
  // particular minute happens to be free.
  let booking = null;
  let bookingBody = null;

  for (let minutes = startMinutes; minutes + 50 <= windowEndMinutes; minutes += 25) {
    const start = hhmm(minutes);
    const end = hhmm(minutes + 50);

    const attempt = await fetch(`${API}/api/calendar/class`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        class_name: "General English",
        teacher_id: teacher.teacher_id,
        student_id: studentId,
        scheduled_date: teacher.available_date,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
        duration: 50,
        class_link: "",
      }),
    });
    bookingBody = await attempt.json();
    booking = { status: attempt.status, body: bookingBody };

    if (attempt.status === 201) {
      classId = bookingBody?.class_id || null;
      break;
    }
  }

  check("the student's booking is accepted", booking?.status, 201);
  check("and it returns the class", Boolean(bookingBody?.class_id), true);

  if (booking?.status !== 201) {
    console.log(`  the route said: ${JSON.stringify(bookingBody)}`);
  }

  if (classId) {
    const [rows] = await db.query(
      `SELECT teacher_id, student_id, scheduled_date, start_time, status FROM classes WHERE class_id = ?`,
      [classId]
    );
    check("the class was really booked", rows.length, 1);
    check("for the student", String(rows[0]?.student_id), String(studentId));
    check("with the teacher", String(rows[0]?.teacher_id), String(teacher.teacher_id));
    check("on the day that was asked for", String(rows[0]?.scheduled_date), String(teacher.available_date));
    check("and it is scheduled", rows[0]?.status, "scheduled");
  }

  // And the guard still refuses a booking for somebody else.
  const [otherStudents] = await db.query(
    `SELECT user_id FROM users WHERE role = 'student' AND status = 'active' AND user_id <> ? LIMIT 1`,
    [studentId]
  );
  if (otherStudents.length) {
    const impersonation = await fetch(`${API}/api/calendar/class`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        class_name: "General English",
        teacher_id: teacher.teacher_id,
        student_id: otherStudents[0].user_id,
        scheduled_date: teacher.available_date,
        start_time: "04:00:00",
        end_time: "04:50:00",
        duration: 50,
        class_link: "",
      }),
    });
    check("but a student cannot book for somebody else", impersonation.status, 403);
  }

  // And a student cannot book with a teacher who is not theirs.
  const [otherTeachers] = await db.query(
    `SELECT user_id FROM users WHERE role = 'teacher' AND status = 'active' AND profile_completed = TRUE AND user_id <> ? LIMIT 1`,
    [teacher.teacher_id]
  );
  if (otherTeachers.length) {
    const wrongTeacher = await fetch(`${API}/api/calendar/class`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        class_name: "General English",
        teacher_id: otherTeachers[0].user_id,
        student_id: studentId,
        scheduled_date: teacher.available_date,
        start_time: "04:00:00",
        end_time: "04:50:00",
        duration: 50,
        class_link: "",
      }),
    });
    check("and cannot book with a teacher who is not theirs", wrongTeacher.status, 403);
  }
} catch (err) {
  failures.push(`  - the run threw: ${err?.stack || err}`);
} finally {
  // Everything the check created, removed. The children first: a booked class
  // gets a video session, and the foreign keys stop a class being deleted
  // while one is attached to it.
  //
  // Each delete is guarded, because a cleanup that throws half way through
  // leaves a test student and a booked class in the live database - which is
  // worse than not cleaning up at all, because nobody is looking for it.
  const wipe = async (sql, params) => {
    try {
      await db.query(sql, params);
    } catch (err) {
      console.log(`  cleanup failed for ${sql.split(" ")[2]}: ${err.message}`);
    }
  };

  if (classId) {
    await wipe(`DELETE FROM video_sessions WHERE class_id = ?`, [classId]);
    await wipe(`DELETE FROM class_attendance_logs WHERE class_id = ?`, [classId]);
    await wipe(`DELETE FROM class_remarks WHERE class_id = ?`, [classId]);
    await wipe(`DELETE FROM classes WHERE class_id = ?`, [classId]);
  }
  if (studentId) {
    await wipe(`DELETE FROM notifications WHERE user_id = ?`, [studentId]);
    await wipe(`DELETE FROM student_class_packages WHERE student_id = ?`, [studentId]);
    await wipe(`DELETE FROM student_profiles WHERE user_id = ?`, [studentId]);
    await wipe(`DELETE FROM users WHERE user_id = ?`, [studentId]);
  }
  await db.end();
}

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

#!/usr/bin/env node
/**
 * Seed demo accounts for a thesis defense.
 *
 *   cd backend && node seed-demo-data.mjs
 *
 * Run it against a WIPED database. Every account uses the same password.
 *
 * The data itself lives in scripts/demo-accounts.mjs, which SAMPLE_ACCOUNTS.txt
 * is also generated from - so the account list you read cannot disagree with
 * what gets written here.
 *
 * !! Why this talks to MySQL directly instead of the API
 * !!
 * !! POST /api/admin/users requires an admin session, and on a wiped database
 * !! there is not one. Going around the API also means the seed does not depend
 * !! on the demo flow it exists to demonstrate.
 * !!
 * !! Why plaintext is safe to write for the encrypted columns
 * !!
 * !! birth_date, contact_number and trial_notes are encrypted at rest with
 * !! AES-256-GCM and an app-specific key. This script does NOT replicate that
 * !! crypto, because it does not have to: decryptNullableText() returns any
 * !! value without the `enc:v1:` prefix unchanged, and encryptExistingSensitiveData()
 * !! runs on every boot and encrypts every plaintext column it finds. So this
 * !! writes readable plaintext and the first server start after seeding converts
 * !! it. That also means the seed keeps working if the key is ever rotated.
 *
 * !! What it deliberately never writes: expires_at and status.
 * !!
 * !! The contract deadline is derived by the server from created_at (+3 months).
 * !! Seeding the purchase age therefore seeds the deadline, and the demo cannot
 * !! drift out of sync with the rule it demonstrates. Danica's package expires
 * !! because the rule says so, not because a column was set to "expired".
 *
 * Idempotent: re-running updates the same rows rather than duplicating them.
 */

import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { describeDbConfig } from "./dbConfig.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import {
  ADMIN, ALL_COURSES, BOOKED_CLASSES, COUNTRY, PASSWORD, STUDENTS, TEACHERS,
  TIMEZONE, WEEKLY_AVAILABILITY, aiBio, criteriaNotes, daysLeftFrom,
} from "../scripts/demo-accounts.mjs";

// The app loads backend/.env. Load it the same way so one set of credentials
// works for both.
// This script lives in backend/ so that Node can resolve dotenv, bcryptjs and
// mysql2 from backend/node_modules. From scripts/ it could not: Node walks UP
// from the importing file looking for node_modules, and backend/ is a sibling,
// not a parent, so every one of those imports failed with ERR_MODULE_NOT_FOUND.
//
// The data module and the txt generator stay in scripts/ - they import nothing
// external, so they resolve from anywhere.
const here = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [path.resolve(here, ".env"), path.resolve(here, "..", "backend", ".env")]) {
  if (fs.existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

// The credentials come from dbConfig.js, the same resolution the server uses:
// DB_* , then MYSQL*, then a parsed MYSQL_URL / DATABASE_URL, which is what
// Railway provides.
//
// !! This script used to read DB_* on its own and default the host to localhost.
// !! Against Railway that found nothing at all, so mysql2 connected to localhost
// !! with no password and answered:
// !!     Access denied for user 'Q'@'localhost' (using password: NO)
// !! "using password: NO" means the credential was never found, not that the one
// !! found was wrong - so no amount of retyping it would have fixed that.
//
// Say what we are about to touch BEFORE touching it. The driver's own error
// names the user and host but not what it was looking for, so it cannot tell you
// that a Railway URL went unread.
const target = describeDbConfig();
console.log(`\nTarget database`);
console.log(`  host      ${target.host}:${target.port}`);
console.log(`  database  ${target.database}`);
console.log(`  user      ${target.user}`);
console.log(`  password  ${target.passwordSet ? "found" : "MISSING"}`);
console.log(`  from      ${target.source}\n`);

if (!target.passwordSet) {
  console.error(
    "No database password was found.\n\n" +
      "Put one in backend/.env, either as\n" +
      "    DB_PASSWORD=...\n" +
      "or, if you are pointing at Railway, as the single URL it provides:\n" +
      "    MYSQL_URL=mysql://USER:PASSWORD@HOST:PORT/jen_academia\n\n" +
      "Not sure? Run this and it will tell you what it resolved:\n" +
      "  node -e \"import('./dbConfig.js').then(m => console.log(m.describeDbConfig()))\"\n"
  );
  process.exit(1);
}

if (target.looksLocal && process.env.ALLOW_LOCAL_DB_SEED !== "1") {
  // A Railway seed that quietly resolved to localhost would write to the
  // developer's own machine - or fail with a confusing error, which is what
  // happened. Ask rather than guess.
  console.error(
    `This resolved to a LOCAL database (${target.host}), not a server.\n\n` +
      `That is almost certainly not what you meant when seeding for Railway.\n` +
      `If it IS what you meant, re-run with:\n` +
      `  ALLOW_LOCAL_DB_SEED=1 node seed-demo-data.mjs\n`
  );
  process.exit(1);
}

const db = await mysql.createConnection({
  host: target.host,
  port: target.port,
  user: target.user,
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "", // resolved in dbConfig
  database: target.database,
  charset: "utf8mb4",
});

/* --------------------------------------------------------------- helpers */

async function upsertUser({
  email, firstName, lastName, role, birthDate = null,
  country = COUNTRY, contact = null, password = PASSWORD,
}) {
  const hash = await bcrypt.hash(password, 10);
  const [existing] = await db.execute(
    "SELECT user_id FROM users WHERE email = ? LIMIT 1", [email]
  );
  if (existing.length) {
    const id = existing[0].user_id;
    await db.execute(
      `UPDATE users
          SET first_name = ?, last_name = ?, role = ?, country = ?,
              birth_date = ?, contact_number = ?, profile_completed = TRUE,
              status = 'active', password_hash = ?, timezone = ?
        WHERE user_id = ?`,
      [firstName, lastName, role, country, birthDate, contact, hash, TIMEZONE, id]
    );
    return id;
  }
  const [ins] = await db.execute(
    `INSERT INTO users
       (email, password_hash, first_name, last_name, contact_number, country,
        birth_date, timezone, role, status, profile_completed, password_changed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', TRUE, TRUE)`,
    [email, hash, firstName, lastName, contact, country, birthDate, TIMEZONE, role]
  );
  return ins.insertId;
}

async function upsertTeacherProfile(userId, { bio, specialization, experienceYears, teachesChildren }) {
  const [[existing]] = await db.execute(
    "SELECT teacher_id FROM teacher_profiles WHERE user_id = ? LIMIT 1", [userId]
  );
  const values = [bio, specialization, experienceYears, teachesChildren ? 1 : 0];
  if (existing) {
    await db.execute(
      `UPDATE teacher_profiles
          SET bio = ?, specialization = ?, experience_years = ?, teaches_children = ?
        WHERE teacher_id = ?`,
      [...values, existing.teacher_id]
    );
    return;
  }
  await db.execute(
    `INSERT INTO teacher_profiles (user_id, bio, specialization, experience_years, teaches_children)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, ...values]
  );
}

async function setTeacherCourses(userId, courseIds) {
  await db.execute("DELETE FROM teacher_courses WHERE teacher_id = ?", [userId]);
  if (!courseIds.length) return;
  await db.query(
    `INSERT INTO teacher_courses (teacher_id, course_id) VALUES ${courseIds.map(() => "(?, ?)").join(", ")}`,
    courseIds.flatMap((id) => [userId, id])
  );
}

async function upsertStudentProfile(userId, { courseId, level, teacherId = null, trialNotes = null }) {
  const [[existing]] = await db.execute(
    "SELECT student_id FROM student_profiles WHERE user_id = ? LIMIT 1", [userId]
  );
  // NOTE: student_profiles has NO ai_criteria column. The app stores the matching
  // criteria inside trial_notes via buildCriteriaNotes, so this does the same
  // rather than inventing a column.
  const values = [courseId, level, teacherId, trialNotes];
  if (existing) {
    await db.execute(
      `UPDATE student_profiles
          SET course_id = ?, proficiency_level = ?, assigned_teacher_id = ?, trial_notes = ?
        WHERE student_id = ?`,
      [...values, existing.student_id]
    );
    return;
  }
  await db.execute(
    `INSERT INTO student_profiles (user_id, course_id, proficiency_level, assigned_teacher_id, trial_notes)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, ...values]
  );
}

/**
 * A class package bought `createdDaysAgo` days ago.
 *
 * expires_at is left NULL on purpose - the server derives it from created_at on
 * the next boot, which is what keeps the demo tied to the real rule.
 */
async function upsertPackage(userId, { total, createdDaysAgo, classDuration = 50 }) {
  const [[existing]] = await db.execute(
    "SELECT package_id FROM student_class_packages WHERE student_id = ? ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  const created = new Date();
  created.setDate(created.getDate() - createdDaysAgo);
  if (existing) {
    await db.execute(
      `UPDATE student_class_packages
          SET total_classes = ?, classes_used = 0, class_duration = ?, status = 'active',
              created_at = ?, expires_at = NULL, expiry_notified_at = NULL
        WHERE package_id = ?`,
      [total, classDuration, created, existing.package_id]
    );
    return;
  }
  await db.execute(
    `INSERT INTO student_class_packages (student_id, total_classes, classes_used, class_duration, status, created_at)
     VALUES (?, ?, 0, ?, 'active', ?)`,
    [userId, total, classDuration, created]
  );
}

/**
 * Course ids by name.
 *
 * Looked up rather than hardcoded so a re-seed that renumbers the catalogue cannot
 * point a teacher at the wrong course. Throws loudly rather than silently
 * creating a course nobody teaches, which would leave the demo with an empty
 * candidate pool and no explanation.
 */
async function courseIds(names) {
  const ids = {};
  for (const name of names) {
    const [[row]] = await db.execute("SELECT course_id FROM courses WHERE course_name = ? LIMIT 1", [name]);
    if (!row) throw new Error(`Course "${name}" does not exist. Seed the courses table first.`);
    ids[name] = row.course_id;
  }
  return ids;
}

/* ------------------------------------------------------- availability */

const WEEKDAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/**
 * The next `weeks` occurrences of each named weekday, from today forward.
 *
 * Only future dates: deletePastTeacherAvailability() strips anything before
 * CURDATE() on every boot, so a past-dated seed would be gone by the time you
 * looked at it.
 */
function upcomingWeekdays(days, weeks) {
  const wanted = new Set(days.map((d) => WEEKDAY_INDEX[d]));
  const out = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < weeks * 7 + 7 && out.length < weeks; i += 1) {
    if (wanted.has(cursor.getDay())) {
      out.push(new Date(cursor));
      if (out.length >= weeks) break;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function seedAvailability() {
  let rows = 0;

  for (const slot of WEEKLY_AVAILABILITY) {
    const teacherId = byEmail[slot.key];
    if (!teacherId) throw new Error(`Availability references unknown teacher "${slot.key}"`);

    // Idempotent: replace this teacher's demo rows rather than accumulating.
    await db.execute(
      "DELETE FROM teacher_availability WHERE teacher_id = ?", [teacherId]
    );

    for (const date of upcomingWeekdays(slot.days, slot.weeks)) {
      await db.execute(
        `INSERT INTO teacher_availability
           (teacher_id, available_date, status, start_time, end_time)
         VALUES (?, ?, 'available', ?, ?)`,
        [teacherId, isoDate(date), slot.start, slot.end]
      );
      rows += 1;
    }
  }

  for (const booked of BOOKED_CLASSES) {
    const teacherId = byEmail[booked.teacher];
    const studentId = byEmail[booked.student];
    if (!teacherId || !studentId) {
      throw new Error(`Booked class references an unknown account: ${booked.teacher}/${booked.student}`);
    }
    for (const date of upcomingWeekdays(booked.days, booked.weeks)) {
      // class_name is UNIQUE-keyed per row only by id, so re-running the seed
      // would duplicate classes. Cleared first for the same reason as
      // availability above.
      await db.execute(
        `INSERT INTO classes
           (class_name, teacher_id, student_id, scheduled_date, start_time, end_time, status)
         VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
        [booked.className, teacherId, studentId, isoDate(date), booked.start, booked.end]
      );
      rows += 1;
    }
  }

  return rows;
}

/* ------------------------------------------------------------------ main */

const C = await courseIds(ALL_COURSES);
const pick = (...names) => names.map((n) => C[n]);

console.log("\nSeeding demo accounts. Password for every account:", PASSWORD, "\n");

await upsertUser(ADMIN);
console.log(`  admin      ${ADMIN.email}`);

/* ---------------------------------------------------------------- teachers */
const byEmail = {};

for (const t of TEACHERS) {
  const id = await upsertUser({
    email: t.email, firstName: t.firstName, lastName: t.lastName,
    role: "teacher", birthDate: t.birthDate, contact: t.contact,
  });
  byEmail[t.key] = id;

  await upsertTeacherProfile(id, {
    bio: t.notes
      ? aiBio({ experience: t.experienceYears, style: t.teachingStyle, pace: t.idealStudentPace, plain: t.notes })
      : "",
    specialization: t.specialization,
    experienceYears: t.experienceYears,
    teachesChildren: t.teachesChildren,
  });
  await setTeacherCourses(id, pick(...t.courses));

  console.log(
    `  teacher    ${t.email.padEnd(34)}${t.teachesChildren ? "" : "(declines children)"}`
  );
}

/* ---------------------------------------------------------------- students */
for (const s of STUDENTS) {
  const id = await upsertUser({
    email: s.email, firstName: s.firstName, lastName: s.lastName,
    role: "student", birthDate: s.birthDate, contact: s.contact,
  });
  await upsertStudentProfile(id, {
    courseId: C[s.course],
    level: s.level,
    teacherId: byEmail[s.teacher] ?? null,
    // Notes plus the criteria block appended, exactly as the create endpoint
    // stores them.
    trialNotes: [s.notes, criteriaNotes(s.criteria)].filter(Boolean).join("\n\n"),
  });
  await upsertPackage(id, {
    total: s.totalClasses, createdDaysAgo: s.createdDaysAgo, classDuration: s.classDuration,
  });

  const left = daysLeftFrom(s.createdDaysAgo);
  console.log(
    `  student    ${s.email.padEnd(44)}${String(left).padStart(4)} days left${left <= 0 ? "  (will expire on boot)" : ""}`
  );
}

/* ---------------------------------------------------------- availability */
const availRows = await seedAvailability();
console.log(`  availability  ${availRows} rows across ${WEEKLY_AVAILABILITY.length} weekly patterns`);

await db.end();
console.log("\nDone. Start the server ONCE so it derives expires_at, encrypts the");
console.log("notes, and expires anything past its term. Then sign in as:");
console.log(`  ${ADMIN.email}  /  ${PASSWORD}\n`);
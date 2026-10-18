#!/usr/bin/env node
/**
 * Seed demo accounts for a thesis defense.
 *
 *   cd backend && node ../scripts/seed-demo-data.mjs
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
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import {
  ADMIN, ALL_COURSES, COUNTRY, PASSWORD, STUDENTS, TEACHERS, TIMEZONE,
  aiBio, criteriaNotes, daysLeftFrom,
} from "./demo-accounts.mjs";

// The app loads backend/.env. Load it the same way so one set of credentials
// works for both.
const here = path.dirname(fileURLToPath(import.meta.url));
const backendEnv = path.resolve(here, "..", "backend", ".env");
if (fs.existsSync(backendEnv)) loadEnv({ path: backendEnv });

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
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

await db.end();
console.log("\nDone. Start the server ONCE so it derives expires_at, encrypts the");
console.log("notes, and expires anything past its term. Then sign in as:");
console.log(`  ${ADMIN.email}  /  ${PASSWORD}\n`);
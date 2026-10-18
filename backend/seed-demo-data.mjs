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

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { DB_PASSWORD, describeDbConfig } from "./dbConfig.js";
// Reused rather than reimplemented, so "09:30" means the same thing here as it
// does in the matching code that compares availability against these slots.
import { toMinutes } from "./teacherMatching.js";
import { CONTRACT_TERM_MONTHS } from "./contractTerms.js";
import {
  ADMIN, ALL_COURSES, BOOKED_CLASSES, COUNTRY, PASSWORD, STUDENTS, TEACHERS,
  TIMEZONE, WEEKLY_AVAILABILITY, aiBio, criteriaNotes, daysLeftFrom,
  validateDemoAccounts,
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
//
// !! Loading .env here used to be this script's job, and it was always too late.
// !! ES modules evaluate every import before any statement of the importing
// !! module's body, so dbConfig.js had already read process.env - found it
// !! empty - and fixed DB_HOST on "localhost" with an empty password by the time
// !! the line below ran. The seeder then reported NOT SET while standing next to
// !! a perfectly good .env. dbConfig.js loads the file itself now, before it
// !! resolves, so importing it is enough.

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
console.log(`  from      ${target.source}`);
console.log(`  env file  ${target.envFile || "(none found)"}\n`);

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

if (target.looksInternal && process.env.ALLOW_INTERNAL_DB_SEED !== "1") {
  // *** THIS IS THE RAILWAY TRAP, AND IT HANGS RATHER THAN ERRORS. ***
  // Railway hands out two different URLs for the same database. The one wired up
  // inside Railway resolves on *.railway.internal, which only exists on Railway's
  // private network. From a laptop that name never resolves, so the driver waits
  // on DNS until it times out - no error message tells you the hostname is wrong,
  // because as far as the network is concerned the request was well formed.
  //
  // It is tempting to leave the app pointed at the internal URL, since that is
  // the one that works in production. That is correct for the app and wrong for
  // this script: the script runs on your machine, not inside Railway.
  console.error(
    `That is Railway's PRIVATE network address (${target.host}).\n\n` +
      `It only resolves from inside Railway's network, so this script - running on\n` +
      `your machine - will hang on DNS until it times out.\n\n` +
      `You want Railway's PUBLIC URL instead: in the Railway dashboard open the\n` +
      `MySQL service > Networking, copy the public domain, and put THAT in\n` +
      `backend/.env:\n` +
      `    MYSQL_URL=mysql://USER:PASSWORD@<public-domain>:PORT/jen_academia\n\n` +
      `Leave the app on the internal URL - that one is right for it, because the\n` +
      `app runs inside Railway. This script is the only thing that needs the\n` +
      `public one.\n`
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

if (process.env.ALLOW_WRONG_DB_SEED !== "1" && !/^jen_academia$|^railway$/i.test(target.database)) {
  // Worth a second look rather than a hard stop: the name is not something this
  // script can reason about, only the person who owns the deployment can.
  console.warn(
    `NOTE: the database name is "${target.database}", not "jen_academia".\n` +
      `If that is not the database your deployment uses, stop here.\n`
  );
}

// Validate the demo data BEFORE connecting. These are typos in a plain data
// file, and this check costs nothing and needs no database - so discovering one
// by connecting to Railway and committing 200 rows is not a reasonable way to
// learn about a mistyped key. Every problem is reported at once, because fixing
// them one run at a time means one database round trip per typo.
const dataProblems = validateDemoAccounts();
if (dataProblems.length) {
  console.error(
    `\nThe demo data is internally inconsistent. Nothing was written.\n\n` +
      dataProblems.map((p) => `  - ${p}`).join("\n") +
      `\n\nFix scripts/demo-accounts.mjs and run it again.\n`
  );
  process.exit(1);
}

const db = await mysql.createConnection({
  host: target.host,
  port: target.port,
  user: target.user,
  password: DB_PASSWORD,
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

  // Derived in SQL with the same rule the server's boot pass uses, so the value
  // is identical either way and neither copy can drift.
  //
  // !! expires_at used to be written as NULL on re-seed, on the reasoning that
  // !! the server derives it on the next boot. That left the Contracts tab
  // !! showing an empty Expires column for every student until someone
  // !! redeployed - the one step the demo depends on most, and the easiest to
  // !! forget. Worse, re-seeding actively cleared a deadline the server had
  // !! already set, so running the seed twice undid the thing it was meant to
  // !! establish.
  //
  // The deadline is plain derivable data, so it is seeded. What is NOT seeded is
  // status: expiry still happens on the server's own sweep, so the transition
  // remains the real mechanism rather than a hand-edited value.
  const expiry = "DATE_ADD(?, INTERVAL ? MONTH)";

  if (existing) {
    await db.execute(
      `UPDATE student_class_packages
          SET total_classes = ?, classes_used = 0, class_duration = ?, status = 'active',
              created_at = ?, expires_at = ${expiry}, expiry_notified_at = NULL
        WHERE package_id = ?`,
      [total, classDuration, created, created, CONTRACT_TERM_MONTHS, existing.package_id]
    );
    return;
  }
  await db.execute(
    `INSERT INTO student_class_packages
       (student_id, total_classes, classes_used, class_duration, status, created_at, expires_at)
     VALUES (?, ?, 0, ?, 'active', ?, ${expiry})`,
    [userId, total, classDuration, created, created, CONTRACT_TERM_MONTHS]
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

  // !! Clear each teacher's rows ONCE, before inserting anything.
  // !!
  // !! This DELETE used to sit inside the loop over WEEKLY_AVAILABILITY, so a
  // !! teacher's second pattern deleted the rows their first pattern had just
  // !! inserted. Five of the six demo teachers have two patterns, so the effect
  // !! was that only the LAST pattern survived for each of them: 15 rows landed
  // !! where 31 were written, and the script cheerfully reported 35.
  // !!
  // !! That is not a cosmetic shortfall. The Saturday patterns are the ones the
  // !! whole Ava scenario rests on - Rafael Santos is seeded as the single
  // !! candidate who can take her Saturday 09:00-11:00 slot, and Dario as the
  // !! exact fit on paper whose Saturdays are all booked. Both had those
  // !! Saturdays deleted by their weekday pattern. The availability columns on
  // !! the recommendation card would have shown the opposite of the demo.
  const cleared = new Set();
  for (const slot of WEEKLY_AVAILABILITY) {
    const teacherId = byKey[slot.key];
    if (!teacherId) throw new Error(`Availability references unknown teacher "${slot.key}"`);
    if (cleared.has(slot.key)) continue;

    cleared.add(slot.key);
    await db.execute("DELETE FROM teacher_availability WHERE teacher_id = ?", [teacherId]);
  }

  // What each teacher should end up with, so the count can be checked below.
  const expected = {};
  for (const slot of WEEKLY_AVAILABILITY) {
    expected[slot.key] = (expected[slot.key] || 0) + slot.weeks;
  }

  for (const slot of WEEKLY_AVAILABILITY) {
    const teacherId = byKey[slot.key];

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
    const teacherId = byKey[booked.teacher];
    const studentId = byKey[booked.student];
    if (!teacherId || !studentId) {
      throw new Error(`Booked class references an unknown account: ${booked.teacher}/${booked.student}`);
    }

    // !! Actually clear the previous run's rows. The comment here used to claim
    // !! this was done "for the same reason as availability above" while no
    // !! DELETE existed anywhere near it, so a second run of the seed appended a
    // !! duplicate set of classes instead of replacing them.
    // !! Targeted on this class name and teacher rather than clearing the table,
    // !! so seeding cannot quietly delete someone's real bookings.
    await db.execute(
      "DELETE FROM classes WHERE teacher_id = ? AND class_name = ?",
      [teacherId, booked.className]
    );

    for (const date of upcomingWeekdays(booked.days, booked.weeks)) {
      // duration is written here because the app always writes it, and a row the
      // app would never create is a poor thing to demo with.
      //
      // !! Omitting it left duration NULL, and every calendar panel derives the
      // !! end of a class from duration rather than reading end_time - so the
      // !! demo class rendered as "9:30 AM -" with nothing after the dash, on a
      // !! row whose end_time was sitting in the database the whole time.
      const durationMins = Math.max(
        0,
        (toMinutes(booked.end) ?? 0) - (toMinutes(booked.start) ?? 0)
      );
      if (!durationMins) {
        throw new Error(
          `Booked class "${booked.className}" has an unusable time range: ` +
            `${booked.start} - ${booked.end}`
        );
      }

      await db.execute(
        `INSERT INTO classes
           (class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
        [booked.className, teacherId, studentId, isoDate(date), booked.start, booked.end, durationMins]
      );
      rows += 1;
    }
  }

  // Count what is actually in the database and compare. The number this script
  // reports is how many INSERTs it issued, which stays correct even when the
  // table ends up holding something else - which is exactly how 31 written rows
  // were reported as a healthy 35 while 15 sat in the table. Read the table back
  // instead of counting statements.
  const [actual] = await db.query(
    `SELECT u.email, COUNT(*) n
       FROM teacher_availability a JOIN users u ON u.user_id = a.teacher_id
      GROUP BY u.email`
  );
  const byEmailCount = Object.fromEntries(actual.map((r) => [r.email, Number(r.n)]));
  const shortfalls = [];
  for (const [key, want] of Object.entries(expected)) {
    const teacher = TEACHERS.find((t) => t.key === key);
    const got = byEmailCount[teacher?.email] ?? 0;
    if (got !== want) shortfalls.push(`${teacher?.email}: expected ${want} rows, found ${got}`);
  }

  if (shortfalls.length) {
    throw new Error(
      `Availability did not land as expected, so the demo would not behave as\n` +
        `documented:\n${shortfalls.map((s) => `  - ${s}`).join("\n")}`
    );
  }

  // Same for the booked classes: expected count comes from the data, not a
  // literal. Hardcoding 4 here would quietly pass if someone widened `weeks`.
  const expectedClasses = {};
  for (const booked of BOOKED_CLASSES) {
    const id = `${booked.teacher}/${booked.className}`;
    expectedClasses[id] = (expectedClasses[id] || 0) + booked.weeks;
  }

  const [classRows] = await db.query(
    `SELECT u.email, c.class_name, COUNT(*) n
       FROM classes c JOIN users u ON u.user_id = c.teacher_id
      GROUP BY u.email, c.class_name`
  );
  const classShortfalls = [];
  for (const booked of BOOKED_CLASSES) {
    const teacher = TEACHERS.find((t) => t.key === booked.teacher);
    const id = `${booked.teacher}/${booked.className}`;
    const row = classRows.find(
      (r) => r.email === teacher?.email && r.class_name === booked.className
    );
    const got = Number(row?.n ?? 0);
    if (got !== expectedClasses[id]) {
      classShortfalls.push(
        `${teacher?.email} "${booked.className}": expected ${expectedClasses[id]}, found ${got}`
      );
    }
  }

  if (classShortfalls.length) {
    throw new Error(
      `Booked classes did not land as expected, so the seed is not idempotent:\n${classShortfalls
        .map((s) => `  - ${s}`)
        .join("\n")}`
    );
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
// Keyed by the short `key`, NOT by email. It was called byEmail, which is what
// made the next bug take so long to find: every lookup below passes a key like
// "alvarez", so reading "byEmail" made those lookups look wrong when they were
// not.
const byKey = {};

for (const t of TEACHERS) {
  const id = await upsertUser({
    email: t.email, firstName: t.firstName, lastName: t.lastName,
    role: "teacher", birthDate: t.birthDate, contact: t.contact,
  });
  byKey[t.key] = id;

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
  // !! Students have to go in this map too, and were not.
  // !! Only teachers were registered, so the availability loop passed - it
  // !! references teachers alone - and the very next loop, the booked classes,
  // !! threw `Booked class references an unknown account: lim/alvarez` because
  // !! byKey["alvarez"] was undefined. A dozen accounts and two hundred
  // !! availability rows were already in the database by then.
  // !! Students appear in BOOKED_CLASSES, so this map is not teachers-only
  // !! despite being built in the teachers block.
  byKey[s.key] = id;

  await upsertStudentProfile(id, {
    courseId: C[s.course],
    level: s.level,
    teacherId: byKey[s.teacher] ?? null,
    // Notes plus the criteria block appended, exactly as the create endpoint
    // stores them.
    trialNotes: [s.notes, criteriaNotes(s.criteria)].filter(Boolean).join("\n\n"),
  });
  await upsertPackage(id, {
    total: s.totalClasses, createdDaysAgo: s.createdDaysAgo, classDuration: s.classDuration,
  });

  const left = daysLeftFrom(s.createdDaysAgo);
  console.log(
    `  student    ${s.email.padEnd(44)}${String(left).padStart(4)} days left${left <= 0 ? "  (expires on the next server sweep)" : ""}`
  );
}

/* ---------------------------------------------------------- availability */
const availRows = await seedAvailability();
console.log(`  availability  ${availRows} rows across ${WEEKLY_AVAILABILITY.length} weekly patterns`);

/* ------------------------------------------------------- read it all back */

// The seeder used to finish on trust. It now checks the deadline it just wrote,
// because a blank Expires column on the Contracts tab looks identical to a
// feature that was never built - and the previous version of this script wrote
// expires_at as NULL deliberately, so nothing else would have caught it.
const [deadlines] = await db.query(
  `SELECT u.email, p.status, p.expires_at, DATEDIFF(p.expires_at, NOW()) days_left
     FROM student_class_packages p JOIN users u ON u.user_id = p.student_id`
);
const missingDeadline = deadlines.filter((d) => d.expires_at === null);
if (missingDeadline.length) {
  console.error(
    `\nWARNING: ${missingDeadline.length} package(s) have no expiry date, so the\n` +
      `Expires column will be blank for:\n` +
      missingDeadline.map((d) => `  - ${d.email}`).join("\n") +
      `\n`
  );
} else {
  const overdue = deadlines.filter((d) => d.days_left <= 0);
  console.log(`\n  deadlines   all ${deadlines.length} set`);
  for (const d of deadlines.sort((a, b) => a.days_left - b.days_left)) {
    const when =
      d.days_left < 0 ? `${Math.abs(d.days_left)} days ago`
      : d.days_left === 0 ? "today"
      : `in ${d.days_left} days`;
    const flag = d.days_left <= 0 ? " (expired)" : d.days_left <= 14 ? " (warning)" : "";
    console.log(`    ${String(when).padStart(12)}  ${d.email}${flag}`);
  }
  if (overdue.length) {
    console.log(
      `\n  ${overdue.length} package(s) are already past their term. The running\n` +
        `  server flips those to "expired" on its next sweep, within a minute -\n` +
        `  no redeploy needed.`
    );
  }
}

await db.end();
console.log("\nDone. The Expires column is populated now. Anything past its term is");
console.log("flipped by the running server's own sweep, so the expiry you show in");
console.log("the demo is the real mechanism rather than an edited value.");
console.log("Sign in as:");
console.log(`  ${ADMIN.email}  /  ${PASSWORD}\n`);
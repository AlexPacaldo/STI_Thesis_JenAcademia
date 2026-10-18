#!/usr/bin/env node
/**
 * Seed demo accounts for a thesis defense.
 *
 *   cd backend && node ../scripts/seed-demo-data.mjs
 *
 * Run it against a WIPED database. Every account below is created at the same
 * password so you can swap between them in one tab.
 *
 * !! Why this talks to MySQL directly instead of the API
 * !!
 * !! POST /api/admin/users requires an admin session, and on a wiped database
 * !! there is not one. Going around the API also means the seed does not depend
 * !! on the demo flow it is meant to demonstrate.
 * !!
 * !! Sensitive columns (birth_date, contact_number, trial_notes, ai_criteria)
 * !! are ENCRYPTED at rest with AES-256-GCM and an app-specific key. This script
 * !! does NOT replicate that crypto, because it does not have to:
 * !! decryptNullableText() returns any value without the `enc:v1:` prefix
 * !! unchanged, and encryptExistingSensitiveData() runs on every boot and
 * !! encrypts every plaintext column it finds. So this writes readable
 * !! plaintext, and the first server start after seeding converts it. That also
 * !! means the seed keeps working if the key is ever rotated.
 *
 * Idempotent: re-running updates the same rows rather than duplicating them.
 */

import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

// The app loads backend/.env. Load it the same way so one set of credentials
// works for both.
const here = path.dirname(fileURLToPath(import.meta.url));
const backendEnv = path.resolve(here, "..", "backend", ".env");
if (fs.existsSync(backendEnv)) loadEnv({ path: backendEnv });

const PASSWORD = "JEN2026!";

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
});

/* --------------------------------------------------------------- helpers */

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

/** Days left on a 90-day term, used only to print the plan back to you. */
const daysLeftFrom = (createdDaysAgo) => 90 - createdDaysAgo;

async function upsertUser({
  email, firstName, lastName, role, birthDate = null,
  country = "Philippines", contact = null, password = PASSWORD,
}) {
  const hash = await bcrypt.hash(password, 10);
  const [existing] = await db.execute(
    "SELECT user_id FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  if (existing.length) {
    const id = existing[0].user_id;
    await db.execute(
      `UPDATE users
          SET first_name = ?, last_name = ?, role = ?, country = ?,
              birth_date = ?, contact_number = ?, profile_completed = TRUE,
              status = 'active', password_hash = ?, timezone = 'Asia/Manila'
        WHERE user_id = ?`,
      [firstName, lastName, role, country, birthDate, contact, hash, id]
    );
    return id;
  }
  const [ins] = await db.execute(
    `INSERT INTO users
       (email, password_hash, first_name, last_name, contact_number, country,
        birth_date, timezone, role, status, profile_completed, password_changed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Asia/Manila', ?, 'active', TRUE, TRUE)`,
    [email, hash, firstName, lastName, contact, country, birthDate, role]
  );
  return ins.insertId;
}

async function upsertTeacherProfile(userId, { bio, specialization, experienceYears, teachesChildren }) {
  const [[existing]] = await db.execute(
    "SELECT teacher_id FROM teacher_profiles WHERE user_id = ? LIMIT 1",
    [userId]
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
    `INSERT INTO teacher_profiles
       (user_id, bio, specialization, experience_years, teaches_children)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, ...values]
  );
}

/**
 * The AI matching profile block, in the exact shape parseTeacherProfileTags reads.
 *
 * The teacher form writes this into the bio via buildTeacherAiBio, so seeding it
 * by hand is what makes the rules scorer see these teachers properly.
 */
function aiBio({ experience, style = [], pace = [], plain = "" }) {
  const lines = [`${experience} years of teaching experience.`];
  if (plain) lines.push(plain);
  lines.push("AI matching profile:");
  if (style.length) lines.push(`Teaching style: ${style.join(", ")}`);
  if (pace.length) lines.push(`Best student pace: ${pace.join(", ")}`);
  return lines.join("\n");
}

async function setTeacherCourses(userId, courseIds) {
  await db.execute("DELETE FROM teacher_courses WHERE teacher_id = ?", [userId]);
  if (!courseIds.length) return;
  await db.query(
    `INSERT INTO teacher_courses (teacher_id, course_id) VALUES ${courseIds
      .map(() => "(?, ?)")
      .join(", ")}`,
    courseIds.flatMap((id) => [userId, id])
  );
}

async function upsertStudentProfile(userId, {
  courseId, level, teacherId = null, trialNotes = null,
}) {
  const [[existing]] = await db.execute(
    "SELECT student_id FROM student_profiles WHERE user_id = ? LIMIT 1",
    [userId]
  );
  // NOTE: there is no ai_criteria column on student_profiles. The app persists
  // the matching criteria inside trial_notes via buildCriteriaNotes, so this
  // writes them there too rather than inventing a column.
  const values = [courseId, level, teacherId, trialNotes];
  if (existing) {
    await db.execute(
      `UPDATE student_profiles
          SET course_id = ?, proficiency_level = ?, assigned_teacher_id = ?,
              trial_notes = ?
        WHERE student_id = ?`,
      [...values, existing.student_id]
    );
    return;
  }
  await db.execute(
    `INSERT INTO student_profiles
       (user_id, course_id, proficiency_level, assigned_teacher_id, trial_notes)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, ...values]
  );
}

/**
 * The "AI matching criteria" block the app appends to a student's trial notes.
 *
 * Same shape buildCriteriaNotes() produces, so seeded students read exactly like
 * ones created through the form - and the advisor reads them either way, since it
 * works from the notes.
 */
function criteriaNotes(criteria) {
  const labels = {
    learningGoal: "Learning goal",
    learningStyle: "Learning style",
    focusArea: "Focus area",
    pace: "Learning pace",
  };
  const lines = Object.entries(criteria)
    .filter(([, values]) => Array.isArray(values) && values.length)
    .map(([key, values]) => `${labels[key] || key}: ${values.join(", ")}`);
  return lines.length ? `AI matching criteria:\n${lines.join("\n")}` : "";
}

/**
 * A class package, created `createdDaysAgo` days ago.
 *
 * The deadline is NOT set here on purpose. The server derives it from created_at
 * on the next boot (DATE_ADD(created_at, INTERVAL 3 MONTH)), so seeding the age
 * is seeding the deadline - which means the demo cannot drift out of sync with
 * the rule it is demonstrating.
 */
async function upsertPackage(userId, { total, createdDaysAgo, classDuration = 50 }) {
  const [[existing]] = await db.execute(
    `SELECT package_id FROM student_class_packages
      WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const created = daysAgo(createdDaysAgo);
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
    `INSERT INTO student_class_packages
       (student_id, total_classes, classes_used, class_duration, status, created_at)
     VALUES (?, ?, 0, ?, 'active', ?)`,
    [userId, total, classDuration, created]
  );
}

/* --------------------------------------------------------------- courses */

// Looked up by name rather than hardcoded id, so this survives a re-seed that
// changes the catalogue. Throws loudly rather than silently creating a course
// nobody teaches, which would leave the demo with an empty candidate pool.
async function courseIds(names) {
  const ids = {};
  for (const name of names) {
    const [[row]] = await db.execute(
      "SELECT course_id FROM courses WHERE course_name = ? LIMIT 1",
      [name]
    );
    if (!row) throw new Error(`Course "${name}" does not exist. Seed the courses table first.`);
    ids[name] = row.course_id;
  }
  return ids;
}

/* ------------------------------------------------------------------ main */

const ALL_COURSES = [
  "Business English", "Job Interview", "Online English", "News", "TOEIC",
  "IELTS", "OPIc", "Conversational English", "Travel English",
];
const C = await courseIds(ALL_COURSES);
const pick = (...names) => names.map((n) => C[n]);

console.log("\nSeeding demo accounts. Password for every account:", PASSWORD, "\n");

// ---- admin ----
await upsertUser({
  email: "admin@jenacademia.local",
  firstName: "Jennifer",
  lastName: "Santos",
  role: "admin",
  country: "Philippines",
  birthDate: "1987-04-08",
  contact: "+63917 555 0001",
});
console.log("  admin      admin@jenacademia.local");

/* ---------------------------------------------------------------- teachers */
// Six teachers, shaped so that the six behaviours the matcher has all have
// something to bite on.

const TEACHERS = [
  {
    key: "cruz",
    birthDate: "1988-03-22",
    email: "maia.cruz@jenacademia.local",
    firstName: "Maia", lastName: "Cruz",
    // The one the AI will like most for a shy child, and the one the age rule
    // must overrule. This is the single most persuasive demo in the set.
    teachesChildren: false,
    courses: pick("Conversational English", "Travel English"),
    bio: aiBio({
      experience: 9,
      style: ["conversational", "interactive"],
      pace: ["balanced"],
      plain:
        "I specialise in speaking and conversation. My students are usually quiet " +
        "adults who freeze when put on the spot, so I build sessions around " +
        "public speaking confidence and warm-up drills before any real conversation. " +
        "I do not take children - I work best with students old enough to hold a " +
        "real discussion.",
    }),
    specialization: "speaking and conversation",
    experienceYears: 9,
  },
  {
    key: "santos",
    birthDate: "1993-07-09",
    email: "rafael.santos@jenacademia.local",
    firstName: "Rafael", lastName: "Santos",
    // The correct answer for a shy child. Beats Maia on the age rule alone.
    teachesChildren: true,
    courses: pick("Conversational English", "Online English"),
    bio: aiBio({
      experience: 6,
      style: ["structured", "visual"],
      pace: ["slow"],
      plain:
        "Teaching kids and novice English for six years. I work with shy young " +
        "learners and build speaking confidence gradually through games, pictures " +
        "and lots of encouragement. Patient with beginners.",
    }),
    specialization: "kids and novice english",
    experienceYears: 6,
  },
  {
    key: "delacruz",
    birthDate: "1985-11-18",
    email: "gina.delacruz@jenacademia.local",
    firstName: "Gina", lastName: "Dela Cruz",
    // Clean strong match for the IELTS student. The easy, obvious win.
    teachesChildren: true,
    courses: pick("IELTS", "TOEIC"),
    bio: aiBio({
      experience: 12,
      style: ["structured"],
      pace: ["review-heavy"],
      plain:
        "Twelve years preparing students for IELTS and TOEIC. Heavy focus on " +
        "exam preparation, reading and vocabulary drills, and a very structured " +
        "review-heavy approach to each band score.",
    }),
    specialization: "exam preparation, grammar and writing",
    experienceYears: 12,
  },
  {
    key: "martin",
    birthDate: "1990-05-30",
    email: "ben.martin@jenacademia.local",
    firstName: "Ben", lastName: "Martin",
    // Loaded to exactly the 2-student limit, so the workload rule has to act.
    teachesChildren: true,
    courses: pick("Conversational English", "IELTS"),
    bio: aiBio({
      experience: 8,
      style: ["interactive"],
      pace: ["fast"],
      plain:
        "Fast-paced and interactive. I teach speaking and conversation, and " +
        "listening and pronunciation through live drills rather than worksheets.",
    }),
    specialization: "speaking and conversation, listening and pronunciation",
    experienceYears: 8,
  },
  {
    key: "reyes",
    birthDate: "2001-09-14",
    email: "clara.reyes@jenacademia.local",
    firstName: "Clara", lastName: "Reyes",
    // Deliberately thin profile. Ranks last and is never the answer, which is
    // what makes "closest available, not a strong match" show up.
    teachesChildren: true,
    courses: pick("Online English"),
    bio: "New teacher.",
    specialization: "",
    experienceYears: 1,
  },
  {
    key: "lim",
    birthDate: "1996-01-25",
    email: "dario.lim@jenacademia.local",
    firstName: "Dario", lastName: "Lim",
    // The generalist: teaches everything, so he is always in the pool and always
    // a credible second answer.
    teachesChildren: true,
    courses: pick(...ALL_COURSES),
    bio: aiBio({
      experience: 5,
      style: ["conversational", "structured"],
      pace: ["balanced"],
      plain:
        "Generalist across every course. I cover business English, job interview " +
        "preparation, news and travel English as well as conversation.",
    }),
    specialization:
      "speaking and conversation, business english, job interview coaching, news discussion, reading and vocabulary",
    experienceYears: 5,
  },
];

for (const t of TEACHERS) {
  const id = await upsertUser({
    email: t.email, firstName: t.firstName, lastName: t.lastName,
    role: "teacher", contact: "+63917 555 0100", birthDate: t.birthDate,
  });
  byEmail[t.key] = id;
  await upsertTeacherProfile(id, {
    bio: t.bio,
    specialization: t.specialization,
    experienceYears: t.experienceYears,
    teachesChildren: t.teachesChildren,
  });
  await setTeacherCourses(id, t.courses);
  console.log(`  teacher    ${t.email.padEnd(34)} ${t.teachesChildren ? "" : "(won't teach children)"}`);
}

/* ---------------------------------------------------------------- students */
// Existing students, so the Contracts page, the teacher's Students page and the
// expiry badges have something in them. Ava is NOT here - you create her live,
// because creating her is the demo.

// Student definitions name their teacher by key, resolved against the ids the
// teacher loop just created.
const byEmail = {};

const students = [
  {
    email: "beatrice.alvarez@student.jenacademia.local",
    firstName: "Beatrice", lastName: "Alvarez", birthDate: "1998-02-14",
    course: "IELTS", level: "intermediate-mid", teacher: "delacruz",
    notes: "Needs a band 6.5. Understands grammar well but freezes under exam conditions.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["listening"], learningStyle: ["structured"], pace: ["review-heavy"] },
    total: 12, createdDaysAgo: 10,
  },
  {
    email: "carlos.mendoza@student.jenacademia.local",
    firstName: "Carlos", lastName: "Mendoza", birthDate: "1992-07-30",
    course: "Conversational English", level: "intermediate-low", teacher: "martin",
    notes: "Very little free time between work. Wants to sound more natural in meetings.",
    criteria: { learningGoal: ["business"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["fast"] },
    // 81 days old -> 9 days left. The amber badge, and the warning a student
    // would already have received.
    total: 8, createdDaysAgo: 81,
  },
  {
    email: "danica.pope@student.jenacademia.local",
    firstName: "Danica", lastName: "Pope", birthDate: "2004-05-19",
    course: "TOEIC", level: "advanced", teacher: "delacruz",
    notes: "Scored 875. Wants a structured review before the next sitting.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["reading"], learningStyle: ["structured"], pace: ["review-heavy"] },
    // Past the 90-day term. The server flips this to 'expired' on the next sweep,
    // which is the honest demonstration rather than a hand-edited status.
    total: 6, createdDaysAgo: 100,
  },
  {
    email: "evan.torres@student.jenacademia.local",
    firstName: "Evan", lastName: "Torres", birthDate: "1996-11-02",
    course: "Conversational English", level: "intermediate-mid", teacher: "martin",
    notes: "Preparing to move abroad and wants to sound natural in an interview.",
    criteria: { learningGoal: ["interview-readiness"], focusArea: ["speaking"], learningStyle: ["interactive"], pace: ["fast"] },
    // Ben's second student - he sits exactly on the 2-student limit.
    total: 10, createdDaysAgo: 4,
  },
  {
    email: "noah.garcia@student.jenacademia.local",
    firstName: "Noah", lastName: "Garcia",
    // Deliberately NO birthday. Creates the "no birthday on file, so teachers
    // who decline children could not be ruled out" disclosure.
    birthDate: null,
    course: "Travel English", level: "intermediate-low", teacher: "cruz",
    notes: "Travelling next month. Wants to handle airport and hotel situations confidently.",
    criteria: { learningGoal: ["confidence"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["balanced"] },
    total: 10, createdDaysAgo: 5,
  },
];

for (const s of students) {
  const id = await upsertUser({
    email: s.email, firstName: s.firstName, lastName: s.lastName,
    role: "student", birthDate: s.birthDate, contact: "+63917 555 0200",
  });
  await upsertStudentProfile(id, {
    courseId: C[s.course],
    level: s.level,
    teacherId: byEmail[s.teacher] ?? null,
    // Notes and the criteria block appended together, exactly as the create
    // endpoint stores them.
    trialNotes: [s.notes, criteriaNotes(s.criteria)].filter(Boolean).join("\n\n"),
  });
  await upsertPackage(id, { total: s.total, createdDaysAgo: s.createdDaysAgo });
  console.log(
    `  student    ${s.email.padEnd(44)} ${String(daysLeftFrom(s.createdDaysAgo)).padStart(4)} days left`
  );
}

await db.end();
console.log("\nDone. Start the server once so it derives expires_at and encrypts the notes.");
console.log("Then sign in as admin@jenacademia.local with the password above.\n");
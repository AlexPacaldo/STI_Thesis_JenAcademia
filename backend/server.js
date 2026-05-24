// server.js (ESM)
import bcrypt from "bcryptjs";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import multer from "multer";
import mysql from "mysql2/promise";
import path from "path";

dotenv.config();

const PORT = process.env.PORT || 3001;
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "Aj1182014";    // <- your password here
const DB_NAME = process.env.DB_NAME || "jen_academia"; // your schema

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = path.join(process.cwd(), "uploads", "assignments");
fs.mkdirSync(uploadDir, { recursive: true });
const profileUploadDir = path.join(process.cwd(), "uploads", "profiles");
fs.mkdirSync(profileUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });
const profileStorage = multer.diskStorage({
  destination: profileUploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});
const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPG, PNG, WEBP, and GIF profile images are allowed"));
  },
});
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// MySQL pool
export const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// ---------- helpers ----------
const COUNTRY_TIMEZONES = {
  Australia: "Australia/Sydney",
  Canada: "America/Toronto",
  China: "Asia/Shanghai",
  India: "Asia/Kolkata",
  Indonesia: "Asia/Jakarta",
  Japan: "Asia/Tokyo",
  Malaysia: "Asia/Kuala_Lumpur",
  Philippines: "Asia/Manila",
  Singapore: "Asia/Singapore",
  "South Korea": "Asia/Seoul",
  Thailand: "Asia/Bangkok",
  "United Arab Emirates": "Asia/Dubai",
  "United Kingdom": "Europe/London",
  "United States": "America/New_York",
  Vietnam: "Asia/Ho_Chi_Minh",
};

function timezoneFromCountry(country) {
  return COUNTRY_TIMEZONES[String(country || "").trim()] || "Asia/Manila";
}

function normalizeTimezone(timezone, fallback = "Asia/Manila") {
  const value = String(timezone || "").trim();
  if (!value) return fallback;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return fallback;
  }
}

const pad = (n) => String(n).padStart(2, "0");
function toMySQLDateTime(isoLike) {
  if (!isoLike) return null;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function splitAssignmentDue(due) {
  if (!due) return { dueDate: null, dueTime: null };
  const [datePart, timePart = ""] = String(due).split("T");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return { dueDate: null, dueTime: null };
  }
  const dueTime = timePart ? `${timePart.slice(0, 5)}:00` : null;
  return { dueDate: datePart, dueTime };
}

function isDueDatePast(dueDate, dueTime) {
  if (!dueDate) return false;
  const now = new Date();
  const datePart = dueDate instanceof Date
    ? `${dueDate.getFullYear()}-${pad(dueDate.getMonth() + 1)}-${pad(dueDate.getDate())}`
    : String(dueDate).slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  let dueDateObj;
  
  if (dueTime) {
    const [hour, minute] = String(dueTime).split(":").map(Number);
    dueDateObj = new Date(year, month - 1, day, hour, minute, 0);
  } else {
    dueDateObj = new Date(year, month - 1, day, 23, 59, 59);
  }
  
  return dueDateObj < now;
}

function humanDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(dateStr);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function humanTime(timeStr) {
  if (!timeStr) return "";
  const [hourPart, minutePart = "00"] = String(timeStr).split(":");
  let hour = Number(hourPart);
  if (Number.isNaN(hour)) return String(timeStr);
  const minute = String(minutePart).padStart(2, "0").slice(0, 2);
  const period = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`;
}

function normalizeDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function normalizeTimeKey(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function timeToMinutes(value) {
  const timeKey = normalizeTimeKey(value);
  if (!timeKey) return null;
  const [hour, minute] = timeKey.split(":").map(Number);
  return hour * 60 + minute;
}

async function deleteLocalProfileImage(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith("/uploads/profiles/")) return;

  const fileName = path.basename(decodeURIComponent(String(imageUrl)));
  const filePath = path.resolve(profileUploadDir, fileName);
  const profileDir = path.resolve(profileUploadDir);

  if (!filePath.startsWith(profileDir + path.sep)) return;

  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("Could not delete old profile image:", err.message);
    }
  }
}

const MS_TENANT_ID = process.env.MS_TENANT_ID || "";
const MS_CLIENT_ID = process.env.MS_CLIENT_ID || "";
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || "";
const MS_TEAMS_ORGANIZER_UPN = process.env.MS_TEAMS_ORGANIZER_UPN || "";

async function getMicrosoftGraphAccessToken() {
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) {
    return null;
  }

  const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    scope: "https://graph.microsoft.com/.default",
    client_secret: MS_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Graph token error: ${response.status} ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

function formatMeetingDateTime(date, time) {
  if (!date || !time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  const dt = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
  return dt.toISOString();
}

const classSelectFields = `
  c.class_id,
  c.class_name,
  c.teacher_id,
  c.student_id,
  DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
  TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
  TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
  c.duration,
  c.class_link,
  c.status,
  c.created_at,
  c.updated_at
`;

async function createTeamsMeeting(subject, date, startTime, endTime, organizerEmail) {
  const accessToken = await getMicrosoftGraphAccessToken();
  if (!accessToken) {
    throw new Error("Microsoft Graph credentials not configured");
  }

  const organizer = organizerEmail || MS_TEAMS_ORGANIZER_UPN;
  if (!organizer) {
    throw new Error("No organizer email configured for Teams meeting creation");
  }

  const startDateTime = formatMeetingDateTime(date, startTime);
  const endDateTime = formatMeetingDateTime(date, endTime);
  if (!startDateTime || !endDateTime) {
    throw new Error("Invalid meeting start or end time");
  }

  const meetingBody = {
    subject: subject || "Jen Academia Class",
    startDateTime,
    endDateTime,
  };

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizer)}/onlineMeetings`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(meetingBody),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Graph meeting creation error: ${response.status} ${body}`);
  }

  const data = await response.json();
  if (!data.joinUrl) {
    throw new Error("Graph meeting response missing joinUrl");
  }

  return data.joinUrl;
}

function generateTeamsMeetingLink() {
  const uuid = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  const safeMeetingId = encodeURIComponent(`19:meeting_${uuid}@thread.v2`);
  return `https://teams.microsoft.com/l/meetup-join/${safeMeetingId}/0?context=%7B%22Tid%22%3A%22placeholder%22%2C%22Oid%22%3A%22placeholder%22%7D`;
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [DB_NAME, tableName, columnName]
  );
  return rows.length > 0;
}

async function deletePastTeacherAvailability(teacherId = null) {
  if (teacherId) {
    await pool.query(
      "DELETE FROM teacher_availability WHERE teacher_id = ? AND available_date < CURDATE()",
      [teacherId]
    );
    return;
  }

  await pool.query("DELETE FROM teacher_availability WHERE available_date < CURDATE()");
}

async function ensureAssignmentAttemptColumns() {
  await pool.query("ALTER TABLE assignments MODIFY COLUMN due_date DATE NULL");
  await pool.query("ALTER TABLE assignment_submissions MODIFY COLUMN file_url VARCHAR(1000) DEFAULT NULL");

  if (!(await columnExists("assignments", "attempt_limit"))) {
    await pool.query("ALTER TABLE assignments ADD COLUMN attempt_limit INT DEFAULT NULL AFTER due_time");
  }

  if (!(await columnExists("assignment_submissions", "attempt_count"))) {
    await pool.query("ALTER TABLE assignment_submissions ADD COLUMN attempt_count INT NOT NULL DEFAULT 1 AFTER file_url");
  }
}

async function ensureBooksColumns() {
  if (!(await columnExists("books", "teacher_id"))) {
    await pool.query("ALTER TABLE books ADD COLUMN teacher_id INT DEFAULT NULL AFTER course_id");
    await pool.query("ALTER TABLE books ADD INDEX idx_teacher_id (teacher_id)");
  }

  if (!(await columnExists("books", "cover_url"))) {
    await pool.query("ALTER TABLE books ADD COLUMN cover_url VARCHAR(1000) DEFAULT NULL AFTER teacher_id");
  }
}

async function ensureLessonsColumns() {
  if (!(await columnExists("lessons", "file_path"))) {
    await pool.query("ALTER TABLE lessons ADD COLUMN file_path VARCHAR(500) DEFAULT NULL AFTER content");
  }
}

async function ensureLessonProgressTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_progress (
      progress_id INT NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      lesson_id INT NOT NULL,
      progress_percentage INT NOT NULL DEFAULT 0,
      is_completed TINYINT(1) NOT NULL DEFAULT 0,
      started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      time_spent_minutes INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (progress_id),
      UNIQUE KEY unique_student_lesson (student_id, lesson_id),
      KEY idx_lesson_progress_student (student_id),
      KEY idx_lesson_progress_lesson (lesson_id),
      KEY idx_lesson_progress_completed (is_completed),
      CONSTRAINT lesson_progress_student_fk FOREIGN KEY (student_id) REFERENCES users (user_id),
      CONSTRAINT lesson_progress_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons (lesson_id) ON DELETE CASCADE
    )
  `);

  if (!(await columnExists("lesson_progress", "progress_percentage"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN progress_percentage INT NOT NULL DEFAULT 0 AFTER lesson_id");
  }

  if (!(await columnExists("lesson_progress", "started_at"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER is_completed");
  }

  if (!(await columnExists("lesson_progress", "completed_at"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL AFTER started_at");
  }

  if (!(await columnExists("lesson_progress", "time_spent_minutes"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN time_spent_minutes INT NOT NULL DEFAULT 0 AFTER completed_at");
  }

  if (!(await columnExists("lesson_progress", "updated_at"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER time_spent_minutes");
  } else {
    await pool.query("ALTER TABLE lesson_progress MODIFY COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  }
}

async function ensureStudentCourseProgressTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_course_progress (
      progress_id INT NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      book_id INT NOT NULL,
      course_id INT NOT NULL,
      status ENUM('In Progress','Completed') NOT NULL DEFAULT 'In Progress',
      completed_lessons INT NOT NULL DEFAULT 0,
      total_lessons INT NOT NULL DEFAULT 0,
      progress_percentage INT NOT NULL DEFAULT 0,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (progress_id),
      UNIQUE KEY unique_student_book_progress (student_id, book_id),
      KEY idx_student_course_progress_student (student_id),
      KEY idx_student_course_progress_book (book_id),
      KEY idx_student_course_progress_course (course_id),
      KEY idx_student_course_progress_status (status),
      CONSTRAINT student_course_progress_student_fk FOREIGN KEY (student_id) REFERENCES users (user_id),
      CONSTRAINT student_course_progress_book_fk FOREIGN KEY (book_id) REFERENCES books (book_id) ON DELETE CASCADE,
      CONSTRAINT student_course_progress_course_fk FOREIGN KEY (course_id) REFERENCES courses (course_id)
    )
  `);
}

async function ensureUserProfileImageColumn() {
  if (!(await columnExists("users", "profile_image_url"))) {
    await pool.query("ALTER TABLE users ADD COLUMN profile_image_url VARCHAR(500) DEFAULT NULL AFTER contact_number");
  }
}

async function ensureUserPasswordChangedColumn() {
  if (!(await columnExists("users", "password_changed"))) {
    await pool.query("ALTER TABLE users ADD COLUMN password_changed BOOLEAN DEFAULT FALSE AFTER profile_completed");
  }
}

async function ensureUserDemographicsColumns() {
  if (!(await columnExists("users", "country"))) {
    await pool.query("ALTER TABLE users ADD COLUMN country VARCHAR(100) DEFAULT NULL AFTER contact_number");
  }

  if (!(await columnExists("users", "birth_date"))) {
    await pool.query("ALTER TABLE users ADD COLUMN birth_date DATE DEFAULT NULL AFTER country");
  }
}

async function refreshProfileCompletion(userId) {
  await pool.query(
    `UPDATE users
     SET profile_completed = (
       first_name IS NOT NULL AND TRIM(first_name) <> ''
       AND last_name IS NOT NULL AND TRIM(last_name) <> ''
       AND contact_number IS NOT NULL AND TRIM(contact_number) <> ''
       AND timezone IS NOT NULL AND TRIM(timezone) <> ''
       AND profile_image_url IS NOT NULL AND TRIM(profile_image_url) <> ''
       AND password_changed = TRUE
     )
     WHERE user_id = ?`,
    [userId]
  );
}

async function refreshAllProfileCompletion() {
  await pool.query(
    `UPDATE users
     SET profile_completed = (
       first_name IS NOT NULL AND TRIM(first_name) <> ''
       AND last_name IS NOT NULL AND TRIM(last_name) <> ''
       AND contact_number IS NOT NULL AND TRIM(contact_number) <> ''
       AND timezone IS NOT NULL AND TRIM(timezone) <> ''
       AND profile_image_url IS NOT NULL AND TRIM(profile_image_url) <> ''
       AND password_changed = TRUE
     )`
  );
}

async function ensureStudentContractRequestsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_contract_requests (
      request_id INT NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      course_id INT DEFAULT NULL,
      requested_classes INT NOT NULL,
      trial_notes TEXT DEFAULT NULL,
      ai_criteria TEXT DEFAULT NULL,
      status ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
      admin_response VARCHAR(500) DEFAULT NULL,
      requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (request_id),
      KEY idx_student_contract_requests_student (student_id),
      KEY idx_student_contract_requests_course (course_id),
      KEY idx_student_contract_requests_status (status),
      CONSTRAINT student_contract_requests_student_fk FOREIGN KEY (student_id) REFERENCES users (user_id),
      CONSTRAINT student_contract_requests_course_fk FOREIGN KEY (course_id) REFERENCES courses (course_id)
    )
  `);

  if (!(await columnExists("student_contract_requests", "trial_notes"))) {
    await pool.query("ALTER TABLE student_contract_requests ADD COLUMN trial_notes TEXT DEFAULT NULL AFTER requested_classes");
  }

  if (!(await columnExists("student_contract_requests", "ai_criteria"))) {
    await pool.query("ALTER TABLE student_contract_requests ADD COLUMN ai_criteria TEXT DEFAULT NULL AFTER trial_notes");
  }
}

async function removeStudentPackageDateColumns() {
  if (await columnExists("student_class_packages", "package_start_date")) {
    await pool.query("ALTER TABLE student_class_packages DROP COLUMN package_start_date");
  }

  if (await columnExists("student_class_packages", "package_end_date")) {
    await pool.query("ALTER TABLE student_class_packages DROP COLUMN package_end_date");
  }
}

async function ensureTeacherCoursesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_courses (
      teacher_id INT NOT NULL,
      course_id INT NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (teacher_id, course_id),
      KEY idx_teacher_courses_course (course_id),
      CONSTRAINT teacher_courses_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users (user_id) ON DELETE CASCADE,
      CONSTRAINT teacher_courses_course_fk FOREIGN KEY (course_id) REFERENCES courses (course_id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    INSERT IGNORE INTO teacher_courses (teacher_id, course_id)
    SELECT u.user_id, c.course_id
    FROM users u
    CROSS JOIN courses c
    WHERE u.role = 'teacher'
      AND NOT EXISTS (
        SELECT 1 FROM teacher_courses tc WHERE tc.teacher_id = u.user_id
      )
  `);
}

try {
  await ensureAssignmentAttemptColumns();
  await ensureBooksColumns();
  await ensureLessonsColumns();
  await ensureLessonProgressTable();
  await ensureStudentCourseProgressTable();
  await ensureUserProfileImageColumn();
  await ensureUserPasswordChangedColumn();
  await ensureUserDemographicsColumns();
  await refreshAllProfileCompletion();
  await ensureStudentContractRequestsTable();
  await removeStudentPackageDateColumns();
  await ensureTeacherCoursesTable();
  await expireDepletedPackages();
  await deletePastTeacherAvailability();
  
} catch (err) {
  console.error("Error preparing database columns:", err);
  process.exit(1);
}

async function resolveCourseIdByIdOrName(value) {
  if (!value) return null;
  // numeric id?
  if (/^\d+$/.test(String(value))) return parseInt(value, 10);

  // try by name
  const [rows] = await pool.query(
    "SELECT course_id FROM courses WHERE course_name = ? LIMIT 1",
    [value]
  );
  if (rows.length) return rows[0].course_id;

  // create if missing
  const [ins] = await pool.query(
    "INSERT INTO courses (course_name) VALUES (?)",
    [value]
  );
  return ins.insertId;
}

const aiCriterionLabels = {
  learningGoal: "Learning goal",
  learningStyle: "Learning style",
  personality: "Student personality",
  focusArea: "Focus area",
  pace: "Learning pace",
};

function normalizeAiValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "").trim();
}

function aiValueText(value) {
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

function aiValueIncludes(value, expected) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

function parseAiCriteriaJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeCriteria(criteria = {}) {
  return Object.fromEntries(
    Object.entries(aiCriterionLabels).map(([key]) => [key, normalizeAiValues(criteria[key])])
  );
}

function buildCriteriaNotes(criteria) {
  const lines = Object.entries(criteria)
    .filter(([, value]) => Array.isArray(value) ? value.length : value)
    .map(([key, value]) => `${aiCriterionLabels[key]}: ${aiValueText(value)}`);

  return lines.length ? `AI matching criteria:\n${lines.join("\n")}` : "";
}

function buildTeacherAiBio({ bio, teachingStyle, personalityStrength, idealStudentPace }) {
  const aiTags = [
    teachingStyle ? `Teaching style: ${teachingStyle}` : "",
    personalityStrength ? `Teacher strength: ${personalityStrength}` : "",
    idealStudentPace ? `Best student pace: ${idealStudentPace}` : "",
  ].filter(Boolean);

  return [bio || "", aiTags.length ? `AI matching profile:\n${aiTags.join("\n")}` : ""]
    .filter((part) => String(part).trim())
    .join("\n\n");
}

function scoreTeacherForStudent(teacher, criteria, trialNotes, courseId) {
  const profileText = [
    teacher.first_name,
    teacher.last_name,
    teacher.bio,
    teacher.specialization,
  ].filter(Boolean).join(" ").toLowerCase();
  const notes = String(trialNotes || "").toLowerCase();
  let score = Number(teacher.experience_years || 0) * 2;
  const reasons = [];

  if (courseId && Number(teacher.selected_course_match || 0) > 0) {
    score += 12;
    reasons.push("matches the selected course");
  }

  const weightedCriteria = [
    ["learningGoal", 14],
    ["focusArea", 12],
    ["learningStyle", 10],
    ["personality", 8],
    ["pace", 8],
  ];

  for (const [key, weight] of weightedCriteria) {
    const values = Array.isArray(criteria[key]) ? criteria[key] : [criteria[key]].filter(Boolean);
    if (!values.length) continue;

    const words = values
      .flatMap((value) => String(value || "").toLowerCase().split(/[\s-]+/))
      .filter((word) => word.length > 2);
    const matched = words.some((word) => profileText.includes(word) || notes.includes(word));
    if (matched) {
      score += weight + Math.max(0, values.length - 1) * 2;
      reasons.push(`${aiCriterionLabels[key].toLowerCase()} fit`);
    }
  }

  if (aiValueIncludes(criteria.learningStyle, "structured")) score += profileText.includes("grammar") ? 5 : 0;
  if (aiValueIncludes(criteria.learningStyle, "conversational")) score += profileText.includes("conversation") || profileText.includes("speaking") ? 5 : 0;
  if (aiValueIncludes(criteria.focusArea, "speaking")) score += profileText.includes("speaking") || profileText.includes("conversation") ? 5 : 0;
  if (aiValueIncludes(criteria.focusArea, "grammar")) score += profileText.includes("grammar") ? 5 : 0;
  if (aiValueIncludes(criteria.personality, "shy")) score += profileText.includes("patient") || profileText.includes("supportive") ? 5 : 0;
  if (aiValueIncludes(criteria.pace, "slow")) score += profileText.includes("patient") ? 4 : 0;

  score -= Number(teacher.assigned_student_count || 0);

  return {
    ...teacher,
    score,
    reasons: reasons.length ? reasons : ["balanced match based on teacher profile and current load"],
  };
}

const TEACHER_BALANCE_LIMIT = 2;

async function recommendTeacher({ criteria = {}, trialNotes = "", courseId = null, preferredTeacherId = null, db = pool }) {
  const normalizedCriteria = normalizeCriteria(criteria);
  const courseFilter = courseId ? parseInt(courseId, 10) : null;
  const [teachers] = await db.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.email,
            tp.bio, tp.specialization, tp.experience_years,
            COUNT(student.user_id) AS assigned_student_count,
            MAX(CASE WHEN selected_tc.course_id IS NOT NULL THEN 1 ELSE 0 END) AS selected_course_match
     FROM users u
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.user_id
     LEFT JOIN teacher_courses selected_tc ON selected_tc.teacher_id = u.user_id AND selected_tc.course_id = ?
     LEFT JOIN student_profiles sp ON sp.assigned_teacher_id = u.user_id
     LEFT JOIN users student ON student.user_id = sp.user_id AND student.status = 'active'
     WHERE u.role = 'teacher' AND u.status = 'active'
       AND (? IS NULL OR selected_tc.course_id IS NOT NULL)
     GROUP BY u.user_id, u.first_name, u.last_name, u.email, tp.bio, tp.specialization, tp.experience_years
     ORDER BY u.first_name ASC, u.last_name ASC`,
    [courseFilter || 0, courseFilter]
  );

  const ranked = teachers
    .map((teacher) => scoreTeacherForStudent(teacher, normalizedCriteria, trialNotes, courseId))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.assigned_student_count || 0) - Number(b.assigned_student_count || 0);
    });

  const underBalanceLimit = ranked.filter((teacher) => Number(teacher.assigned_student_count || 0) < TEACHER_BALANCE_LIMIT);
  const leastLoaded = [...ranked].sort((a, b) => {
    const loadDiff = Number(a.assigned_student_count || 0) - Number(b.assigned_student_count || 0);
    if (loadDiff !== 0) return loadDiff;
    return b.score - a.score;
  })[0];
  const preferred = preferredTeacherId
    ? ranked.find((teacher) => String(teacher.user_id) === String(preferredTeacherId))
    : null;
  const assigned = preferred && Number(preferred.assigned_student_count || 0) < TEACHER_BALANCE_LIMIT
    ? preferred
    : underBalanceLimit[0] || leastLoaded;

  return {
    teacher: assigned || null,
    rankedTeachers: ranked,
    criteria: normalizedCriteria,
    overBalanceTeachers: ranked.filter((teacher) => Number(teacher.assigned_student_count || 0) >= TEACHER_BALANCE_LIMIT),
    usedLeastLoadedFallback: underBalanceLimit.length === 0 && Boolean(leastLoaded),
  };
}

function packageStatusFromUsage(status, totalClasses, classesUsed) {
  const normalizedStatus = ["active", "expired", "cancelled"].includes(status) ? status : "active";
  const total = Math.max(0, parseInt(totalClasses, 10) || 0);
  const used = Math.max(0, parseInt(classesUsed, 10) || 0);
  return total - used <= 0 ? "expired" : normalizedStatus;
}

async function expireDepletedPackages(db = pool) {
  await db.query(
    `UPDATE student_class_packages
     SET status = 'expired'
     WHERE status = 'active' AND classes_left <= 0`
  );
}

const assignmentSelect = `
  SELECT a.assignment_id AS id,
         a.assignment_id AS assignmentId,
         a.teacher_id AS teacherId,
         a.student_id AS studentId,
         CONCAT(student.first_name, ' ', student.last_name) AS student,
         CONCAT(teacher.first_name, ' ', teacher.last_name) AS teacherName,
         a.course_id AS courseId,
         c.course_name AS subject,
         a.title AS name,
         a.title,
         a.instructions,
         a.instructions AS description,
         DATE_FORMAT(a.due_date, '%Y-%m-%d') AS dueDate,
         TIME_FORMAT(a.due_time, '%H:%i') AS dueTime,
         a.attempt_limit AS attemptLimit,
         CASE
           WHEN a.due_time IS NULL THEN DATE_FORMAT(a.due_date, '%Y-%m-%d')
           ELSE CONCAT(DATE_FORMAT(a.due_date, '%Y-%m-%d'), 'T', TIME_FORMAT(a.due_time, '%H:%i'))
         END AS due,
         a.status,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS postedAt,
         CASE
           WHEN s.grade IS NULL THEN 'Pending'
           ELSE CAST(s.grade AS CHAR)
         END AS score,
         s.submission_id AS submissionId,
         s.submission_text AS comments,
         s.file_url AS fileUrl,
         COALESCE(s.attempt_count, 0) AS attemptsUsed,
         COALESCE(s.attempt_count, 0) AS attemptCount,
         DATE_FORMAT(s.submitted_at, '%Y-%m-%d %H:%i') AS submittedAt,
         s.feedback
  FROM assignments a
  JOIN users student ON student.user_id = a.student_id
  JOIN users teacher ON teacher.user_id = a.teacher_id
  LEFT JOIN courses c ON c.course_id = a.course_id
  LEFT JOIN assignment_submissions s ON s.assignment_id = a.assignment_id
`;

const submissionSelect = `
  SELECT s.submission_id AS id,
         s.submission_id AS submissionId,
         s.assignment_id AS assignmentId,
         a.title AS assignmentName,
         a.instructions AS assignmentInstructions,
         a.teacher_id AS teacherId,
         a.student_id AS studentId,
         a.attempt_limit AS attemptLimit,
         CONCAT(student.first_name, ' ', student.last_name) AS student,
         CONCAT(student.first_name, ' ', student.last_name) AS assignedStudent,
         CONCAT(teacher.first_name, ' ', teacher.last_name) AS teacherName,
         s.submission_text AS comments,
         s.file_url AS fileUrl,
         s.attempt_count AS attemptsUsed,
         s.attempt_count AS attemptCount,
         COALESCE(s.file_url, 'Comment submission') AS file,
         CASE WHEN s.grade IS NULL THEN 'Submitted' ELSE 'Graded' END AS status,
         DATE_FORMAT(s.submitted_at, '%Y-%m-%d %H:%i') AS submittedAt,
         s.grade,
         s.feedback
  FROM assignment_submissions s
  JOIN assignments a ON a.assignment_id = s.assignment_id
  JOIN users student ON student.user_id = s.student_id
  JOIN users teacher ON teacher.user_id = a.teacher_id
`;

// ---------- courses ----------
app.get("/api/courses", async (_req, res) => {
  const [rows] = await pool.query("SELECT course_id, course_name FROM courses ORDER BY course_name");
  res.json({ courses: rows });
});

app.get("/api/teacher-courses", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tc.teacher_id, tc.course_id, c.course_name
       FROM teacher_courses tc
       JOIN courses c ON c.course_id = tc.course_id
       ORDER BY tc.teacher_id ASC, c.course_name ASC`
    );

    res.json({ teacherCourses: rows });
  } catch (err) {
    console.error("GET /api/teacher-courses error:", err);
    res.status(500).json({ message: "Error fetching teacher courses" });
  }
});

app.put("/api/admin/teachers/:teacherId/courses", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const teacherId = parseInt(req.params.teacherId, 10);
    const courseIds = Array.isArray(req.body?.courseIds)
      ? [...new Set(req.body.courseIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0))]
      : [];

    if (!teacherId) {
      return res.status(400).json({ message: "Invalid teacher selected" });
    }

    if (!courseIds.length) {
      return res.status(400).json({ message: "Please select at least one course for this teacher" });
    }

    const [[teacher]] = await connection.query(
      "SELECT user_id FROM users WHERE user_id = ? AND role = 'teacher' LIMIT 1",
      [teacherId]
    );
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const [validCourses] = await connection.query(
      `SELECT course_id FROM courses WHERE course_id IN (${courseIds.map(() => "?").join(", ")})`,
      courseIds
    );
    if (validCourses.length !== courseIds.length) {
      return res.status(400).json({ message: "One or more selected courses are invalid" });
    }

    await connection.beginTransaction();
    await connection.query("DELETE FROM teacher_courses WHERE teacher_id = ?", [teacherId]);
    await connection.query(
      `INSERT INTO teacher_courses (teacher_id, course_id)
       VALUES ${courseIds.map(() => "(?, ?)").join(", ")}`,
      courseIds.flatMap((courseId) => [teacherId, courseId])
    );
    await connection.commit();

    res.json({ message: "Teacher courses updated" });
  } catch (err) {
    await connection.rollback();
    console.error("PUT /api/admin/teachers/:teacherId/courses error:", err);
    res.status(500).json({ message: "Error updating teacher courses" });
  } finally {
    connection.release();
  }
});

// ---------- month availability ----------
/**
 * GET /api/trial/availability?year=2025&month=11
 * Returns: { days: { 'YYYY-MM-DD': { disabled: bool, booked: ['09:00', ...] } } }
 */
app.get("/api/trial/availability", async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10); // 1..12

  if (!year || !month) return res.json({ days: {} });

  const start = `${year}-${pad(month)}-01 00:00:00`;
  const end = `${year}-${pad(month)}-31 23:59:59`; // safe enough

  // Pull existing trial bookings for that month
  const [rows] = await pool.query(
    `SELECT DATE(trial_datetime) as d, TIME_FORMAT(trial_datetime, '%H:%i') as t
     FROM trial_bookings
     WHERE trial_datetime BETWEEN ? AND ?
       AND status IN ('pending','approved')`,
    [start, end]
  );

  // Build per-day map of booked slots
  const map = {};
  for (const r of rows) {
    if (!map[r.d]) map[r.d] = new Set();
    map[r.d].add(r.t);
  }

  // Make response: all days enabled unless all slots are taken
  const days = {};
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const booked = Array.from(map[iso] || []);
    // consider a day "disabled" if every slot is already booked
    const disabled = booked.length >= 3; // because SLOTS has 3 default times
    days[iso] = { disabled, booked };
  }

  res.json({ days });
});

// ---------- (existing) login kept the same ----------
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Look up the user by email
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, email, contact_number AS contact, password_hash, role, status, profile_completed, password_changed, profile_image_url, country, birth_date, timezone
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];

    // Compare password with bcrypt
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.status === "archived") {
      return res.status(403).json({
        message: "This account is currently archived and cannot be accessed. Please contact the administrator to request account reactivation.",
      });
    }

    // Success — fetch assigned teacher for students and return a trimmed user object
    let assignedTeacherId = null;
    if (user.role === "student") {
      const [profileRows] = await pool.query(
        `SELECT assigned_teacher_id FROM student_profiles WHERE user_id = ? LIMIT 1`,
        [user.user_id]
      );
      if (profileRows.length) {
        assignedTeacherId = profileRows[0].assigned_teacher_id;
      }
    }

    await refreshProfileCompletion(user.user_id);
    const [[completion]] = await pool.query(
      "SELECT profile_completed, password_changed, profile_image_url FROM users WHERE user_id = ? LIMIT 1",
      [user.user_id]
    );

    res.json({
      message: "Login successful",
      user: {
        id: user.user_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        contact: user.contact,
        role: user.role,
        country: user.country,
        birthDate: user.birth_date,
        timezone: normalizeTimezone(user.timezone),
        profileCompleted: completion?.profile_completed,
        passwordChanged: completion?.password_changed,
        profileImageUrl: completion?.profile_image_url,
        assignedTeacherId,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



//ACCOUNT
app.get("/api/users/:id", async (req, res) => {
  try {
    await refreshProfileCompletion(req.params.id);
    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.contact_number AS contact, u.country, u.birth_date, u.profile_image_url, u.timezone, u.role, u.status,
              u.profile_completed, u.password_changed, u.created_at,
              sp.assigned_teacher_id
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const u = rows[0];
    let roleDetails = {};

    if (u.role === "student") {
      const [studentRows] = await pool.query(
        `SELECT sp.proficiency_level, sp.assigned_teacher_id, sp.trial_notes,
                c.course_id, c.course_name, c.description AS course_description, c.duration AS course_duration,
                t.first_name AS teacher_first_name, t.last_name AS teacher_last_name, t.email AS teacher_email,
                scp.total_classes, scp.classes_used, scp.classes_left, scp.status AS package_status
         FROM student_profiles sp
         LEFT JOIN courses c ON c.course_id = sp.course_id
         LEFT JOIN users t ON t.user_id = sp.assigned_teacher_id
         LEFT JOIN student_class_packages scp ON scp.student_id = sp.user_id AND scp.status = 'active'
         WHERE sp.user_id = ?
         LIMIT 1`,
        [req.params.id]
      );
      roleDetails = studentRows[0] || {};
    } else if (u.role === "teacher") {
      const [teacherRows] = await pool.query(
        `SELECT tp.bio, tp.specialization, tp.experience_years, tp.hourly_rate,
                COUNT(DISTINCT student.user_id) AS active_students,
                GROUP_CONCAT(DISTINCT c.course_name ORDER BY c.course_name SEPARATOR ', ') AS courses
         FROM users u
         LEFT JOIN teacher_profiles tp ON tp.user_id = u.user_id
         LEFT JOIN student_profiles sp ON sp.assigned_teacher_id = u.user_id
         LEFT JOIN users student ON student.user_id = sp.user_id AND student.status = 'active'
         LEFT JOIN teacher_courses tc ON tc.teacher_id = u.user_id
         LEFT JOIN courses c ON c.course_id = tc.course_id
         WHERE u.user_id = ?
         GROUP BY tp.bio, tp.specialization, tp.experience_years, tp.hourly_rate
         LIMIT 1`,
        [req.params.id]
      );
      const [classRows] = await pool.query(
        `SELECT COUNT(*) AS upcoming_classes
         FROM classes
         WHERE teacher_id = ? AND status = 'scheduled' AND scheduled_date >= CURDATE()`,
        [req.params.id]
      );
      roleDetails = {
        ...(teacherRows[0] || {}),
        upcoming_classes: classRows[0]?.upcoming_classes || 0,
      };
    } else if (u.role === "admin") {
      const [[stats]] = await pool.query(
        `SELECT
           SUM(role = 'student' AND status = 'active') AS active_students,
           SUM(role = 'teacher' AND status = 'active') AS active_teachers,
           SUM(status = 'archived') AS archived_users
         FROM users`
      );
      roleDetails = stats || {};
    }

    res.json({
      user: {
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        contact: u.contact,
        country: u.country,
        birthDate: u.birth_date,
        profileImageUrl: u.profile_image_url,
        timezone: u.timezone,
        role: u.role,
        status: u.status,
        createdAt: u.created_at,
        profileCompleted: u.profile_completed,
        passwordChanged: u.password_changed,
        assignedTeacherId: u.assigned_teacher_id || null,
        roleDetails,
      },
    });
  } catch (err) {
    console.error("GET /api/users/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
app.put("/api/users/:id", async (req, res) => {
  try {
    const { firstName, lastName, email, contact, country, birthDate, timezone } = req.body;
    const normalizedBirthDate = birthDate ? String(birthDate).slice(0, 10) : null;
    const normalizedCountry = String(country || "").trim();
    const resolvedTimezone = normalizeTimezone(timezone, timezoneFromCountry(normalizedCountry));

    if (normalizedBirthDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
      return res.status(400).json({ message: "Birthday must be a valid date" });
    }

    // Validate required fields for profile completion
    if (!firstName || !lastName || !contact || !resolvedTimezone) {
      return res.status(400).json({ 
        message: "First name, last name, contact, and timezone are required to complete your profile"
      });
    }

    await pool.query(
      `UPDATE users
       SET first_name = ?, last_name = ?, email = ?, contact_number = ?, country = ?, birth_date = ?, timezone = ?
       WHERE user_id = ?`,
      [firstName, lastName, email, contact, normalizedCountry || null, normalizedBirthDate, resolvedTimezone, req.params.id]
    );
    await refreshProfileCompletion(req.params.id);

    res.json({ message: "Profile updated successfully!" });
  } catch (err) {
    console.error("PUT /api/users/:id error:", err);
    res.status(500).json({ message: "Could not update profile" });
  }
});

app.post("/api/users/:id/profile-picture", profileUpload.single("profile_picture"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please choose an image to upload" });
    }

    const imageUrl = `/uploads/profiles/${req.file.filename}`;
    const [currentRows] = await pool.query(
      `SELECT profile_image_url FROM users WHERE user_id = ? LIMIT 1`,
      [req.params.id]
    );

    if (!currentRows.length) {
      await deleteLocalProfileImage(imageUrl);
      return res.status(404).json({ message: "User not found" });
    }

    const oldImageUrl = currentRows[0].profile_image_url;
    const [result] = await pool.query(
      `UPDATE users SET profile_image_url = ? WHERE user_id = ?`,
      [imageUrl, req.params.id]
    );

    if (!result.affectedRows) {
      await deleteLocalProfileImage(imageUrl);
      return res.status(404).json({ message: "User not found" });
    }

    await pool.query(
      `UPDATE teacher_profiles SET profile_image_url = ? WHERE user_id = ?`,
      [imageUrl, req.params.id]
    );

    if (oldImageUrl && oldImageUrl !== imageUrl) {
      await deleteLocalProfileImage(oldImageUrl);
    }
    await refreshProfileCompletion(req.params.id);

    res.json({ message: "Profile picture updated", profileImageUrl: imageUrl });
  } catch (err) {
    console.error("POST /api/users/:id/profile-picture error:", err);
    res.status(500).json({ message: err.message || "Could not upload profile picture" });
  }
});

app.put("/api/users/:id/password", async (req, res) => {
  try {
    const { current, next } = req.body;
    const userId = req.params.id;

    // Fetch current hash
    const [rows] = await pool.query(
      "SELECT password_hash FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const user = rows[0];
    const match = await bcrypt.compare(current, user.password_hash);
    if (!match)
      return res.status(401).json({ message: "Current password incorrect" });

    // Hash new password
    const newHash = await bcrypt.hash(next, 10);
    await pool.query(
      "UPDATE users SET password_hash = ?, password_changed = TRUE WHERE user_id = ?",
      [newHash, userId]
    );
    await refreshProfileCompletion(userId);

    res.json({ message: "Password updated successfully!" });
  } catch (err) {
    console.error("PUT /api/users/:id/password error:", err);
    res.status(500).json({ message: "Could not change password" });
  }
});

//ADMIN

app.post("/api/admin/recommend-teacher", async (req, res) => {
  try {
    const { criteria, trialNotes, courseId, teacherId } = req.body || {};
    const recommendation = await recommendTeacher({
      criteria,
      trialNotes,
      courseId,
      preferredTeacherId: teacherId,
    });

    res.json({
      teacher: recommendation.teacher,
      rankedTeachers: recommendation.rankedTeachers,
      overBalanceTeachers: recommendation.overBalanceTeachers,
      usedLeastLoadedFallback: recommendation.usedLeastLoadedFallback,
      criteria: recommendation.criteria,
    });
  } catch (err) {
    console.error("POST /api/admin/recommend-teacher error:", err);
    res.status(500).json({ message: "Error recommending teacher" });
  }
});

//Create Teacher Account
app.post("/api/admin/users", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      contact,
      country,
      birthDate,
      birth_date,
      role = "teacher",
      classesAvailed,
      level,
      teacherId,
      trialNotes,
      courseId,
      aiCriteria,
      specialization,
      experienceYears,
      experience_years,
      teachingStyle,
      personalityStrength,
      idealStudentPace,
      bio,
      courseIds = [],
    } = req.body;

    const [exist] = await pool.query("SELECT user_id FROM users WHERE email = ?", [email]);
    if (exist.length) return res.status(409).json({ message: "Email already exists" });

    const selectedTeacherCourseIds = Array.isArray(courseIds)
      ? courseIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0)
      : [];

    if (role === "teacher" && !selectedTeacherCourseIds.length) {
      return res.status(400).json({ message: "Please select at least one course this teacher can teach" });
    }

    if (role === "student" && !courseId) {
      return res.status(400).json({ message: "Please select the student's course" });
    }

    const normalizedCountry = String(country || "").trim();
    const normalizedBirthDate = birthDate || birth_date || null;
    if (!normalizedCountry || !normalizedBirthDate) {
      return res.status(400).json({ message: "Country and birthday are required" });
    }

    const defaultPassword = role === "teacher" ? "teacher" : "student";
    const hash = await bcrypt.hash(password || defaultPassword, 10);
    
    // Always mark newly created users as incomplete so they must complete their profile
    // This ensures they select their timezone and other settings
    const profileCompleted = false;
    const detectedTimezone = timezoneFromCountry(normalizedCountry);

    const [ins] = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, contact_number, country, birth_date, timezone, role, profile_completed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [email, hash, firstName, lastName, contact || null, normalizedCountry, normalizedBirthDate, detectedTimezone, role, profileCompleted]);

    const userId = ins.insertId;
    
    // Create teacher profile if role is teacher
    if (role === "teacher") {
      const rawExperienceYears = experienceYears ?? experience_years ?? null;
      const parsedExperienceYears =
        rawExperienceYears === null || rawExperienceYears === "" ? null : Number(rawExperienceYears);
      const teacherBio = buildTeacherAiBio({
        bio,
        teachingStyle,
        personalityStrength,
        idealStudentPace,
      });
      const specializationText = Array.isArray(specialization)
        ? specialization.map((item) => String(item || "").trim()).filter(Boolean).join(", ")
        : String(specialization || "").trim();

      await pool.query(
        `INSERT INTO teacher_profiles (user_id, bio, specialization, experience_years)
         VALUES (?, ?, ?, ?)`,
        [
          userId,
          teacherBio || "",
          specializationText || null,
          Number.isFinite(parsedExperienceYears) ? parsedExperienceYears : null,
        ]
      );

      await pool.query(
        `INSERT INTO teacher_courses (teacher_id, course_id)
         VALUES ${selectedTeacherCourseIds.map(() => "(?, ?)").join(", ")}`,
        selectedTeacherCourseIds.flatMap((courseId) => [userId, courseId])
      );
    }
    
    // Create student profile if role is student
    if (role === "student") {
      const recommendation = await recommendTeacher({
        criteria: aiCriteria,
        trialNotes,
        courseId,
        preferredTeacherId: teacherId,
      });
      const assignedTeacherId = recommendation.teacher?.user_id || null;
      const proficiencyLevel = level || "beginner";
      const courseIdValue = courseId ? parseInt(courseId, 10) : null;
      const criteriaNotes = buildCriteriaNotes(recommendation.criteria);
      const finalTrialNotes = [trialNotes || "", criteriaNotes]
        .filter((part) => String(part).trim())
        .join("\n\n");
      
      await pool.query(`
        INSERT INTO student_profiles (user_id, proficiency_level, assigned_teacher_id, course_id, trial_notes)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, proficiencyLevel, assignedTeacherId, courseIdValue, finalTrialNotes || null]);
      
      // Create student class package if classesAvailed is provided
      if (classesAvailed && parseInt(classesAvailed, 10) > 0) {
        await pool.query(`
          INSERT INTO student_class_packages (student_id, total_classes, classes_used, status)
          VALUES (?, ?, 0, 'active')
        `, [userId, parseInt(classesAvailed, 10)]);
      }
    }

    res.json({ message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created`, userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating user" });
  }
});

// NOTE: the old archived-based endpoint was removed; use the status-aware version below

// ==================== ADMIN ENDPOINTS ====================

// Get users with optional role and status filtering
app.get("/api/admin/users", async (req, res) => {
  try {
    const { role, status } = req.query;
    let query = "SELECT user_id, first_name, last_name, email, role, status FROM users WHERE 1=1";
    const params = [];

    if (role) {
      query += " AND role = ?";
      params.push(role);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY first_name ASC";
    const [users] = await pool.query(query, params);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.get("/api/admin/student-contracts", async (_req, res) => {
  try {
    await expireDepletedPackages();

    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email,
              sp.course_id, c.course_name, sp.assigned_teacher_id,
              CONCAT(t.first_name, ' ', t.last_name) AS teacher_name,
              scp.package_id, scp.total_classes, scp.classes_used, scp.classes_left,
              scp.status AS package_status
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN courses c ON c.course_id = sp.course_id
       LEFT JOIN users t ON t.user_id = sp.assigned_teacher_id
       LEFT JOIN student_class_packages scp
         ON scp.package_id = (
           SELECT latest.package_id
           FROM student_class_packages latest
           WHERE latest.student_id = u.user_id
           ORDER BY FIELD(latest.status, 'active', 'expired', 'cancelled'), latest.created_at DESC
           LIMIT 1
         )
       WHERE u.role = 'student' AND u.status = 'active'
       ORDER BY u.first_name ASC, u.last_name ASC`
    );

    res.json({ contracts: rows });
  } catch (err) {
    console.error("GET /api/admin/student-contracts error:", err);
    res.status(500).json({ message: "Error fetching student contracts" });
  }
});

app.put("/api/admin/student-contracts/:student_id", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { student_id } = req.params;
    const {
      course_id,
      assigned_teacher_id,
      package_id,
      total_classes,
      classes_used,
      status,
    } = req.body;

    const parsedTotal = Math.max(0, parseInt(total_classes, 10) || 0);
    const parsedUsed = Math.min(parsedTotal, Math.max(0, parseInt(classes_used, 10) || 0));
    const packageStatus = packageStatusFromUsage(status, parsedTotal, parsedUsed);
    const courseIdValue = course_id ? parseInt(course_id, 10) : null;
    const teacherIdValue = assigned_teacher_id ? parseInt(assigned_teacher_id, 10) : null;

    if (courseIdValue && teacherIdValue) {
      const [teacherCourseRows] = await connection.query(
        `SELECT 1 FROM teacher_courses WHERE teacher_id = ? AND course_id = ? LIMIT 1`,
        [teacherIdValue, courseIdValue]
      );

      if (!teacherCourseRows.length) {
        return res.status(400).json({ message: "Selected teacher cannot teach the selected course" });
      }
    }

    await connection.beginTransaction();

    await connection.query(
      `UPDATE student_profiles
       SET course_id = COALESCE(?, course_id), assigned_teacher_id = ?
       WHERE user_id = ?`,
      [courseIdValue, teacherIdValue, student_id]
    );

    if (package_id) {
      await connection.query(
        `UPDATE student_class_packages
         SET total_classes = ?, classes_used = ?, status = ?
         WHERE package_id = ? AND student_id = ?`,
        [
          parsedTotal,
          parsedUsed,
          packageStatus,
          package_id,
          student_id,
        ]
      );
    } else if (parsedTotal > 0) {
      await connection.query(
        `INSERT INTO student_class_packages
         (student_id, total_classes, classes_used, status)
         VALUES (?, ?, ?, ?)`,
        [student_id, parsedTotal, parsedUsed, packageStatus]
      );
    }

    await connection.commit();
    res.json({ message: "Student contract updated" });
  } catch (err) {
    await connection.rollback();
    console.error("PUT /api/admin/student-contracts/:student_id error:", err);
    res.status(500).json({ message: "Error updating student contract" });
  } finally {
    connection.release();
  }
});

app.post("/api/student/contract-requests", async (req, res) => {
  try {
    const { student_id, course_id, requested_classes, trial_notes, ai_criteria } = req.body;
    const parsedStudentId = parseInt(student_id, 10);
    const parsedCourseId = course_id ? parseInt(course_id, 10) : null;
    const parsedClasses = parseInt(requested_classes, 10);

    if (!parsedStudentId || !parsedCourseId || !Number.isFinite(parsedClasses) || parsedClasses <= 0) {
      return res.status(400).json({ message: "Please choose a course and number of classes." });
    }

    const [existing] = await pool.query(
      `SELECT request_id
       FROM student_contract_requests
       WHERE student_id = ? AND status = 'pending'
       LIMIT 1`,
      [parsedStudentId]
    );

    if (existing.length) {
      return res.status(409).json({ message: "You already have a pending contract request." });
    }

    const [result] = await pool.query(
      `INSERT INTO student_contract_requests (student_id, course_id, requested_classes, trial_notes, ai_criteria, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [
        parsedStudentId,
        parsedCourseId,
        parsedClasses,
        String(trial_notes || "").trim() || null,
        JSON.stringify(normalizeCriteria(ai_criteria || {})),
      ]
    );

    const [studentRows] = await pool.query(
      `SELECT first_name, last_name FROM users WHERE user_id = ?`,
      [parsedStudentId]
    );
    const [courseRows] = await pool.query(
      `SELECT course_name FROM courses WHERE course_id = ?`,
      [parsedCourseId]
    );
    const [adminRows] = await pool.query(
      `SELECT user_id FROM users WHERE role = 'admin' AND status = 'active'`
    );

    const studentName = studentRows.length
      ? `${studentRows[0].first_name} ${studentRows[0].last_name}`.trim()
      : "A student";
    const courseName = courseRows[0]?.course_name || "a course";
    const notificationMessage = `${studentName} requested a new contract for ${courseName} with ${parsedClasses} classes.`;

    if (adminRows.length) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
         VALUES ${adminRows.map(() => "(?, 'general', 'New Contract Request', ?, ?, 'contract_request', '/AdminDashboard')").join(", ")}`,
        adminRows.flatMap((admin) => [admin.user_id, notificationMessage, result.insertId])
      );
    }

    res.status(201).json({ message: "Contract request sent", request_id: result.insertId });
  } catch (err) {
    console.error("POST /api/student/contract-requests error:", err);
    res.status(500).json({ message: "Error sending contract request" });
  }
});

app.get("/api/student/contract-requests/:student_id", async (req, res) => {
  try {
    const { student_id } = req.params;
    const [rows] = await pool.query(
      `SELECT r.*, c.course_name
       FROM student_contract_requests r
       LEFT JOIN courses c ON c.course_id = r.course_id
       WHERE r.student_id = ?
       ORDER BY r.requested_at DESC
       LIMIT 5`,
      [student_id]
    );

    res.json({ requests: rows });
  } catch (err) {
    console.error("GET /api/student/contract-requests/:student_id error:", err);
    res.status(500).json({ message: "Error fetching contract requests" });
  }
});

app.get("/api/admin/contract-requests", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, c.course_name,
              u.first_name, u.last_name, u.email
       FROM student_contract_requests r
       JOIN users u ON u.user_id = r.student_id
       LEFT JOIN courses c ON c.course_id = r.course_id
       ORDER BY FIELD(r.status, 'pending', 'approved', 'declined'), r.requested_at DESC`
    );

    res.json({ requests: rows });
  } catch (err) {
    console.error("GET /api/admin/contract-requests error:", err);
    res.status(500).json({ message: "Error fetching contract requests" });
  }
});

app.put("/api/admin/contract-requests/:request_id", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { request_id } = req.params;
    const { status, admin_response } = req.body;

    if (!["approved", "declined"].includes(status)) {
      return res.status(400).json({ message: "Invalid request status" });
    }

    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT r.request_id, r.student_id, r.course_id, r.requested_classes, r.trial_notes, r.ai_criteria, r.status,
              c.course_name
       FROM student_contract_requests r
       LEFT JOIN courses c ON c.course_id = r.course_id
       WHERE r.request_id = ?
       FOR UPDATE`,
      [request_id]
    );

    if (!requestRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Contract request not found" });
    }

    const request = requestRows[0];
    if (request.status !== "pending") {
      await connection.rollback();
      return res.status(409).json({ message: "This request has already been resolved" });
    }

    if (status === "approved") {
      const [profileRows] = await connection.query(
        `SELECT trial_notes, assigned_teacher_id
         FROM student_profiles
         WHERE user_id = ?
         LIMIT 1
         FOR UPDATE`,
        [request.student_id]
      );

      if (!profileRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: "Student profile not found" });
      }

      const requestCriteria = parseAiCriteriaJson(request.ai_criteria);
      const requestCriteriaNotes = buildCriteriaNotes(normalizeCriteria(requestCriteria));
      const combinedTrialNotes = [profileRows[0].trial_notes || "", request.trial_notes || ""]
        .filter((part) => String(part).trim())
        .join("\n\nContract request notes:\n");
      const recommendation = await recommendTeacher({
        criteria: requestCriteria,
        trialNotes: combinedTrialNotes,
        courseId: request.course_id,
        preferredTeacherId: profileRows[0].assigned_teacher_id,
        db: connection,
      });
      const assignedTeacherId = recommendation.teacher?.user_id || null;

      if (!assignedTeacherId) {
        await connection.rollback();
        return res.status(400).json({
          message: "No active teacher can currently teach the requested course. Assign a teacher to this course first.",
        });
      }

      await connection.query(
        `UPDATE student_profiles
         SET course_id = COALESCE(?, course_id), assigned_teacher_id = ?, trial_notes = ?
         WHERE user_id = ?`,
        [
          request.course_id,
          assignedTeacherId,
          [profileRows[0].trial_notes || "", request.trial_notes || "", requestCriteriaNotes]
            .filter((part) => String(part).trim())
            .join("\n\n"),
          request.student_id,
        ]
      );

      await connection.query(
        `UPDATE student_class_packages
         SET status = 'expired'
         WHERE student_id = ? AND status = 'active'`,
        [request.student_id]
      );

      await connection.query(
        `INSERT INTO student_class_packages
         (student_id, total_classes, classes_used, status)
         VALUES (?, ?, 0, 'active')`,
        [request.student_id, request.requested_classes]
      );
    }

    await connection.query(
      `UPDATE student_contract_requests
       SET status = ?, admin_response = ?, resolved_at = NOW()
       WHERE request_id = ?`,
      [status, admin_response || null, request_id]
    );

    const notificationTitle = status === "approved"
      ? "Contract Request Approved"
      : "Contract Request Declined";
    const notificationMessage = status === "approved"
      ? `Your contract request for ${request.course_name || "your selected course"} with ${request.requested_classes} classes was approved.`
      : `Your contract request for ${request.course_name || "your selected course"} with ${request.requested_classes} classes was declined.`;

    await connection.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'general', ?, ?, ?, 'contract_request', '/Calendar')`,
      [request.student_id, notificationTitle, notificationMessage, request.request_id]
    );

    await connection.commit();
    res.json({ message: `Contract request ${status}` });
  } catch (err) {
    await connection.rollback();
    console.error("PUT /api/admin/contract-requests/:request_id error:", err);
    res.status(500).json({ message: "Error updating contract request" });
  } finally {
    connection.release();
  }
});

// Update user status (active, suspended, archived)
app.put("/api/users/:userId/status", async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // Validate status value
    const validStatuses = ["active", "suspended", "archived"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const [result] = await pool.query(
      "UPDATE users SET status = ? WHERE user_id = ?",
      [status, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: `User status updated to ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user status" });
  }
});

// ==================== CALENDAR ENDPOINTS ====================

// Get teacher availability for a month
app.get("/api/calendar/teacher-availability", async (req, res) => {
  try {
    const { teacher_id, year, month } = req.query;
    
    if (!teacher_id || !year || !month) {
      return res.status(400).json({ message: "Missing teacher_id, year, or month" });
    }

    await deletePastTeacherAvailability(teacher_id);

    const monthIndex = parseInt(month, 10);
    const yearValue = parseInt(year, 10);
    const daysInMonth = new Date(yearValue, monthIndex, 0).getDate();
    const startDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-01`;
    const endDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(available_date, '%Y-%m-%d') as available_date, status FROM teacher_availability 
       WHERE teacher_id = ? AND available_date BETWEEN ? AND ?
       ORDER BY available_date`,
      [teacher_id, startDate, endDate]
    );

    const availability = {};
    rows.forEach(row => {
      // DATE_FORMAT already returns a string in YYYY-MM-DD format
      availability[row.available_date] = row.status;
    });

    res.json({ availability });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching availability" });
  }
});

// Set teacher availability for a date
app.post("/api/calendar/teacher-availability", async (req, res) => {
  try {
    const { teacher_id, available_date, status } = req.body;
    
    if (!teacher_id || !available_date || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await pool.query(
      `INSERT INTO teacher_availability (teacher_id, available_date, status)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?`,
      [teacher_id, available_date, status, status]
    );

    res.json({ message: "Availability updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating availability" });
  }
});

// Get all classes for a specific date
app.get("/api/calendar/classes-by-date", async (req, res) => {
  try {
    const { scheduled_date, student_id, teacher_id } = req.query;

    let query = `SELECT ${classSelectFields},
                       stu.first_name as student_name,
                       stu.last_name as student_last_name,
                       stu.email as student_email,
                       stu.timezone as student_timezone,
                       tea.first_name as teacher_name,
                       tea.email as teacher_email,
                       tea.timezone as teacher_timezone,
                       COALESCE(c.class_link, vs.teams_meeting_link) as class_link
                 FROM classes c
                 LEFT JOIN video_sessions vs ON vs.class_id = c.class_id
                 JOIN users stu ON c.student_id = stu.user_id
                 JOIN users tea ON c.teacher_id = tea.user_id
                 WHERE c.scheduled_date = ?
                 AND c.status = 'scheduled'
                 AND c.scheduled_date >= CURDATE()`;
    const params = [scheduled_date];

    if (student_id) {
      query += ` AND c.student_id = ?`;
      params.push(student_id);
    }
    if (teacher_id) {
      query += ` AND c.teacher_id = ?`;
      params.push(teacher_id);
    }

    query += ` ORDER BY c.start_time ASC, c.class_id ASC`;

    const [rows] = await pool.query(query, params);
    res.json({ classes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching classes" });
  }
});

// Get upcoming classes for a teacher or student
app.get("/api/calendar/upcoming-classes", async (req, res) => {
  try {
    const { teacher_id, student_id, limit = 10 } = req.query;
    if (!teacher_id && !student_id) {
      return res.status(400).json({ message: "Missing teacher_id or student_id" });
    }

    let query = `SELECT ${classSelectFields}, \
                       stu.first_name as student_name, \
                       stu.last_name as student_last_name, \
                       stu.email as student_email, \
                       stu.timezone as student_timezone, \
                       tea.first_name as teacher_name, \
                       tea.last_name as teacher_last_name, \
                       tea.email as teacher_email, \
                       tea.timezone as teacher_timezone, \
                       COALESCE(c.class_link, vs.teams_meeting_link) as class_link \
                 FROM classes c \
                 LEFT JOIN video_sessions vs ON vs.class_id = c.class_id \
                 JOIN users stu ON c.student_id = stu.user_id \
                 JOIN users tea ON c.teacher_id = tea.user_id \
                 WHERE c.status = 'scheduled' \
                 AND c.scheduled_date >= CURDATE()`;
    const params = [];

    if (teacher_id) {
      query += ` AND c.teacher_id = ?`;
      params.push(teacher_id);
    }
    if (student_id) {
      query += ` AND c.student_id = ?`;
      params.push(student_id);
    }

    query += ` ORDER BY c.scheduled_date ASC, c.start_time ASC LIMIT ?`;
    params.push(parseInt(limit, 10) || 10);

    const [rows] = await pool.query(query, params);
    res.json({ classes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching upcoming classes" });
  }
});

// Create a new class
app.post("/api/calendar/class", async (req, res) => {
  try {
    const { class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, class_link } = req.body;

    if (!class_name || !teacher_id || !student_id || !scheduled_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [packageRows] = await pool.query(
      `SELECT classes_left
       FROM student_class_packages
       WHERE student_id = ? AND status = 'active'
       LIMIT 1`,
      [student_id]
    );

    if (!packageRows.length || Number(packageRows[0].classes_left) <= 0) {
      return res.status(400).json({ message: "This student has no classes left. Please contact the admin for a new contract." });
    }

    const [teacherRows] = await pool.query(
      `SELECT first_name, last_name, email FROM users WHERE user_id = ?`,
      [teacher_id]
    );
    const teacherEmail = teacherRows.length > 0 ? teacherRows[0].email : null;

    let classLinkToSave = class_link?.trim();
    if (!classLinkToSave) {
      try {
        classLinkToSave = await createTeamsMeeting(
          class_name,
          scheduled_date,
          start_time,
          end_time,
          teacherEmail || MS_TEAMS_ORGANIZER_UPN
        );
      } catch (meetingErr) {
        console.error("Teams meeting creation failed", meetingErr);
        classLinkToSave = generateTeamsMeetingLink();
      }
    }

    const [result] = await pool.query(
      `INSERT INTO classes (class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, class_link, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, classLinkToSave]
    );

    await pool.query(
      `INSERT INTO video_sessions (class_id, teacher_id, student_id, teams_meeting_link)
       VALUES (?, ?, ?, ?)`,
      [result.insertId, teacher_id, student_id, classLinkToSave]
    );

    const [studentRows] = await pool.query(
      `SELECT first_name, last_name FROM users WHERE user_id = ?`,
      [student_id]
    );

    const studentName = studentRows.length > 0 ? `${studentRows[0].first_name} ${studentRows[0].last_name}` : "A student";
    const notificationMessage = `${studentName} booked "${class_name}" for ${scheduled_date} at ${start_time}.`;

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [teacher_id, "general", "New Class Booked", notificationMessage, result.insertId, "class"]
    );

    res.status(201).json({ class_id: result.insertId, class_link: classLinkToSave, message: "Class created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating class" });
  }
});

// Get student class package
app.get("/api/calendar/student-package/:student_id", async (req, res) => {
  try {
    const { student_id } = req.params;
    await expireDepletedPackages();

    const [rows] = await pool.query(
      `SELECT *
       FROM student_class_packages
       WHERE student_id = ?
       ORDER BY FIELD(status, 'active', 'expired', 'cancelled'), created_at DESC
       LIMIT 1`,
      [student_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No package found" });
    }

    res.json({ package: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching package" });
  }
});

app.put("/api/calendar/classes/:class_id/complete", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { class_id } = req.params;
    const { teacher_id } = req.body;

    if (!class_id || !teacher_id) {
      return res.status(400).json({ message: "Missing class_id or teacher_id" });
    }

    await connection.beginTransaction();

    const [classRows] = await connection.query(
      `SELECT class_id, teacher_id, student_id, class_name, status
       FROM classes
       WHERE class_id = ?
       FOR UPDATE`,
      [class_id]
    );

    if (!classRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    if (String(classInfo.teacher_id) !== String(teacher_id)) {
      await connection.rollback();
      return res.status(403).json({ message: "Only the assigned teacher can confirm this class" });
    }

    if (classInfo.status === "completed") {
      await connection.rollback();
      return res.status(409).json({ message: "This class has already been marked as done" });
    }

    if (classInfo.status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({ message: "Cancelled classes cannot be marked as done" });
    }

    const [packageRows] = await connection.query(
      `SELECT package_id, student_id, total_classes, classes_used, classes_left, status
       FROM student_class_packages
       WHERE student_id = ? AND status = 'active'
       FOR UPDATE`,
      [classInfo.student_id]
    );

    if (!packageRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "No active package found for this student" });
    }

    const currentPackage = packageRows[0];
    if (Number(currentPackage.classes_left) <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: "This student has no classes left" });
    }

    await connection.query(
      `UPDATE classes SET status = 'completed' WHERE class_id = ?`,
      [class_id]
    );

    await connection.query(
      `UPDATE student_class_packages
       SET classes_used = classes_used + 1,
           status = CASE
             WHEN total_classes - (classes_used + 1) <= 0 THEN 'expired'
             ELSE status
           END
       WHERE package_id = ?`,
      [currentPackage.package_id]
    );

    const [updatedPackageRows] = await connection.query(
      `SELECT package_id, student_id, total_classes, classes_used, classes_left, status
       FROM student_class_packages
       WHERE package_id = ?`,
      [currentPackage.package_id]
    );

    await connection.commit();

    res.json({
      message: "Class marked as done",
      class: {
        class_id: classInfo.class_id,
        status: "completed",
      },
      package: updatedPackageRows[0],
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Error marking class as done" });
  } finally {
    connection.release();
  }
});

// Request class reschedule
app.post("/api/calendar/reschedule-request", async (req, res) => {
  try {
    const { class_id, requested_by_id, requested_date, requested_time, reason } = req.body;
    const requestedDateKey = normalizeDateKey(requested_date);
    const requestedTimeKey = normalizeTimeKey(requested_time);
    const requestedTimeForDb = requestedTimeKey ? `${requestedTimeKey}:00` : "";

    if (!class_id || !requested_by_id || !requestedDateKey || !requestedTimeKey) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Get class details to determine recipient
    const [classRows] = await pool.query(
      `SELECT c.*,
              tea.timezone AS teacher_timezone,
              stu.timezone AS student_timezone,
              ru.first_name AS requester_first,
              ru.last_name AS requester_last
       FROM classes c
       JOIN users tea ON c.teacher_id = tea.user_id
       JOIN users stu ON c.student_id = stu.user_id
       JOIN users ru ON ru.user_id = ?
       WHERE c.class_id = ? AND (c.teacher_id = ? OR c.student_id = ?)`,
      [requested_by_id, class_id, requested_by_id, requested_by_id]
    );

    if (!classRows.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const classData = classRows[0];
    const requestedMinutes = timeToMinutes(requestedTimeKey);

    const [availabilityRows] = await pool.query(
      `SELECT status,
              TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
              TIME_FORMAT(break_start, '%H:%i:%s') AS break_start,
              TIME_FORMAT(break_end, '%H:%i:%s') AS break_end
       FROM teacher_availability
       WHERE teacher_id = ? AND available_date = ?
       LIMIT 1`,
      [classData.teacher_id, requestedDateKey]
    );

    const availabilityRecord = availabilityRows[0];
    if (!availabilityRecord || availabilityRecord.status !== "available") {
      return res.status(400).json({ message: "Teacher is not available on the requested date" });
    }

    if (availabilityRecord.start_time && availabilityRecord.end_time) {
      const startMinutes = timeToMinutes(availabilityRecord.start_time);
      const endMinutes = timeToMinutes(availabilityRecord.end_time);
      if (startMinutes == null || endMinutes == null || requestedMinutes < startMinutes || requestedMinutes >= endMinutes) {
        return res.status(400).json({ message: "Requested time is outside the teacher's availability window" });
      }
    }

    if (availabilityRecord.break_start && availabilityRecord.break_end) {
      const breakStartMinutes = timeToMinutes(availabilityRecord.break_start);
      const breakEndMinutes = timeToMinutes(availabilityRecord.break_end);
      if (breakStartMinutes != null && breakEndMinutes != null && requestedMinutes >= breakStartMinutes && requestedMinutes < breakEndMinutes) {
        return res.status(400).json({ message: "Requested time conflicts with the teacher's break" });
      }
    }

    const [teacherConflictRows] = await pool.query(
      `SELECT class_id
       FROM classes
       WHERE teacher_id = ?
         AND class_id <> ?
         AND scheduled_date = ?
         AND TIME_FORMAT(start_time, '%H:%i') = ?
         AND status = 'scheduled'
       LIMIT 1`,
      [classData.teacher_id, class_id, requestedDateKey, requestedTimeKey]
    );

    if (teacherConflictRows.length) {
      return res.status(409).json({ message: "This time slot is already booked on the teacher's schedule" });
    }

    // Determine recipient: if student requested, notify teacher; if teacher requested, notify student
    const recipientId = classData.student_id === requested_by_id ? classData.teacher_id : classData.student_id;
    const requesterUser = await pool.query(
      `SELECT first_name, last_name FROM users WHERE user_id = ?`,
      [requested_by_id]
    );
    const requesterName = requesterUser[0].length > 0 ? `${requesterUser[0][0].first_name} ${requesterUser[0][0].last_name}` : "User";

    // Create reschedule request
    const [result] = await pool.query(
      `INSERT INTO reschedule_requests (class_id, requested_by_id, requested_date, requested_time, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [class_id, requested_by_id, requestedDateKey, requestedTimeForDb, reason]
    );

    // Create notification for the counterparty
    const notificationMessage = `Reschedule request from ${requesterName} for "${classData.class_name}" to ${requestedDateKey} at ${requestedTimeKey}`;
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [recipientId, "reschedule", `Reschedule Request`, notificationMessage, result.insertId, "reschedule_request"]
    );

    res.status(201).json({ id: result.insertId, message: "Reschedule request sent and notification created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating reschedule request" });
  }
});

// Get booked dates and times for a user (teacher or student)
app.get("/api/calendar/booked-dates/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const [bookedDates] = await pool.query(
      `SELECT DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
              c.teacher_id,
              c.student_id,
              tea.timezone AS teacher_timezone,
              stu.timezone AS student_timezone
       FROM classes c
       JOIN users tea ON c.teacher_id = tea.user_id
       JOIN users stu ON c.student_id = stu.user_id
       WHERE (teacher_id = ? OR student_id = ?)
       AND c.status = 'scheduled'
       AND c.scheduled_date >= CURDATE()
       ORDER BY c.scheduled_date ASC, c.start_time ASC`,
      [user_id, user_id]
    );

    res.json({ bookedDates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching booked dates" });
  }
});

// Get reschedule requests for a user (that they need to approve/reject)
app.get("/api/calendar/my-reschedule-requests/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const [requests] = await pool.query(
      `SELECT rr.*, c.class_id, c.class_name,
              DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
              req.first_name AS requester_first, req.last_name AS requester_last,
              stu.first_name AS student_first, stu.last_name AS student_last,
              stu.timezone AS student_timezone,
              tea.first_name AS teacher_first, tea.last_name AS teacher_last,
              tea.timezone AS teacher_timezone
       FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       JOIN users req ON rr.requested_by_id = req.user_id
       LEFT JOIN users stu ON c.student_id = stu.user_id
       LEFT JOIN users tea ON c.teacher_id = tea.user_id
       WHERE (c.teacher_id = ? OR c.student_id = ?)
       AND rr.requested_by_id != ?
       AND rr.status = 'pending'
       ORDER BY rr.requested_at DESC`,
      [user_id, user_id, user_id]
    );

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching reschedule requests" });
  }
});

// Approve a reschedule request (from user, not just admin)
app.post("/api/calendar/reschedule-requests/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    // Verify user is authorized (teacher or student of the class)
    const [authCheck] = await pool.query(
      `SELECT rr.* FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       WHERE rr.request_id = ? AND (c.teacher_id = ? OR c.student_id = ?)`,
      [id, user_id, user_id]
    );

    if (!authCheck.length) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Get reschedule request details
    const [rescheduleData] = await pool.query(
      `SELECT class_id, requested_date, requested_time FROM reschedule_requests WHERE request_id = ?`,
      [id]
    );

    if (!rescheduleData.length) {
      return res.status(404).json({ message: "Reschedule request not found" });
    }

    const { class_id, requested_date, requested_time } = rescheduleData[0];

    // Get current class end_time to calculate duration
    const [classData] = await pool.query(
      `SELECT start_time, end_time FROM classes WHERE class_id = ?`,
      [class_id]
    );

    if (!classData.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const { end_time: oldEndTime, start_time: oldStartTime } = classData[0];
    
    // Calculate new end_time by preserving the original duration
    const startDate = new Date(`2000-01-01 ${oldStartTime}`);
    const endDate = new Date(`2000-01-01 ${oldEndTime}`);
    const durationMs = endDate - startDate;
    
    const newEndTimeDate = new Date(`2000-01-01 ${requested_time}`);
    newEndTimeDate.setTime(newEndTimeDate.getTime() + durationMs);
    const newEndTime = newEndTimeDate.toTimeString().slice(0, 8);

    // Update reschedule request status
    const resolvedAt = new Date();
    await pool.query(
      `UPDATE reschedule_requests SET status = ?, resolved_at = ? WHERE request_id = ?`,
      ["approved", resolvedAt, id]
    );

    // Update class with new date and time
    await pool.query(
      `UPDATE classes SET scheduled_date = ?, start_time = ?, end_time = ? WHERE class_id = ?`,
      [requested_date, requested_time, newEndTime, class_id]
    );

    // Get the requester info for notification
    const [requesterInfo] = await pool.query(
      `SELECT rr.requested_by_id, c.teacher_id, c.student_id, c.class_name 
       FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       WHERE rr.request_id = ?`,
      [id]
    );

    if (requesterInfo.length) {
      const { requested_by_id, teacher_id, student_id, class_name } = requesterInfo[0];
      const otherPartyId = requested_by_id === teacher_id ? student_id : teacher_id;
      
      // Create notification for the requester (they approved the requestor's request)
      const approverName = user_id === teacher_id ? 'Teacher' : 'Student';
      const notificationMessage = `Your reschedule request for "${class_name}" has been approved for ${requested_date} at ${requested_time}`;
      
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [requested_by_id, "reschedule", "Reschedule Approved", notificationMessage, id, "reschedule_request"]
      );
      
      // Create notification for the other party (to inform them of the change)
      const otherPartyMessage = `${approverName} approved the reschedule request for "${class_name}". New date: ${requested_date} at ${requested_time}`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [otherPartyId, "reschedule", "Reschedule Approved", otherPartyMessage, id, "reschedule_request"]
      );
    }

    res.json({ 
      message: "Reschedule request approved and calendar updated",
      newDate: requested_date,
      newTime: requested_time,
      newEndTime: newEndTime
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error approving request" });
  }
});

// Reject a reschedule request (from user, not just admin)
app.post("/api/calendar/reschedule-requests/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    // Verify user is authorized (teacher or student of the class)
    const [authCheck] = await pool.query(
      `SELECT rr.* FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       WHERE rr.request_id = ? AND (c.teacher_id = ? OR c.student_id = ?)`,
      [id, user_id, user_id]
    );

    if (!authCheck.length) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const resolvedAt = new Date();
    await pool.query(
      `UPDATE reschedule_requests SET status = ?, resolved_at = ? WHERE request_id = ?`,
      ["declined", resolvedAt, id]
    );

    // Get the requester info for notification
    const [requesterInfo] = await pool.query(
      `SELECT rr.requested_by_id, c.teacher_id, c.student_id, c.class_name 
       FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       WHERE rr.request_id = ?`,
      [id]
    );

    if (requesterInfo.length) {
      const { requested_by_id, teacher_id, student_id, class_name } = requesterInfo[0];
      const otherPartyId = requested_by_id === teacher_id ? student_id : teacher_id;
      
      // Create notification for the requester
      const rejectorName = user_id === teacher_id ? 'Teacher' : 'Student';
      const notificationMessage = `Your reschedule request for "${class_name}" has been rejected`;
      
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [requested_by_id, "reschedule", "Reschedule Rejected", notificationMessage, id, "reschedule_request"]
      );
      
      // Create notification for the other party
      const otherPartyMessage = `${rejectorName} rejected the reschedule request for "${class_name}"`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [otherPartyId, "reschedule", "Reschedule Rejected", otherPartyMessage, id, "reschedule_request"]
      );
    }

    res.json({ message: "Reschedule request rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error rejecting request" });
  }
});

// --- admin management of reschedule requests ---
app.get("/api/admin/reschedule-requests", async (req, res) => {
  try {
    // optionally filter by status via query param
    const { status } = req.query;
    let query = `SELECT rr.*, c.class_name, c.scheduled_date, c.start_time,
                        req.first_name AS requester_first, req.last_name AS requester_last,
                        stu.first_name AS student_first, stu.last_name AS student_last,
                        tea.first_name AS teacher_first, tea.last_name AS teacher_last
                 FROM reschedule_requests rr
                 JOIN classes c ON rr.class_id = c.class_id
                 JOIN users req ON rr.requested_by_id = req.user_id
                 LEFT JOIN users stu ON c.student_id = stu.user_id
                 LEFT JOIN users tea ON c.teacher_id = tea.user_id`;
    const params = [];
    if (status) {
      query += ` WHERE rr.status = ?`;
      params.push(status);
    }

    const [rows] = await pool.query(query, params);
    res.json({ requests: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching reschedule requests" });
  }
});

app.delete("/api/admin/reschedule-requests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM reschedule_requests WHERE request_id = ?", [id]);
    res.json({ message: "Request deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting request" });
  }
});

app.delete("/api/admin/reschedule-requests", async (req, res) => {
  try {
    await pool.query("DELETE FROM reschedule_requests");
    res.json({ message: "All requests deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting requests" });
  }
});

// NOTE: Admin can no longer approve/reject reschedule requests from here.
// Approval/rejection now happens through user notifications and the dedicated endpoints.

// Submit class remarks
app.post("/api/calendar/remarks", async (req, res) => {
  try {
    const { class_id, teacher_id, student_id, remarks, rating } = req.body;

    if (!class_id || !teacher_id || !student_id || !remarks) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await pool.query(
      `INSERT INTO class_remarks (class_id, teacher_id, student_id, remarks, rating)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE remarks = ?, rating = ?`,
      [class_id, teacher_id, student_id, remarks, rating, remarks, rating]
    );

    const [classRows] = await pool.query(
      `SELECT class_name, scheduled_date, start_time FROM classes WHERE class_id = ? LIMIT 1`,
      [class_id]
    );
    const className = classRows.length ? classRows[0].class_name : "your class";
    const scheduleDate = classRows.length ? classRows[0].scheduled_date : null;
    const startTime = classRows.length ? classRows[0].start_time : null;

    const formatDate = (dateValue) => {
      if (!dateValue) return null;
      const date = new Date(dateValue);
      return date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    };

    const formatTime = (timeValue) => {
      if (!timeValue) return null;
      const [hour, minute] = timeValue.split(":");
      if (hour == null || minute == null) return timeValue;
      const hourNumber = parseInt(hour, 10);
      const ampm = hourNumber >= 12 ? "PM" : "AM";
      const hour12 = ((hourNumber + 11) % 12) + 1;
      return `${hour12}:${minute}${ampm}`;
    };

    const dateText = scheduleDate ? formatDate(scheduleDate) : null;
    const timeText = startTime ? formatTime(startTime) : null;
    const scheduleText = dateText && timeText ? ` on ${dateText} at ${timeText}` : dateText ? ` on ${dateText}` : timeText ? ` at ${timeText}` : "";

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        student_id,
        "remark",
        "New teacher remark",
        `Your teacher left a new remark for ${className}${scheduleText}`,
        class_id,
        "class_remarks",
        "/remarks"
      ]
    );

    res.json({ message: "Remarks saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving remarks" });
  }
});

// Get all remarks for a student
app.get("/api/student/:student_id/remarks", async (req, res) => {
  try {
    const { student_id } = req.params;

    const [rows] = await pool.query(
      `SELECT cr.*, c.class_name, c.scheduled_date, c.start_time, c.end_time,
              t.first_name AS teacher_first, t.last_name AS teacher_last,
              t.profile_image_url AS teacher_profile_image_url
       FROM class_remarks cr
       JOIN classes c ON cr.class_id = c.class_id
       JOIN users t ON cr.teacher_id = t.user_id
       WHERE cr.student_id = ?
       ORDER BY cr.created_at DESC`,
      [student_id]
    );

    const remarks = rows.map((row) => ({
      remark_id: row.remark_id,
      class_id: row.class_id,
      class_name: row.class_name,
      teacher_name: `${row.teacher_first} ${row.teacher_last}`,
      teacher_profile_image_url: row.teacher_profile_image_url,
      remarks: row.remarks,
      rating: row.rating,
      created_at: row.created_at,
      scheduled_date: row.scheduled_date,
      start_time: row.start_time,
      end_time: row.end_time,
    }));

    res.json({ remarks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching student remarks" });
  }
});

// Get class remarks
app.get("/api/calendar/remarks/:class_id", async (req, res) => {
  try {
    const { class_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM class_remarks WHERE class_id = ?`,
      [class_id]
    );

    res.json({ remarks: rows.length ? rows[0] : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching remarks" });
  }
});

// ==================== VIDEO SESSIONS (MS TEAMS) ====================

// Create a video session with Teams meeting link
app.post("/api/video-sessions", async (req, res) => {
  try {
    const { class_id, teacher_id, student_id, teams_meeting_link } = req.body;

    if (!teacher_id || !student_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [result] = await pool.query(
      `INSERT INTO video_sessions (class_id, teacher_id, student_id, teams_meeting_link)
       VALUES (?, ?, ?, ?)`,
      [class_id, teacher_id, student_id, teams_meeting_link]
    );

    res.status(201).json({ id: result.insertId, message: "Video session created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating video session" });
  }
});

// Get video session by class ID
app.get("/api/video-sessions/:class_id", async (req, res) => {
  try {
    const { class_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM video_sessions WHERE class_id = ?`,
      [class_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No video session found" });
    }

    res.json({ session: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching video session" });
  }
});

// Update Teams meeting link for a session
app.put("/api/video-sessions/:session_id", async (req, res) => {
  try {
    const { session_id } = req.params;
    const { teams_meeting_link, status } = req.body;

    let query = "UPDATE video_sessions SET ";
    const params = [];

    if (teams_meeting_link) {
      query += "teams_meeting_link = ?, ";
      params.push(teams_meeting_link);
    }
    if (status) {
      query += "status = ?, ";
      params.push(status);
    }

    query = query.slice(0, -2); // Remove trailing ", "
    query += " WHERE session_id = ?";
    params.push(session_id);

    await pool.query(query, params);

    res.json({ message: "Video session updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating video session" });
  }
});

// Get all video sessions for a user
app.get("/api/video-sessions/user/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM video_sessions 
       WHERE teacher_id = ? OR student_id = ?
       ORDER BY created_at DESC`,
      [user_id, user_id]
    );

    res.json({ sessions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching video sessions" });
  }
});

// ==================== NOTIFICATIONS (System-wide) ====================

// Get all unread notifications for a user
app.get("/api/notifications/unread/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM notifications 
       WHERE user_id = ? AND is_read = FALSE`,
      [user_id]
    );

    res.json({ unreadCount: rows[0].count || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching unread notifications" });
  }
});

// Get all notifications for a user (paginated)
app.get("/api/notifications/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const type = req.query.type || null; // optional filter by type

    let query = `SELECT * FROM notifications WHERE user_id = ?`;
    const params = [user_id];

    if (type) {
      query += ` AND type = ?`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM notifications WHERE user_id = ?${type ? ` AND type = ?` : ''}`,
      type ? [user_id, type] : [user_id]
    );

    res.json({ 
      notifications: rows, 
      total: countResult[0].total,
      page,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
});

// Create a new notification (system endpoint)
app.post("/api/notifications", async (req, res) => {
  try {
    const { user_id, type, title, message, related_id, related_type, action_url } = req.body;

    if (!user_id || !type || !message) {
      return res.status(400).json({ message: "Missing required fields: user_id, type, message" });
    }

    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, type, title || null, message, related_id || null, related_type || null, action_url || null]
    );

    res.status(201).json({ id: result.insertId, message: "Notification created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating notification" });
  }
});

// Mark notification as read
app.put("/api/notifications/:notification_id/read", async (req, res) => {
  try {
    const { notification_id } = req.params;

    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE notification_id = ?`,
      [notification_id]
    );

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error marking notification as read" });
  }
});

// Mark all notifications as read for a user
app.put("/api/users/:user_id/notifications/read-all", async (req, res) => {
  try {
    const { user_id } = req.params;

    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND is_read = FALSE`,
      [user_id]
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error marking notifications as read" });
  }
});

// Delete a notification
app.delete("/api/notifications/:notification_id", async (req, res) => {
  try {
    const { notification_id } = req.params;

    await pool.query(
      `DELETE FROM notifications WHERE notification_id = ?`,
      [notification_id]
    );

    res.json({ message: "Notification deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting notification" });
  }
});

// Delete all notifications for a user
app.delete("/api/notifications/user/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    await pool.query(
      `DELETE FROM notifications WHERE user_id = ?`,
      [user_id]
    );

    res.json({ message: "All notifications deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting notifications" });
  }
});

// Get user notification preferences
app.get("/api/notification-preferences/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = ?`,
      [user_id]
    );

    if (!rows.length) {
      // Create default preferences if they don't exist
      await pool.query(
        `INSERT INTO notification_preferences (user_id) VALUES (?)`,
        [user_id]
      );
      const [newRows] = await pool.query(
        `SELECT * FROM notification_preferences WHERE user_id = ?`,
        [user_id]
      );
      return res.json({ preferences: newRows[0] });
    }

    res.json({ preferences: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching preferences" });
  }
});

// Update user notification preferences
app.put("/api/notification-preferences/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const { class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end } = req.body;

    await pool.query(
      `INSERT INTO notification_preferences (user_id, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       class_reminders = ?, assignment_notifications = ?, remark_notifications = ?, reschedule_notifications = ?, enrollment_notifications = ?, email_on_notification = ?, do_not_disturb_start = ?, do_not_disturb_end = ?`,
      [user_id, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end]
    );

    res.json({ message: "Preferences updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating preferences" });
  }
});

// ==================== STUDENT PROFILE ENDPOINTS ====================

// Get student profile with package info
app.get("/api/student/profile/:student_id", async (req, res) => {
  try {
    const { student_id } = req.params;

    const [profileRows] = await pool.query(
      `SELECT sp.*, u.first_name, u.last_name, u.email,
              ta.first_name as teacher_first, ta.last_name as teacher_last,
              c.course_id, c.course_name, c.description as course_description, c.duration as course_duration
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.user_id
       LEFT JOIN users ta ON sp.assigned_teacher_id = ta.user_id
       LEFT JOIN courses c ON sp.course_id = c.course_id
       WHERE sp.user_id = ?`,
      [student_id]
    );

    if (!profileRows.length) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    const [packageRows] = await pool.query(
      `SELECT * FROM student_class_packages WHERE student_id = ? AND status = 'active'`,
      [student_id]
    );

    const profile = profileRows[0];
    const packageInfo = packageRows.length > 0 ? packageRows[0] : null;

    res.json({
      profile: {
        user_id: profile.user_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        proficiency_level: profile.proficiency_level,
        assigned_teacher_id: profile.assigned_teacher_id,
        teacher_name: profile.teacher_first && profile.teacher_last ? `${profile.teacher_first} ${profile.teacher_last}` : null,
        trial_notes: profile.trial_notes,
        course_id: profile.course_id,
        course_name: profile.course_name,
        course_description: profile.course_description,
        course_duration: profile.course_duration
      },
      package: packageInfo ? {
        package_id: packageInfo.package_id,
        total_classes: packageInfo.total_classes,
        classes_used: packageInfo.classes_used,
        classes_left: packageInfo.classes_left,
        status: packageInfo.status
      } : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching student profile" });
  }
});

app.get("/api/student/assigned-teacher/:student_id", async (req, res) => {
  try {
    const { student_id } = req.params;
    const [rows] = await pool.query(
      `SELECT assigned_teacher_id FROM student_profiles WHERE user_id = ? LIMIT 1`,
      [student_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Assigned teacher not found" });
    }

    res.json({ assigned_teacher_id: rows[0].assigned_teacher_id ?? null });
  } catch (err) {
    console.error("GET /api/student/assigned-teacher/:student_id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all students assigned to a teacher
app.get("/api/teacher/:teacher_id/students", async (req, res) => {
  try {
    const { teacher_id } = req.params;

    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.contact_number AS contact,
              u.profile_image_url,
              sp.proficiency_level, sp.assigned_teacher_id, sp.course_id, sp.trial_notes
       FROM users u
       JOIN student_profiles sp ON u.user_id = sp.user_id
       WHERE sp.assigned_teacher_id = ?`,
      [teacher_id]
    );

    const students = rows.map((student) => ({
      user_id: student.user_id,
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      contact: student.contact,
      profileImageUrl: student.profile_image_url,
      profile_image_url: student.profile_image_url,
      proficiency_level: student.proficiency_level,
      assigned_teacher_id: student.assigned_teacher_id,
      course_id: student.course_id,
      trial_notes: student.trial_notes,
    }));

    res.json({ students });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/students error:", err);
    res.status(500).json({ message: "Error fetching assigned students" });
  }
});

// ==================== ASSIGNMENTS ====================

app.get("/api/teacher/:teacher_id/assignments", async (req, res) => {
  try {
    const { teacher_id } = req.params;
    const [rows] = await pool.query(
      `${assignmentSelect}
       WHERE a.teacher_id = ?
       ORDER BY a.created_at DESC, a.assignment_id DESC`,
      [teacher_id]
    );

    res.json({ assignments: rows });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/assignments error:", err);
    res.status(500).json({ message: "Error fetching teacher assignments" });
  }
});

app.get("/api/teacher/:teacher_id/submissions", async (req, res) => {
  try {
    const { teacher_id } = req.params;
    const [rows] = await pool.query(
      `${submissionSelect}
       WHERE a.teacher_id = ?
       ORDER BY s.submitted_at DESC, s.submission_id DESC`,
      [teacher_id]
    );

    res.json({ submissions: rows });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/submissions error:", err);
    res.status(500).json({ message: "Error fetching assignment submissions" });
  }
});

app.get("/api/student/:student_id/assignments", async (req, res) => {
  try {
    const { student_id } = req.params;
    const [rows] = await pool.query(
      `${assignmentSelect}
       WHERE a.student_id = ?
       ORDER BY a.due_date ASC, a.due_time ASC, a.created_at DESC`,
      [student_id]
    );

    res.json({ assignments: rows });
  } catch (err) {
    console.error("GET /api/student/:student_id/assignments error:", err);
    res.status(500).json({ message: "Error fetching student assignments" });
  }
});

app.get("/api/assignments/:assignment_id", async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const [rows] = await pool.query(
      `${assignmentSelect}
       WHERE a.assignment_id = ?
       LIMIT 1`,
      [assignment_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.json({ assignment: rows[0] });
  } catch (err) {
    console.error("GET /api/assignments/:assignment_id error:", err);
    res.status(500).json({ message: "Error fetching assignment" });
  }
});

app.post("/api/assignments", async (req, res) => {
  try {
    const {
      teacherId,
      teacher_id,
      studentId,
      student_id,
      title,
      name,
      instructions,
      due,
      courseId,
      course_id,
      attemptLimit,
      attempt_limit,
    } = req.body;
    const resolvedTeacherId = teacherId ?? teacher_id;
    const resolvedStudentId = studentId ?? student_id;
    const assignmentTitle = (title || name || "").trim();
    const assignmentInstructions = (instructions || "").trim();
    const { dueDate, dueTime } = splitAssignmentDue(due);
    const rawAttemptLimit = attemptLimit ?? attempt_limit ?? null;
    const parsedAttemptLimit =
      rawAttemptLimit === null || rawAttemptLimit === "" ? null : Number(rawAttemptLimit);
    let resolvedCourseId = courseId ?? course_id ?? null;

    if (!resolvedTeacherId || !resolvedStudentId || !assignmentTitle || !assignmentInstructions) {
      return res.status(400).json({
        message: "Teacher, student, title, and instructions are required",
      });
    }

    if (isDueDatePast(dueDate, dueTime)) {
      return res.status(400).json({
        message: "Due date must be in the future. Please select a current or future date and time.",
      });
    }

    if (
      parsedAttemptLimit !== null &&
      (!Number.isInteger(parsedAttemptLimit) || parsedAttemptLimit < 1)
    ) {
      return res.status(400).json({
        message: "Attempt limit must be a whole number greater than 0.",
      });
    }

    if (!resolvedCourseId) {
      const [profileRows] = await pool.query(
        "SELECT course_id FROM student_profiles WHERE user_id = ? LIMIT 1",
        [resolvedStudentId]
      );
      resolvedCourseId = profileRows[0]?.course_id ?? null;
    }

    const [result] = await pool.query(
      `INSERT INTO assignments (teacher_id, student_id, course_id, title, instructions, due_date, due_time, attempt_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedTeacherId,
        resolvedStudentId,
        resolvedCourseId,
        assignmentTitle,
        assignmentInstructions,
        dueDate,
        dueTime,
        parsedAttemptLimit,
      ]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'assignment', 'New Assignment', ?, ?, 'assignment', ?)`,
      [
        resolvedStudentId,
        `New assignment posted: "${assignmentTitle}"${dueDate ? ` due ${dueDate}${dueTime ? ` ${dueTime.slice(0, 5)}` : ""}` : ""}.`,
        result.insertId,
        `/assignmentsDropbox?assignmentId=${result.insertId}`,
      ]
    );

    const [rows] = await pool.query(
      `${assignmentSelect}
       WHERE a.assignment_id = ?
       LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json({ assignment: rows[0], message: "Assignment created" });
  } catch (err) {
    console.error("POST /api/assignments error:", err);
    res.status(500).json({ message: "Error creating assignment" });
  }
});

const submissionUploader = (req, res, next) => {
  if (req.is("multipart/form-data")) {
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("Upload error:", err);
        return res.status(500).json({ message: "Error uploading file" });
      }
      next();
    });
  } else {
    next();
  }
};

app.post("/api/assignments/:assignment_id/submissions", submissionUploader, async (req, res) => {
  const conn = await pool.getConnection();
  let transactionStarted = false;
  try {
    const { assignment_id } = req.params;
    const { studentId, student_id, submissionText, comments, fileUrl, file_url } = req.body || {};
    const resolvedStudentId = studentId ?? student_id;
    const text = (submissionText ?? comments ?? "").trim();
    const uploadedFile = req.file ? `${req.protocol}://${req.get("host")}/uploads/assignments/${encodeURIComponent(req.file.filename)}` : null;
    const finalFileUrl = uploadedFile ?? fileUrl ?? file_url ?? null;

    if (!resolvedStudentId || (!text && !finalFileUrl)) {
      return res.status(400).json({ message: "Student and submission text or file are required" });
    }

    await conn.beginTransaction();
    transactionStarted = true;

    const [assignmentRows] = await conn.query(
      `SELECT assignment_id, teacher_id, student_id, title, due_date, due_time, attempt_limit
       FROM assignments
       WHERE assignment_id = ?
       LIMIT 1`,
      [assignment_id]
    );

    if (!assignmentRows.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Assignment not found" });
    }

    const assignment = assignmentRows[0];
    if (String(assignment.student_id) !== String(resolvedStudentId)) {
      await conn.rollback();
      return res.status(403).json({ message: "This assignment is not assigned to the selected student" });
    }

    if (isDueDatePast(assignment.due_date, assignment.due_time)) {
      await conn.rollback();
      return res.status(400).json({ message: "This assignment is past due and can no longer be submitted." });
    }

    const [existingSubmissionRows] = await conn.query(
      `SELECT submission_id, attempt_count
       FROM assignment_submissions
       WHERE assignment_id = ? AND student_id = ?
       LIMIT 1
       FOR UPDATE`,
      [assignment_id, resolvedStudentId]
    );
    const attemptsUsed = Number(existingSubmissionRows[0]?.attempt_count || 0);
    const attemptLimit = assignment.attempt_limit === null ? null : Number(assignment.attempt_limit);

    if (attemptLimit !== null && attemptsUsed >= attemptLimit) {
      await conn.rollback();
      return res.status(400).json({
        message: `Attempt limit reached. This assignment only allows ${attemptLimit} submission${attemptLimit === 1 ? "" : "s"}.`,
      });
    }

    const [result] = await conn.query(
      `INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_url)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE submission_text = VALUES(submission_text),
                                file_url = VALUES(file_url),
                                attempt_count = attempt_count + 1,
                                submitted_at = CURRENT_TIMESTAMP,
                                grade = NULL,
                                feedback = NULL,
                               graded_at = NULL`,
      [assignment_id, resolvedStudentId, text || null, finalFileUrl]
    );

    await conn.query(
      `UPDATE assignments SET status = 'submitted' WHERE assignment_id = ?`,
      [assignment_id]
    );

    await conn.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'assignment', 'Assignment Submitted', ?, ?, 'assignment', ?)`,
      [
        assignment.teacher_id,
        `A student submitted "${assignment.title}".`,
        assignment_id,
        `/teacherAssignment`,
      ]
    );

    await conn.commit();
    transactionStarted = false;

    const [rows] = await conn.query(
      `${submissionSelect}
       WHERE s.assignment_id = ? AND s.student_id = ?
       LIMIT 1`,
      [assignment_id, resolvedStudentId]
    );

    res.status(result.insertId ? 201 : 200).json({ submission: rows[0], message: "Assignment submitted" });
  } catch (err) {
    if (transactionStarted) {
      await conn.rollback();
    }
    console.error("POST /api/assignments/:assignment_id/submissions error:", err);
    res.status(500).json({ message: "Error submitting assignment" });
  } finally {
    conn.release();
  }
});

// Get latest class for a teacher and student pair
app.get("/api/teacher/:teacher_id/student/:student_id/latest-class", async (req, res) => {
  try {
    const { teacher_id, student_id } = req.params;
    const [rows] = await pool.query(
      `SELECT class_id, class_name, scheduled_date, start_time, end_time, status
       FROM classes
       WHERE teacher_id = ? AND student_id = ?
       ORDER BY scheduled_date DESC, class_id DESC
       LIMIT 1`,
      [teacher_id, student_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No class found for this student" });
    }

    res.json({ class: rows[0] });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/student/:student_id/latest-class error:", err);
    res.status(500).json({ message: "Error fetching latest class" });
  }
});

// Get all courses
app.get("/api/courses", async (req, res) => {
  try {
    const [courses] = await pool.query(
      `SELECT course_id, course_name, description, duration
       FROM courses
       ORDER BY course_name ASC`
    );

    res.json({ courses });
  } catch (err) {
    console.error("GET /api/courses error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/admin/student-profile", async (req, res) => {
  try {
    const { user_id, proficiency_level, assigned_teacher_id, course_id, trial_notes } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "user_id is required" });
    }

    // Insert into student_profiles
    await pool.query(
      `INSERT INTO student_profiles (user_id, proficiency_level, assigned_teacher_id, course_id, trial_notes)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, proficiency_level || "beginner", assigned_teacher_id || null, course_id || null, trial_notes || null]
    );

    res.json({ message: "Student profile created successfully" });
  } catch (err) {
    console.error("POST /api/admin/student-profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/student/package/:student_id/use-class", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { student_id } = req.params;

    await connection.beginTransaction();

    const [packageRows] = await connection.query(
      `SELECT package_id
       FROM student_class_packages
       WHERE student_id = ? AND status = 'active' AND classes_left > 0
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [student_id]
    );

    if (!packageRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "No active package found" });
    }

    const packageId = packageRows[0].package_id;
    await connection.query(
      `UPDATE student_class_packages
       SET classes_used = classes_used + 1,
           status = CASE
             WHEN total_classes - (classes_used + 1) <= 0 THEN 'expired'
             ELSE status
           END
       WHERE package_id = ?`,
      [packageId]
    );

    const [updatedPackageRows] = await connection.query(
      `SELECT * FROM student_class_packages WHERE package_id = ?`,
      [packageId]
    );

    await connection.commit();
    res.json({ message: "Class usage recorded", package: updatedPackageRows[0] });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Error updating package" });
  } finally {
    connection.release();
  }
});

// Get teacher availability records for a specific month
app.get("/api/calendar/teacher-availability-records", async (req, res) => {
  try {
    const { teacher_id, year, month } = req.query;

    if (!teacher_id || !year || !month) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    await deletePastTeacherAvailability(teacher_id);

    const monthIndex = parseInt(month, 10);
    const yearValue = parseInt(year, 10);
    const daysInMonth = new Date(yearValue, monthIndex, 0).getDate();
    const startDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-01`;
    const endDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const [rows] = await pool.query(
      `SELECT ta.availability_id as id,
              ta.teacher_id,
              DATE_FORMAT(ta.available_date, '%Y-%m-%d') as available_date,
              ta.status,
              ta.notes,
              TIME_FORMAT(ta.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(ta.end_time, '%H:%i:%s') AS end_time,
              TIME_FORMAT(ta.break_start, '%H:%i:%s') AS break_start,
              TIME_FORMAT(ta.break_end, '%H:%i:%s') AS break_end,
              u.timezone AS teacher_timezone
       FROM teacher_availability ta
       JOIN users u ON u.user_id = ta.teacher_id
       WHERE ta.teacher_id = ? AND ta.available_date BETWEEN ? AND ?
       ORDER BY ta.available_date ASC`,
      [teacher_id, startDate, endDate]
    );

    res.json({ records: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching availability records" });
  }
});

// Get teacher availability record for a specific date
app.get("/api/calendar/teacher-availability-record", async (req, res) => {
  try {
    const { teacher_id, available_date } = req.query;
    if (!teacher_id || !available_date) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    await deletePastTeacherAvailability(teacher_id);

    const [rows] = await pool.query(
      `SELECT ta.availability_id as id,
              ta.teacher_id,
              DATE_FORMAT(ta.available_date, '%Y-%m-%d') as available_date,
              ta.status,
              ta.notes,
              TIME_FORMAT(ta.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(ta.end_time, '%H:%i:%s') AS end_time,
              TIME_FORMAT(ta.break_start, '%H:%i:%s') AS break_start,
              TIME_FORMAT(ta.break_end, '%H:%i:%s') AS break_end,
              u.timezone AS teacher_timezone
       FROM teacher_availability ta
       JOIN users u ON u.user_id = ta.teacher_id
       WHERE ta.teacher_id = ? AND DATE(ta.available_date) = ?
       LIMIT 1`,
      [teacher_id, available_date]
    );

    res.json({ record: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching availability record" });
  }
});

// Set teacher availability with validation
app.post("/api/calendar/set-availability", async (req, res) => {
  try {
    const { teacher_id, available_date, status, start_time, end_time, break_start, break_end } = req.body;

    if (!teacher_id || !available_date || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate date is not in the past
    const today = new Date();
    // Parse date without timezone issues (YYYY-MM-DD format)
    const [selYear, selMonth, selDay] = available_date.split('-').map(Number);
    const selectedDate = new Date(selYear, selMonth - 1, selDay, 0, 0, 0, 0);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    
    if (selectedDate < todayMidnight) {
      return res.status(400).json({ message: "Cannot set availability for past dates" });
    }

    // Validate date is in current month
    if (
      selectedDate.getFullYear() !== today.getFullYear() ||
      selectedDate.getMonth() !== today.getMonth()
    ) {
      return res.status(400).json({ message: "Can only set availability for current month" });
    }

    // If setting availability for today, validate that times are after current time
    if (selectedDate.getTime() === todayMidnight.getTime()) {
      const currentHours = today.getHours();
      const currentMins = today.getMinutes();
      const currentTotalMins = currentHours * 60 + currentMins;

      if (status === "available") {
        const [startHours, startMins] = start_time.split(":").map(Number);
        const startTotalMins = startHours * 60 + startMins;

        if (startTotalMins <= currentTotalMins) {
          return res.status(400).json({ message: "Start time must be after the current time" });
        }

        const [endHours, endMins] = end_time.split(":").map(Number);
        const endTotalMins = endHours * 60 + endMins;

        if (endTotalMins <= currentTotalMins) {
          return res.status(400).json({ message: "End time must be after the current time" });
        }
      }
    }

    // Validate time range if available status
    if (status === "available") {
      if (!start_time || !end_time) {
        return res.status(400).json({ message: "Start time and end time are required when setting available" });
      }

      // Validate end time is after start time
      const startMinutes = parseInt(start_time.split(":")[0]) * 60 + parseInt(start_time.split(":")[1]);
      const endMinutes = parseInt(end_time.split(":")[0]) * 60 + parseInt(end_time.split(":")[1]);
      
      if (endMinutes <= startMinutes) {
        return res.status(400).json({ message: "End time must be after start time" });
      }

      // Validate break times if provided
      if (break_start || break_end) {
        if (!break_start || !break_end) {
          return res.status(400).json({ message: "Both break start and break end times are required" });
        }

        const breakStartMin = parseInt(break_start.split(":")[0]) * 60 + parseInt(break_start.split(":")[1]);
        const breakEndMin = parseInt(break_end.split(":")[0]) * 60 + parseInt(break_end.split(":")[1]);

        // Break end must be after break start
        if (breakEndMin <= breakStartMin) {
          return res.status(400).json({ message: "Break end time must be after break start time" });
        }

        // Break must be within availability window
        if (breakStartMin < startMinutes || breakEndMin > endMinutes) {
          return res.status(400).json({ message: "Break time must be within your availability window" });
        }
      }

      // Check if there's already a booked class during this time window
      const [existingClasses] = await pool.query(
        `SELECT class_id, start_time, end_time FROM classes 
         WHERE teacher_id = ? AND scheduled_date = ?`,
        [teacher_id, available_date]
      );

      if (existingClasses.length > 0) {
        // Check for time conflict
        for (const cls of existingClasses) {
          const classStartMin = parseInt((cls.start_time || "00:00").split(":")[0]) * 60 + parseInt((cls.start_time || "00:00").split(":")[1]);
          const classEndMin = parseInt((cls.end_time || "00:00").split(":")[0]) * 60 + parseInt((cls.end_time || "00:00").split(":")[1]);
          
          // Check if class overlaps with availability window
          if (classStartMin < endMinutes && classEndMin > startMinutes) {
            return res.status(409).json({ message: "You have a booked class during this time period" });
          }
        }
      }
    }

    // Insert or update availability
    const [result] = await pool.query(
      `INSERT INTO teacher_availability (teacher_id, available_date, status, start_time, end_time, break_start, break_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?, start_time = ?, end_time = ?, break_start = ?, break_end = ?, updated_at = CURRENT_TIMESTAMP`,
      [teacher_id, available_date, status, start_time || null, end_time || null, break_start || null, break_end || null, status, start_time || null, end_time || null, break_start || null, break_end || null]
    );

    const [availabilityRows] = await pool.query(
      `SELECT availability_id
       FROM teacher_availability
       WHERE teacher_id = ? AND available_date = ?
       LIMIT 1`,
      [teacher_id, available_date]
    );

    const availabilityId = availabilityRows[0]?.availability_id || result.insertId || null;

    const [teacherRows] = await pool.query(
      `SELECT first_name, last_name
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [teacher_id]
    );

    const teacherName = teacherRows.length
      ? `${teacherRows[0].first_name || ""} ${teacherRows[0].last_name || ""}`.trim() || "Your teacher"
      : "Your teacher";

    const [studentRows] = await pool.query(
      `SELECT u.user_id
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.assigned_teacher_id = ?
         AND u.role = 'student'
         AND u.status = 'active'`,
      [teacher_id]
    );

    if (studentRows.length) {
      const notificationTitle = status === "available"
        ? "Teacher Availability Updated"
        : "Teacher Availability Changed";
      const notificationMessage = status === "available"
        ? `${teacherName} is available on ${humanDate(available_date)} from ${humanTime(start_time)} to ${humanTime(end_time)}.`
        : `${teacherName} marked ${humanDate(available_date)} as unavailable.`;

      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
         VALUES ${studentRows.map(() => "(?, 'announcement', ?, ?, ?, 'teacher_availability', '/Calendar')").join(", ")}`,
        studentRows.flatMap((student) => [
          student.user_id,
          notificationTitle,
          notificationMessage,
          availabilityId,
        ])
      );
    }

    res.json({ message: "Availability updated successfully", id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error setting availability" });
  }
});

// Delete teacher availability record
app.delete("/api/calendar/availability/:availability_id", async (req, res) => {
  try {
    const { availability_id } = req.params;

    const [result] = await pool.query(
      `DELETE FROM teacher_availability WHERE availability_id = ?`,
      [availability_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Availability record not found" });
    }

    res.json({ message: "Availability deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting availability" });
  }
});

// ========== BOOKS/LESSONS MODULE ==========

// Create multer storage for lessons (separate from assignments)
const lessonUploadDir = path.join(process.cwd(), "uploads", "lessons");
fs.mkdirSync(lessonUploadDir, { recursive: true });

const lessonStorage = multer.diskStorage({
  destination: lessonUploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const lessonUpload = multer({ 
  storage: lessonStorage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'), false);
    }
  }
});

// Create multer storage for book covers
const bookCoverUploadDir = path.join(process.cwd(), "uploads", "books");
fs.mkdirSync(bookCoverUploadDir, { recursive: true });

const bookCoverStorage = multer.diskStorage({
  destination: bookCoverUploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const bookCoverUpload = multer({
  storage: bookCoverStorage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image/jpeg, image/png, and image/webp are allowed for book covers'), false);
    }
  },
});



// ===== BOOKS ENDPOINTS =====

async function getStudentProfile(studentId) {
  if (!studentId) return null;

  const [rows] = await pool.query(
    "SELECT assigned_teacher_id, course_id FROM student_profiles WHERE user_id = ? LIMIT 1",
    [studentId]
  );
  return rows[0] || null;
}

async function getStudentAssignedTeacherId(studentId) {
  const profile = await getStudentProfile(studentId);
  return profile?.assigned_teacher_id || null;
}

async function canStudentAccessBook(studentId, bookId) {
  const profile = await getStudentProfile(studentId);
  if (!profile?.assigned_teacher_id) return false;

  const params = [studentId, bookId, profile.assigned_teacher_id];
  let query = `SELECT b.book_id
     FROM books b
     JOIN student_profiles sp ON sp.user_id = ?
     WHERE b.book_id = ?
       AND b.teacher_id = ?`;

  if (profile.course_id) {
    query += ' AND b.course_id = ?';
    params.push(profile.course_id);
  }

  query += '\n     LIMIT 1';

  const [rows] = await pool.query(query, params);
  return rows.length > 0;
}

async function canStudentAccessLesson(studentId, lessonId) {
  const profile = await getStudentProfile(studentId);
  if (!profile?.assigned_teacher_id) return false;

  const params = [studentId, lessonId, profile.assigned_teacher_id];
  let query = `SELECT l.lesson_id
     FROM lessons l
     JOIN books b ON l.book_id = b.book_id
     JOIN student_profiles sp ON sp.user_id = ?
     WHERE l.lesson_id = ?
       AND b.teacher_id = ?`;

  if (profile.course_id) {
    query += ' AND b.course_id = ?';
    params.push(profile.course_id);
  }

  query += '\n     LIMIT 1';

  const [rows] = await pool.query(query, params);
  return rows.length > 0;
}

async function getAssignedStudentIds(teacherId, courseId) {
  if (!teacherId) return [];

  let query = `SELECT u.user_id
     FROM users u
     JOIN student_profiles sp ON sp.user_id = u.user_id
     WHERE u.role = 'student'
       AND u.status = 'active'
       AND sp.assigned_teacher_id = ?`;
  const params = [teacherId];

  if (courseId) {
    query += ' AND sp.course_id = ?';
    params.push(courseId);
  }

  const [rows] = await pool.query(query, params);
  return rows.map((row) => row.user_id);
}

async function createNotificationsForUsers(userIds, type, title, message, relatedId = null, relatedType = null, actionUrl = null) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const values = userIds.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];

  userIds.forEach((userId) => {
    params.push(userId, type, title || null, message, relatedId, relatedType, actionUrl);
  });

  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url) VALUES ${values}`,
    params
  );
}

// ========== TEACHER DATA ISOLATION & SECURITY HELPERS ==========

/**
 * Extract teacher ID from request (query, body, or headers)
 * Priority: query param > body > header
 */
function getTeacherIdFromRequest(req) {
  return req.query.teacher_id || req.body?.teacher_id || req.headers?.['x-teacher-id'];
}

/**
 * Check if a teacher owns a specific book
 * @param {number} bookId - The book ID to check
 * @param {number} teacherId - The teacher ID making the request
 * @returns {Promise<boolean>} True if teacher owns the book
 */
async function isTeacherBookOwner(bookId, teacherId) {
  const [rows] = await pool.query(
    "SELECT book_id FROM books WHERE book_id = ? AND teacher_id = ? LIMIT 1",
    [bookId, teacherId]
  );
  return rows.length > 0;
}

/**
 * Validate that the requesting teacher owns the book
 * Throws 403 error if teacher does not own the book or if book doesn't exist
 * @param {Object} res - Express response object
 * @param {number} bookId - The book ID to check
 * @param {number} teacherId - The authenticated teacher's ID
 * @returns {Promise<boolean>} True if authorized, throws error otherwise
 */
async function validateTeacherBookOwnership(res, bookId, teacherId) {
  if (!teacherId) {
    res.status(401).json({ message: "Unauthorized: Teacher ID not provided" });
    return false;
  }

  const [books] = await pool.query(
    "SELECT book_id, teacher_id FROM books WHERE book_id = ? LIMIT 1",
    [bookId]
  );

  if (books.length === 0) {
    res.status(404).json({ message: "Book not found" });
    return false;
  }

  if (books[0].teacher_id !== parseInt(teacherId)) {
    res.status(403).json({ 
      message: "Forbidden: You do not have permission to access this book. You can only manage books you uploaded." 
    });
    return false;
  }

  return true;
}

/**
 * Validate that the requesting teacher owns the book containing a lesson
 * @param {Object} res - Express response object
 * @param {number} lessonId - The lesson ID to check
 * @param {number} teacherId - The authenticated teacher's ID
 * @returns {Promise<boolean>} True if authorized, throws error otherwise
 */
async function validateTeacherLessonOwnership(res, lessonId, teacherId) {
  if (!teacherId) {
    res.status(401).json({ message: "Unauthorized: Teacher ID not provided" });
    return false;
  }

  const [lessons] = await pool.query(
    `SELECT l.lesson_id, b.teacher_id, l.book_id
     FROM lessons l
     JOIN books b ON l.book_id = b.book_id
     WHERE l.lesson_id = ? LIMIT 1`,
    [lessonId]
  );

  if (lessons.length === 0) {
    res.status(404).json({ message: "Lesson not found" });
    return false;
  }

  if (lessons[0].teacher_id !== parseInt(teacherId)) {
    res.status(403).json({ 
      message: "Forbidden: You do not have permission to manage this lesson. The lesson belongs to a book uploaded by another teacher." 
    });
    return false;
  }

  return true;
}

// GET all books (filtered by course, teacher, or assigned student teacher)
app.get("/api/books", async (req, res) => {
  try {
    const { course_id, teacher_id, student_id } = req.query;

    let query = `SELECT b.*,
        TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS teacher_name,
        NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') AS author
      FROM books b
      LEFT JOIN users u ON u.user_id = b.teacher_id`;
    let params = [];

    if (student_id) {
      const profile = await getStudentProfile(student_id);
      if (!profile?.assigned_teacher_id) {
        return res.json({ books: [] });
      }

      query += " WHERE b.teacher_id = ?";
      params.push(profile.assigned_teacher_id);

      if (profile.course_id) {
        query += " AND b.course_id = ?";
        params.push(profile.course_id);
      } else if (course_id) {
        query += " AND b.course_id = ?";
        params.push(course_id);
      }
    } else if (teacher_id) {
      query += " WHERE b.teacher_id = ?";
      params.push(teacher_id);
    } else if (course_id) {
      query += " WHERE b.course_id = ?";
      params.push(course_id);
    }

    query += " ORDER BY b.created_at DESC";

    const [books] = await pool.query(query, params);
    res.json({ books });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching books" });
  }
});

// GET single book with lesson count
// SECURITY: Teacher can only view books they own; students can view their assigned teacher's books
app.get("/api/books/:book_id", async (req, res) => {
  try {
    const { book_id } = req.params;
    const { student_id, teacher_id } = req.query;

    const [books] = await pool.query(
      "SELECT * FROM books WHERE book_id = ?",
      [book_id]
    );

    if (books.length === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    if (teacher_id) {
      if (!(await validateTeacherBookOwnership(res, book_id, teacher_id))) {
        return;
      }
    } else if (student_id) {
      if (!(await canStudentAccessBook(student_id, book_id))) {
        return res.status(403).json({ message: "You do not have access to this book" });
      }
    } else {
      return res.status(401).json({ message: "student_id or teacher_id is required" });
    }

    const [lessons] = await pool.query(
      "SELECT COUNT(*) as lesson_count FROM lessons WHERE book_id = ?",
      [book_id]
    );

    res.json({ 
      book: {
        ...books[0],
        lesson_count: lessons[0].lesson_count
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching book" });
  }
});

// GET teacher-facing student progress for a book
app.get("/api/teacher/book/:bookId/progress", async (req, res) => {
  try {
    const { bookId } = req.params;
    const teacher_id = getTeacherIdFromRequest(req);

    if (!teacher_id) {
      return res.status(401).json({ message: "Unauthorized: teacher_id is required" });
    }

    const [bookRows] = await pool.query(
      "SELECT book_id, title, course_id, teacher_id FROM books WHERE book_id = ? LIMIT 1",
      [bookId]
    );

    if (bookRows.length === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    const book = bookRows[0];
    if (book.teacher_id !== parseInt(teacher_id, 10)) {
      return res.status(403).json({ message: "Forbidden: You do not have permission to view progress for this book." });
    }

    const [lessons] = await pool.query(
      `SELECT lesson_id, lesson_number, title
       FROM lessons
       WHERE book_id = ?
       ORDER BY order_number ASC, lesson_number ASC`,
      [bookId]
    );

    const [students] = await pool.query(
      `SELECT u.user_id AS student_id, u.first_name, u.last_name, u.email, u.profile_image_url,
              sp.course_id, sp.assigned_teacher_id
       FROM users u
       JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.role = 'student'
         AND u.status = 'active'
         AND sp.course_id = ?
         AND sp.assigned_teacher_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [book.course_id, book.teacher_id]
    );

    if (students.length === 0) {
      return res.json({
        book,
        lessons,
        students: [],
      });
    }

    const studentIds = students.map((student) => student.student_id);
    const placeholders = studentIds.map(() => "?").join(",");
    const [progressRows] = await pool.query(
      `SELECT lp.student_id, lp.lesson_id, lp.is_completed, lp.progress_percentage, lp.completed_at
       FROM lesson_progress lp
       JOIN lessons l ON l.lesson_id = lp.lesson_id
       WHERE l.book_id = ?
         AND lp.student_id IN (${placeholders})`,
      [bookId, ...studentIds]
    );

    const [courseProgressRows] = await pool.query(
      `SELECT student_id, status, completed_lessons, total_lessons, progress_percentage, completed_at
       FROM student_course_progress
       WHERE book_id = ?
         AND student_id IN (${placeholders})`,
      [bookId, ...studentIds]
    );

    const progressByStudent = new Map();
    progressRows.forEach((row) => {
      if (!progressByStudent.has(row.student_id)) {
        progressByStudent.set(row.student_id, new Map());
      }
      progressByStudent.get(row.student_id).set(row.lesson_id, row);
    });

    const courseProgressByStudent = new Map();
    courseProgressRows.forEach((row) => {
      courseProgressByStudent.set(row.student_id, row);
    });

    const totalLessons = lessons.length;
    const studentProgress = students.map((student) => {
      const lessonMap = progressByStudent.get(student.student_id) || new Map();
      const courseProgress = courseProgressByStudent.get(student.student_id);
      const lessonProgress = lessons.map((lesson) => {
        const progress = lessonMap.get(lesson.lesson_id);
        const completed = Boolean(progress?.is_completed) || Number(progress?.progress_percentage || 0) >= 100;

        return {
          lessonId: lesson.lesson_id,
          lessonNumber: lesson.lesson_number,
          title: lesson.title,
          isCompleted: completed,
          completedAt: progress?.completed_at || null,
        };
      });
      const completedLessons = lessonProgress.filter((lesson) => lesson.isCompleted).length;
      const progressPercentage = totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;
      const courseCompleted = totalLessons > 0 && completedLessons === totalLessons;

      return {
        studentId: student.student_id,
        name: `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.email,
        email: student.email,
        profileImageUrl: student.profile_image_url,
        completedLessons,
        totalLessons,
        progressPercentage,
        status: courseCompleted ? "Course Completed" : "In Progress",
        courseCompleted,
        courseCompletedAt: courseCompleted ? courseProgress?.completed_at || null : null,
        lessons: lessonProgress,
      };
    });

    res.json({
      book,
      lessons,
      students: studentProgress,
    });
  } catch (err) {
    console.error("GET /api/teacher/book/:bookId/progress error:", err);
    res.status(500).json({ message: "Error fetching book progress" });
  }
});

// CREATE new book
app.post("/api/books", bookCoverUpload.single("cover"), async (req, res) => {
  try {
    const { title, description, course_id, teacher_id } = req.body;

    console.log('DEBUG create book inputs:', { title, description, course_id, teacher_id, file: req.file && req.file.filename });

    if (!title || !course_id || !teacher_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const cover_url = req.file ? `/uploads/books/${req.file.filename}` : null;

    try {
      const [result] = await pool.query(
        "INSERT INTO books (title, description, course_id, teacher_id, cover_url) VALUES (?, ?, ?, ?, ?)",
        [title, description || null, course_id, teacher_id, cover_url]
      );

      const studentIds = await getAssignedStudentIds(teacher_id, course_id);
      if (studentIds.length > 0) {
        const notificationTitle = `New book available: ${title}`;
        const notificationMessage = `A new book titled "${title}" has been added to your course by your teacher. Check it out in Books & Lessons.`;
        await createNotificationsForUsers(
          studentIds,
          'general',
          notificationTitle,
          notificationMessage,
          result.insertId,
          'book',
          `/bookscontent/${result.insertId}`
        );
      }

      res.status(201).json({
        message: "Book created successfully",
        book_id: result.insertId,
        cover_url,
      });
    } catch (dbErr) {
      console.error('DB ERROR creating book:', dbErr && dbErr.message, dbErr);
      return res.status(500).json({ message: "DB error creating book", error: dbErr.message });
    }
  } catch (err) {
    console.error('CREATE BOOK ERROR', err && err.stack || err);
    res.status(500).json({ message: "Error creating book", error: err && err.message });
  }
});


// UPDATE book
// SECURITY: Only the teacher who uploaded the book can update it
app.put("/api/books/:book_id", bookCoverUpload.single("cover"), async (req, res) => {
  try {
    const { book_id } = req.params;
    const { title, description, teacher_id } = req.body;

    console.log('DEBUG update book inputs:', { book_id, title, description, teacher_id, file: req.file && req.file.filename });

    // Verify teacher ownership before allowing update
    if (!(await validateTeacherBookOwnership(res, book_id, teacher_id))) {
      return;
    }

    const cover_url = req.file ? `/uploads/books/${req.file.filename}` : null;

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push("title = ?");
      params.push(title);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description || null);
    }
    if (cover_url !== null) {
      updates.push("cover_url = ?");
      params.push(cover_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No update fields provided" });
    }

    const query = `UPDATE books SET ${updates.join(", ")} WHERE book_id = ?`;
    params.push(book_id);

    try {
      const [result] = await pool.query(query, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Book not found" });
      }

      res.json({ message: "Book updated successfully" });
    } catch (dbErr) {
      console.error('DB ERROR updating book:', dbErr && dbErr.message, dbErr);
      return res.status(500).json({ message: "DB error updating book", error: dbErr.message });
    }
  } catch (err) {
    console.error('UPDATE BOOK ERROR', err && err.stack || err);
    res.status(500).json({ message: "Error updating book", error: err && err.message });
  }
});

// DELETE book (cascade delete lessons and progress)
// SECURITY: Only the teacher who uploaded the book can delete it
app.delete("/api/books/:book_id", async (req, res) => {
  try {
    const { book_id } = req.params;
    const teacher_id = getTeacherIdFromRequest(req);

    // Verify teacher ownership before allowing deletion
    if (!(await validateTeacherBookOwnership(res, book_id, teacher_id))) {
      return;
    }

    // Get all lesson IDs for this book
    const [lessons] = await pool.query(
      "SELECT lesson_id FROM lessons WHERE book_id = ?",
      [book_id]
    );

    // Delete lesson progress for all lessons in this book
    for (const lesson of lessons) {
      await pool.query(
        "DELETE FROM lesson_progress WHERE lesson_id = ?",
        [lesson.lesson_id]
      );
    }

    // Delete all lessons
    await pool.query("DELETE FROM lessons WHERE book_id = ?", [book_id]);

    // Delete the book
    const [result] = await pool.query(
      "DELETE FROM books WHERE book_id = ?",
      [book_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json({ message: "Book deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting book" });
  }
});

// ===== LESSONS ENDPOINTS =====

// GET all lessons for a book
app.get("/api/lessons", async (req, res) => {
  try {
    const { book_id, student_id, teacher_id } = req.query;

    if (!book_id) {
      return res.status(400).json({ message: "book_id is required" });
    }

    if (student_id) {
      if (!(await canStudentAccessBook(student_id, book_id))) {
        return res.status(403).json({ message: "You do not have access to this book" });
      }
    } else if (teacher_id) {
      if (!(await validateTeacherBookOwnership(res, book_id, teacher_id))) {
        return;
      }
    } else {
      return res.status(401).json({ message: "student_id or teacher_id is required" });
    }

    const [lessons] = await pool.query(
      "SELECT * FROM lessons WHERE book_id = ? ORDER BY order_number ASC, lesson_number ASC",
      [book_id]
    );

    res.json({ lessons });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching lessons" });
  }
});

// GET single lesson with progress info
app.get("/api/lessons/:lesson_id", async (req, res) => {
  try {
    const { lesson_id } = req.params;
    const { student_id, teacher_id } = req.query;

    const [lessons] = await pool.query(
      "SELECT * FROM lessons WHERE lesson_id = ?",
      [lesson_id]
    );

    if (lessons.length === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (student_id) {
      if (!(await canStudentAccessLesson(student_id, lesson_id))) {
        return res.status(403).json({ message: "You do not have access to this lesson" });
      }
    } else if (teacher_id) {
      if (!(await validateTeacherLessonOwnership(res, lesson_id, teacher_id))) {
        return;
      }
    } else {
      return res.status(401).json({ message: "student_id or teacher_id is required" });
    }

    let progress = null;
    if (student_id) {
      const [progressRows] = await pool.query(
        "SELECT * FROM lesson_progress WHERE lesson_id = ? AND student_id = ?",
        [lesson_id, student_id]
      );
      progress = progressRows[0] || null;
    }

    res.json({ 
      lesson: lessons[0],
      progress
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching lesson" });
  }
});

// CREATE new lesson (with file upload)
// CREATE lesson
// SECURITY: Only the teacher who owns the book can create lessons for it
app.post("/api/lessons", lessonUpload.single("file"), async (req, res) => {
  try {
    const { book_id, title, content, is_published, teacher_id } = req.body;

    if (!book_id || !title) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Verify teacher owns the book before allowing lesson creation
    if (!(await validateTeacherBookOwnership(res, book_id, teacher_id))) {
      return;
    }

    const file_path = req.file ? `/uploads/lessons/${req.file.filename}` : null;
    const [lessonNumberRows] = await pool.query(
      `SELECT COALESCE(MAX(lesson_number), 0) + 1 AS next_lesson_number,
              COALESCE(MAX(order_number), 0) + 1 AS next_order_number
       FROM lessons
       WHERE book_id = ?`,
      [book_id]
    );
    const lessonNumber = Number(lessonNumberRows[0]?.next_lesson_number || 1);
    const orderNumber = Number(lessonNumberRows[0]?.next_order_number || lessonNumber);

    const [result] = await pool.query(
      `INSERT INTO lessons (book_id, lesson_number, title, content, file_path, order_number, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [book_id, lessonNumber, title, content || null, file_path, orderNumber, is_published || 1]
    );

    const [bookRows] = await pool.query(
      "SELECT title, course_id FROM books WHERE book_id = ? LIMIT 1",
      [book_id]
    );

    if (bookRows.length > 0) {
      const bookTitle = bookRows[0].title || 'your book';
      const courseIdForNotification = bookRows[0].course_id;
      const studentIds = await getAssignedStudentIds(teacher_id, courseIdForNotification);

      if (studentIds.length > 0) {
        const notificationTitle = `New lesson added to ${bookTitle}`;
        const notificationMessage = `A new lesson "${title}" has been added to the book ${bookTitle}. Visit Books & Lessons to review it.`;
        await createNotificationsForUsers(
          studentIds,
          'general',
          notificationTitle,
          notificationMessage,
          book_id,
          'book',
          `/bookscontent/${book_id}`
        );
      }
    }

    res.status(201).json({ 
      message: "Lesson created successfully",
      lesson_id: result.insertId,
      lesson_number: lessonNumber,
      file_path
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating lesson" });
  }
});

// UPDATE lesson (with optional file replacement)
// SECURITY: Only the teacher who owns the book containing the lesson can update it
app.put("/api/lessons/:lesson_id", lessonUpload.single("file"), async (req, res) => {
  try {
    const { lesson_id } = req.params;
    const { lesson_number, title, content, order_number, is_published, teacher_id } = req.body;

    // Verify teacher owns the lesson's book before allowing update
    if (!(await validateTeacherLessonOwnership(res, lesson_id, teacher_id))) {
      return;
    }

    // Get current lesson to check for old file
    const [lessons] = await pool.query(
      "SELECT * FROM lessons WHERE lesson_id = ?",
      [lesson_id]
    );

    if (lessons.length === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    let file_path = lessons[0].file_path;
    if (req.file) {
      file_path = `/uploads/lessons/${req.file.filename}`;
    }

    const [result] = await pool.query(
      `UPDATE lessons SET lesson_number = ?, title = ?, content = ?, file_path = ?, order_number = ?, is_published = ? WHERE lesson_id = ?`,
      [lesson_number, title, content || null, file_path, order_number || lesson_number, is_published, lesson_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    res.json({ 
      message: "Lesson updated successfully",
      file_path
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating lesson" });
  }
});

// DELETE lesson
// SECURITY: Only the teacher who owns the book containing the lesson can delete it
app.delete("/api/lessons/:lesson_id", async (req, res) => {
  try {
    const { lesson_id } = req.params;
    const teacher_id = getTeacherIdFromRequest(req);

    // Verify teacher owns the lesson's book before allowing deletion
    if (!(await validateTeacherLessonOwnership(res, lesson_id, teacher_id))) {
      return;
    }

    // Delete lesson progress records
    await pool.query(
      "DELETE FROM lesson_progress WHERE lesson_id = ?",
      [lesson_id]
    );

    // Delete lesson
    const [result] = await pool.query(
      "DELETE FROM lessons WHERE lesson_id = ?",
      [lesson_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    res.json({ message: "Lesson deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting lesson" });
  }
});

// ===== LESSON PROGRESS ENDPOINTS =====

// GET student's lesson progress
app.get("/api/lesson-progress", async (req, res) => {
  try {
    const { student_id, book_id } = req.query;

    if (!student_id) {
      return res.status(400).json({ message: "student_id is required" });
    }

    let query = `
      SELECT lp.* FROM lesson_progress lp
      JOIN lessons l ON lp.lesson_id = l.lesson_id
    `;
    let params = [student_id];

    if (book_id) {
      query += " WHERE lp.student_id = ? AND l.book_id = ?";
      params.push(book_id);
    } else {
      query += " WHERE lp.student_id = ?";
    }

    query += " ORDER BY lp.updated_at DESC";

    const [progress] = await pool.query(query, params);
    res.json({ progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching lesson progress" });
  }
});

function normalizeLessonProgress(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed >= 100) return 100;
  return Math.max(0, Math.min(99, Math.floor(parsed)));
}

async function refreshStudentBookProgress(studentId, lessonId) {
  const [lessonRows] = await pool.query(
    `SELECT l.book_id, b.course_id, b.teacher_id, b.title AS book_title
     FROM lessons l
     JOIN books b ON b.book_id = l.book_id
     WHERE l.lesson_id = ?
     LIMIT 1`,
    [lessonId]
  );

  if (lessonRows.length === 0) return null;

  const { book_id: bookId, course_id: courseId, teacher_id: teacherId, book_title: bookTitle } = lessonRows[0];
  const [existingProgressRows] = await pool.query(
    "SELECT status FROM student_course_progress WHERE student_id = ? AND book_id = ? LIMIT 1",
    [studentId, bookId]
  );
  const wasCompleted = existingProgressRows.length > 0 && existingProgressRows[0].status === 'Completed';

  const [lessonCountRows] = await pool.query(
    "SELECT COUNT(*) AS totalLessons FROM lessons WHERE book_id = ?",
    [bookId]
  );
  const totalLessons = Number(lessonCountRows[0]?.totalLessons || 0);

  const [completedRows] = await pool.query(
    `SELECT COUNT(DISTINCT lp.lesson_id) AS completedLessons
     FROM lesson_progress lp
     JOIN lessons l ON l.lesson_id = lp.lesson_id
     WHERE lp.student_id = ?
       AND l.book_id = ?
       AND (lp.is_completed = 1 OR lp.progress_percentage >= 100)`,
    [studentId, bookId]
  );
  const completedLessons = Number(completedRows[0]?.completedLessons || 0);
  const progressPercentage = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;
  const isCompleted = totalLessons > 0 && completedLessons === totalLessons;
  const status = isCompleted ? "Completed" : "In Progress";
  const completedAt = isCompleted ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;

  await pool.query(
    `INSERT INTO student_course_progress
       (student_id, book_id, course_id, status, completed_lessons, total_lessons, progress_percentage, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       course_id = VALUES(course_id),
       status = VALUES(status),
       completed_lessons = VALUES(completed_lessons),
       total_lessons = VALUES(total_lessons),
       progress_percentage = VALUES(progress_percentage),
       completed_at = CASE
         WHEN VALUES(status) = 'Completed' THEN COALESCE(student_course_progress.completed_at, VALUES(completed_at))
         ELSE NULL
       END`,
    [studentId, bookId, courseId, status, completedLessons, totalLessons, progressPercentage, completedAt]
  );

  if (status === 'Completed' && !wasCompleted && teacherId) {
    const [studentRows] = await pool.query(
      "SELECT first_name, last_name FROM users WHERE user_id = ? LIMIT 1",
      [studentId]
    );
    const studentName = studentRows.length
      ? `${studentRows[0].first_name || ''} ${studentRows[0].last_name || ''}`.trim() || `Student ${studentId}`
      : `Student ${studentId}`;

    const notificationTitle = `Student completed ${bookTitle}`;
    const notificationMessage = `${studentName} has completed 100% of lessons in "${bookTitle}".`;

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'general', ?, ?, ?, 'book', ?)`,
      [teacherId, notificationTitle, notificationMessage, bookId, `/teacherBooksLessons/${bookId}`]
    );
  }

  return {
    student_id: studentId,
    book_id: bookId,
    course_id: courseId,
    status,
    completed_lessons: completedLessons,
    total_lessons: totalLessons,
    progress_percentage: progressPercentage,
    completed_at: completedAt,
  };
}

// Save manual lesson completion for one student/lesson
app.post("/api/lesson-progress", async (req, res) => {
  try {
    const { student_id, lesson_id, is_completed, progress_percentage, time_spent_minutes } = req.body;

    if (!student_id || !lesson_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const manualComplete = is_completed === true || is_completed === 1 || is_completed === "1";
    const progressPercentage = manualComplete ? 100 : normalizeLessonProgress(progress_percentage);
    const isCompleted = progressPercentage >= 100 ? 1 : 0;
    const completedAt = isCompleted ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;

    // Check if record exists
    const [existing] = await pool.query(
      "SELECT progress_id, progress_percentage, is_completed, completed_at FROM lesson_progress WHERE student_id = ? AND lesson_id = ?",
      [student_id, lesson_id]
    );

    let savedProgress;

    if (existing.length > 0) {
      const savedProgressValue = normalizeLessonProgress(existing[0].progress_percentage);
      const nextProgress = Math.max(savedProgressValue, progressPercentage);
      const nextCompleted = existing[0].is_completed || nextProgress >= 100 ? 1 : 0;
      const nextCompletedAt = existing[0].completed_at || (nextCompleted ? completedAt : null);

      // Update existing
      await pool.query(
        `UPDATE lesson_progress 
         SET progress_percentage = ?, is_completed = ?, time_spent_minutes = GREATEST(COALESCE(time_spent_minutes, 0), ?), completed_at = ?
         WHERE student_id = ? AND lesson_id = ?`,
        [nextProgress, nextCompleted, time_spent_minutes || 0, nextCompletedAt, student_id, lesson_id]
      );

      savedProgress = {
        progress_id: existing[0].progress_id,
        student_id,
        lesson_id,
        progress_percentage: nextProgress,
        is_completed: nextCompleted,
        completed_at: nextCompletedAt,
      };
    } else {
      // Create new
      const [result] = await pool.query(
        `INSERT INTO lesson_progress (student_id, lesson_id, progress_percentage, is_completed, time_spent_minutes, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [student_id, lesson_id, progressPercentage, isCompleted, time_spent_minutes || 0, completedAt]
      );

      savedProgress = {
        progress_id: result.insertId,
        student_id,
        lesson_id,
        progress_percentage: progressPercentage,
        is_completed: isCompleted,
        completed_at: completedAt,
      };
    }

    const bookProgress = await refreshStudentBookProgress(student_id, lesson_id);
    const statusCode = existing.length > 0 ? 200 : 201;

    res.status(statusCode).json({
      message: existing.length > 0 ? "Lesson progress updated" : "Lesson progress created",
      progress: savedProgress,
      bookProgress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating lesson progress" });
  }
});

// GET teacher's books with lesson stats
// SECURITY: Only returns books owned by the requesting teacher
app.get("/api/teacher/books", async (req, res) => {
  try {
    const teacher_id = getTeacherIdFromRequest(req);

    if (!teacher_id) {
      return res.status(401).json({ message: "Unauthorized: teacher_id is required" });
    }

    // Enforce data isolation: teacher can only see their own books
    const [books] = await pool.query(
      `SELECT b.*, COUNT(l.lesson_id) as lesson_count
       FROM books b
       LEFT JOIN lessons l ON b.book_id = l.book_id
       WHERE b.teacher_id = ?
       GROUP BY b.book_id
       ORDER BY b.created_at DESC`,
      [teacher_id]
    );

    res.json({ books });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching teacher books" });
  }
});

app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`));

// server.js (ESM)
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import multer from "multer";
import mysql from "mysql2/promise";
import path from "path";
import crypto from "crypto";

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

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });
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

async function ensureAssignmentAttemptColumns() {
  await pool.query("ALTER TABLE assignments MODIFY COLUMN due_date DATE NULL");

  if (!(await columnExists("assignments", "attempt_limit"))) {
    await pool.query("ALTER TABLE assignments ADD COLUMN attempt_limit INT DEFAULT NULL AFTER due_time");
  }

  if (!(await columnExists("assignment_submissions", "attempt_count"))) {
    await pool.query("ALTER TABLE assignment_submissions ADD COLUMN attempt_count INT NOT NULL DEFAULT 1 AFTER file_url");
  }
}

try {
  await ensureAssignmentAttemptColumns();
} catch (err) {
  console.error("Error preparing assignment attempt columns:", err);
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

function normalizeCriteria(criteria = {}) {
  return Object.fromEntries(
    Object.entries(aiCriterionLabels).map(([key]) => [key, String(criteria[key] || "").trim()])
  );
}

function buildCriteriaNotes(criteria) {
  const lines = Object.entries(criteria)
    .filter(([, value]) => value)
    .map(([key, value]) => `${aiCriterionLabels[key]}: ${value}`);

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
    const value = String(criteria[key] || "").toLowerCase();
    if (!value) continue;

    const words = value.split(/[\s-]+/).filter((word) => word.length > 2);
    const matched = words.some((word) => profileText.includes(word) || notes.includes(word));
    if (matched) {
      score += weight;
      reasons.push(`${aiCriterionLabels[key].toLowerCase()} fit`);
    }
  }

  if (criteria.learningStyle === "structured") score += profileText.includes("grammar") ? 5 : 0;
  if (criteria.learningStyle === "conversational") score += profileText.includes("conversation") || profileText.includes("speaking") ? 5 : 0;
  if (criteria.focusArea === "speaking") score += profileText.includes("speaking") || profileText.includes("conversation") ? 5 : 0;
  if (criteria.focusArea === "grammar") score += profileText.includes("grammar") ? 5 : 0;
  if (criteria.personality === "shy") score += profileText.includes("patient") || profileText.includes("supportive") ? 5 : 0;
  if (criteria.pace === "slow") score += profileText.includes("patient") ? 4 : 0;

  score -= Number(teacher.assigned_student_count || 0);

  return {
    ...teacher,
    score,
    reasons: reasons.length ? reasons : ["balanced match based on teacher profile and current load"],
  };
}

async function recommendTeacher({ criteria = {}, trialNotes = "", courseId = null, preferredTeacherId = null }) {
  const normalizedCriteria = normalizeCriteria(criteria);
  const [teachers] = await pool.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.email,
            tp.bio, tp.specialization, tp.experience_years,
            COUNT(student.user_id) AS assigned_student_count,
            MAX(CASE WHEN student.user_id IS NOT NULL AND sp.course_id = ? THEN 1 ELSE 0 END) AS selected_course_match
     FROM users u
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.user_id
     LEFT JOIN student_profiles sp ON sp.assigned_teacher_id = u.user_id
     LEFT JOIN users student ON student.user_id = sp.user_id AND student.status = 'active'
     WHERE u.role = 'teacher' AND u.status = 'active'
     GROUP BY u.user_id, u.first_name, u.last_name, u.email, tp.bio, tp.specialization, tp.experience_years
     ORDER BY u.first_name ASC, u.last_name ASC`,
    [courseId || 0]
  );

  const ranked = teachers
    .map((teacher) => scoreTeacherForStudent(teacher, normalizedCriteria, trialNotes, courseId))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.assigned_student_count || 0) - Number(b.assigned_student_count || 0);
    });

  const underBalanceLimit = ranked.filter((teacher) => Number(teacher.assigned_student_count || 0) < 5);
  const leastLoaded = [...ranked].sort((a, b) => {
    const loadDiff = Number(a.assigned_student_count || 0) - Number(b.assigned_student_count || 0);
    if (loadDiff !== 0) return loadDiff;
    return b.score - a.score;
  })[0];
  const preferred = preferredTeacherId
    ? ranked.find((teacher) => String(teacher.user_id) === String(preferredTeacherId))
    : null;
  const assigned = preferred && Number(preferred.assigned_student_count || 0) < 5
    ? preferred
    : underBalanceLimit[0] || leastLoaded;

  return {
    teacher: assigned || null,
    rankedTeachers: ranked,
    criteria: normalizedCriteria,
    overBalanceTeachers: ranked.filter((teacher) => Number(teacher.assigned_student_count || 0) >= 5),
    usedLeastLoadedFallback: underBalanceLimit.length === 0 && Boolean(leastLoaded),
  };
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
      `SELECT user_id, first_name, last_name, email, password_hash, role, profile_completed
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

    res.json({
      message: "Login successful",
      user: {
        id: user.user_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        profileCompleted: user.profile_completed,
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
    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.contact_number AS contact, u.timezone, u.role, u.profile_completed,
              sp.assigned_teacher_id
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const u = rows[0];
    res.json({
      user: {
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        contact: u.contact,
        timezone: u.timezone,
        role: u.role,
        profileCompleted: u.profile_completed,
        assignedTeacherId: u.assigned_teacher_id || null,
      },
    });
  } catch (err) {
    console.error("GET /api/users/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
app.put("/api/users/:id", async (req, res) => {
  try {
    const { firstName, lastName, email, contact, timezone } = req.body;

    // Validate required fields for profile completion
    if (!firstName || !lastName || !contact || !timezone) {
      return res.status(400).json({ 
        message: "First name, last name, contact, and timezone are required to complete your profile"
      });
    }

    await pool.query(
      `UPDATE users
       SET first_name = ?, last_name = ?, email = ?, contact_number = ?, timezone = ?, profile_completed = TRUE
       WHERE user_id = ?`,
      [firstName, lastName, email, contact, timezone, req.params.id]
    );

    res.json({ message: "Profile updated successfully!" });
  } catch (err) {
    console.error("PUT /api/users/:id error:", err);
    res.status(500).json({ message: "Could not update profile" });
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
      "UPDATE users SET password_hash = ? WHERE user_id = ?",
      [newHash, userId]
    );

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
    } = req.body;

    const [exist] = await pool.query("SELECT user_id FROM users WHERE email = ?", [email]);
    if (exist.length) return res.status(409).json({ message: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    
    // Always mark newly created users as incomplete so they must complete their profile
    // This ensures they select their timezone and other settings
    const profileCompleted = false;

    const [ins] = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, contact_number, role, profile_completed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [email, hash, firstName, lastName, contact, role, profileCompleted]);

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

      await pool.query(
        `INSERT INTO teacher_profiles (user_id, bio, specialization, experience_years)
         VALUES (?, ?, ?, ?)`,
        [
          userId,
          teacherBio || "",
          specialization || null,
          Number.isFinite(parsedExperienceYears) ? parsedExperienceYears : null,
        ]
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

    let query = `SELECT c.*,
                       stu.first_name as student_name,
                       stu.email as student_email,
                       tea.first_name as teacher_name,
                       tea.email as teacher_email,
                       COALESCE(c.class_link, vs.teams_meeting_link) as class_link
                 FROM classes c
                 LEFT JOIN video_sessions vs ON vs.class_id = c.class_id
                 JOIN users stu ON c.student_id = stu.user_id
                 JOIN users tea ON c.teacher_id = tea.user_id
                 WHERE c.scheduled_date = ?`;
    const params = [scheduled_date];

    if (student_id) {
      query += ` AND c.student_id = ?`;
      params.push(student_id);
    }
    if (teacher_id) {
      query += ` AND c.teacher_id = ?`;
      params.push(teacher_id);
    }

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

    let query = `SELECT c.*, \
                       stu.first_name as student_name, \
                       stu.last_name as student_last_name, \
                       stu.email as student_email, \
                       tea.first_name as teacher_name, \
                       tea.last_name as teacher_last_name, \
                       tea.email as teacher_email, \
                       COALESCE(c.class_link, vs.teams_meeting_link) as class_link \
                 FROM classes c \
                 LEFT JOIN video_sessions vs ON vs.class_id = c.class_id \
                 JOIN users stu ON c.student_id = stu.user_id \
                 JOIN users tea ON c.teacher_id = tea.user_id \
                 WHERE c.scheduled_date >= CURDATE()`;
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

    const [rows] = await pool.query(
      `SELECT * FROM student_class_packages WHERE student_id = ? AND status = 'active'`,
      [student_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No active package found" });
    }

    res.json({ package: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching package" });
  }
});

// Request class reschedule
app.post("/api/calendar/reschedule-request", async (req, res) => {
  try {
    const { class_id, requested_by_id, requested_date, requested_time, reason } = req.body;

    if (!class_id || !requested_by_id || !requested_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Get class details to determine recipient
    const [classRows] = await pool.query(
      `SELECT c.*, ru.first_name AS requester_first, ru.last_name AS requester_last
       FROM classes c
       JOIN users ru ON c.teacher_id = ru.user_id OR c.student_id = ru.user_id
       WHERE c.class_id = ? AND (ru.user_id = ? OR ru.user_id = ?)`,
      [class_id, requested_by_id, requested_by_id]
    );

    if (!classRows.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const classData = classRows[0];
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
      [class_id, requested_by_id, requested_date, requested_time, reason]
    );

    // Create notification for the counterparty
    const notificationMessage = `Reschedule request from ${requesterName} for "${classData.class_name}" to ${requested_date} at ${requested_time}`;
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
      `SELECT scheduled_date, start_time, end_time
       FROM classes
       WHERE (teacher_id = ? OR student_id = ?)
       AND status = 'scheduled'
       ORDER BY scheduled_date ASC, start_time ASC`,
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
      `SELECT rr.*, c.class_id, c.class_name, c.scheduled_date, c.start_time, c.end_time,
              req.first_name AS requester_first, req.last_name AS requester_last,
              stu.first_name AS student_first, stu.last_name AS student_last,
              tea.first_name AS teacher_first, tea.last_name AS teacher_last
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
              t.first_name AS teacher_first, t.last_name AS teacher_last
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
  try {
    const { student_id } = req.params;

    const [result] = await pool.query(
      `UPDATE student_class_packages SET classes_used = classes_used + 1 WHERE student_id = ? AND status = 'active'`,
      [student_id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "No active package found" });
    }

    const [packageRows] = await pool.query(
      `SELECT * FROM student_class_packages WHERE student_id = ? AND status = 'active'`,
      [student_id]
    );

    res.json({ message: "Class usage recorded", package: packageRows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating package" });
  }
});

// Get teacher availability records for a specific month
app.get("/api/calendar/teacher-availability-records", async (req, res) => {
  try {
    const { teacher_id, year, month } = req.query;

    if (!teacher_id || !year || !month) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    const monthIndex = parseInt(month, 10);
    const yearValue = parseInt(year, 10);
    const daysInMonth = new Date(yearValue, monthIndex, 0).getDate();
    const startDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-01`;
    const endDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const [rows] = await pool.query(
      `SELECT availability_id as id, teacher_id, DATE_FORMAT(available_date, '%Y-%m-%d') as available_date, status, notes, start_time, end_time, break_start, break_end
       FROM teacher_availability
       WHERE teacher_id = ? AND available_date BETWEEN ? AND ?
       ORDER BY available_date ASC`,
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

    const [rows] = await pool.query(
      `SELECT availability_id as id, teacher_id, DATE_FORMAT(available_date, '%Y-%m-%d') as available_date, status, notes, start_time, end_time, break_start, break_end
       FROM teacher_availability
       WHERE teacher_id = ? AND DATE(available_date) = ?
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

app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`));

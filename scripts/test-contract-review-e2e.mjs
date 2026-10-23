/**
 * End-to-end check of the contract-completion review flow.
 *
 *   node scripts/test-contract-review-e2e.mjs
 *
 * Starts the backend, creates a completed contract for a throwaway student and
 * teacher, and drives the routes the review page actually calls. It removes
 * every row it created afterwards.
 *
 * The unit test (test-contract-review.mjs) checks the rubric and its two copies.
 * This checks the part units cannot: that a finished contract opens exactly one
 * review, that both sides can submit once, that the teacher's scores recompute
 * the student's level, that neither side can read the other's review, that the
 * admin can read both, and that an unfinished or time-expired contract does not
 * open a review.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDbPasswordPresent, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } from "../backend/dbConfig.js";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

assertDbPasswordPresent();

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const PORT = Number(process.env.CONTRACT_REVIEW_E2E_PORT || 3299);
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const PASSWORD = "JEN2026!ReviewTest";
const STUDENT_EMAIL = `contract-review-student-${STAMP}@student.jenacademia.local`;
const TEACHER_EMAIL = `contract-review-teacher-${STAMP}@teacher.jenacademia.local`;
const OTHER_TEACHER_EMAIL = `contract-review-other-${STAMP}@teacher.jenacademia.local`;
const ADMIN_EMAIL = `contract-review-admin-${STAMP}@jenacademia.local`;

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

function report(label, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push(`  - ${label}${detail ? `\n      ${detail}` : ""}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Notifications are encrypted at rest by server.js. Reading them back lets the
// test prove that a private review was not copied into the other person's
// notification.
const ENCRYPTION_KEY = crypto.scryptSync(
  String(
    process.env.CHAT_ENCRYPTION_KEY
      || process.env.ENCRYPTION_KEY
      || process.env.JWT_SECRET
      || DB_PASSWORD
  ),
  "jen-academia-chat-v1",
  32
);

function decryptText(value) {
  if (!value) return "";
  const text = String(value);
  if (!text.startsWith("enc:v1:")) return text;
  try {
    const [, , ivBase64, tagBase64, encryptedBase64] = text.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      ENCRYPTION_KEY,
      Buffer.from(ivBase64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function encryptText(value) {
  if (!value) return null;
  const text = String(value);
  if (text.startsWith("enc:v1:")) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["enc:v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

/* ------------------------------------------------------------- the server */

const server = spawn(process.execPath, [path.join(repoRoot, "backend", "server.js")], {
  env: { ...process.env, PORT: String(PORT), NODE_ENV: "test" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return true;
    } catch {
      // Not up yet.
    }
    await sleep(1000);
  }
  return false;
}

const db = await mysql.createConnection({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectTimeout: 60000,
});

const created = {
  studentId: null,
  teacherId: null,
  otherTeacherId: null,
  adminId: null,
  packageIds: [],
};

async function createUser({ email, firstName, role, contact }) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [result] = await db.query(
    `INSERT INTO users
       (first_name, last_name, email, password_hash, contact_number, country, timezone,
        profile_image_url, role, status, profile_completed)
     VALUES (?, 'ReviewTest', ?, ?, ?, 'Philippines', 'Asia/Manila',
             'https://example.test/avatar.png', ?, 'active', 1)`,
    [firstName, email, passwordHash, contact, role]
  );
  return result.insertId;
}

async function login(email) {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await response.json();
  const token = body?.token || body?.sessionToken;
  return { ok: response.ok, status: response.status, token, body };
}

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function getReviews(token) {
  const response = await fetch(`${BASE}/api/contract-reviews`, {
    headers: authHeaders(token),
  });
  return { status: response.status, body: await response.json() };
}

async function getNotifications(token, userId) {
  const response = await fetch(`${BASE}/api/notifications/${userId}`, {
    headers: authHeaders(token),
  });
  return { status: response.status, body: await response.json() };
}

async function getAdminReports(token) {
  const response = await fetch(`${BASE}/api/admin/contract-reviews`, {
    headers: authHeaders(token),
  });
  return { status: response.status, body: await response.json() };
}

async function submitTeacherReview(token, packageId, scores, comments = "") {
  const response = await fetch(`${BASE}/api/contract-reviews/${packageId}/teacher`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ scores, comments }),
  });
  return { status: response.status, body: await response.json() };
}

async function submitStudentReview(token, packageId, scores, comments = "") {
  const response = await fetch(`${BASE}/api/contract-reviews/${packageId}/student`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ scores, comments }),
  });
  return { status: response.status, body: await response.json() };
}

const teacherScores = {
  speakingPronunciation: 5,
  readingComprehension: 5,
  structure: 4,
  sentenceGrammar: 5,
  vocabulary: 5,
};

const studentScores = {
  clearExplanations: 5,
  patientSupport: 4,
  engagingClasses: 4,
  helpfulFeedback: 5,
  professionalism: 4,
};

try {
  const up = await waitForServer();
  if (!up) {
    console.log("The backend did not start. Its output was:\n");
    console.log(serverLog.slice(-4000));
    server.kill();
    process.exit(1);
  }

  const [courses] = await db.query(
    `SELECT course_id, course_name FROM courses ORDER BY course_id LIMIT 1`
  );
  const courseId = courses[0]?.course_id ?? null;
  const courseName = courses[0]?.course_name ?? null;
  if (!courseId) {
    console.log("Skipped: the database has no course to attach a student profile to.");
    await db.end();
    server.kill();
    process.exit(0);
  }

  /* ------------------------------------------------------------ fixtures */

  created.studentId = await createUser({
    email: STUDENT_EMAIL,
    firstName: "Review",
    role: "student",
    contact: "+639170000101",
  });
  created.teacherId = await createUser({
    email: TEACHER_EMAIL,
    firstName: "Teacher",
    role: "teacher",
    contact: "+639170000102",
  });
  created.otherTeacherId = await createUser({
    email: OTHER_TEACHER_EMAIL,
    firstName: "OtherTeacher",
    role: "teacher",
    contact: "+639170000103",
  });
  created.adminId = await createUser({
    email: ADMIN_EMAIL,
    firstName: "ReportAdmin",
    role: "admin",
    contact: "+639170000104",
  });

  await db.query(
    `INSERT INTO student_profiles (user_id, course_id, assigned_teacher_id, proficiency_level)
     VALUES (?, ?, ?, 'intermediate-mid')`,
    [created.studentId, courseId, created.teacherId]
  );

  // A finished contract: every class used and the status that completion sets.
  const [finishedPackage] = await db.query(
    `INSERT INTO student_class_packages (student_id, total_classes, classes_used, class_duration, status)
     VALUES (?, 1, 1, 50, 'expired')`,
    [created.studentId]
  );
  const packageId = finishedPackage.insertId;
  created.packageIds.push(packageId);

  // A contract that merely ran out of time. It has classes left, so it is not
  // complete and must not open a review.
  const [timedOutPackage] = await db.query(
    `INSERT INTO student_class_packages
       (student_id, total_classes, classes_used, class_duration, status, expires_at)
     VALUES (?, 10, 4, 50, 'expired', DATE_SUB(NOW(), INTERVAL 10 DAY))`,
    [created.studentId]
  );
  const incompletePackageId = timedOutPackage.insertId;
  created.packageIds.push(incompletePackageId);

  const studentLogin = await login(STUDENT_EMAIL);
  const teacherLogin = await login(TEACHER_EMAIL);
  const otherTeacherLogin = await login(OTHER_TEACHER_EMAIL);
  const adminLogin = await login(ADMIN_EMAIL);

  report("the test student can sign in", studentLogin.ok && Boolean(studentLogin.token), `status ${studentLogin.status}`);
  report("the test teacher can sign in", teacherLogin.ok && Boolean(teacherLogin.token), `status ${teacherLogin.status}`);
  report("the other teacher can sign in", otherTeacherLogin.ok && Boolean(otherTeacherLogin.token), `status ${otherTeacherLogin.status}`);
  report("the test admin can sign in", adminLogin.ok && Boolean(adminLogin.token), `status ${adminLogin.status}`);

  /* ------------------------------------------- listing opens the review */

  const studentBefore = await getReviews(studentLogin.token);
  check("the student's list loads", studentBefore.status, 200);
  check("only the completed contract is listed", studentBefore.body?.reviews?.length, 1);
  check("and it is the completed package", studentBefore.body?.reviews?.[0]?.package_id, packageId);
  check("the student still has to review", studentBefore.body?.reviews?.[0]?.pending_for_you, true);
  check("the teacher has not evaluated yet", studentBefore.body?.reviews?.[0]?.teacher_review, null);
  check("the student has not rated yet", studentBefore.body?.reviews?.[0]?.student_review, null);

  const [reviewRows] = await db.query(
    `SELECT review_id, teacher_id, completion_notified_at
       FROM contract_reviews WHERE package_id = ?`,
    [packageId]
  );
  check("one review row now exists", reviewRows.length, 1);
  check("it belongs to the assigned teacher", Number(reviewRows[0]?.teacher_id), created.teacherId);
  report("the completion notification was recorded", Boolean(reviewRows[0]?.completion_notified_at));

  const [notifications] = await db.query(
    `SELECT user_id FROM notifications
      WHERE related_id = ? AND related_type = 'contract_review'
      ORDER BY user_id`,
    [packageId]
  );
  check(
    "both sides got exactly one completion notification",
    notifications.map((row) => Number(row.user_id)).sort((a, b) => a - b),
    [created.studentId, created.teacherId].sort((a, b) => a - b)
  );

  const teacherBefore = await getReviews(teacherLogin.token);
  check("the teacher's list loads", teacherBefore.status, 200);
  check("and shows the same contract", teacherBefore.body?.reviews?.[0]?.package_id, packageId);
  check("the teacher still has to review", teacherBefore.body?.reviews?.[0]?.pending_for_you, true);

  const [notificationsAfterTeacherGet] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications
      WHERE related_id = ? AND related_type = 'contract_review'`,
    [packageId]
  );
  check(
    "re-opening the page does not duplicate the completion notifications",
    Number(notificationsAfterTeacherGet[0]?.total),
    2
  );

  /* -------------------------------------------------------- validation */

  const incomplete = await getReviews(studentLogin.token);
  check(
    "a time-expired contract with classes left is not listed",
    incomplete.body?.reviews?.some((review) => review.package_id === incompletePackageId),
    false
  );

  const badScores = await submitTeacherReview(teacherLogin.token, packageId, {
    ...teacherScores,
    vocabulary: 6,
  });
  check("a score outside 1-5 is rejected", badScores.status, 400);

  const wrongTeacher = await submitTeacherReview(otherTeacherLogin.token, packageId, teacherScores);
  check("a teacher who does not hold the contract cannot evaluate", wrongTeacher.status, 403);

  const incompleteSubmit = await submitTeacherReview(teacherLogin.token, incompletePackageId, teacherScores);
  check("an incomplete contract cannot be evaluated", incompleteSubmit.status, 404);

  /* ------------------------------------------------- teacher evaluation */

  const teacherSubmit = await submitTeacherReview(
    teacherLogin.token,
    packageId,
    teacherScores,
    "Strong finish. Keep working on organising longer answers."
  );
  check("the teacher can submit the final evaluation", teacherSubmit.status, 200);
  check("the score combination computes Advanced", teacherSubmit.body?.computed_level, "advanced");

  const [profileRows] = await db.query(
    `SELECT proficiency_level FROM student_profiles WHERE user_id = ?`,
    [created.studentId]
  );
  check("the student's stored level is updated", profileRows[0]?.proficiency_level, "advanced");

  const duplicateTeacher = await submitTeacherReview(teacherLogin.token, packageId, teacherScores);
  check("the teacher cannot submit twice", duplicateTeacher.status, 409);

  const teacherAfter = await getReviews(teacherLogin.token);
  const teacherReview = teacherAfter.body?.reviews?.find((review) => review.package_id === packageId);
  report("the teacher's evaluation is stored", Boolean(teacherReview?.teacher_review));
  check("their five scores are stored", teacherReview?.teacher_review?.scores, teacherScores);
  check("the computed level is shown back", teacherReview?.teacher_review?.computed_level, "advanced");
  check("their comment is returned", teacherReview?.teacher_review?.comments, "Strong finish. Keep working on organising longer answers.");
  check("they are no longer pending", teacherReview?.pending_for_you, false);
  check("but the review is not complete until the student rates", teacherReview?.review_complete, false);

  const [teacherNotified] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications
      WHERE user_id = ? AND related_id = ? AND related_type = 'contract_review'`,
    [created.studentId, packageId]
  );
  check(
    "the student was told the review was updated",
    Number(teacherNotified[0]?.total) >= 2,
    true
  );

  const adminPartial = await getAdminReports(adminLogin.token);
  const partialReview = adminPartial.body?.reviews?.find((review) => review.package_id === packageId);
  check("the admin sees a teacher evaluation before the student rates", Boolean(partialReview?.teacher_review), true);
  check("the admin sees the student rating is still pending", partialReview?.student_review, null);

  /* ---------------------------------------------------- student rating */

  const studentSubmit = await submitStudentReview(
    studentLogin.token,
    packageId,
    studentScores,
    "Very patient and the feedback was useful."
  );
  check("the student can rate the teacher", studentSubmit.status, 200);
  check("the overall rating is the average", Number(studentSubmit.body?.overall_rating), 4.4);

  const duplicateStudent = await submitStudentReview(studentLogin.token, packageId, studentScores);
  check("the student cannot rate twice", duplicateStudent.status, 409);

  const wrongStudent = await submitStudentReview(otherTeacherLogin.token, packageId, studentScores);
  check("a non-student cannot submit the teacher rating", wrongStudent.status, 403);

  const studentAfter = await getReviews(studentLogin.token);
  const completedReview = studentAfter.body?.reviews?.find((review) => review.package_id === packageId);
  check("both sides are now complete", completedReview?.review_complete, true);
  check("the student is no longer pending", completedReview?.pending_for_you, false);
  check("the student cannot see the teacher's evaluation", completedReview?.teacher_review, null);
  check("the student's own scores are stored", completedReview?.student_review?.scores, studentScores);
  check("the student's own comment is visible", completedReview?.student_review?.comments, "Very patient and the feedback was useful.");
  check("and the rating is 4.4", Number(completedReview?.student_review?.average), 4.4);

  const teacherAfterStudent = await getReviews(teacherLogin.token);
  const teacherCompletedView = teacherAfterStudent.body?.reviews?.find((review) => review.package_id === packageId);
  check("the teacher still sees their own evaluation", Boolean(teacherCompletedView?.teacher_review), true);
  check("the teacher cannot see the student's feedback", teacherCompletedView?.student_review, null);

  const [teacherNotificationRows] = await db.query(
    `SELECT message FROM notifications
      WHERE user_id = ? AND related_id = ? AND related_type = 'contract_review'`,
    [created.teacherId, packageId]
  );
  const teacherMessages = teacherNotificationRows.map((row) => decryptText(row.message)).join(" | ");
  report(
    "the teacher is told the rating was submitted",
    /submitted their closing contract rating/i.test(teacherMessages)
  );
  check(
    "the teacher's notification does not reveal the student's score or comment",
    /4\.4|out of 5|Very patient/i.test(teacherMessages),
    false
  );

  const [studentNotificationRows] = await db.query(
    `SELECT message FROM notifications
      WHERE user_id = ? AND related_id = ? AND related_type = 'contract_review'`,
    [created.studentId, packageId]
  );
  const studentMessages = studentNotificationRows.map((row) => decryptText(row.message)).join(" | ");
  check(
    "the student's notifications do not reveal the teacher's evaluation",
    /advanced|speaking|reading|structure|grammar|vocabulary|Strong finish/i.test(studentMessages),
    false
  );

  // Notifications created before the reviews became private are still in the
  // database. They must be redacted when they are read, not just when new ones
  // are written.
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
     VALUES (?, 'general', ?, ?, ?, 'contract_review', ?)`,
    [
      created.teacherId,
      encryptText("Your student rated the contract"),
      encryptText("Review ReviewTest rated the classes 4.4 out of 5 and left a comment."),
      packageId,
      "/ContractReview",
    ]
  );
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
     VALUES (?, 'general', ?, ?, ?, 'contract_review', ?)`,
    [
      created.studentId,
      encryptText("Your contract evaluation is ready"),
      encryptText("Your teacher submitted the final evaluation. Your proficiency level is now Advanced."),
      packageId,
      "/ContractReview",
    ]
  );

  const teacherNotificationList = await getNotifications(teacherLogin.token, created.teacherId);
  check("the teacher can load notifications", teacherNotificationList.status, 200);
  const legacyTeacherNotification = (teacherNotificationList.body?.notifications || []).find(
    (notification) => notification.title === "Your student rated the contract"
  );
  check("the legacy teacher notification is present", Boolean(legacyTeacherNotification), true);
  check(
    "the legacy teacher notification does not reveal the student's rating",
    /4\.4|out of 5|Very patient/i.test(legacyTeacherNotification?.message || ""),
    false
  );
  check(
    "the legacy teacher notification is replaced with a generic message",
    legacyTeacherNotification?.message,
    "Your student submitted their closing contract rating."
  );

  const studentNotificationList = await getNotifications(studentLogin.token, created.studentId);
  check("the student can load notifications", studentNotificationList.status, 200);
  const legacyStudentNotification = (studentNotificationList.body?.notifications || []).find(
    (notification) => notification.title === "Your contract evaluation is ready"
  );
  check("the legacy student notification is present", Boolean(legacyStudentNotification), true);
  check(
    "the legacy student notification does not reveal the teacher's level",
    /advanced|proficiency level is now/i.test(legacyStudentNotification?.message || ""),
    false
  );
  check(
    "the legacy student notification is replaced with a generic message",
    legacyStudentNotification?.message,
    "Your teacher submitted the final evaluation. Your contract review has been updated."
  );

  /* ----------------------------------------------------- admin reports */

  const teacherReportDenied = await getAdminReports(teacherLogin.token);
  check("a teacher cannot open the admin review report", teacherReportDenied.status, 403);

  const adminReports = await getAdminReports(adminLogin.token);
  check("the admin can open the contract review report", adminReports.status, 200);
  const adminReview = adminReports.body?.reviews?.find((review) => review.package_id === packageId);
  report("the completed contract is in the admin report", Boolean(adminReview));
  check("the admin sees both assessments", Boolean(adminReview?.teacher_review) && Boolean(adminReview?.student_review), true);
  check("the admin sees the contract course", adminReview?.course_name, courseName);
  check("the admin sees the teacher's evaluation", adminReview?.teacher_review?.computed_level, "advanced");
  check("the admin sees the teacher's comment", adminReview?.teacher_review?.comments, "Strong finish. Keep working on organising longer answers.");
  check("the admin sees the student's rating", Number(adminReview?.student_review?.average), 4.4);
  check("the admin sees the student's comment", adminReview?.student_review?.comments, "Very patient and the feedback was useful.");
  check("the admin's report is not a personal pending item", adminReview?.pending_for_you, false);
  check(
    "a time-expired contract with classes left is not in the admin report",
    adminReports.body?.reviews?.some((review) => review.package_id === incompletePackageId),
    false
  );

  const [reviewCount] = await db.query(
    `SELECT COUNT(*) AS total FROM contract_reviews WHERE package_id = ?`,
    [packageId]
  );
  check("the whole process still leaves exactly one review row", Number(reviewCount[0]?.total), 1);
} catch (err) {
  failures.push(`  - the run threw: ${err?.stack || err}`);
} finally {
  /* ------------------------------------------------------------- tidy up */

  if (created.packageIds.length) {
    const placeholders = created.packageIds.map(() => "?").join(", ");
    await db.query(
      `DELETE FROM notifications WHERE related_id IN (${placeholders}) AND related_type = 'contract_review'`,
      created.packageIds
    );
    await db.query(`DELETE FROM contract_reviews WHERE package_id IN (${placeholders})`, created.packageIds);
    await db.query(`DELETE FROM student_class_packages WHERE package_id IN (${placeholders})`, created.packageIds);
  }

  if (created.studentId) {
    await db.query(`DELETE FROM student_profiles WHERE user_id = ?`, [created.studentId]);
  }

  const userIds = [created.studentId, created.teacherId, created.otherTeacherId, created.adminId].filter(Boolean);
  if (userIds.length) {
    const placeholders = userIds.map(() => "?").join(", ");
    await db.query(`DELETE FROM users WHERE user_id IN (${placeholders})`, userIds);
  }

  await db.end();
  server.kill();
}

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

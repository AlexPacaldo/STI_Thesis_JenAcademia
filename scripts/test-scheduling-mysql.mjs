// Optional integration check: uses uniquely named scratch tables, never app rows.
// Run with database access: node scripts/test-scheduling-mysql.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } from "../backend/dbConfig.js";
import { classScheduleConflict, scheduleWindow } from "../backend/scheduling.js";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");
const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const suffix = `${Date.now()}_${process.pid}`;
const names = Object.fromEntries(["classes", "class_attendance_logs", "student_class_packages", "users"]
  .map(name => [name, `_codex_sched_${name === "student_class_packages" ? "packages" : name === "class_attendance_logs" ? "logs" : name}_${suffix}`]));
assert(Object.values(names).every(name => /^_codex_sched_[a-z0-9_]+$/.test(name) && name.length <= 64));
const rewrite = sql => sql.replace(/\b(classes|class_attendance_logs|student_class_packages|users)\b/g, name => `\`${names[name]}\``);
function sqlInRoute(path, pattern) {
  const start = source.indexOf(`app.post("${path}",`);
  const end = source.indexOf("\napp.", start + 1);
  const match = source.slice(start, end).match(pattern);
  assert(match, `Missing production SQL for ${path}`);
  return rewrite(match[1]);
}
const insertPattern = /`(INSERT INTO class_attendance_logs[\s\S]*?)`/;
const joinSql = sqlInRoute("/api/calendar/classes/:class_id/join", insertPattern);
const startSql = sqlInRoute("/api/calendar/classes/:class_id/start", insertPattern);
const debit = source.match(/`(UPDATE student_class_packages\s+SET status = CASE[\s\S]*?WHERE package_id = \?)`/);
assert(debit);
const pool = mysql.createPool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
  database: DB_NAME, connectionLimit: 2, connectTimeout: 15000 });
let a;
let b;
try {
  a = await pool.getConnection();
  b = await pool.getConnection();
  await a.query(`CREATE TABLE \`${names.classes}\` (class_id INT PRIMARY KEY, teacher_id INT, student_id INT,
    scheduled_date DATE, start_time TIME, duration INT, status VARCHAR(20)) ENGINE=InnoDB`);
  await a.query(`CREATE TABLE \`${names.users}\` (user_id INT PRIMARY KEY, timezone VARCHAR(64)) ENGINE=InnoDB`);
  await a.query(`CREATE TABLE \`${names.class_attendance_logs}\` (
    class_id INT PRIMARY KEY, teacher_id INT NOT NULL, student_id INT NOT NULL,
    evidence_mode VARCHAR(20), teacher_started_at TIMESTAMP NULL, teacher_recording_consent_at TIMESTAMP NULL,
    student_joined_at TIMESTAMP NULL, student_recording_consent_at TIMESTAMP NULL,
    teacher_ended_at TIMESTAMP NULL, verification_status VARCHAR(32) NOT NULL,
    duration_minutes INT DEFAULT 0, proof_url VARCHAR(255), end_proof_uploaded_at TIMESTAMP NULL,
    review_reason TEXT, summary TEXT) ENGINE=InnoDB`);
  await a.query(`CREATE TABLE \`${names.student_class_packages}\` (
    package_id INT AUTO_INCREMENT PRIMARY KEY, student_id INT, total_classes INT, classes_used INT,
    classes_left INT GENERATED ALWAYS AS (total_classes - classes_used) STORED,
    status VARCHAR(20), class_duration INT DEFAULT 25, expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);

  for (const order of [["join", "start"], ["start", "join"]]) {
    const classId = order[0] === "join" ? 1 : 2;
    for (const action of order) await a.query(action === "join" ? joinSql : startSql,
      action === "join" ? [classId, 10, 20] : [classId, 10, 20, "screenshots"]);
    const [[before]] = await a.query(rewrite("SELECT * FROM class_attendance_logs WHERE class_id = ?"), [classId]);
    assert(before.teacher_started_at && before.student_joined_at && before.student_recording_consent_at);
    assert.equal(before.verification_status, "student_confirmed");
    await a.query(joinSql, [classId, 10, 20]);
    const [[after]] = await a.query(rewrite("SELECT * FROM class_attendance_logs WHERE class_id = ?"), [classId]);
    assert.deepEqual(after, before);
  }

  await a.query(rewrite("INSERT INTO student_class_packages (package_id, student_id, total_classes, classes_used, status, created_at) VALUES (1, 20, 10, 8, 'active', '2020-01-01'), (2, 20, 10, 0, 'active', '2099-01-01')"));
  await a.query(rewrite(debit[1]), [1]);
  let [[pkg]] = await a.query(rewrite("SELECT classes_left, status FROM student_class_packages WHERE package_id = 1"));
  assert.equal(pkg.classes_left, 1);
  assert.equal(pkg.status, "active");
  await a.query(rewrite(debit[1]), [1]);
  [[pkg]] = await a.query(rewrite("SELECT classes_left, status FROM student_class_packages WHERE package_id = 1"));
  assert.equal(pkg.classes_left, 0);
  assert.equal(pkg.status, "expired");
  const completionStart = source.indexOf('app.put("/api/calendar/classes/:class_id/complete",');
  const originalSql = source.slice(completionStart).match(/`(SELECT package_id,[\s\S]*?FROM student_class_packages[\s\S]*?LIMIT 1 FOR UPDATE)`/);
  assert(originalSql);
  const [[original]] = await a.query(rewrite(originalSql[1]), [20, "2025-01-01"]);
  assert.equal(original.package_id, 1, "An old class must never charge the replacement contract");

  const contractInserts = [...source.matchAll(/(INSERT INTO student_class_packages\s*\([^`]*?expires_at\)\s*VALUES[^`]+)`/g)];
  assert.equal(contractInserts.length, 3);
  for (const [_, sql] of contractInserts) {
    const args = /VALUES\s*\(\?, \?, \?, \?, \?,/.test(sql) ? [20, 10, 0, "active", 25, 3] : [20, 10, 25, 3];
    const [inserted] = await a.query(rewrite(sql), args);
    const [[created]] = await a.query(rewrite("SELECT expires_at, DATE_ADD(created_at, INTERVAL 3 MONTH) AS expected FROM student_class_packages WHERE package_id = ?"), [inserted.insertId]);
    assert(created.expires_at);
    assert.equal(created.expires_at.getTime(), created.expected.getTime());
  }

  // Reproduce a join/reschedule race with a pre-existing repeatable-read snapshot.
  await a.query(rewrite("INSERT INTO classes (class_id) VALUES (3)"));
  await a.query(rewrite("INSERT INTO class_attendance_logs (class_id, teacher_id, student_id, verification_status) VALUES (3, 10, 20, 'pending')"));
  await a.beginTransaction();
  await a.query(rewrite("SELECT class_id FROM classes WHERE class_id = 3 FOR UPDATE"));
  await b.beginTransaction();
  const [[snapshot]] = await b.query(rewrite("SELECT student_joined_at FROM class_attendance_logs WHERE class_id = 3"));
  assert.equal(snapshot.student_joined_at, null);
  let obtainedLock = false;
  const waiting = b.query(rewrite("SELECT class_id FROM classes WHERE class_id = 3 FOR UPDATE"))
    .then(result => { obtainedLock = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(obtainedLock, false);
  await a.query(joinSql, [3, 10, 20]);
  await a.commit();
  await waiting;
  const [[current]] = await b.query(rewrite("SELECT student_joined_at FROM class_attendance_logs WHERE class_id = 3 LIMIT 1 FOR UPDATE"));
  assert(current.student_joined_at, "The locked attendance read must see the committed join, not the old snapshot");
  await b.rollback();

  await a.query(rewrite("INSERT INTO users VALUES (10, 'UTC'), (11, 'Asia/Manila')"));
  await a.query(rewrite("INSERT INTO classes (class_id, teacher_id, student_id, scheduled_date, start_time, duration, status) VALUES (44, 10, 20, '2099-01-01', '10:00:00', 25, 'scheduled')"));
  const scratchDb = { query: (sql, params) => a.query(rewrite(sql), params) };
  assert.equal(await classScheduleConflict(scratchDb, { teacherId: 11, studentId: 20, date: "2099-01-01",
    window: scheduleWindow("2099-01-01", "18:00", 25, "Asia/Manila") }), true);
  assert.equal(await classScheduleConflict(scratchDb, { teacherId: 11, studentId: 20, date: "2099-01-01",
    window: scheduleWindow("2099-01-01", "10:00", 25, "Asia/Manila") }), false);

  const endingSql = source.match(/`(UPDATE class_attendance_logs\s+SET teacher_ended_at = COALESCE[\s\S]*?WHERE class_id = \?)`/);
  assert(endingSql);
  for (const [classId, studentDelay, expectedMinutes, expectedStatus] of [[4, 1, 1, "needs_review"], [5, 25, 25, "verified"]]) {
    await a.query(rewrite(`INSERT INTO class_attendance_logs
      (class_id, teacher_id, student_id, teacher_started_at, student_joined_at, duration_minutes, verification_status)
      VALUES (?, 10, 20, DATE_SUB(NOW(), INTERVAL 25 MINUTE), DATE_SUB(NOW(), INTERVAL ? MINUTE), 25, 'student_confirmed')`),
    [classId, studentDelay]);
    await a.query(rewrite(endingSql[1]), ["/end.png", "/end.png", "", "A complete lesson.", 15, 1, "", classId]);
    const [[ended]] = await a.query(rewrite("SELECT duration_minutes, verification_status FROM class_attendance_logs WHERE class_id = ?"), [classId]);
    assert.equal(ended.duration_minutes, expectedMinutes);
    assert.equal(ended.verification_status, expectedStatus);
  }
  console.log("MySQL integration passed: entry orders, credit exhaustion, original contracts, concurrent locks, timezone conflicts and shared attendance duration.");
} finally {
  if (b) { await b.rollback(); b.release(); }
  if (a) {
    await a.rollback();
    for (const name of Object.values(names)) await a.query(`DROP TABLE IF EXISTS \`${name}\``);
    a.release();
  }
  await pool.end();
}

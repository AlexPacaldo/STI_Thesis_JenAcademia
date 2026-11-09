// Optional integration check: uses uniquely named scratch tables, never app rows.
// Run with database access: node scripts/test-scheduling-mysql.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } from "../backend/dbConfig.js";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");
const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const suffix = `${Date.now()}_${process.pid}`;
const names = Object.fromEntries(["classes", "class_attendance_logs", "student_class_packages"]
  .map(name => [name, `_codex_sched_${name === "student_class_packages" ? "packages" : name === "class_attendance_logs" ? "logs" : name}_${suffix}`]));
assert(Object.values(names).every(name => /^_codex_sched_[a-z0-9_]+$/.test(name) && name.length <= 64));
const rewrite = sql => sql.replace(/\b(classes|class_attendance_logs|student_class_packages)\b/g, name => `\`${names[name]}\``);
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
  await a.query(`CREATE TABLE \`${names.classes}\` (class_id INT PRIMARY KEY) ENGINE=InnoDB`);
  await a.query(`CREATE TABLE \`${names.class_attendance_logs}\` (
    class_id INT PRIMARY KEY, teacher_id INT NOT NULL, student_id INT NOT NULL,
    evidence_mode VARCHAR(20), teacher_started_at TIMESTAMP NULL, teacher_recording_consent_at TIMESTAMP NULL,
    student_joined_at TIMESTAMP NULL, student_recording_consent_at TIMESTAMP NULL,
    teacher_ended_at TIMESTAMP NULL, verification_status VARCHAR(32) NOT NULL) ENGINE=InnoDB`);
  await a.query(`CREATE TABLE \`${names.student_class_packages}\` (
    package_id INT PRIMARY KEY, student_id INT, total_classes INT, classes_used INT,
    classes_left INT GENERATED ALWAYS AS (total_classes - classes_used) STORED,
    status VARCHAR(20), created_at DATETIME) ENGINE=InnoDB`);

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

  // Reproduce a join/reschedule race with a pre-existing repeatable-read snapshot.
  await a.query(rewrite("INSERT INTO classes VALUES (3)"));
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
  console.log("MySQL integration passed: both entry orders, repeat joins, final credits, original contracts and concurrent attendance locks.");
} finally {
  if (b) { await b.rollback(); b.release(); }
  if (a) {
    await a.rollback();
    for (const name of Object.values(names)) await a.query(`DROP TABLE IF EXISTS \`${name}\``);
    a.release();
  }
  await pool.end();
}

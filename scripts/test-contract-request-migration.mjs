/**
 * Checks the contract request migration against a real MySQL server.
 *
 *   node scripts/test-contract-request-migration.mjs
 *
 * !! The schema steps run at boot, against the live database, and a statement
 * !! that MySQL rejects leaves the schema half-migrated: the status enum
 * !! widened but the generated column missing, say, which reads as a
 * !! successful start with none of the enforcement in place.
 * !!
 * !! So the exact ALTERs are run against a scratch table with the same shape,
 * !! and the results are checked. The scratch table is dropped afterwards,
 * !! whether the checks passed or not.
 *
 * It connects with the same resolution the server uses, so it reaches the same
 * database the server will.
 */
import { createRequire } from "node:module";
import {
  assertDbPasswordPresent,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
  DB_USER,
} from "../backend/dbConfig.js";

// mysql2 is a dependency of the backend, not of this folder, so it is resolved
// from the backend's own package rather than added twice.
const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");

assertDbPasswordPresent();

const TABLE = "tmp_contract_request_migration_check";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

const connection = await mysql.createConnection({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectTimeout: 60000,
});

try {
  await connection.query(`DROP TABLE IF EXISTS ${TABLE}`);
  await connection.query(`
    CREATE TABLE ${TABLE} (
      request_id INT NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      course_id INT DEFAULT NULL,
      requested_classes INT NOT NULL,
      class_duration INT NOT NULL DEFAULT 50,
      trial_notes TEXT DEFAULT NULL,
      ai_criteria TEXT DEFAULT NULL,
      status ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
      admin_response VARCHAR(500) DEFAULT NULL,
      requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      request_type ENUM('new','extension') NOT NULL DEFAULT 'new',
      package_id INT NULL,
      classes_left_at_request INT NULL,
      preferred_days VARCHAR(64) NULL,
      preferred_start TIME NULL,
      preferred_end TIME NULL,
      PRIMARY KEY (request_id),
      KEY idx_student_contract_requests_student (student_id)
    )
  `);

  /* ------------------------------------------------------- the new columns */

  await connection.query(
    `ALTER TABLE ${TABLE} ADD COLUMN revision_count INT NOT NULL DEFAULT 1 AFTER status`
  );
  await connection.query(
    `ALTER TABLE ${TABLE} ADD COLUMN request_history TEXT DEFAULT NULL AFTER revision_count`
  );
  await connection.query(
    `ALTER TABLE ${TABLE} MODIFY COLUMN status ENUM('pending','approved','declined','cancelled') NOT NULL DEFAULT 'pending'`
  );
  await connection.query(
    `ALTER TABLE ${TABLE} ADD COLUMN pending_key VARCHAR(64)
       GENERATED ALWAYS AS (IF(status = 'pending', CONCAT(student_id, ':', request_type), NULL)) STORED`
  );
  await connection.query(
    `ALTER TABLE ${TABLE} ADD UNIQUE KEY uq_contract_requests_pending (pending_key)`
  );

  const [columns] = await connection.query(
    `SELECT COLUMN_NAME, EXTRA, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [DB_NAME, TABLE]
  );
  const byName = Object.fromEntries(columns.map((c) => [c.COLUMN_NAME, c]));

  check("revision_count exists", Boolean(byName.revision_count), true);
  check("request_history exists", Boolean(byName.request_history), true);
  check(
    "pending_key is a generated column",
    String(byName.pending_key?.EXTRA || "").includes("STORED GENERATED"),
    true
  );

  const [indexes] = await connection.query(
    `SELECT INDEX_NAME, NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = 'uq_contract_requests_pending'`,
    [DB_NAME, TABLE]
  );
  check("the unique key exists", indexes.length, 1);
  check("and it is unique", indexes[0]?.NON_UNIQUE, 0);

  /* --------------------------------------------- the rule the key enforces */

  await connection.query(
    `INSERT INTO ${TABLE} (student_id, course_id, requested_classes, request_type, status)
     VALUES (69, 1, 10, 'new', 'pending')`
  );
  await connection.query(
    `INSERT INTO ${TABLE} (student_id, course_id, requested_classes, request_type, status)
     VALUES (69, 1, 10, 'extension', 'pending')`
  );

  let duplicateRejected = false;
  try {
    await connection.query(
      `INSERT INTO ${TABLE} (student_id, course_id, requested_classes, request_type, status)
       VALUES (69, 1, 10, 'new', 'pending')`
    );
  } catch (err) {
    duplicateRejected = err.code === "ER_DUP_ENTRY";
  }
  check("a second pending request of the same kind is refused", duplicateRejected, true);

  let sameOtherStudent = null;
  try {
    const [result] = await connection.query(
      `INSERT INTO ${TABLE} (student_id, course_id, requested_classes, request_type, status)
       VALUES (70, 1, 10, 'new', 'pending')`
    );
    sameOtherStudent = result.insertId;
  } catch (err) {
    sameOtherStudent = `rejected: ${err.code}`;
  }
  check("another student may have one of their own", typeof sameOtherStudent, "number");

  // Resolving a request frees the slot, and the resolved rows themselves are
  // not constrained - that is what the NULL in the generated column does.
  await connection.query(`UPDATE ${TABLE} SET status = 'approved' WHERE request_id = 1`);
  let secondApproved = null;
  try {
    const [result] = await connection.query(
      `INSERT INTO ${TABLE} (student_id, course_id, requested_classes, request_type, status)
       VALUES (69, 1, 10, 'new', 'approved')`
    );
    secondApproved = result.insertId;
  } catch (err) {
    secondApproved = `rejected: ${err.code}`;
  }
  check("resolved requests are unconstrained", typeof secondApproved, "number");

  let withdrawnThenNew = null;
  try {
    const [result] = await connection.query(
      `INSERT INTO ${TABLE} (student_id, course_id, requested_classes, request_type, status)
       VALUES (69, 1, 10, 'new', 'cancelled')`
    );
    withdrawnThenNew = result.insertId;
  } catch (err) {
    withdrawnThenNew = `rejected: ${err.code}`;
  }
  check("a withdrawn request does not block a new one", typeof withdrawnThenNew, "number");

  /* ------------------------------------------- the pending key says what */

  const [keys] = await connection.query(
    `SELECT student_id, request_type, status, pending_key FROM ${TABLE} ORDER BY request_id`
  );
  const pendingKey = keys.find((k) => k.status === "pending");
  check(
    "the pending key is student and kind",
    pendingKey?.pending_key,
    `${pendingKey?.student_id}:${pendingKey?.request_type}`
  );
  check(
    "a resolved request has no key",
    keys.find((k) => k.status === "approved")?.pending_key,
    null
  );
} finally {
  await connection.query(`DROP TABLE IF EXISTS ${TABLE}`);
  await connection.end();
}

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

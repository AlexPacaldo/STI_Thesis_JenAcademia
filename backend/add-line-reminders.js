// add-line-reminders.js
/**
 * Add the columns and the log table that LINE reminders need.
 *
 * Run once per database:
 *
 *   cd backend
 *   node add-line-reminders.js
 *
 * !! It is idempotent on purpose. Each column and the table are checked first,
 * !! so running it twice is safe and a half-applied migration can be finished
 * !! by running it again. A plain ALTER TABLE in a .sql file cannot say "only
 * !! if missing" on every MySQL version this project might meet.
 */

import mysql from "mysql2/promise";
import {
  DB_CONNECTION_LIMIT,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
  DB_USER,
  assertDbPasswordPresent,
  describeDbConfig,
} from "./dbConfig.js";

assertDbPasswordPresent();

const USER_COLUMNS = [
  {
    name: "line_user_id",
    definition: "VARCHAR(64) NULL",
    comment: "The U... id LINE assigns after the user adds the Official Account.",
  },
  {
    name: "line_display_name",
    definition: "VARCHAR(100) NULL",
    comment: "The LINE profile name, shown on the Account page.",
  },
  {
    name: "line_linked_at",
    definition: "TIMESTAMP NULL DEFAULT NULL",
    comment: "When the account was linked.",
  },
  {
    name: "line_link_code_hash",
    definition: "CHAR(64) NULL",
    comment: "HMAC-SHA256 of the six-digit linking code. The code itself is never stored.",
  },
  {
    name: "line_link_code_expires_at",
    definition: "TIMESTAMP NULL DEFAULT NULL",
    comment: "When the linking code stops working.",
  },
  {
    name: "line_reminders_enabled",
    definition: "TINYINT(1) NOT NULL DEFAULT 1",
    comment: "Per-user switch for LINE reminders; 0 means linked but paused.",
  },
];

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
});

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(connection, table, indexName) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1`,
    [table, indexName]
  );
  return rows.length > 0;
}

async function addUserColumns(connection) {
  for (const column of USER_COLUMNS) {
    if (await columnExists(connection, "users", column.name)) {
      console.log(`✓ users.${column.name} already exists`);
      continue;
    }

    await connection.query(
      `ALTER TABLE users ADD COLUMN \`${column.name}\` ${column.definition}`
    );
    console.log(`✓ Added users.${column.name} — ${column.comment}`);
  }

  if (await indexExists(connection, "users", "idx_users_line_user_id")) {
    console.log("✓ idx_users_line_user_id already exists");
    return;
  }

  await connection.query(
    "ALTER TABLE users ADD INDEX idx_users_line_user_id (line_user_id)"
  );
  console.log("✓ Added idx_users_line_user_id");
}

async function createReminderLog(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS line_reminder_log (
      reminder_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      reminder_type VARCHAR(50) NOT NULL,
      related_id INT NOT NULL,
      occurrence_key VARCHAR(64) NOT NULL DEFAULT '',
      sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (reminder_id),
      UNIQUE KEY uniq_line_reminder (user_id, reminder_type, related_id, occurrence_key),
      KEY idx_line_reminder_sent (sent_at),
      CONSTRAINT line_reminder_log_user_fk
        FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  console.log("✓ line_reminder_log is ready");
}

async function main() {
  console.log("Database:", JSON.stringify(describeDbConfig()));
  const connection = await pool.getConnection();

  try {
    await addUserColumns(connection);
    await createReminderLog(connection);
    console.log("\nDone. LINE reminder schema is up to date.");
  } finally {
    connection.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("LINE reminder migration failed:", err);
    try {
      await pool.end();
    } catch {
      // Ignore a close error on the way out; the migration error is the useful one.
    }
    process.exitCode = 1;
  });

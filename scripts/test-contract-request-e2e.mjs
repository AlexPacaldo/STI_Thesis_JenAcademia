/**
 * End to end check of the contract request flow.
 *
 *   node scripts/test-contract-request-e2e.mjs
 *
 * Starts the backend on its own port, drives the real routes over HTTP, and
 * removes everything it created afterwards.
 *
 * !! Why this exists when there are already unit tests: the rules were
 * !! correct and the flow was still wrong. The unit tests check what the
 * !! pieces decide. This checks the THING - a student asking twice, an admin
 * !! being told once, a request being withdrawn - through the routes a
 * !! browser actually calls, against the database that actually enforces
 * !! anything.
 *
 * !! It creates a student of its own rather than using a real one. A test
 * !! that revises a real student's pending request and then withdraws it
 * !! would leave their history rewritten and their request gone, and the
 * !! failure would be in their data rather than in the output.
 */
import { spawn } from "node:child_process";
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
const PORT = Number(process.env.E2E_PORT || 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = `contract-flow-e2e-${Date.now()}@student.jenacademia.local`;
const PASSWORD = "JEN2026!FlowTest";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

function report(label, condition, detail = "") {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`  - ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

let studentId = null;
let packageId = null;
let courseId = null;
const createdRequestIds = [];

try {
  const up = await waitForServer();
  if (!up) {
    console.log("The backend did not start. Its output was:\n");
    console.log(serverLog.slice(-4000));
    process.exit(1);
  }

  /* ------------------------------------------------------ the test student */

  const [courses] = await db.query(`SELECT course_id FROM courses ORDER BY course_id LIMIT 1`);
  courseId = courses[0]?.course_id ?? null;

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [inserted] = await db.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, contact_number, country, role, status, profile_completed)
     VALUES (?, ?, ?, ?, ?, 'Philippines', 'student', 'active', 1)`,
    ["Contract", "FlowTest", EMAIL, passwordHash, "+639170000001"]
  );
  studentId = inserted.insertId;

  await db.query(
    `INSERT INTO student_profiles (user_id, course_id, proficiency_level) VALUES (?, ?, 'intermediate-mid')`,
    [studentId, courseId]
  );

  // A contract that ended with classes on it - the situation the whole
  // extension route exists for.
  const [pkg] = await db.query(
    `INSERT INTO student_class_packages (student_id, total_classes, classes_used, class_duration, status, expires_at)
     VALUES (?, 10, 4, 50, 'expired', DATE_SUB(NOW(), INTERVAL 10 DAY))`,
    [studentId]
  );
  packageId = pkg.insertId;

  /* --------------------------------------------------------------- sign in */

  const loginResponse = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginResponse.json();
  const token = login?.token || login?.sessionToken;
  report("the test student can sign in", loginResponse.ok && Boolean(token), `status ${loginResponse.status}`);

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const postRequest = async (body) => {
    const response = await fetch(`${BASE}/api/student/contract-requests`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  const getRequests = async () => {
    const response = await fetch(`${BASE}/api/student/contract-requests/${studentId}`, {
      headers: authHeaders,
    });
    return { status: response.status, body: await response.json() };
  };

  /* ------------------------------------------------- nothing sent yet */

  const empty = await getRequests();
  check("a student with no requests has none pending", empty.body?.pending, []);
  check("and no history either", empty.body?.requests, []);

  /* ------------------------------------------------------- the first ask */

  const first = await postRequest({
    student_id: studentId,
    request_type: "extension",
    trial_notes: "I was ill for three weeks and missed my lessons.",
  });

  check("the first extension request is created", first.status, 201);
  check("and is not a revision", first.body?.isRevision, false);
  check("and is version 1", first.body?.revision, 1);
  const requestId = first.body?.request_id;
  createdRequestIds.push(requestId);
  report("and has an id", Boolean(requestId));

  const afterFirst = await getRequests();
  check("one request is pending", afterFirst.body?.pending?.length, 1);
  check("and it is the extension", afterFirst.body?.pending?.[0]?.request_type, "extension");
  check("and it has not been revised", afterFirst.body?.pending?.[0]?.revision_count, 1);

  /* ------------------------------------------------------- asking again */

  const second = await postRequest({
    student_id: studentId,
    request_type: "extension",
    trial_notes: "Actually the illness is over, but I still need two more classes.",
  });

  check("asking again updates the request", second.status, 200);
  check("and says it is a revision", second.body?.isRevision, true);
  check("and it is version 2", second.body?.revision, 2);
  check("and it is the same request", second.body?.request_id, requestId);

  const afterSecond = await getRequests();
  check("still only one request is pending", afterSecond.body?.pending?.length, 1);
  check("and it is version 2", afterSecond.body?.pending?.[0]?.revision_count, 2);
  check("the earlier note is kept", afterSecond.body?.pending?.[0]?.revisions?.[0]?.trial_notes, "I was ill for three weeks and missed my lessons.");
  check("and the current note is the new one", afterSecond.body?.pending?.[0]?.trial_notes, "Actually the illness is over, but I still need two more classes.");
  check("the history says it was revised once", afterSecond.body?.pending?.[0]?.revision_label, "Revised 1 time");

  /* ------------------------------------------ the admin is told once */

  const [admins] = await db.query(
    `SELECT user_id FROM users WHERE role = 'admin' AND status = 'active'`
  );
  check("there is at least one admin to notify", admins.length > 0, true);

  const [notifications] = await db.query(
    `SELECT notification_id, user_id, is_read FROM notifications WHERE related_id = ? AND related_type = 'contract_request'`,
    [requestId]
  );
  // One per admin, not one per admin per submission. The old code inserted a
  // new row every time, so a student who revised a request three times put
  // three unread entries in every admin's bell for one request.
  check("one notification per admin, not one per submission", notifications.length, admins.length);
  check(
    "and each admin has exactly one",
    admins.every((admin) => notifications.filter((n) => n.user_id === admin.user_id).length === 1),
    true
  );

  /* ------------------------------------- two submissions at the same time */

  const concurrent = await Promise.all([
    postRequest({
      student_id: studentId,
      request_type: "extension",
      trial_notes: "Sent from one tab.",
    }),
    postRequest({
      student_id: studentId,
      request_type: "extension",
      trial_notes: "Sent from another tab.",
    }),
  ]);

  report(
    "neither simultaneous submission is refused",
    concurrent.every((r) => r.status === 200 || r.status === 201),
    concurrent.map((r) => r.status).join(", ")
  );
  check(
    "and they are the same request",
    concurrent[0].body?.request_id === concurrent[1].body?.request_id,
    true
  );

  const afterRace = await getRequests();
  check("and there is still exactly one pending request", afterRace.body?.pending?.length, 1);

  const [raceRows] = await db.query(
    `SELECT COUNT(*) AS total FROM student_contract_requests
      WHERE student_id = ? AND status = 'pending' AND request_type = 'extension'`,
    [studentId]
  );
  check("the database agrees there is one", Number(raceRows[0].total), 1);

  /* ------------------------- the other kind cannot be asked for at the same time */

  // A new contract REPLACES the contract the unused classes are on, so
  // approving one throws away what the other is asking to preserve. There is
  // no version of the two that can both be granted, so the second ask is
  // refused and the student is told to withdraw the first.
  const newContract = await postRequest({
    student_id: studentId,
    course_id: courseId,
    requested_classes: 8,
    class_duration: 50,
  });

  check("a new contract request is refused while the extension is pending", newContract.status, 409);
  report(
    "and says which request is in the way",
    String(newContract.body?.message || "").includes("extension request"),
    newContract.body?.message
  );

  const afterRefusal = await getRequests();
  check("and nothing new is pending", afterRefusal.body?.pending?.length, 1);
  check(
    "the one that is pending is still the extension",
    afterRefusal.body?.pending?.[0]?.request_type,
    "extension"
  );

  /* ------------------------------------------------------------ withdraw */

  const withdrawn = await fetch(`${BASE}/api/student/contract-requests/${requestId}/cancel`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ student_id: studentId }),
  });
  const withdrawnBody = await withdrawn.json();
  check("a pending request can be withdrawn", withdrawn.status, 200);
  report("and says so", typeof withdrawnBody?.message === "string" && withdrawnBody.message.length > 0);

  const afterWithdraw = await getRequests();
  check("it is no longer pending", afterWithdraw.body?.pending?.length, 0);

  const history = afterWithdraw.body?.requests?.find((r) => r.request_id === requestId);
  check("and the history records it as withdrawn", history?.status, "cancelled");

  /* --------------------------- the other kind, once the first is out of the way */

  const newContractAfter = await postRequest({
    student_id: studentId,
    course_id: courseId,
    requested_classes: 8,
    class_duration: 50,
  });
  check("the new contract request is accepted now", newContractAfter.status, 201);
  check("and it has its own id", newContractAfter.body?.request_id !== requestId, true);
  createdRequestIds.push(newContractAfter.body?.request_id);

  /* ------------------------------------- withdrawing twice is refused */

  const again = await fetch(`${BASE}/api/student/contract-requests/${requestId}/cancel`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ student_id: studentId }),
  });
  check("withdrawing it twice is refused", again.status, 409);

  /* ------------------------------------- a new request after withdrawing */

  const afterWithdrawal = await postRequest({
    student_id: studentId,
    request_type: "extension",
    trial_notes: "Asking again, now that the first one is out of the way.",
  });
  check("a fresh extension request is refused while the new contract is pending", afterWithdrawal.status, 409);

  // Withdraw the new-contract request, and the extension is free to go.
  await fetch(`${BASE}/api/student/contract-requests/${newContractAfter.body?.request_id}/cancel`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ student_id: studentId }),
  });

  const finalExtension = await postRequest({
    student_id: studentId,
    request_type: "extension",
    trial_notes: "Asking again, now that the first one is out of the way.",
  });
  check("and accepted once that is withdrawn", finalExtension.status, 201);
  check("and it is a new request, not the old one", finalExtension.body?.request_id !== requestId, true);
  createdRequestIds.push(finalExtension.body?.request_id);
} catch (err) {
  failures.push(`  - the run threw: ${err?.stack || err}`);
} finally {
  /* ------------------------------------------------------------- tidy up */

  if (studentId) {
    // Every request this student made, not only the ones the test happened to
    // remember. A notification for a request that is then deleted is an
    // orphan in the admin's bell, and orphans are what makes a badge
    // untrustworthy.
    const [madeRequests] = await db.query(
      `SELECT request_id FROM student_contract_requests WHERE student_id = ?`,
      [studentId]
    );
    const requestIds = madeRequests.map((row) => row.request_id);
    const allIds = [...new Set([...requestIds, ...createdRequestIds])];

    if (allIds.length) {
      await db.query(
        `DELETE FROM notifications WHERE related_id IN (${allIds.map(() => "?").join(", ")}) AND related_type = 'contract_request'`,
        allIds
      );
    }

    await db.query(`DELETE FROM student_contract_requests WHERE student_id = ?`, [studentId]);
    if (packageId) {
      await db.query(`DELETE FROM student_class_packages WHERE package_id = ?`, [packageId]);
    }
    await db.query(`DELETE FROM student_profiles WHERE user_id = ?`, [studentId]);
    await db.query(`DELETE FROM users WHERE user_id = ?`, [studentId]);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isRescheduleClosedByStart, RESCHEDULE_CLOSED_AFTER_START_MESSAGE } from "../backend/rescheduleRequestFlow.js";
import { hasScheduledClassEnded, attendanceMinutes } from "../backend/classSession.js";
import { zonedWallClockToInstant } from "../backend/lineReminders.js";
import { assessClassEvidence } from "../backend/classEvidence.js";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const reply = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function route(method, path, context) {
  const start = source.indexOf(`app.${method}("${path}",`);
  const end = source.indexOf("\napp.", start + 1);
  assert(start >= 0 && end > start);
  let handler;
  vm.runInNewContext(source.slice(start, end), {
    app: { [method]: (_path, ...callbacks) => { handler = callbacks.at(-1); } },
    requireSession() {}, requireAdminSession() {}, requireClassAccess: () => () => {},
    requireBodyIdentity: () => () => {}, sessionMayActFor: () => true,
    console, groupClassSchemaReady: false, attendanceMinutes, ...context,
  });
  return handler;
}

// Past unresolved bookings continue reserving credit; incomplete records release it.
const packageInfo = { student_id: 3, package_id: 1, total_classes: 3, classes_used: 0, classes_left: 3, created_at: "2020-01-01" };
const bookings = [
  { status: "scheduled", scheduled_date: "2020-01-02" },
  { status: "scheduled", scheduled_date: "2099-01-01" },
  { status: "scheduled", scheduled_date: "2099-01-01", verification_status: "incomplete" },
];
const packageDb = { async query(sql) {
  if (sql.includes("COUNT(*) AS booked_count")) {
    assert(!sql.includes("CURDATE()"), "A booking must not release its credit merely because the date passed");
    return [[{ booked_count: bookings.filter(row => row.status === "scheduled" && row.verification_status !== "incomplete").length }]];
  }
  return [[packageInfo]];
} };
const helperStart = source.indexOf("async function getStudentPackageAvailability(");
const helperEnd = source.indexOf("\nasync function ", helperStart + 1);
const availability = vm.runInNewContext(source.slice(helperStart, helperEnd) + "\ngetStudentPackageAvailability;", {});
assert.equal((await availability(packageDb, 3)).bookableClasses, 1);
bookings[0].status = "no-show";
assert.equal((await availability(packageDb, 3)).bookableClasses, 2);
const counts = [...source.matchAll(/SELECT COUNT\(\*\) AS booked_count[\s\S]*?`/g)];
assert.equal(counts.length, 3);
for (const [query] of counts) assert(!query.includes("CURDATE()"));

// A pending reschedule cannot be approved after student-first attendance.
let moved = false;
const rescheduleDb = {
  async beginTransaction() {}, async rollback() {}, release() {},
  async query(sql) {
    if (sql.includes("FROM reschedule_requests rr")) return [[{ teacher_id: 2, student_id: 3, status: "pending" }]];
    if (sql.includes("FROM users")) return [[{ user_id: 2 }, { user_id: 3 }]];
    if (sql.includes("FROM reschedule_requests")) return [[{ class_id: 1, requested_date: "2099-01-01", requested_time: "10:00" }]];
    if (sql.includes("FROM classes")) {
      assert.match(sql, /cal.student_joined_at AS student_joined_at/);
      assert.match(sql, /FOR UPDATE/);
      return [[{ teacher_id: 2, student_id: 3, status: "scheduled", class_started_at: null, student_joined_at: new Date() }]];
    }
    if (sql.includes("UPDATE classes")) moved = true;
    throw new Error(`Unexpected query: ${sql}`);
  },
};
const approveReschedule = route("post", "/api/calendar/reschedule-requests/:id/approve", {
  pool: { getConnection: async () => rescheduleDb }, isRescheduleClosedByStart, RESCHEDULE_CLOSED_AFTER_START_MESSAGE,
});
const rescheduleResponse = reply();
await approveReschedule({ params: { id: 1 }, body: { user_id: 2 } }, rescheduleResponse);
assert.equal(rescheduleResponse.code, 409);
assert.equal(moved, false);

// Administrator resolution returns the refreshed allowance after committing.
let commits = 0;
const incompleteDb = {
  async beginTransaction() {}, async commit() { commits++; }, async rollback() {}, release() {},
  async query(sql) {
    if (sql.includes("FROM classes")) return [[{ class_id: 1, teacher_id: 2, student_id: 3, status: "scheduled" }]];
    if (sql.includes("UPDATE class_attendance_logs")) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  },
};
const incomplete = route("put", "/api/admin/class-verifications/:class_id/incomplete", {
  pool: { getConnection: async () => incompleteDb },
  getStudentPackageAvailability: async () => ({ package: packageInfo, bookedClasses: 1, bookableClasses: 2 }),
  getClassVerification: async () => ({ verification_status: "incomplete" }), broadcastCalendarChange() {},
});
const incompleteResponse = reply();
await incomplete({ params: { class_id: 1 } }, incompleteResponse);
assert.equal(incompleteResponse.code, 200);
assert.equal(incompleteResponse.body.package.bookable_classes, 2);
assert.equal(commits, 1);

// No-show cannot be used to close a future class or override student attendance.
let noShowWrites = 0;
const absentClass = { class_id: 1, teacher_id: 2, student_id: 3, status: "scheduled", duration: 25,
  scheduled_date: "2099-01-01", start_time: "10:00:00", teacher_timezone: "UTC" };
const noShowDb = {
  async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
  async query(sql) {
    if (sql.includes("FROM classes")) return [[absentClass]];
    if (sql.includes("UPDATE classes")) { noShowWrites++; return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected query: ${sql}`);
  },
};
const noShow = route("put", "/api/calendar/classes/:class_id/no-show", {
  pool: { getConnection: async () => noShowDb }, hasScheduledClassEnded, zonedWallClockToInstant,
  getStudentPackageAvailability: async () => ({ package: packageInfo, bookedClasses: 1, bookableClasses: 2 }),
  broadcastCalendarChange() {},
});
const markNoShow = async () => {
  const res = reply();
  await noShow({ params: { class_id: 1 }, body: { teacher_id: 2 } }, res);
  return res;
};
assert.equal((await markNoShow()).code, 409);
assert.equal(noShowWrites, 0);
absentClass.scheduled_date = "2020-01-01";
absentClass.student_joined_at = new Date();
assert.equal((await markNoShow()).code, 409);
assert.equal(noShowWrites, 0);
absentClass.student_joined_at = null;
assert.equal((await markNoShow()).code, 200);
assert.equal(noShowWrites, 1);

// An old class must not fall through to a replacement contract.
for (const [path, admin] of [["/api/calendar/classes/:class_id/complete", false], ["/api/admin/class-verifications/:class_id/approve", true]]) {
  const originalCreatedAt = "2020-01-01";
  let debited = false;
  const db = {
    async beginTransaction() {}, async rollback() {}, release() {},
    async query(sql, params) {
      if (sql.includes("FROM classes")) {
        assert.match(sql, /c.created_at/);
        return [[{ class_id: 1, teacher_id: 2, student_id: 3, status: "scheduled", created_at: originalCreatedAt,
          duration: 25, teacher_started_at: new Date("2020-01-01T10:00:00Z"), student_joined_at: new Date("2020-01-01T10:00:00Z"), teacher_ended_at: new Date("2020-01-01T10:25:00Z"),
          duration_minutes: 25, summary: "A complete class.", verification_status: "verified" }]];
      }
      if (sql.includes("UPDATE class_attendance_logs")) return [{ affectedRows: 1 }];
      if (sql.includes("FROM student_class_packages")) {
        assert.match(sql, /created_at <= \?/);
        assert.deepEqual(Array.from(params), [3, originalCreatedAt]);
        assert.match(sql, /ORDER BY created_at DESC, package_id DESC/);
        return [[]];
      }
      if (sql.includes("UPDATE student_class_packages")) debited = true;
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const complete = route("put", path, { pool: { getConnection: async () => db }, getRequiredClassMinutes: () => 15 });
  const res = reply();
  await complete({ params: { class_id: 1 }, body: { teacher_id: 2 } }, res);
  assert.equal(res.code, admin ? 400 : 409);
  assert.equal(debited, false);
}

// The actual end route must refuse automatic verification when the student
// attended only the final minute, even though the screenshot evidence qualifies.
const endNow = Date.now();
const shortLog = { evidence_mode: "screenshots", teacher_started_at: new Date(endNow - 25 * 60_000),
  student_joined_at: new Date(endNow - 60_000), start_proof_uploaded_at: new Date(endNow - 30_000),
  start_proof_url: "/start.png", proof_url: "/end.png", duration_minutes: 25 };
let endedWrites = 0;
const endHandler = route("post", "/api/calendar/classes/:class_id/end", {
  classProofUpload: { single: () => () => {} }, assessClassEvidence, getRequiredClassMinutes: () => 15,
  hasCompleteSentence: () => true,
  pool: { async query(sql) {
    if (sql.includes("FROM classes")) return [[{ class_id: 1, teacher_id: 2, student_id: 3, duration: 25, status: "scheduled" }]];
    if (sql.includes("FROM class_attendance_logs")) return [[shortLog]];
    endedWrites++;
    throw new Error("A short class must not be automatically verified");
  } },
});
const shortResponse = reply();
await endHandler({ params: { class_id: 1 }, body: { teacher_id: 2, summary: "We practiced conversation." } }, shortResponse);
assert.equal(shortResponse.code, 400);
assert.match(shortResponse.body.message, /Both participants must attend/);
assert.equal(endedWrites, 0);

// MySQL applies assignments left-to-right. Exhaustion must use the old usage
// exactly once, so the penultimate class leaves one active credit.
const debits = [...source.matchAll(/UPDATE student_class_packages\s+SET status = CASE\s+WHEN classes_used \+ 1 >= total_classes THEN 'expired'[\s\S]*?WHERE package_id = \?/g)];
assert.equal(debits.length, 3);
for (const [query] of debits) assert(query.indexOf("status = CASE") < query.indexOf("classes_used = classes_used + 1"));

// Class remarks use the same participant/admin access rule as the classroom.
let mayRead = false;
let remarkQueries = 0;
const remarks = route("get", "/api/calendar/remarks/:class_id", {
  sessionMayActOnClass: async () => mayRead,
  pool: { async query() { remarkQueries++; return [[{ remarks: "A useful lesson." }]]; } },
  decryptFields: row => row,
});
const denied = reply();
await remarks({ params: { class_id: 1 } }, denied);
assert.equal(denied.code, 403);
assert.equal(remarkQueries, 0);
mayRead = true;
const allowed = reply();
await remarks({ params: { class_id: 1 } }, allowed);
assert.equal(allowed.code, 200);
assert.equal(allowed.body.remarks.remarks, "A useful lesson.");

// The unused manual debit API must not let students bypass verified completion.
const adminOnly = () => {};
let registeredGuards;
const manualStart = source.indexOf('app.put("/api/student/package/:student_id/use-class",');
const manualEnd = source.indexOf("\napp.", manualStart + 1);
vm.runInNewContext(source.slice(manualStart, manualEnd), {
  app: { put: (_path, ...callbacks) => { registeredGuards = callbacks; } },
  requireAdminSession: adminOnly,
});
assert.equal(registeredGuards[0], adminOnly);
console.log("Scheduling lifecycle: credit reservations, student-first reschedule protection, administrator resolution and original-contract completion checks pass.");

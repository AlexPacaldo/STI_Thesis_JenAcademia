import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as scheduling from "../backend/scheduling.js";
import { timeToMinutes, normalizeTime } from "../frontend/src/utils/classTime.js";
import { isRescheduleClosedByStart, normalizeDeclineReason } from "../backend/rescheduleRequestFlow.js";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const date = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
const original = { teacher_id: 1, student_id: 2, status: "scheduled", duration: 25,
  scheduled_date: date, start_time: "09:00", created_at: "2020-01-01", teacher_timezone: "UTC" };
let classInfo;
let target;
let contract;
let writes;
let conflicted;
let requester;
let expectLock;
function reset() {
  classInfo = { ...original }; target = { requested_date: date, requested_time: "10:00", requested_date_key: date, requested_time_key: "10:00", class_id: 1 };
  contract = { package_id: 1, status: "active", class_duration: 25, classes_left: 2, created_at: "2020-01-01", expires_at: "2099-12-31" };
  writes = []; conflicted = []; requester = 2; expectLock = true;
}
const db = {
  async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
  async query(sql, params) {
    if (sql.includes("SELECT rr.*")) return [[{ ...classInfo, requested_by_id: requester, status: "pending" }]];
    if (sql.includes("SELECT rr.requested_by_id")) return [[]];
    if (sql.includes("SELECT user_id")) return [[{ user_id: 1 }, { user_id: 2 }]];
    if (sql.includes("FROM reschedule_requests")) return [[target]];
    if (sql.includes("FROM student_class_packages")) {
      assert.deepEqual(Array.from(params), [2, "2020-01-01"]);
      assert.match(sql, /created_at <= \?/);
      assert.equal(sql.includes("FOR UPDATE"), expectLock);
      return contract ? [[contract]] : [[]];
    }
    if (sql.includes("cal.teacher_started_at AS class_started_at")) return [[classInfo]];
    if (sql.includes("FROM teacher_availability")) return [[{ status: "available", start_time: "08:00", end_time: "17:00" }]];
    if (sql.includes("FROM classes")) return [conflicted];
    if (sql.includes("UPDATE")) { writes.push(sql); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected query: ${sql}`);
  },
};
function handler(path) {
  const start = source.indexOf(`app.post("${path}",`);
  const end = source.indexOf("\napp.", start + 1);
  let route;
  vm.runInNewContext(source.slice(start, end), {
    ...scheduling,
    app: { post: (_path, ...callbacks) => { route = callbacks.at(-1); } },
    pool: { query: db.query, getConnection: async () => db }, requireSession() {}, sessionMayActFor: () => true,
    requireBodyIdentity: () => () => {},
    groupClassSchemaReady: false, isRescheduleClosedByStart, normalizeDeclineReason, timeToMinutes,
    getRangeMinutes: (time, duration) => ({ start: timeToMinutes(time), end: timeToMinutes(time) + duration }),
    normalizeDateKey: value => String(value).slice(0, 10), normalizeTimeKey: normalizeTime,
    minutesToTimeKey: minutes => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    broadcastCalendarChange() {}, console,
  });
  return route;
}
const approve = handler("/api/calendar/reschedule-requests/:id/approve");
const decline = handler("/api/calendar/reschedule-requests/:id/reject");
async function request(route = approve, userId = 1) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await route({ params: { id: 1 }, body: { user_id: userId, reason: "I need another time." } }, res);
  return res;
}
reset(); assert.equal((await request(approve, "2")).code, 403); assert.equal(writes.length, 0);
reset(); requester = 1; assert.equal((await request(approve, 1)).code, 403); assert.equal(writes.length, 0);
reset(); assert.equal((await request(decline, 2)).code, 403); assert.equal(writes.length, 0);
reset(); target.requested_date_key = target.requested_date = "2000-01-01";
assert.equal((await request()).code, 400); assert.equal(writes.length, 0);
reset(); contract.expires_at = `${date}T10:24:59Z`;
assert.equal((await request()).code, 400); assert.equal(writes.length, 0);
reset(); contract.status = "expired";
assert.equal((await request()).code, 400); assert.equal(writes.length, 0);
reset(); classInfo.status = "no-show";
assert.equal((await request()).code, 409); assert.equal(writes.length, 0);
reset(); contract.expires_at = `${date}T10:25:00Z`;
assert.equal((await request()).code, 200); assert(writes.some(sql => sql.includes("UPDATE classes")));
reset(); requester = 1;
assert.equal((await request(approve, 2)).code, 200); assert(writes.some(sql => sql.includes("UPDATE classes")));
reset(); conflicted = [{ class_id: 9, teacher_id: 3, student_id: 2, scheduled_date: date, start_time: "18:00", duration: 25, teacher_timezone: "Asia/Manila" }];
assert.equal((await request()).code, 409); assert.equal(writes.length, 0);
const create = handler("/api/calendar/reschedule-request");
for (const past of [true, false]) {
  reset(); expectLock = false;
  if (!past) contract.expires_at = `${date}T10:24:59Z`;
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await create({ body: { class_id: 1, requested_by_id: 2, requested_date: past ? "2000-01-01" : date, requested_time: "10:00" } }, res);
  assert.equal(res.code, 400);
  assert.equal(writes.length, 0);
}
console.log("Reschedule API enforces counterparty approval, future times, original contract coverage, class status and cross-timezone conflicts.");

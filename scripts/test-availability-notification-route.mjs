import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const guardStart = source.indexOf("async function sessionMayReadTeacherAvailability(");
const guardEnd = source.indexOf("async function sessionMayActOnNotification(", guardStart);
const routeStart = source.indexOf('app.get("/api/calendar/teacher-availability-record",');
const routeEnd = source.indexOf("\n});", routeStart) + 4;
assert(guardStart >= 0 && guardEnd > guardStart && routeStart >= 0 && routeEnd > routeStart);
let callbacks;
let recordQueries = 0;
const record = { id: 12, teacher_id: 10, available_date: "2026-12-01", start_time: "09:00", end_time: "12:00", teacher_timezone: "Asia/Tokyo", status: "available" };
const pool = {
  async query(sql, params) {
    if (sql.includes("FROM student_profiles")) return [[{ assigned_teacher_id: 10 }]];
    recordQueries++;
    assert.match(sql, /WHERE ta\.teacher_id = \?/);
    if (sql.includes("ta.availability_id = ?")) {
      return [String(params[0]) === "10" && String(params[1]) === "12" ? [record] : []];
    }
    assert.match(sql, /DATE\(ta\.available_date\) = \?/);
    return [String(params[0]) === "10" && params[1] === record.available_date ? [record] : []];
  },
};
vm.runInNewContext(source.slice(guardStart, guardEnd) + source.slice(routeStart, routeEnd), {
  app: { get: (_path, ...handlers) => { callbacks = handlers; } },
  pool, requireSession: (_req, _res, next) => next(),
  deletePastTeacherAvailability: async () => {}, console,
});

function read(query, session = { userId: 20, role: "student" }) {
  return new Promise((resolve, reject) => {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; resolve(this); return this; } };
    let index = 0;
    const next = () => {
      try { Promise.resolve(callbacks[index++]({ query, session }, response, next)).catch(reject); }
      catch (error) { reject(error); }
    };
    next();
  });
}

assert.equal((await read({ teacher_id: "10", availability_id: "12" })).body.record, record);
assert.equal((await read({ teacher_id: "10", available_date: "2026-12-01" })).body.record, record);
assert.equal((await read({ teacher_id: "10", availability_id: "999" })).body.record, null);
const beforeInvalid = recordQueries;
for (const id of ["0", "-1", "1.2", "abc", "12 OR 1=1"]) {
  assert.equal((await read({ teacher_id: "10", availability_id: id })).code, 400);
}
assert.equal((await read({ teacher_id: "10" })).code, 400);
assert.equal((await read({ teacher_id: "99", availability_id: "12" })).code, 403);
assert.equal(recordQueries, beforeInvalid);
assert.equal((await read({ teacher_id: "99", availability_id: "12" }, { userId: 99, role: "teacher" })).body.record, null);
console.log("Availability notification links resolve records by ID or date and retain assigned-teacher access checks.");

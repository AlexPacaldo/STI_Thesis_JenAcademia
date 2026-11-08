import test from "node:test";
import assert from "node:assert/strict";
import { createGroupClassService, groupExpiry, groupHoldConflict, intervalsConflict, registerGroupClassRoutes, unchangedBooking, validateGroupPair } from "./groupClasses.js";
import { zonedWallClockToInstant } from "./lineReminders.js";

// In-memory transactional DB double exercises the real service without using
// production accounts. MySQL locking/schema and browser QA remain separate.
function fixture() {
  const date = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const booking = (class_id, student_id, time) => ({ class_id, student_id, teacher_id: 1,
    scheduled_date: date, start_time: time, duration: 25, class_name: "English", status: "scheduled",
    teacher_timezone: "UTC", created_at: new Date("2020-01-01"), group_session_id: null, started: 0 });
  let state = {
    classes: [booking(10, 2, "10:00"), booking(20, 3, "11:00")], proposals: [], members: [], sessions: [], notifications: [],
    packages: [2, 3].map(student_id => ({ student_id, package_id: 100 + student_id, class_duration: 25,
      classes_left: 10, status: "active", created_at: new Date("2019-01-01"), expires_at: new Date(Date.now() + 90 * 86400_000) })),
    availability: { status: "available", start_time: "08:00", end_time: "18:00", break_start: "12:00", break_end: "12:30" },
  };
  let queue = Promise.resolve();
  let failOn = "";
  const queries = [];
  const valid = proposal => {
    return state.members.filter(member => member.proposal_id === proposal.proposal_id)
      .every(member => unchangedBooking(state.classes.find(row => row.class_id === member.class_id), member));
  };
  const enrich = row => ({ ...row, teacher_timezone: "UTC", teacher_name: "Jen" });
  async function query(sql, params = []) {
    const q = sql.replace(/\s+/g, " ").trim(); queries.push(q);
    if (failOn && q.includes(failOn)) throw new Error("Simulated database failure");
    assert(!/UPDATE student_class_packages|INSERT INTO classes|DELETE FROM classes/.test(q), "Grouping must not create extra class charges or delete original records");
    if (q.startsWith("SELECT c.*")) {
      if (q.includes("c.class_id NOT IN")) return [state.classes.filter(row => row.status === "scheduled" && !params[0].includes(row.class_id))];
      return [state.classes.filter(row => params[0].map(Number).includes(row.class_id)).map(row => ({ ...row }))];
    }
    if (q.startsWith("SELECT user_id, role")) return [params[0].map(user_id => ({ user_id, status: "active", profile_completed: true, role: user_id === 1 ? "teacher" : "student" }))];
    if (q.includes("FROM student_class_packages")) return [state.packages.filter(pkg => params[0].includes(pkg.student_id) && pkg.status === "active")];
    if (q.startsWith("SELECT * FROM teacher_availability")) return [[state.availability]];
    if (q.startsWith("UPDATE group_class_proposals SET status = 'expired'")) {
      state.proposals.forEach(row => { if (row.status === "pending" && row.expires_at <= new Date()) row.status = "expired"; }); return [{ affectedRows: 1 }];
    }
    if (q.startsWith("UPDATE group_class_proposals gp")) {
      state.proposals.forEach(row => { if (row.status === "pending" && !valid(row)) row.status = "invalidated"; }); return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT gm.proposal_id")) return [state.members.filter(member => params[0].includes(member.class_id)
      && state.proposals.some(proposal => proposal.proposal_id === member.proposal_id && proposal.status === "pending" && proposal.expires_at > new Date() && valid(proposal)))];
    if (q.startsWith("INSERT INTO group_class_proposals")) {
      const proposal_id = state.proposals.length + 1;
      state.proposals.push({ proposal_id, teacher_id: params[0], scheduled_date: params[1], start_time: params[2], duration: params[3], expires_at: params[4], status: "pending" });
      return [{ insertId: proposal_id }];
    }
    if (q.startsWith("INSERT INTO group_class_proposal_members")) {
      const keys = ["proposal_id", "class_id", "teacher_id", "student_id", "package_id", "original_name", "original_date", "original_time", "duration", "original_group_session_id"];
      state.members.push({ ...Object.fromEntries(keys.map((key, index) => [key, params[index]])), response: "pending" });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT gm.*")) return [state.members.filter(row => row.proposal_id === Number(params[0]))
      .map(row => ({ ...row, student_name: row.student_id === 2 ? "Grace" : "Shannon" }))];
    if (q.startsWith("SELECT *, DATE_FORMAT(scheduled_date")) return [state.proposals.filter(row => row.proposal_id === Number(params[0])).map(enrich)];
    if (q.startsWith("SELECT gp.*")) {
      if (q.includes("gp.proposal_id <>")) return [state.proposals.filter(row => row.status === "pending" && row.proposal_id !== Number(params[0]) && valid(row)).map(enrich)];
      return [state.proposals.filter(row => row.teacher_id === Number(params[0]) || state.members.some(member => member.proposal_id === row.proposal_id && member.student_id === Number(params[1]))).map(enrich)];
    }
    if (q.startsWith("SELECT gp.proposal_id")) return [state.proposals.filter(row => row.status === "pending" && valid(row)).map(enrich)];
    if (q.startsWith("SELECT timezone FROM users")) return [[{ timezone: "UTC" }]];
    if (q.startsWith("UPDATE group_class_proposal_members")) {
      state.members.filter(row => row.proposal_id === Number(params[0]) && row.student_id === Number(params[1])).forEach(row => { row.response = "accepted"; }); return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO group_class_sessions")) {
      const group_session_id = state.sessions.length + 1;
      state.sessions.push({ group_session_id, teacher_id: params[0], scheduled_date: params[1], start_time: params[2], duration: params[3], class_link: params[4] });
      return [{ insertId: group_session_id }];
    }
    if (q.startsWith("UPDATE classes SET scheduled_date")) {
      state.classes.filter(row => params[5].includes(row.class_id)).forEach(row => Object.assign(row, { scheduled_date: params[0], start_time: params[1], end_time: params[2], class_link: params[3], group_session_id: params[4] }));
      return [{ affectedRows: 2 }];
    }
    if (q.startsWith("UPDATE video_sessions") || q.startsWith("UPDATE reschedule_requests")) return [{ affectedRows: 2 }];
    if (q.startsWith("UPDATE group_class_proposals SET status = 'approved'")) {
      Object.assign(state.proposals.find(row => row.proposal_id === Number(params[1])), { status: "approved", group_session_id: params[0] }); return [{ affectedRows: 1 }];
    }
    if (q.startsWith("UPDATE group_class_proposals SET status = ?")) {
      state.proposals.find(row => row.proposal_id === Number(params[1])).status = params[0]; return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO notifications")) { state.notifications.push(params); return [{ insertId: state.notifications.length }]; }
    throw new Error(`Unhandled fixture query: ${q}`);
  }
  const pool = { query, async getConnection() {
    let release, snapshot;
    return { query,
      async beginTransaction() { const previous = queue; queue = new Promise(resolve => { release = resolve; }); await previous; snapshot = structuredClone(state); },
      async commit() { release(); release = null; },
      async rollback() { state = snapshot; release?.(); release = null; }, release() {},
    };
  } };
  const events = [];
  const service = createGroupClassService({ pool, instant: zonedWallClockToInstant, encrypt: value => value,
    meetingLink: () => "https://meet.test/group-room", broadcast: (...event) => events.push(event) });
  const teacher = { userId: 1, role: "teacher" };
  const student = userId => ({ userId, role: "student" });
  const body = { class_ids: [10, 20], scheduled_date: date, start_time: "10:00" };
  return { service, teacher, student, body, pool, events, queries, get state() { return state; }, setFail: value => { failOn = value; } };
}

test("group conversion requires both students and preserves booking IDs and class allowances", async () => {
  const f = fixture(); const originals = structuredClone(f.state.classes); const packages = structuredClone(f.state.packages);
  const proposal = await f.service.create(f.teacher, f.body);
  assert.deepEqual(f.state.classes, originals);
  assert.equal((await f.service.respond(f.student(2), proposal.proposal_id, "accept")).status, "pending");
  assert.deepEqual(f.state.classes, originals);
  assert.equal((await f.service.respond(f.student(3), proposal.proposal_id, "accept")).status, "approved");
  assert.deepEqual(f.state.classes.map(row => row.class_id), [10, 20]);
  assert(f.state.classes.every(row => row.start_time === "10:00" && row.group_session_id === 1));
  assert.equal(f.state.classes[0].class_link, f.state.classes[1].class_link);
  assert.deepEqual(f.state.packages, packages);
  assert.equal(f.state.sessions.length, 1);
  assert(f.queries.some(q => q.includes("ORDER BY student_id FOR UPDATE")), "Final approvals must read current responses, not a stale transaction snapshot");
});

test("students and unrelated teachers cannot create proposals or respond for someone else", async () => {
  const f = fixture();
  await assert.rejects(f.service.create(f.student(2), f.body), error => error.status === 403);
  await assert.rejects(f.service.create({ userId: 99, role: "teacher" }, f.body), error => error.status === 403);
  const { proposal_id } = await f.service.create(f.teacher, f.body);
  await assert.rejects(f.service.respond(f.student(99), proposal_id, "accept"), error => error.status === 403);
  await assert.rejects(f.service.respond(f.teacher, proposal_id, "accept"), error => error.status === 403);
  await assert.rejects(f.service.respond(f.student(2), proposal_id, "cancel"), error => error.status === 403);
});

test("a decline or teacher cancellation keeps both originals even after one acceptance", async () => {
  for (const action of ["decline", "cancel"]) {
    const f = fixture(); const originals = structuredClone(f.state.classes);
    const { proposal_id } = await f.service.create(f.teacher, f.body);
    await f.service.respond(f.student(2), proposal_id, "accept");
    const result = await f.service.respond(action === "cancel" ? f.teacher : f.student(3), proposal_id, action);
    assert.equal(result.status, action === "cancel" ? "cancelled" : "declined");
    assert.deepEqual(f.state.classes, originals); assert.equal(f.state.sessions.length, 0);
  }
});

test("changed bookings, expired invitations, and changed contracts cannot convert", async () => {
  for (const change of ["booking", "expiry", "contract"]) {
    const f = fixture(); const { proposal_id } = await f.service.create(f.teacher, f.body);
    await f.service.respond(f.student(2), proposal_id, "accept");
    if (change === "booking") f.state.classes[0].start_time = "09:00";
    if (change === "expiry") f.state.proposals[0].expires_at = new Date(0);
    if (change === "contract") f.state.packages[0].status = "expired";
    const originals = structuredClone(f.state.classes);
    const result = await f.service.respond(f.student(3), proposal_id, "accept");
    assert.equal(result.status, change === "expiry" ? "expired" : "invalidated");
    assert.deepEqual(f.state.classes, originals); assert.equal(f.state.sessions.length, 0);
  }
});

test("availability, breaks, unrelated bookings and full lesson duration constrain shared times", async () => {
  const f = fixture();
  await assert.rejects(f.service.create(f.teacher, { ...f.body, start_time: "11:50" }), /conflicts/);
  await assert.rejects(f.service.create(f.teacher, { ...f.body, start_time: "17:50" }), /conflicts/);
  f.state.classes.push({ ...f.state.classes[0], class_id: 30, student_id: 4, start_time: "13:00" });
  await assert.rejects(f.service.create(f.teacher, { ...f.body, start_time: "12:50" }), /conflicts/);
  const options = await f.service.options(f.teacher, [10, 20], f.body.scheduled_date, "13:00");
  assert.equal(options.times.length, 3); assert(!options.times.includes("13:00"));
  assert(options.times.includes("12:30")); // The proposal may start when the teacher's break ends.
  assert(!options.times.includes("12:50")); // The 13:00 class still occupies its actual interval.
});

test("simultaneous approvals convert once; pending proposals cannot be duplicated", async () => {
  const f = fixture(); const { proposal_id } = await f.service.create(f.teacher, f.body);
  await assert.rejects(f.service.create(f.teacher, f.body), /pending group invitation/);
  const results = await Promise.all([f.service.respond(f.student(2), proposal_id, "accept"), f.service.respond(f.student(3), proposal_id, "accept")]);
  assert.deepEqual(results.map(result => result.status), ["pending", "approved"]);
  assert.equal(f.state.sessions.length, 1);
  await assert.rejects(f.service.respond(f.student(3), proposal_id, "accept"), /no longer pending/);
});

test("a failed final conversion rolls back both booking updates and can be retried", async () => {
  const f = fixture(); const originals = structuredClone(f.state.classes);
  const { proposal_id } = await f.service.create(f.teacher, f.body);
  await f.service.respond(f.student(2), proposal_id, "accept");
  f.setFail("UPDATE video_sessions");
  await assert.rejects(f.service.respond(f.student(3), proposal_id, "accept"), /Simulated/);
  assert.deepEqual(f.state.classes, originals); assert.equal(f.state.sessions.length, 0);
  assert.equal(f.state.proposals[0].status, "pending");
  f.setFail("");
  assert.equal((await f.service.respond(f.student(3), proposal_id, "accept")).status, "approved");
});

test("pending proposals reserve times and history hides the other student's original booking", async () => {
  const f = fixture(); await f.service.create(f.teacher, f.body);
  assert.equal(await groupHoldConflict(f.pool, { teacherId: 1, studentId: 9, date: f.body.scheduled_date, start: "10:00", duration: 25, instant: zonedWallClockToInstant }), true);
  assert.equal(await groupHoldConflict(f.pool, { teacherId: 1, studentId: 9, date: f.body.scheduled_date, start: "14:00", duration: 25, instant: zonedWallClockToInstant }), false);
  const { proposals } = await f.service.list(f.student(2));
  assert(proposals[0].members.find(member => member.student_id === 2).original_date);
  assert.equal(proposals[0].members.find(member => member.student_id === 3).original_date, undefined);
});

test("pair validation rejects different durations, students, teachers and started lessons", () => {
  const f = fixture();
  for (const changes of [{ duration: 50 }, { student_id: 2 }, { teacher_id: 9 }, { started: 1 }, { status: "completed" }]) {
    assert.throws(() => validateGroupPair([f.state.classes[0], { ...f.state.classes[1], ...changes }]));
  }
  const now = Date.now();
  assert.equal(groupExpiry(now, [now + 60 * 60_000]).getTime(), now + 45 * 60_000);
  assert(!intervalsConflict(100, 200, 200, 300));
  assert(intervalsConflict(100, 200, 199, 300));
});

test("an existing group moves only after both students approve another proposal", async () => {
  const f = fixture(); const first = await f.service.create(f.teacher, f.body);
  await f.service.respond(f.student(2), first.proposal_id, "accept");
  await f.service.respond(f.student(3), first.proposal_id, "accept");
  await assert.rejects(f.service.create(f.teacher, f.body), /conflicts/);
  const second = await f.service.create(f.teacher, { ...f.body, start_time: "14:00" });
  await f.service.respond(f.student(3), second.proposal_id, "accept");
  assert(f.state.classes.every(row => row.start_time === "10:00"));
  await f.service.respond(f.student(2), second.proposal_id, "accept");
  assert(f.state.classes.every(row => row.start_time === "14:00" && row.group_session_id === 2));
  assert.equal(f.state.sessions.length, 2); // The first shared session remains in audit history.
  const list = await f.service.list(f.student(2));
  assert.equal(list.proposals.length, 2);
});

test("invalid dates and times fail before touching the database", async () => {
  const f = fixture();
  for (const scheduled_date of ["2026-02-30", "2026-99-01", "invalid"]) {
    await assert.rejects(f.service.create(f.teacher, { ...f.body, scheduled_date }), error => error.status === 400);
  }
  await assert.rejects(f.service.options(f.teacher, [10, 20], f.body.scheduled_date, "25:00"), error => error.status === 400);
  assert.equal(f.queries.length, 0);
});

test("an unavailable group schema disables group routes without running feature queries", async () => {
  const handlers = new Map();
  const app = { get: (path, ...callbacks) => handlers.set(path, callbacks.at(-1)), post: (path, ...callbacks) => handlers.set(path, callbacks.at(-1)) };
  registerGroupClassRoutes(app, { requireSession() {}, service: {}, available: () => false });
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handlers.get("/api/calendar/group-class-proposals")({ session: { userId: 1, role: "teacher" } }, response);
  assert.equal(response.code, 503);
  assert.match(response.body.message, /Existing bookings are unchanged/);
});

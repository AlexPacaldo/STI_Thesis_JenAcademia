import { hasClassAttendance } from "./classSession.js";

// A group owns one shared session. Existing class IDs remain each student's
// participation/contract/attendance record, so historical references stay valid.
export class GroupClassError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
const fail = message => { throw new GroupClassError(message); };
const id = value => Number(value);
const dateKey = value => String(value || "").slice(0, 10);
const timeKey = value => String(value || "").slice(0, 5);
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
export function validateGroupPair(rows) {
  if (rows.length !== 2 || new Set(rows.map(row => id(row.class_id))).size !== 2) fail("Choose two existing classes.");
  if (id(rows[0].teacher_id) !== id(rows[1].teacher_id)) fail("Both classes must have the same teacher.");
  if (id(rows[0].student_id) === id(rows[1].student_id)) fail("Choose classes belonging to two different students.");
  if (![25, 50].includes(id(rows[0].duration)) || id(rows[0].duration) !== id(rows[1].duration)) fail("Both classes must have the same duration.");
  if (String(rows[0].class_name).trim().toLowerCase() !== String(rows[1].class_name).trim().toLowerCase()) fail("Both classes must be for the same course.");
  if (rows.some(row => row.status !== "scheduled" || row.started || hasClassAttendance(row))) fail("Only scheduled classes that have not started can be grouped.");
  if (rows.some(row => row.group_session_id) && (!rows[0].group_session_id || id(rows[0].group_session_id) !== id(rows[1].group_session_id))) fail("An existing group can only be moved with its original participants.");
}
export function unchangedBooking(row, member) {
  return id(row?.class_id) === id(member.class_id) && id(row?.teacher_id) === id(member.teacher_id)
    && id(row?.student_id) === id(member.student_id) && row.status === "scheduled" && !row.started && !hasClassAttendance(row)
    && dateKey(row.scheduled_date) === dateKey(member.original_date)
    && timeKey(row.start_time) === timeKey(member.original_time)
    && id(row.duration) === id(member.duration)
    && String(row.class_name) === String(member.original_name)
    && id(row.group_session_id || 0) === id(member.original_group_session_id || 0);
}
export function groupExpiry(now, starts) {
  return new Date(Math.min(now + 24 * 60 * 60_000, ...starts.map(start => start - 15 * 60_000)));
}
export function intervalsConflict(start, end, busyStart, busyEnd) {
  return start < busyEnd && end > busyStart;
}

// Invalidate a pending proposal when any original booking changes or starts.
const validOriginalsSql = `NOT EXISTS (
  SELECT 1 FROM group_class_proposal_members gm JOIN classes gc ON gc.class_id = gm.class_id
  LEFT JOIN class_attendance_logs gl ON gl.class_id = gc.class_id
  WHERE gm.proposal_id = gp.proposal_id AND (
    gc.status <> 'scheduled' OR gc.scheduled_date <> gm.original_date
    OR gc.start_time <> gm.original_time OR gc.duration <> gm.duration
    OR gc.class_name <> gm.original_name
    OR COALESCE(gc.group_session_id, 0) <> COALESCE(gm.original_group_session_id, 0)
    OR gl.teacher_started_at IS NOT NULL OR gl.student_joined_at IS NOT NULL))`;

export async function ensureGroupClassSchema(db, columnExists) {
  await db.query(`CREATE TABLE IF NOT EXISTS group_class_sessions (
    group_session_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL, scheduled_date DATE NOT NULL, start_time TIME NOT NULL,
    duration INT NOT NULL, class_link TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_group_teacher (teacher_id, scheduled_date))`);
  if (!(await columnExists("classes", "group_session_id"))) {
    await db.query("ALTER TABLE classes ADD COLUMN group_session_id INT NULL, ADD INDEX idx_class_group_session (group_session_id)");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS group_class_proposals (
    proposal_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, teacher_id INT NOT NULL,
    scheduled_date DATE NOT NULL, start_time TIME NOT NULL, duration INT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending', expires_at DATETIME NOT NULL,
    group_session_id INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL, KEY idx_group_proposal_teacher (teacher_id, status, expires_at))`);
  await db.query(`CREATE TABLE IF NOT EXISTS group_class_proposal_members (
    proposal_id INT NOT NULL, class_id INT NOT NULL, teacher_id INT NOT NULL,
    student_id INT NOT NULL, package_id INT NOT NULL, original_name VARCHAR(255) NOT NULL,
    original_date DATE NOT NULL, original_time TIME NOT NULL, duration INT NOT NULL,
    original_group_session_id INT NULL, response VARCHAR(16) NOT NULL DEFAULT 'pending',
    responded_at DATETIME NULL, PRIMARY KEY (proposal_id, student_id),
    UNIQUE KEY unique_group_proposal_class (proposal_id, class_id),
    KEY idx_group_member_class (class_id), KEY idx_group_member_student (student_id))`);
}

export function createGroupClassService({ pool, instant, encrypt, meetingLink, broadcast }) {
  const moment = (date, time, timezone) => new Date(instant(dateKey(date), timeKey(time), timezone || "Asia/Manila")).getTime();
  const run = async work => {
    const db = await pool.getConnection();
    try { await db.beginTransaction(); const result = await work(db); await db.commit(); return result; }
    catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  };
  const classes = async (db, classIds, lock = false) => {
    const [rows] = await db.query(`SELECT c.*, DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
      TIME_FORMAT(c.start_time, '%H:%i') AS start_time, u.timezone AS teacher_timezone,
      EXISTS(SELECT 1 FROM class_attendance_logs cal WHERE cal.class_id = c.class_id
        AND (cal.teacher_started_at IS NOT NULL OR cal.student_joined_at IS NOT NULL)) AS started
      FROM classes c JOIN users u ON u.user_id = c.teacher_id
      WHERE c.class_id IN (?) ORDER BY c.class_id ${lock ? "FOR UPDATE" : ""}`, [classIds]);
    return rows;
  };
  const lockPeople = async (db, rows) => {
    const people = [...new Set(rows.flatMap(row => [id(row.teacher_id), id(row.student_id)]))].sort((a, b) => a - b);
    const [users] = await db.query(`SELECT user_id, role, status, profile_completed FROM users
      WHERE user_id IN (?) ORDER BY user_id FOR UPDATE`, [people]);
    if (users.length !== people.length || users.some(user => user.status !== "active" || !user.profile_completed)) fail("All participants must have active, complete accounts.");
  };
  const authorizeTeacher = (actor, rows) => {
    if (actor.role !== "teacher" || rows.some(row => id(row.teacher_id) !== id(actor.userId))) throw new GroupClassError("Only the assigned teacher can propose a group class.", 403);
  };
  async function members(db, proposalId, lock = false) {
    const [rows] = await db.query(`SELECT gm.*, DATE_FORMAT(gm.original_date, '%Y-%m-%d') AS original_date,
      TIME_FORMAT(gm.original_time, '%H:%i') AS original_time, u.first_name AS student_name
      FROM group_class_proposal_members gm JOIN users u ON u.user_id = gm.student_id
      WHERE proposal_id = ? ORDER BY student_id ${lock ? "FOR UPDATE" : ""}`, [proposalId]);
    return rows;
  }
  async function notify(db, userIds, title, message, proposalId) {
    for (const userId of new Set(userIds)) await db.query(`INSERT INTO notifications
      (user_id, type, title, message, related_id, related_type, action_url)
      VALUES (?, 'general', ?, ?, ?, 'group_class_proposal', '/Calendar')`,
    [userId, encrypt(title), encrypt(message), proposalId]);
  }
  async function contracts(db, rows, targetStart, targetEnd, snapshots = null) {
    const ids = rows.map(row => id(row.student_id));
    const [packages] = await db.query(`SELECT package_id, student_id, class_duration, created_at, expires_at, classes_left
      FROM student_class_packages WHERE student_id IN (?) AND status = 'active'
      ORDER BY student_id, created_at DESC FOR UPDATE`, [ids]);
    const selected = rows.map(row => {
      const current = packages.find(pkg => id(pkg.student_id) === id(row.student_id));
      if (!current || id(current.class_duration) !== id(row.duration) || id(current.classes_left) <= 0
        || new Date(current.created_at).getTime() > new Date(row.created_at).getTime()
        || (current.expires_at && targetEnd > new Date(current.expires_at).getTime())
        || (snapshots && !snapshots.some(member => id(member.student_id) === id(row.student_id) && id(member.package_id) === id(current.package_id)))) {
        fail("Each student's original contract must still cover this class and the proposed time.");
      }
      return current;
    });
    if (!Number.isFinite(targetStart) || targetStart <= Date.now()) fail("Choose a future class time.");
    return selected;
  }
  async function scheduleContext(db, rows, date, excludeProposalId = 0) {
    const teacherId = rows[0].teacher_id;
    const studentIds = rows.map(row => row.student_id);
    const [availability] = await db.query(`SELECT * FROM teacher_availability WHERE teacher_id = ? AND available_date = ? LIMIT 1 FOR UPDATE`, [teacherId, date]);
    const [busy] = await db.query(`SELECT c.*, DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
      TIME_FORMAT(c.start_time, '%H:%i') AS start_time, u.timezone AS teacher_timezone
      FROM classes c JOIN users u ON u.user_id = c.teacher_id
      WHERE c.status = 'scheduled' AND c.class_id NOT IN (?)
      AND (c.teacher_id = ? OR c.student_id IN (?))
      AND c.scheduled_date BETWEEN DATE_SUB(?, INTERVAL 1 DAY) AND DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY c.class_id FOR UPDATE`, [rows.map(row => row.class_id), teacherId, studentIds, date, date]);
    const [holds] = await db.query(`SELECT gp.*, DATE_FORMAT(gp.scheduled_date, '%Y-%m-%d') AS scheduled_date,
      TIME_FORMAT(gp.start_time, '%H:%i') AS start_time, u.timezone AS teacher_timezone
      FROM group_class_proposals gp JOIN users u ON u.user_id = gp.teacher_id
      WHERE gp.status = 'pending' AND gp.expires_at > NOW() AND gp.proposal_id <> ?
      AND (gp.teacher_id = ? OR EXISTS (SELECT 1 FROM group_class_proposal_members gm
        WHERE gm.proposal_id = gp.proposal_id AND gm.student_id IN (?))) AND ${validOriginalsSql} FOR UPDATE`,
    [excludeProposalId, teacherId, studentIds]);
    return { availability: availability[0], busy: [...busy, ...holds] };
  }
  function checkTime(rows, date, time, context) {
    if (rows.every(row => row.group_session_id && dateKey(row.scheduled_date) === date && timeKey(row.start_time) === time)) return false;
    const timezone = rows[0].teacher_timezone;
    const start = moment(date, time, timezone);
    const end = start + id(rows[0].duration) * 60_000;
    const available = context.availability;
    if (!Number.isFinite(start) || start <= Date.now() + 16 * 60_000) return false;
    if (!available || available.status !== "available" || !available.start_time || !available.end_time) return false;
    if (start < moment(date, available.start_time, timezone) || end > moment(date, available.end_time, timezone)) return false;
    if (available.break_start && available.break_end && intervalsConflict(start, end,
      moment(date, available.break_start, timezone), moment(date, available.break_end, timezone))) return false;
    return !context.busy.some(busy => {
      const busyStart = moment(busy.scheduled_date, busy.start_time, busy.teacher_timezone);
      return intervalsConflict(start, end, busyStart, busyStart + id(busy.duration) * 60_000);
    });
  }
  async function prepare(db, actor, classIds) {
    if (!Array.isArray(classIds) || classIds.length !== 2 || classIds.some(value => !Number.isSafeInteger(id(value)) || id(value) <= 0)) fail("Choose two existing classes.");
    const preliminary = await classes(db, classIds);
    if (preliminary.length !== 2) fail("One of the selected classes is no longer available.");
    authorizeTeacher(actor, preliminary);
    await lockPeople(db, preliminary);
    const rows = await classes(db, classIds, true);
    validateGroupPair(rows);
    if (rows.some(row => moment(row.scheduled_date, row.start_time, row.teacher_timezone) <= Date.now() + 16 * 60_000)) fail("There is not enough time for both students to respond before class. Choose later bookings.");
    return rows;
  }
  return {
    async candidates(actor, classId) {
      const rows = await classes(pool, [classId]);
      if (!rows.length) throw new GroupClassError("Class not found.", 404);
      authorizeTeacher(actor, rows);
      const [candidates] = await pool.query(`SELECT c.class_id, c.student_id, c.class_name, c.duration,
        c.group_session_id, DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
        TIME_FORMAT(c.start_time, '%H:%i') AS start_time, u.first_name AS student_name
        FROM classes c JOIN users u ON u.user_id = c.student_id
        WHERE c.teacher_id = ? AND c.student_id <> ? AND c.duration = ? AND c.class_name = ?
        AND c.status = 'scheduled' AND c.scheduled_date >= CURDATE()
        AND ((? IS NULL AND c.group_session_id IS NULL) OR c.group_session_id = ?)
        AND NOT EXISTS (SELECT 1 FROM class_attendance_logs cal WHERE cal.class_id = c.class_id AND (cal.teacher_started_at IS NOT NULL OR cal.student_joined_at IS NOT NULL))
        ORDER BY c.scheduled_date, c.start_time LIMIT 100`,
      [rows[0].teacher_id, rows[0].student_id, rows[0].duration, rows[0].class_name, rows[0].group_session_id || null, rows[0].group_session_id || null]);
      return { candidates: candidates.filter(candidate => moment(candidate.scheduled_date, candidate.start_time, rows[0].teacher_timezone) > Date.now() + 16 * 60_000), teacher_timezone: rows[0].teacher_timezone };
    },
    async options(actor, classIds, date, preferred) {
      if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(preferred))) throw new GroupClassError("Enter a valid date and preferred start time.", 400);
      return run(async db => {
        const rows = await prepare(db, actor, classIds);
        const packages = await contracts(db, rows, Date.now() + 60_000, Date.now() + 60_000);
        const context = await scheduleContext(db, rows, date);
        const minute = time => { const [h, m] = timeKey(time).split(":").map(Number); return h * 60 + m; };
        const target = minute(preferred);
        if (!Number.isFinite(target)) fail("Enter a preferred start time.");
        const candidates = new Set([target]);
        for (let start = 0; start < 1440; start += 5) candidates.add(start);
        const options = [...candidates].map(start => `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`)
          .filter(time => checkTime(rows, date, time, context))
          .filter(time => packages.every(pkg => !pkg.expires_at || moment(date, time, rows[0].teacher_timezone) + id(rows[0].duration) * 60_000 <= new Date(pkg.expires_at).getTime()))
          .sort((a, b) => Math.abs(minute(a) - target) - Math.abs(minute(b) - target) || minute(a) - minute(b));
        return { times: options.slice(0, 3) };
      });
    },
    async create(actor, body) {
      if (!validDate(body.scheduled_date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.start_time))) throw new GroupClassError("Enter a valid date and start time.", 400);
      return run(async db => {
        const rows = await prepare(db, actor, body.class_ids);
        const date = dateKey(body.scheduled_date), time = timeKey(body.start_time);
        const start = moment(date, time, rows[0].teacher_timezone);
        const end = start + id(rows[0].duration) * 60_000;
        const packages = await contracts(db, rows, start, end);
        const [existing] = await db.query(`SELECT gm.proposal_id FROM group_class_proposal_members gm
          JOIN group_class_proposals gp ON gp.proposal_id = gm.proposal_id
          WHERE gm.class_id IN (?) AND gp.status = 'pending' AND gp.expires_at > NOW()
          AND ${validOriginalsSql} LIMIT 1 FOR UPDATE`, [rows.map(row => row.class_id)]);
        if (existing.length) fail("One of these classes already has a pending group invitation. Cancel it first.");
        const context = await scheduleContext(db, rows, date);
        if (!checkTime(rows, date, time, context)) fail("That time conflicts with availability, a break, or another booking. Find another time.");
        const expires = groupExpiry(Date.now(), [start, ...rows.map(row => moment(row.scheduled_date, row.start_time, row.teacher_timezone))]);
        if (expires.getTime() <= Date.now() + 60_000) fail("There is not enough time for both students to respond before class. Choose later bookings.");
        const [proposal] = await db.query(`INSERT INTO group_class_proposals
          (teacher_id, scheduled_date, start_time, duration, expires_at) VALUES (?, ?, ?, ?, ?)`,
        [rows[0].teacher_id, date, time, rows[0].duration, expires]);
        for (const row of rows) await db.query(`INSERT INTO group_class_proposal_members
          (proposal_id, class_id, teacher_id, student_id, package_id, original_name, original_date, original_time, duration, original_group_session_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [proposal.insertId, row.class_id, row.teacher_id, row.student_id,
          packages.find(pkg => id(pkg.student_id) === id(row.student_id)).package_id, row.class_name,
          row.scheduled_date, row.start_time, row.duration, row.group_session_id || null]);
        await notify(db, rows.map(row => row.student_id), "Group class invitation", "Your teacher proposed a group class. Review the invitation in Calendar. Your original booking stays reserved until everyone accepts.", proposal.insertId);
        return { proposal_id: proposal.insertId, expires_at: expires, participants: [actor.userId, ...rows.map(row => row.student_id)] };
      }).then(({ participants, ...result }) => { broadcast(participants, "group-proposal-changed"); return result; });
    },
    async list(actor) {
      // Derive stale/expired states without a global UPDATE during polling.
      // This avoids taking unrelated teachers' proposal locks on every refresh.
      const [rows] = await pool.query(`SELECT gp.*,
        CASE WHEN gp.status = 'pending' AND gp.expires_at <= NOW() THEN 'expired'
          WHEN gp.status = 'pending' AND NOT (${validOriginalsSql}) THEN 'invalidated'
          ELSE gp.status END AS status, DATE_FORMAT(gp.scheduled_date, '%Y-%m-%d') AS scheduled_date,
        TIME_FORMAT(gp.start_time, '%H:%i') AS start_time, u.timezone AS teacher_timezone,
        u.first_name AS teacher_name FROM group_class_proposals gp JOIN users u ON u.user_id = gp.teacher_id
        WHERE gp.teacher_id = ? OR EXISTS(SELECT 1 FROM group_class_proposal_members gm
          WHERE gm.proposal_id = gp.proposal_id AND gm.student_id = ?)
        ORDER BY gp.created_at DESC LIMIT 50`, [actor.userId, actor.userId]);
      for (const row of rows) {
        const people = await members(pool, row.proposal_id);
        row.class_name = people[0]?.original_name || "Group class";
        row.members = people.map(person => ({ student_id: person.student_id, student_name: person.student_name,
          response: person.response, ...(id(person.student_id) === id(actor.userId) || id(row.teacher_id) === id(actor.userId)
            ? { class_id: person.class_id, original_date: person.original_date, original_time: person.original_time } : {}) }));
      }
      return { proposals: rows };
    },
    async respond(actor, proposalId, action) {
      if (!["accept", "decline", "cancel"].includes(action)) throw new GroupClassError("Choose a valid response.", 400);
      const result = await run(async db => {
        const people = await members(db, proposalId);
        if (!people.length) throw new GroupClassError("Invitation not found.", 404);
        if (action === "cancel" ? actor.role !== "teacher" || id(people[0].teacher_id) !== id(actor.userId)
          : actor.role !== "student" || !people.some(person => id(person.student_id) === id(actor.userId))) throw new GroupClassError("You cannot respond to this invitation.", 403);
        await lockPeople(db, people);
        const [proposals] = await db.query("SELECT *, DATE_FORMAT(scheduled_date, '%Y-%m-%d') AS scheduled_date, TIME_FORMAT(start_time, '%H:%i') AS start_time FROM group_class_proposals WHERE proposal_id = ? FOR UPDATE", [proposalId]);
        const proposal = proposals[0];
        if (!proposal || proposal.status !== "pending") fail("This invitation is no longer pending. Refresh your calendar.");
        const rows = await classes(db, people.map(person => person.class_id), true);
        const participants = [proposal.teacher_id, ...people.map(person => person.student_id)];
        const close = async (status, message) => {
          await db.query("UPDATE group_class_proposals SET status = ?, resolved_at = NOW() WHERE proposal_id = ?", [status, proposalId]);
          await notify(db, participants, "Group invitation updated", message, proposalId);
          return { status, message, participants };
        };
        if (new Date(proposal.expires_at).getTime() <= Date.now()) return close("expired", "The group invitation expired. Original bookings were kept.");
        if (action === "cancel" || action === "decline") return close(action === "cancel" ? "cancelled" : "declined", "The group invitation was closed. Original bookings were kept.");
        if (rows.length !== 2 || rows.some(row => !people.some(person => unchangedBooking(row, person)))) return close("invalidated", "An original booking changed. The teacher must send a new invitation.");
        await db.query("UPDATE group_class_proposal_members SET response = 'accepted', responded_at = COALESCE(responded_at, NOW()) WHERE proposal_id = ? AND student_id = ?", [proposalId, actor.userId]);
        const updated = await members(db, proposalId, true);
        if (!updated.every(person => person.response === "accepted")) return { status: "pending", message: "Accepted. Waiting for the other student. Your original booking is still reserved.", participants };
        try {
          validateGroupPair(rows);
          const start = moment(proposal.scheduled_date, proposal.start_time, rows[0].teacher_timezone);
          await contracts(db, rows, start, start + id(proposal.duration) * 60_000, people);
          const context = await scheduleContext(db, rows, proposal.scheduled_date, proposalId);
          if (!checkTime(rows, proposal.scheduled_date, proposal.start_time, context)) fail("The proposed time is no longer available.");
        } catch (error) {
          if (!(error instanceof GroupClassError)) throw error;
          return close("invalidated", `${error.message} Original bookings were kept. Ask the teacher for a new invitation.`);
        }
        const link = meetingLink({ className: "Group class", scheduledDate: proposal.scheduled_date,
          startTime: proposal.start_time, teacherId: proposal.teacher_id, studentId: `group-${proposalId}` });
        const [session] = await db.query(`INSERT INTO group_class_sessions (teacher_id, scheduled_date, start_time, duration, class_link) VALUES (?, ?, ?, ?, ?)`,
          [proposal.teacher_id, proposal.scheduled_date, proposal.start_time, proposal.duration, encrypt(link)]);
        const [hour, minute] = timeKey(proposal.start_time).split(":").map(Number);
        const endMinutes = hour * 60 + minute + id(proposal.duration);
        const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}:00`;
        await db.query(`UPDATE classes SET scheduled_date = ?, start_time = ?, end_time = ?, class_link = ?, group_session_id = ? WHERE class_id IN (?)`,
          [proposal.scheduled_date, proposal.start_time, end, encrypt(link), session.insertId, rows.map(row => row.class_id)]);
        await db.query("UPDATE video_sessions SET teams_meeting_link = ? WHERE class_id IN (?)", [encrypt(link), rows.map(row => row.class_id)]);
        await db.query("UPDATE reschedule_requests SET status = 'cancelled', resolved_at = NOW() WHERE class_id IN (?) AND status = 'pending'", [rows.map(row => row.class_id)]);
        await db.query("UPDATE group_class_proposals SET status = 'approved', resolved_at = NOW(), group_session_id = ? WHERE proposal_id = ?", [session.insertId, proposalId]);
        await notify(db, participants, "Group class confirmed", "Both students accepted. Calendar now shows your shared group class. Each student's existing class allowance was kept; no extra class was charged.", proposalId);
        return { status: "approved", message: "Both students accepted. The group class is confirmed.", participants };
      });
      broadcast(result.participants, "group-proposal-changed");
      return result;
    },
  };
}

// Pending proposals reserve their proposed interval for the teacher and both
// students. Query scope is provided by authenticated calendar routes only.
export async function groupProposalHolds(db, { teacherId, studentId, date, lock = false }) {
  const [rows] = await db.query(`SELECT gp.proposal_id, gp.teacher_id, gp.duration,
    DATE_FORMAT(gp.scheduled_date, '%Y-%m-%d') AS scheduled_date,
    TIME_FORMAT(gp.start_time, '%H:%i') AS start_time, u.timezone AS teacher_timezone
    FROM group_class_proposals gp JOIN users u ON u.user_id = gp.teacher_id
    WHERE gp.status = 'pending' AND gp.expires_at > NOW()
    AND (? IS NULL OR gp.scheduled_date = ?)
    AND (gp.teacher_id = ? OR EXISTS(SELECT 1 FROM group_class_proposal_members gm
      WHERE gm.proposal_id = gp.proposal_id AND gm.student_id = ?)) AND ${validOriginalsSql} ${lock ? "FOR UPDATE" : ""}`,
  [date || null, date || null, teacherId || 0, studentId || 0]);
  return rows.map(row => ({ ...row, class_id: `group-hold-${row.proposal_id}`, student_id: studentId || 0,
    class_name: "Reserved for a group invitation", status: "scheduled", is_group_hold: true }));
}

export async function groupHoldConflict(db, { teacherId, studentId, date, start, duration, instant }) {
  const holds = await groupProposalHolds(db, { teacherId, studentId, lock: true });
  if (!holds.length) return false;
  const [teachers] = await db.query("SELECT timezone FROM users WHERE user_id = ?", [teacherId]);
  const proposed = new Date(instant(date, timeKey(start), teachers[0]?.timezone || "Asia/Manila")).getTime();
  return holds.some(hold => {
    const held = new Date(instant(hold.scheduled_date, hold.start_time, hold.teacher_timezone || "Asia/Manila")).getTime();
    return intervalsConflict(proposed, proposed + id(duration) * 60_000, held, held + id(hold.duration) * 60_000);
  });
}

export async function groupClassPeers(db, classId) {
  const [rows] = await db.query(`SELECT peer.class_id, peer.teacher_id, peer.student_id, peer.duration
    FROM classes source JOIN classes peer ON peer.group_session_id = source.group_session_id
    WHERE source.class_id = ? AND source.group_session_id IS NOT NULL
    AND peer.class_id <> source.class_id AND peer.status = 'scheduled'`, [classId]);
  return rows;
}

export function registerGroupClassRoutes(app, { requireSession, service, available = () => true }) {
  const route = work => async (req, res) => {
    try {
      if (!available()) throw new GroupClassError("Group invitations are temporarily unavailable. Existing bookings are unchanged.", 503);
      res.json(await work(req));
    }
    catch (error) { if (!(error instanceof GroupClassError)) console.error("Group class request failed:", error); res.status(error.status || 500).json({ message: error.status ? error.message : "Unable to update the group invitation. Please retry." }); }
  };
  app.get("/api/calendar/group-class-candidates/:class_id", requireSession, route(req => service.candidates(req.session, id(req.params.class_id))));
  app.get("/api/calendar/group-class-proposals", requireSession, route(req => service.list(req.session)));
  app.post("/api/calendar/group-class-options", requireSession, route(req => service.options(req.session, req.body.class_ids, req.body.scheduled_date, req.body.preferred_time)));
  app.post("/api/calendar/group-class-proposals", requireSession, route(req => service.create(req.session, req.body)));
  app.post("/api/calendar/group-class-proposals/:proposal_id/respond", requireSession, route(req => service.respond(req.session, id(req.params.proposal_id), req.body.action)));
}

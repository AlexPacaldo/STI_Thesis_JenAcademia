/**
 * Give the demo student's teacher availability across the whole plan.
 *
 *   node scripts/seed-student-teacher-availability.mjs
 *
 * !! The demo student's plan runs for three months, and the student's booking
 * !! screen shows every day of it. A teacher who has only marked the next
 * !! fortnight free leaves that screen showing a fortnight - which reads as
 * !! "the student can only book two weeks ahead" when the truth is "the
 * !! teacher has not said otherwise yet".
 * !!
 * !! So this marks the teacher's days across the student's plan. It goes
 * !! through the app's own endpoint as the teacher, so the rows are exactly
 * !! what the teacher's own availability manager writes, the days with a
 * !! booked class are skipped, the days outside the booking window are
 * !! skipped, and the students who are waiting on that teacher are told.
 *
 * It is safe to run more than once.
 *
 * @param {string} [studentEmail] the demo student whose teacher is topped up
 * @param {string} [teacherEmail] the teacher to top up
 * @param {string} [apiBase] where the server is
 */

const API_BASE = process.env.API_BASE_URL || "http://localhost:3001";
const PASSWORD = process.env.DEMO_PASSWORD || "JEN2026!";

const STUDENT_EMAIL = process.env.DEMO_STUDENT_EMAIL || "AlexPacaldo@gmail.com";
const TEACHER_EMAIL = process.env.DEMO_TEACHER_EMAIL || "RichardSantos@gmail.com";

/** The days of the week the demo teacher works: Tuesday, Thursday, Saturday. */
const WEEKDAYS = [2, 4, 6];

/** The hours the demo teacher works. */
const START_TIME = "09:00";
const END_TIME = "17:00";

/**
 * The months a student's plan covers, from this month to the month the plan
 * ends in.
 *
 * The teacher's own availability may go a little past the plan - the plan is
 * the student's limit, not the teacher's - and the extra days are simply
 * never offered to a student whose plan does not reach them.
 */
function monthsForPlan(planEndsAt) {
  const start = new Date();
  const months = [];

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = planEndsAt ? new Date(planEndsAt) : new Date(start.getFullYear(), start.getMonth() + 3, 1);

  for (let i = 0; i < 24; i += 1) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
    if (cursor.getFullYear() > end.getFullYear() || (cursor.getFullYear() === end.getFullYear() && cursor.getMonth() > end.getMonth())) {
      break;
    }
  }

  return months;
}

async function login(email) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data?.token) throw new Error(`Could not sign in as ${email}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.token;
}

async function get(path, token) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const studentToken = await login(STUDENT_EMAIL);
const student = await get("/api/student/profile/122", studentToken);
const teacherId = student?.profile?.assigned_teacher_id;

if (!teacherId) {
  console.log("No teacher is assigned to this student, so there is nothing to do.");
  process.exit(0);
}

const teacherToken = await login(TEACHER_EMAIL);
const plan = await get(`/api/calendar/student-package/122`, studentToken);
const planEndsAt = plan?.package?.expires_at || null;

console.log(`Teacher ${teacherId} (${TEACHER_EMAIL})`);
console.log(`The student's plan ends on ${planEndsAt || "(no plan)"}`);

let saved = 0;
for (const { year, month } of monthsForPlan(planEndsAt)) {
  const res = await fetch(`${API_BASE}/api/calendar/set-availability-bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${teacherToken}` },
    body: JSON.stringify({
      teacher_id: teacherId,
      year,
      month,
      weekdays: WEEKDAYS,
      status: "available",
      start_time: START_TIME,
      end_time: END_TIME,
    }),
  });
  const data = await res.json();
  const count = (data?.saved_dates || []).length;
  saved += count;
  console.log(`  ${year}-${String(month).padStart(2, "0")}: ${count} days`);
}

console.log(`Done. ${saved} days are now open across the student's plan.`);

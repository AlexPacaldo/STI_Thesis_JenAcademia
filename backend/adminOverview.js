// adminOverview.js
/**
 * The single read behind the admin Overview tab.
 *
 * !! Why one endpoint instead of the frontend stitching eight requests together.
 * !!
 * !! The admin's first screen has to answer "what is going on right now, and what
 * !! is waiting for me?" Every one of those answers came from a different admin
 * !! route (reschedule requests, contract requests, class verifications, the
 * !! contracts tab, the calendar). Firing them all from the browser meant eight
 * !! round trips before the page was trustworthy, eight independent loading flags,
 * !! and - the actual bug - a number on screen that belonged to a moment the other
 * !! numbers did not. A reschedule approved while the page was loading left the
 * !! card showing "3 pending" next to a contract count already at zero.
 * !!
 * !! One query batch, one snapshot, one response. Nothing here can disagree with
 * !! anything else in the payload because it was all read at the same instant.
 *
 * !! Kept out of server.js for the same reason dbConfig.js and contractTerms.js
 * !! are: this is logic worth testing, and it needs a database connection only to
 * !! run, not to understand. The pure helpers below (buildTrendSeries,
 * !! countByStatus, buildAttentionList) are exported and covered by
 * !! adminOverview.test.js with no database at all.
 */

import { CONTRACT_EXPIRY_WARNING_DAYS } from "./contractTerms.js";

/** Days of class history behind the trend bars. */
export const OVERVIEW_TREND_DAYS = 7;

/** How far ahead the "next 7 days" figure looks. */
export const OVERVIEW_UPCOMING_DAYS = 7;

/**
 * Classes left at or below this counts as "running low".
 *
 * Two is the point where a student with a weekly lesson can still finish their
 * package; one is a single missed class from running out mid-term. Chosen so the
 * number means something, not because it is a round figure.
 */
export const OVERVIEW_LOW_BALANCE_THRESHOLD = 2;

/** Cap on the small "who needs this" lists. */
export const OVERVIEW_LIST_LIMIT = 6;

/** The statuses `classes.status` can hold, in the order the UI shows them. */
const CLASS_STATUSES = ["scheduled", "completed", "cancelled", "no-show"];

/**
 * A day with nothing recorded in it.
 *
 * The trend is drawn from real rows, and a day with no classes produces no row at
 * all - which would silently shorten the chart and leave the admin comparing a
 * six-bar week against a seven-day label. Every day gets a zeroed slot first, so
 * the series is always exactly as long as the window it covers.
 */
export function emptyDayCounts() {
  return { scheduled: 0, completed: 0, cancelled: 0, noShow: 0, total: 0 };
}

/**
 * Normalise whatever the driver produced for a DATE column into "YYYY-MM-DD".
 *
 * !! mysql2 does not hand back a string for a DATE column - it builds a
 * !! JavaScript Date. String()ing one gives "Fri Oct 16 2026 00:00:00 GMT+0800",
 * !! whose first ten characters are "Fri Oct 16": not a date, not sortable, and
 * !! indistinguishable from a real value at a glance. Truncating one and moving
 * !! on put three future days on the chart and shuffled it out of order, and the
 * !! array still looked completely well-formed.
 * !!
 * !! The trend query formats with DATE_FORMAT so this is a guard rather than the
 * !! main path - but a guard that keeps a later simplification of that query
 * !! honest is worth more than the two lines it costs.
 */
export function toIsoDay(value) {
  if (value == null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim().slice(0, 10);
    // Only a real YYYY-MM-DD is passed through. Returning any ten characters would
    // let a malformed value become a chart key, and the chart would then draw a
    // perfectly ordinary-looking bar for a day that does not exist.
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
  }
  if (value instanceof Date) {
    // The driver constructs DATE columns in local time, so the local parts are the
    // ones that agree with what MySQL stored. Reading UTC parts instead would
    // shift the day backwards for everyone west of Greenwich.
    if (Number.isNaN(value.getTime())) return "";
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return "";
}

/**
 * One row per (date, status) -> one ordered day per date.
 *
 * Dates come from the rows themselves, so this function only guarantees that
 * every date the query reported is present exactly once and in order - it does
 * not invent days it was never told about. That is enough, because the trend
 * query is a recursive CTE over a LEFT JOIN: MySQL emits at least one row per
 * date in the window even when the day has no classes, with a NULL status and a
 * zero count. The test spells that contract out.
 *
 * Counts are matched by key rather than by position because GROUP BY results are
 * grouped, not sorted, unless ORDER BY says otherwise, and because the CTE emits
 * the days in date order while the statuses within a day are in no guaranteed
 * order at all. Reading them positionally is how a chart ends up drawing a day's
 * cancelled classes in the colour meant for completed ones.
 */
export function buildTrendSeries(rows) {
  const days = rows.map((row) => toIsoDay(row.day));
  const dates = [...new Set(days)].sort();
  const byDate = new Map(dates.map((date) => [date, { date, ...emptyDayCounts() }]));

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const day = byDate.get(days[i]);
    if (!day) continue;

    // "no-show" is not a valid identifier, so it is mapped rather than used raw.
    const key = row.status === "no-show" ? "noShow" : row.status;
    if (!Object.prototype.hasOwnProperty.call(day, key)) continue;

    const count = Number(row.class_count || 0);
    if (!Number.isFinite(count)) continue;

    day[key] += count;
    day.total += count;
  }

  return dates.map((date) => byDate.get(date));
}

/**
 * Turn one row per status into a complete count object.
 *
 * Missing statuses become 0 rather than undefined, so a template can read them
 * without a guard on every one.
 */
export function countByStatus(rows, statuses = CLASS_STATUSES) {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  for (const row of rows) {
    const status = String(row.status || "");
    if (!Object.prototype.hasOwnProperty.call(counts, status)) continue;
    counts[status] = Number(row.total || 0) || 0;
  }
  return counts;
}

/**
 * The "Needs attention" list, worst news first.
 *
 * Each item points at the admin tab that resolves it, so the dashboard is a way
 * into the work rather than a report about it. `severity` is what the tile is
 * tinted with: `high` for anything a student is waiting on, `medium` for anything
 * only the admin can clear.
 *
 * Exported because the ordering - the actual decision - is worth testing without
 * a database.
 */
export function buildAttentionList(attention) {
  const items = [
    {
      key: "rescheduleRequests",
      label: "Reschedule requests",
      count: attention.rescheduleRequests,
      tab: "requests",
      severity: "high",
      hint: "Students waiting to move or cancel a class.",
    },
    {
      key: "contractRequests",
      label: "Contract requests",
      count: attention.contractRequests,
      tab: "contracts",
      severity: "high",
      hint: "New packages waiting for a decision.",
    },
    {
      key: "classVerifications",
      label: "Classes to verify",
      count: attention.classVerifications,
      tab: "verifications",
      severity: "high",
      hint: "Past classes with no attendance evidence yet.",
    },
    {
      key: "studentsWithoutTeacher",
      label: "Students with no teacher",
      count: attention.studentsWithoutTeacher,
      tab: "teacherCourses",
      severity: "high",
      hint: "Nobody is assigned to teach them yet.",
    },
    {
      key: "expiringContracts",
      label: "Contracts expiring soon",
      count: attention.expiringContracts,
      tab: "contracts",
      severity: "medium",
      hint: `Within ${CONTRACT_EXPIRY_WARNING_DAYS} days.`,
    },
    {
      key: "studentsWithoutActiveContract",
      label: "Students with no active contract",
      count: attention.studentsWithoutActiveContract,
      tab: "contracts",
      severity: "medium",
      hint: "They cannot book a class until one exists.",
    },
    {
      key: "incompleteProfiles",
      label: "Profiles not finished",
      count: attention.incompleteProfiles,
      tab: "archive",
      severity: "medium",
      hint: "Account created, setup never completed.",
    },
    {
      key: "lowBalanceStudents",
      label: "Students running out of classes",
      count: attention.lowBalanceStudents,
      tab: "contracts",
      severity: "medium",
      hint: `${OVERVIEW_LOW_BALANCE_THRESHOLD} classes or fewer left.`,
    },
  ];

  return items
    .filter((item) => Number(item.count || 0) > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Read the whole overview in one round trip's worth of concurrency.
 *
 * Every query is an aggregate or a small LIMITed list, so none of them should be
 * slow - but they are issued together rather than awaited in sequence, because
 * eight dependent round trips would make the first paint of the dashboard the sum
 * of eight latencies.
 */
export async function fetchAdminOverview(pool, { now = new Date() } = {}) {
  // The clock is read once, here, and handed to every caller. Each query could
  // otherwise resolve CURDATE() in its own pooled connection with its own session
  // time zone, and the trend would end up a day off against the "today" tile.
  const generatedAt = now.toISOString();

  const [
    peopleRows,
    libraryRows,
    attentionRows,
    todayRows,
    todayClassesRows,
    signupsRows,
    expiringRows,
    lowBalanceRows,
    trendRows,
  ] = await Promise.all([
    // Headcounts and the account states that decide whether somebody can sign in.
    pool.query(
      `SELECT role, status, profile_completed, COUNT(*) AS total
       FROM users
       GROUP BY role, status, profile_completed`
    ),

    // Courses, books and lessons: the teaching material actually available.
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM courses) AS courses,
         (SELECT COUNT(*) FROM books WHERE status = 'active') AS active_books,
         (SELECT COUNT(*) FROM books WHERE status = 'archived') AS archived_books,
         (SELECT COUNT(*) FROM lessons) AS lessons,
         (SELECT COUNT(*) FROM books b
            WHERE b.status = 'active'
              AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.book_id = b.book_id)) AS books_without_lessons`
    ),

    // Everything the "Needs attention" list is built from.
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM reschedule_requests WHERE status = 'pending') AS reschedule_requests,
         (SELECT COUNT(*) FROM student_contract_requests WHERE status = 'pending') AS contract_requests,
         (SELECT COUNT(*) FROM classes c
            LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
            WHERE (cal.log_id IS NOT NULL
                   OR TIMESTAMP(c.scheduled_date, COALESCE(c.start_time, '00:00:00')) <= NOW())
              AND COALESCE(cal.verification_status, 'pending') = 'pending') AS class_verifications,
         -- A teacher that has been archived or suspended does not teach anyone,
            -- however intact the assignment row is. Archiving a teacher is a normal
            -- admin action here, and without this the students they were left
            -- responsible for would show as "assigned" while having nobody.
            (SELECT COUNT(*)
            FROM users u
            LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
            LEFT JOIN users t ON t.user_id = sp.assigned_teacher_id
            WHERE u.role = 'student' AND u.status = 'active'
              AND (sp.assigned_teacher_id IS NULL OR t.user_id IS NULL OR t.status <> 'active')) AS students_without_teacher,
         (SELECT COUNT(*)
            FROM users u
            WHERE u.role = 'student' AND u.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM student_class_packages scp
                WHERE scp.student_id = u.user_id AND scp.status = 'active'
              )) AS students_without_active_contract,
         (SELECT COUNT(*)
            FROM student_class_packages scp
            JOIN users u ON u.user_id = scp.student_id AND u.status = 'active'
            WHERE scp.status = 'active'
              AND scp.expires_at IS NOT NULL
              AND scp.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)) AS expiring_contracts,
         (SELECT COUNT(DISTINCT scp.student_id)
            FROM student_class_packages scp
            JOIN users u ON u.user_id = scp.student_id AND u.status = 'active'
            WHERE scp.status = 'active' AND scp.classes_left <= ?) AS low_balance_students`,
      [CONTRACT_EXPIRY_WARNING_DAYS, OVERVIEW_LOW_BALANCE_THRESHOLD]
    ),

    // Today's headline numbers, broken down by status.
    pool.query(
      `SELECT status, COUNT(*) AS total
       FROM classes
       WHERE scheduled_date = CURDATE()
       GROUP BY status`
    ),

    // Today's timetable itself.
    pool.query(
      `SELECT c.class_id,
              c.class_name,
              c.status,
              TIME_FORMAT(c.start_time, '%H:%i') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i') AS end_time,
              stu.user_id AS student_id,
              stu.first_name AS student_first_name,
              stu.last_name AS student_last_name,
              tea.user_id AS teacher_id,
              tea.first_name AS teacher_first_name,
              tea.last_name AS teacher_last_name
       FROM classes c
       JOIN users stu ON stu.user_id = c.student_id
       JOIN users tea ON tea.user_id = c.teacher_id
       WHERE c.scheduled_date = CURDATE()
       ORDER BY c.start_time ASC, c.class_id ASC
       LIMIT 25`
    ),

    // Newest accounts, so the admin sees a signup land without refreshing.
    pool.query(
      `SELECT user_id, first_name, last_name, role, status, created_at
       FROM users
       ORDER BY created_at DESC, user_id DESC
       LIMIT ?`,
      [OVERVIEW_LIST_LIMIT]
    ),

    // Named, not just counted: "3 contracts expiring" is not actionable, the three
    // names are.
    pool.query(
      `SELECT u.user_id,
              CONCAT(u.first_name, ' ', u.last_name) AS student_name,
              scp.classes_left,
              DATE_FORMAT(scp.expires_at, '%Y-%m-%d') AS expires_at
       FROM student_class_packages scp
       JOIN users u ON u.user_id = scp.student_id
       WHERE scp.status = 'active'
         AND u.status = 'active'
         AND scp.expires_at IS NOT NULL
         AND scp.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
       ORDER BY scp.expires_at ASC
       LIMIT ?`,
      [CONTRACT_EXPIRY_WARNING_DAYS, OVERVIEW_LIST_LIMIT]
    ),

    pool.query(
      `SELECT u.user_id,
              CONCAT(u.first_name, ' ', u.last_name) AS student_name,
              scp.classes_left,
              scp.total_classes
       FROM student_class_packages scp
       JOIN users u ON u.user_id = scp.student_id
       WHERE scp.status = 'active'
         AND u.status = 'active'
         AND scp.classes_left <= ?
       ORDER BY scp.classes_left ASC, scp.expires_at ASC
       LIMIT ?`,
      [OVERVIEW_LOW_BALANCE_THRESHOLD, OVERVIEW_LIST_LIMIT]
    ),

    // The trend window. Issued last, and allowed to fail on its own.
    //
    // !! This is the only query in the payload using a recursive CTE, and it is
    // !! the only one whose failure is survivable. Everything else feeds a number
    // !! the admin acts on; this feeds a picture. Sharing one Promise.all meant a
    // !! rejected chart query returned a 500 for the whole dashboard and took the
    // !! student counts down with it - trading a missing bar for a blank page.
    // !! A failed trend degrades to an empty series and the panels still render.
    pool
      .query(
        `WITH RECURSIVE days AS (
           SELECT DATE_SUB(CURDATE(), INTERVAL ? DAY) AS day
           UNION ALL
           SELECT DATE_ADD(day, INTERVAL 1 DAY) FROM days WHERE day < CURDATE()
         )
         SELECT DATE_FORMAT(d.day, '%Y-%m-%d') AS day,
                c.status AS status,
                COUNT(c.class_id) AS class_count
         FROM days d
         LEFT JOIN classes c ON c.scheduled_date = d.day
         GROUP BY d.day, c.status
         ORDER BY d.day ASC`,
        [OVERVIEW_TREND_DAYS - 1]
      )
      .catch((err) => {
        console.error("admin overview: trend query failed, continuing without it:", err.message);
        return [[]];
      }),
  ]);

  const headcount = { student: {}, teacher: {}, admin: {} };
  let incompleteProfiles = 0;
  for (const row of peopleRows[0]) {
    const role = row.role in headcount ? row.role : null;
    if (!role) continue;
    const bucket = (headcount[role][row.status] =
      headcount[role][row.status] || { total: 0, pendingSetup: 0 });
    const total = Number(row.total || 0);
    bucket.total += total;
    if (!row.profile_completed) {
      bucket.pendingSetup += total;
      incompleteProfiles += total;
    }
  }

  const attention = toAttentionCounts(attentionRows[0][0] || {});
  // The headcount is the authoritative answer for unfinished profiles - it is the
  // same number the Account Management tab counts - so it replaces the placeholder
  // rather than trusting a second aggregate that could drift from it.
  attention.incompleteProfiles = incompleteProfiles;

  const trend = buildTrendSeries(trendRows[0]);

  const today = {
    counts: countByStatus(todayRows[0]),
    classes: todayClassesRows[0],
  };
  today.total = CLASS_STATUSES.reduce((sum, status) => sum + today.counts[status], 0);
  // The server's idea of today, not the browser's. An admin in Manila and the
  // server in Singapore can legitimately disagree about which day it is, and the
  // timetable has to be titled with the day the query actually selected rows for.
  // Taken from the trend, whose window is built out of CURDATE() server-side.
  today.date = trend[trend.length - 1]?.date || "";

  return {
    generatedAt,
    people: headcount,
    library: {
      courses: Number(libraryRows[0][0]?.courses || 0),
      activeBooks: Number(libraryRows[0][0]?.active_books || 0),
      archivedBooks: Number(libraryRows[0][0]?.archived_books || 0),
      lessons: Number(libraryRows[0][0]?.lessons || 0),
      booksWithoutLessons: Number(libraryRows[0][0]?.books_without_lessons || 0),
    },
    attention,
    attentionList: buildAttentionList(attention),
    today,
    upcomingDays: OVERVIEW_UPCOMING_DAYS,
    trend,
    recentSignups: signupsRows[0],
    expiringContracts: expiringRows[0],
    lowBalanceStudents: lowBalanceRows[0],
  };
}

/**
 * The single aggregate row -> camelCase attention counters.
 *
 * Every field is coerced with Number() because mysql2 hands COUNT(*) back as a
 * string for BIGINT results. A card that renders "3 pending" next to a
 * `<progress>` element whose `value` is the string "3" silently fails to render
 * the bar at all - this is where that stops.
 */
function toAttentionCounts(row) {
  return {
    rescheduleRequests: Number(row.reschedule_requests || 0),
    contractRequests: Number(row.contract_requests || 0),
    classVerifications: Number(row.class_verifications || 0),
    studentsWithoutTeacher: Number(row.students_without_teacher || 0),
    studentsWithoutActiveContract: Number(row.students_without_active_contract || 0),
    expiringContracts: Number(row.expiring_contracts || 0),
    lowBalanceStudents: Number(row.low_balance_students || 0),
    incompleteProfiles: Number(row.incomplete_profiles || 0),
  };
}
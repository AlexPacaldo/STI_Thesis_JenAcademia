import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import styles from "../assets/AdminDashboard.module.css";
import { API_BASE_URL } from "../utils/api.js";

/**
 * The admin's landing tab: what the school looks like, what is waiting for an
 * answer, and what is on today.
 *
 * !! Why this is one component and one request.
 * !!
 * !! Everything on this screen used to need a different admin route. Assembled in
 * !! the browser it took eight round trips, and - the part that actually mattered -
 * !! each card was true at its own moment. Approving a reschedule while the page was
 * !! loading left "3 pending" sitting next to a contract count that had already
 * !! moved on. See backend/adminOverview.js.
 *
 * No charting dependency: the trend is one flex column per day, so there is nothing
 * for a library to do, and the bars are sized from the same numbers the labels use.
 */

// `swatch` is what the legend paints, `className` what the bar paints. Both are
// the same colour, but they are named separately so the legend cannot drift away
// from the bars it is explaining.
const CLASS_STATUS_STYLE = {
  completed: { className: styles.trendCompleted, swatch: "accent-success", label: "Completed" },
  scheduled: { className: styles.trendScheduled, swatch: "accent-info", label: "Scheduled" },
  "no-show": { className: styles.trendNoShow, swatch: "alert-danger", label: "No-show" },
  cancelled: { className: styles.trendCancelled, swatch: "accent-sage", label: "Cancelled" },
};

// Rendered bottom-up, so the stack reads the same way the enum lists the statuses.
const TREND_SEGMENT_ORDER = ["completed", "scheduled", "no-show", "cancelled"];

const formatTime = (value) => {
  if (!value) return "-";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  const hour = Number(match[1]);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${match[2]} ${period}`;
};

/**
 * "2026-10-16" -> "Thu 16 Oct".
 *
 * Parsed by hand rather than through `new Date(string)`: that constructor reads a
 * bare YYYY-MM-DD as UTC midnight, which in any negative-offset time zone is the
 * *previous* day. Every bar would then be labelled with the day before the one it
 * represents, and "today" would land under yesterday's bar.
 */
const formatDayLabel = (value, { withWeekday = true } = {}) => {
  const parts = String(value || "").slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value || "");
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    ...(withWeekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
  });
};

/** "2026-10-16 14:03:22" from MySQL -> a local "2:03 PM" style string. */
const formatStamp = (value) => {
  if (!value) return "";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const fullName = (person) =>
  [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim() || "Unnamed";

const initialsOf = (person) =>
  [person?.first_name, person?.last_name]
    .filter(Boolean)
    .map((part) => String(part).trim().charAt(0))
    .join("")
    .toUpperCase() || "?";

/** A status word, tinted the way the rest of the admin screens tint them. */
const CLASS_STATUS_PILL = {
  scheduled: { background: "var(--pill-info)", color: "var(--text-info)" },
  completed: { background: "var(--pill-success)", color: "var(--text-success)" },
  cancelled: { background: "var(--surface-recessed)", color: "var(--muted)" },
  "no-show": { background: "var(--pill-danger)", color: "var(--text-danger)" },
};

function StatTile({ label, value, note, icon, tone, onClick }) {
  const classNames = [
    styles.statTile,
    tone === "accent" ? styles.statTileAccent : "",
    onClick ? styles.statTileLink : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <span className={styles.statTileValue}>{value}</span>
      <span className={styles.statTileLabel}>
        {icon && <i className={`bi bi-${icon}`} aria-hidden="true" />}
        {label}
      </span>
      {note && <span className={styles.statTileNote}>{note}</span>}
    </>
  );

  // A tile that navigates and a tile that does not must not be the same element:
  // a <div> with an onClick is unreachable by keyboard, and this is the screen the
  // admin is most likely to drive without a mouse.
  if (!onClick) {
    return <div className={classNames}>{body}</div>;
  }

  return (
    <button type="button" className={classNames} onClick={onClick}>
      {body}
    </button>
  );
}

/**
 * Turn a failed request into something that says which problem this actually is.
 *
 * !! This is not polish. The frontend and the backend deploy independently - the
 * !! Vite app can be running against a backend that predates this tab - and every
 * !! one of these failures produced the identical red box before:
 * !!
 * !!   404  the backend is simply an older build without this route
 * !!   401  the session token expired
 * !!   500  the query itself is broken
 * !!   *    nothing is listening on the API host at all
 * !!
 * !! Those need four different responses, and the first one in particular is not a
 * !! bug to debug - it is a deploy to make. Telling the admin "could not load"
 * !! for a missing route sends them looking for a fault in code that is fine.
 */
function describeOverviewFailure(error) {
  const status = error?.response?.status;
  const apiHost = API_BASE_URL;

  if (!error?.response) {
    return {
      message: `Could not reach the backend at ${apiHost}.`,
      hint: "Nothing is answering on that address. Check that the server is running and that VITE_API_URL is correct.",
    };
  }

  const serverMessage = String(error?.response?.data?.message || "").trim();

  if (status === 404) {
    return {
      message: "This backend does not have the overview yet.",
      hint: "The Overview tab needs a build of the backend that includes GET /api/admin/overview. Deploy the latest backend code, then refresh.",
    };
  }

  if (status === 401 || status === 403) {
    return {
      message: "This session is not allowed to read the admin overview.",
      hint: "Sign out and sign back in, then try again.",
    };
  }

  if (status >= 500) {
    return {
      message: "The backend could not build the overview.",
      hint: serverMessage || "The error is in the backend logs.",
    };
  }

  return {
    message: serverMessage || "Could not load the overview.",
    hint: `The server answered with HTTP ${status}.`,
  };
}

export default function AdminOverview({ onNavigateToTab }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/overview`);
      setOverview(response.data?.overview || null);
      setError(null);
    } catch (e) {
      console.error(e);
      // The previous payload is left in place rather than blanked. Half a
      // dashboard - four correct tiles and four stale ones - would be read as
      // fact; saying so is the honest state.
      //
      // No toast here. A failed load already puts a persistent, dismissible-by-
      // fixing banner on screen, and a toast saying the same sentence on top of
      // it was two red boxes for one fault.
      setError(describeOverviewFailure(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Jump to the tab that resolves the item. The handler is passed in because the
  // tab is owned by AdminDashboard and encoded in the URL there; duplicating that
  // knowledge here is how the two drift apart.
  //
  // Not memoised: this is only ever called from an onClick, never from a dependency
  // array or an effect, so a stable identity would buy nothing.
  const goToTab = (tab) => onNavigateToTab?.(tab);

  const people = overview?.people || {};
  const students = people.student || {};
  const teachers = people.teacher || {};
  const library = overview?.library || {};
  const today = overview?.today || {};
  const todayCounts = today.counts || {};
  // Sums every queue in the attention panel, so this tile and that panel can never
  // quote different totals.
  //
  // Deliberately not a useMemo: it reduces over at most eight items, and memoising
  // it would mean pinning a dependency to `overview?.attentionList || []` - a fresh
  // empty array on every render, which defeats the memo and then warns about it.
  const attentionList = overview?.attentionList || [];
  const pendingTotal = attentionList.reduce((sum, item) => sum + Number(item.count || 0), 0);

  // Bars are sized against the busiest day in the window, not against each other,
  // so the tallest bar is always full height and a quiet week is visibly quiet
  // instead of being stretched to look busy.
  const trendPeak = useMemo(
    () => Math.max(1, ...(overview?.trend || []).map((day) => Number(day.total || 0))),
    [overview]
  );

  const trendLastDate = overview?.trend?.[overview.trend.length - 1]?.date || "";
  // The server's today, used for the timetable heading. Falls back to the last day
  // of the trend window, which is also built from the server's CURDATE(), and to
  // a bare "Today" if the trend query was the one thing that failed.
  const todayLabel = overview?.today?.date || trendLastDate;
  const archivedUsers =
    Number(students.archived?.total || 0) +
    Number(teachers.archived?.total || 0) +
    Number((people.admin?.archived || {}).total || 0);

  if (!overview && loading) {
    return <div className={styles.overviewEmpty}>Loading your overview...</div>;
  }

  return (
    <div className={styles.overview}>
      <div className={styles.overviewPanelHead}>
        <div>
          <h3>Admin Overview</h3>
          <p>
            {loading
              ? "Refreshing..."
              : overview?.generatedAt
                ? `Updated ${formatStamp(overview.generatedAt)}`
                : "Live snapshot of the academy"}
          </p>
        </div>
        <button className={styles.secondaryBtn} type="button" onClick={loadOverview} disabled={loading}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && (
        <div className={styles.overviewError} role="alert">
          <span>
            <strong className={styles.overviewErrorTitle}>{error.message}</strong>
            <span className={styles.overviewErrorHint}>{error.hint}</span>
          </span>
          <button className={styles.secondaryBtn} type="button" onClick={loadOverview}>
            Try again
          </button>
        </div>
      )}

      <section className={styles.statGrid}>
        <StatTile
          label="Active Students"
          icon="people"
          value={Number(students.active?.total || 0)}
          note={
            Number(students.active?.pendingSetup || 0) > 0
              ? `${students.active.pendingSetup} still setting up`
              : "All accounts ready"
          }
          onClick={() => goToTab("archive")}
        />
        <StatTile
          label="Active Teachers"
          icon="person-video3"
          value={Number(teachers.active?.total || 0)}
          note={
            Number(teachers.active?.pendingSetup || 0) > 0
              ? `${teachers.active.pendingSetup} still setting up`
              : "All accounts ready"
          }
          onClick={() => goToTab("archive")}
        />
        <StatTile
          label="Classes Today"
          icon="calendar-event"
          value={Number(today.total || 0)}
          note={
            Number(today.total || 0) === 0
              ? "Nothing on the schedule"
              : `${Number(todayCounts.completed || 0)} done · ${Number(todayCounts.scheduled || 0)} still to come`
          }
          onClick={() => goToTab("calendar")}
        />
        <StatTile
          label="Needs Attention"
          icon="inbox"
          tone={pendingTotal > 0 ? "accent" : undefined}
          value={pendingTotal}
          note={
            pendingTotal > 0
              ? `Across ${attentionList.length} ${attentionList.length === 1 ? "queue" : "queues"}`
              : "Nothing outstanding"
          }
        />
        <StatTile
          label="Courses"
          icon="mortarboard"
          value={Number(library.courses || 0)}
          note={`${Number(library.activeBooks || 0)} active books · ${Number(library.lessons || 0)} lessons`}
          onClick={() => goToTab("books")}
        />
        <StatTile
          label="Archived Accounts"
          icon="archive"
          value={archivedUsers}
          note={
            archivedUsers > 0 ? "Can be restored at any time" : "None archived"
          }
          onClick={() => goToTab("archive")}
        />
      </section>

      <div className={styles.overviewSplit}>
        <section className={styles.overviewPanel}>
          <div className={styles.overviewPanelHead}>
            <div>
              <h3>Needs Attention</h3>
              <p>Everything below is waiting on an admin decision.</p>
            </div>
            <span className={styles.overviewCount}>
              {pendingTotal} open
            </span>
          </div>

          {attentionList.length ? (
            <ul className={styles.attentionList}>
              {attentionList.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`${styles.attentionItem} ${
                      item.severity === "high" ? styles.attentionHigh : styles.attentionMedium
                    }`}
                    onClick={() => goToTab(item.tab)}
                  >
                    <span>
                      <span className={styles.attentionTitle}>{item.label}</span>
                      <span className={styles.attentionHint}>{item.hint}</span>
                    </span>
                    <span className={styles.attentionCount}>{item.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.attentionClear}>
              <i className="bi bi-check2-circle" aria-hidden="true" />
              Nothing is waiting on you right now.
            </div>
          )}

          {Number(library.booksWithoutLessons || 0) > 0 && (
            <div className={styles.overviewEmpty}>
              <i className="bi bi-journal-x" aria-hidden="true" /> {library.booksWithoutLessons}{" "}
              {library.booksWithoutLessons === 1 ? "active book has" : "active books have"} no lessons yet.
            </div>
          )}
        </section>

        <section className={styles.overviewPanel}>
          <div className={styles.overviewPanelHead}>
            <div>
              <h3>Last {overview?.trend?.length || 7} Days</h3>
              <p>Classes by outcome.</p>
            </div>
            <span className={styles.overviewCount}>
              Peak {trendPeak} {trendPeak === 1 ? "class" : "classes"}
            </span>
          </div>

          {overview?.trend?.length ? (
            <>
              <div className={styles.trend}>
                {overview.trend.map((day) => (
                  <div key={day.date} className={styles.trendDay}>
                    <span className={styles.trendTotal}>{day.total || ""}</span>
                    <div
                      className={styles.trendTrack}
                      role="img"
                      aria-label={`${formatDayLabel(day.date)}: ${day.total} classes`}
                    >
                      {TREND_SEGMENT_ORDER.map((status) => {
                        const count = Number(day[status === "no-show" ? "noShow" : status] || 0);
                        if (count <= 0) return null;
                        return (
                          <div
                            key={status}
                            className={`${styles.trendBar} ${CLASS_STATUS_STYLE[status].className}`}
                            style={{ height: `${(count / trendPeak) * 100}%` }}
                          />
                        );
                      })}
                    </div>
                    <span
                      className={`${styles.trendLabel} ${day.date === trendLastDate ? styles.trendToday : ""}`}
                    >
                      {formatDayLabel(day.date)}
                    </span>
                  </div>
                ))}
              </div>

              <div className={styles.trendLegend}>
                {TREND_SEGMENT_ORDER.map((status) => (
                  <span key={status} className={styles.trendLegendItem}>
                    <span
                      className={styles.trendSwatch}
                      style={{ background: `var(--${CLASS_STATUS_STYLE[status].swatch})` }}
                    />
                    {CLASS_STATUS_STYLE[status].label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.overviewEmpty}>
              Could not load the class history for this period.
            </div>
          )}
        </section>
      </div>

      <div className={styles.overviewSplit}>
        <section className={styles.overviewPanel}>
          <div className={styles.overviewPanelHead}>
            <div>
              <h3>Today&apos;s Timetable</h3>
              <p>{formatDayLabel(todayLabel) || "Today"}</p>
            </div>
            <button className={styles.linkBtn} type="button" onClick={() => goToTab("calendar")}>
              Open calendar
            </button>
          </div>

          {today.classes?.length ? (
            <ul className={styles.scheduleList}>
              {today.classes.map((row) => {
                const pill = CLASS_STATUS_PILL[row.status] || CLASS_STATUS_PILL.scheduled;
                return (
                  <li key={row.class_id} className={styles.scheduleRow}>
                    <span className={styles.scheduleTime}>{formatTime(row.start_time)}</span>
                    <span className={styles.scheduleNames}>
                      <span className={styles.scheduleStudent}>
                        {fullName({
                          first_name: row.student_first_name,
                          last_name: row.student_last_name,
                        })}
                      </span>
                      <span className={styles.scheduleTeacher}>
                        {row.class_name} · {fullName({
                          first_name: row.teacher_first_name,
                          last_name: row.teacher_last_name,
                        })}
                      </span>
                    </span>
                    <span
                      className={styles.statusPill}
                      style={{ background: pill.background, color: pill.color }}
                    >
                      {String(row.status || "").replace("-", " ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.overviewEmpty}>No classes scheduled today.</div>
          )}

          {today.classes?.length >= 25 && (
            <div className={styles.overviewMeta}>
              Showing the first 25 classes. Open the calendar for the full day.
            </div>
          )}
        </section>

        <div style={{ display: "grid", gap: "20px" }}>
          <section className={styles.overviewPanel}>
            <div className={styles.overviewPanelHead}>
              <div>
                <h3>Contracts Ending</h3>
                <p>Running out soon.</p>
              </div>
              <button className={styles.linkBtn} type="button" onClick={() => goToTab("contracts")}>
                Manage
              </button>
            </div>

            {overview?.expiringContracts?.length ? (
              <ul className={styles.overviewNameList}>
                {overview.expiringContracts.map((row) => (
                  <li key={`expiring-${row.user_id}`} className={styles.overviewNameRow}>
                    <span>{row.student_name}</span>
                    <span className={styles.overviewMeta}>Ends {formatDayLabel(row.expires_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.overviewEmpty}>No contracts ending soon.</div>
            )}
          </section>

          <section className={styles.overviewPanel}>
            <div className={styles.overviewPanelHead}>
              <div>
                <h3>Low Class Balance</h3>
                <p>Two classes or fewer left.</p>
              </div>
            </div>

            {overview?.lowBalanceStudents?.length ? (
              <ul className={styles.overviewNameList}>
                {overview.lowBalanceStudents.map((row) => (
                  <li key={`low-${row.user_id}`} className={styles.overviewNameRow}>
                    <span>{row.student_name}</span>
                    <span className={styles.overviewMeta}>
                      {row.classes_left} of {row.total_classes} left
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.overviewEmpty}>Everyone has classes left.</div>
            )}
          </section>
        </div>
      </div>

      <section className={styles.overviewPanel}>
        <div className={styles.overviewPanelHead}>
          <div>
            <h3>Newest Accounts</h3>
            <p>The last {overview?.recentSignups?.length || 0} people to join.</p>
          </div>
        </div>

        {overview?.recentSignups?.length ? (
          <ul className={styles.attentionList}>
            {overview.recentSignups.map((row) => (
              <li key={row.user_id} className={styles.attentionItem}>
                <span>
                  <span className={styles.attentionTitle}>
                    {initialsOf(row)} · {fullName(row)}
                  </span>
                  <span className={styles.attentionHint}>{formatStamp(row.created_at)}</span>
                </span>
                <span className={styles.statusPill}>{row.role}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.overviewEmpty}>No accounts yet.</div>
        )}
      </section>
    </div>
  );
}
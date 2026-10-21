/**
 * The student's class history, in Kid Mode.
 *
 * !! This screen used to be the teacher's review screen with the teacher's
 * !! words on it. "Verification status", "evidence", "missing items" - a
 * !! screen for the adult who has to check the paperwork, shown to a child
 * !! who wants to remember what they did on Tuesday.
 * !!
 * !! So this is a different screen, not a restyled one. It asks one
 * !! question - "which class do you want to look at?" - and answers it with
 * !! a list of cards. Each card has a picture, the name of the class, one
 * !! friendly word for how it went, and the three facts a child actually
 * !! wants: who taught it, how long it was, and what they did.
 * !!
 * !! The proof, the recording and the review are the teacher's business.
 * !! The recording is here because the child may want to watch their own
 * !! class again, and it is the one thing on this screen they can press.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import kid from "../assets/studentKid.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";
import { describeTimeOfDay, formatFriendlyDate } from "../utils/classTime.js";
import { openClassRecording } from "../utils/classRecording.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import { dateKeyToLocalDate, daysBetween } from "../utils/studentSchedule.js";
import { HISTORY, HOME } from "../utils/studentCopy.js";

/** How many classes are on the screen at once. */
const PAGE_SIZE = 6;

/**
 * The three "when" choices, in the order a child thinks in them.
 *
 * !! Not dates. A child cannot read a date range, and a calendar of the
 * !! past is a puzzle. "This week", "this month" and "earlier" are three
 * !! words that cannot be got wrong.
 */
const WHEN_FILTERS = [
  ["thisWeek", HISTORY.thisWeek],
  ["thisMonth", HISTORY.thisMonth],
  ["earlier", HISTORY.earlier],
];

/**
 * The one word that says how a class went.
 *
 * !! The statuses the server sends are for the adult who checks the class
 * !! record. The child gets a word instead, and the colour comes second.
 */
function describeOutcome(row) {
  const started = Boolean(row.teacher_started_at || row.student_joined_at || row.teacher_ended_at);

  if (!started) {
    return { word: HISTORY.notFinished, tone: "pastStatusWaiting", icon: "⏳" };
  }

  switch (row.verification_status) {
    case "verified":
      return { word: HISTORY.done, tone: "pastStatusDone", icon: "🎉" };
    case "student_confirmed":
      return { word: HISTORY.joined, tone: "pastStatusDone", icon: "🙋" };
    case "needs_review":
      return { word: HISTORY.checking, tone: "pastStatusChecking", icon: "🔎" };
    case "in_progress":
      return { word: HISTORY.goingOn, tone: "pastStatusAlmost", icon: "⏳" };
    case "pending":
      return { word: HISTORY.waiting, tone: "pastStatusWaiting", icon: "🕒" };
    default:
      return { word: HISTORY.almost, tone: "pastStatusAlmost", icon: "⏳" };
  }
}

/** "2026-10-21" -> "Today" or "Yesterday" or "Wednesday, October 21". */
function describeWhen(dateKey, todayKey) {
  if (!dateKey) return "";
  if (todayKey) {
    const offset = daysBetween(todayKey, dateKey);
    if (offset === 0) return HISTORY.today;
    if (offset === -1) return HISTORY.yesterday;
  }
  return formatFriendlyDate(dateKey);
}

export default function StudentClassHistoryKid() {
  const { notify } = useNotification() || {};
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [classFilter, setClassFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [whenFilter, setWhenFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const user = readStoredUser();
  const currentUserId = user?.id || user?.user_id || user?.userId;
  const userRole = String(user?.role || "").toLowerCase();

  const loadHistory = async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/student/${currentUserId}/class-history`,
        { params: { limit: 200 } }
      );
      setHistory(response.data?.history || []);
      setVisible(PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setHistory([]);
      notify?.(err?.response?.data?.message || "Could not load your classes", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      window.location.href = "/";
      return;
    }
    if (userRole !== "student") {
      window.location.href = userRole === "teacher" ? "/TeacherDashboard" : "/AdminDashboard";
      return;
    }
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, userRole]);

  const todayKey = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
  }, []);

  /* The filter.
     *
     * !! Three small questions, in one window: which class, how it went, and
     * !! when. Each one is a row of big buttons with the number of classes
     * !! in each one, so a child can see the answer before pressing.
     *
     * !! The teacher screen had eight status pills, a search box, a date
     * !! range and two dropdowns, which is a wall of choices and a child
     * !! picks nothing. Every button here says something the student
     * !! recognises, because it is one of their own classes.
     */
  const classNames = useMemo(() => {
    const counts = new Map();
    for (const row of history) {
      const name = String(row.class_name || "").trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [history]);

  const periodOf = (row) => {
    if (!row.scheduled_date || !todayKey) return "earlier";
    const offset = daysBetween(row.scheduled_date, todayKey);
    if (offset >= 0 && offset <= 6) return "thisWeek";
    const date = dateKeyToLocalDate(row.scheduled_date);
    const today = dateKeyToLocalDate(todayKey);
    if (date && today && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()) {
      return "thisMonth";
    }
    return "earlier";
  };

  const rowsMatching = useMemo(
    () => ({ className = "", outcome = "", when = "" } = {}) =>
      history.filter((row) => {
        if (className && row.class_name !== className) return false;
        if (outcome && describeOutcome(row).word !== outcome) return false;
        if (when && periodOf(row) !== when) return false;
        return true;
      }),
    [history, todayKey]
  );

  const classCounts = useMemo(() => {
    const counts = new Map();
    for (const row of rowsMatching({ outcome: outcomeFilter, when: whenFilter })) {
      const name = String(row.class_name || "").trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rowsMatching, outcomeFilter, whenFilter]);

  const outcomeCounts = useMemo(() => {
    const counts = new Map();
    for (const row of rowsMatching({ className: classFilter, when: whenFilter })) {
      const word = describeOutcome(row).word;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rowsMatching, classFilter, whenFilter]);

  const whenCounts = useMemo(() => {
    const counts = new Map();
    for (const row of rowsMatching({ className: classFilter, outcome: outcomeFilter })) {
      const period = periodOf(row);
      counts.set(period, (counts.get(period) || 0) + 1);
    }
    return counts;
  }, [rowsMatching, classFilter, outcomeFilter]);

  // A filter that no longer matches anything is not a filter any more - the
  // list changed under the student, and a filter that shows nothing is a
  // dead end.
  const activeClass = classCounts.some(([name]) => name === classFilter) ? classFilter : "";
  const activeOutcome = outcomeCounts.some(([word]) => word === outcomeFilter) ? outcomeFilter : "";
  const activeWhen = whenCounts.has(whenFilter) ? whenFilter : "";

  const filtered = useMemo(
    () => rowsMatching({ className: activeClass, outcome: activeOutcome, when: activeWhen }),
    [activeClass, activeOutcome, activeWhen, rowsMatching]
  );

  const shown = filtered.slice(0, visible);
  const hidden = Math.max(0, filtered.length - visible);

  const activeFilterCount =
    (activeClass ? 1 : 0) + (activeOutcome ? 1 : 0) + (activeWhen ? 1 : 0);

  // !! A function that takes the setter and the value, NOT a function that
  // !! returns a handler. `pick(setClassFilter)("")` calls the handler
  // !! straight away - during the render - and setting state while
  // !! rendering is the "too many re-renders" error.
  const pick = (setter, value) => {
    setter(value);
    // Six at a time starts again, or the student presses "show more" and
    // sees nothing new.
    setVisible(PAGE_SIZE);
  };

  const pill = (active) => `${kid.filterPill} ${active ? kid.filterPillActive : ""}`;

  return (
    <div className={kid.history}>
      <header className={kid.historyHead}>
        <div>
          <h1 className={kid.historyTitle}>{HISTORY.title}</h1>
          <p className={kid.historySubtitle}>{HISTORY.subtitle}</p>
        </div>
        <button
          type="button"
          className={kid.refreshBtn}
          onClick={loadHistory}
          disabled={loading}
        >
          {HISTORY.refresh}
        </button>
      </header>

      {loading ? (
        // A skeleton in the shape of the thing being loaded. Never a
        // spinner, and never "no classes" - the answer has not arrived yet.
        <div className={kid.historyList}>
          {[0, 1, 2].map((index) => (
            <div key={index} className={kid.loadingCard} />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className={kid.historyEmpty}>
          <span className={kid.historyEmptyIcon} aria-hidden="true">
            🗓️
          </span>
          <p className={kid.historyEmptyTitle}>{HISTORY.emptyTitle}</p>
          <p className={kid.historyEmptyHelp}>{HISTORY.emptyHelp}</p>
        </div>
      ) : (
        <>
          <div className={kid.historyBar}>
            <button
              type="button"
              className={kid.filterOpenBtn}
              onClick={() => setFilterOpen(true)}
            >
              {HISTORY.filter}
              {activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
            <p className={kid.historySummary}>
              {HISTORY.showing(filtered.length, history.length)}
            </p>
          </div>

          <div className={kid.historyList}>
            {filtered.length === 0 ? (
              <div className={kid.historyEmpty}>
                <span className={kid.historyEmptyIcon} aria-hidden="true">
                  🗓️
                </span>
                <p className={kid.historyEmptyTitle}>{HISTORY.noneInThisClass}</p>
              </div>
            ) : null}

            {shown.map((row) => {
              const outcome = describeOutcome(row);
              const teacherName =
                `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`.trim() ||
                HISTORY.yourTeacher;

              const minutes = Number(row.duration_minutes || 0) || Number(row.duration || 0) || 0;
              const partOfDay = describeTimeOfDay(row.start_time);
              const when = describeWhen(row.scheduled_date, todayKey);

              return (
                <article key={row.class_id} className={kid.pastCard}>
                  <div className={kid.pastHead}>
                    <span className={kid.pastIcon} aria-hidden="true">
                      📘
                    </span>
                    <div>
                      <h2 className={kid.pastName}>{row.class_name || HISTORY.title}</h2>
                      <p className={kid.pastWhen}>
                        {when}
                        {partOfDay ? ` · ${partOfDay}` : ""}
                      </p>
                    </div>
                  </div>

                  <span className={`${kid.pastStatus} ${kid[outcome.tone]}`}>
                    <span aria-hidden="true">{outcome.icon}</span>
                    {outcome.word}
                  </span>

                  <div className={kid.pastFacts}>
                    <div className={kid.pastFact}>
                      <span className={kid.pastFactIcon} aria-hidden="true">
                        👩‍🏫
                      </span>
                      <div>
                        <div className={kid.pastFactLabel}>{HISTORY.yourTeacher}</div>
                        <div className={kid.pastFactValue}>{teacherName}</div>
                      </div>
                    </div>

                    <div className={kid.pastFact}>
                      <span className={kid.pastFactIcon} aria-hidden="true">
                        ⏱️
                      </span>
                      <div>
                        <div className={kid.pastFactLabel}>{HISTORY.howLong}</div>
                        <div className={kid.pastFactValue}>
                          {minutes > 0 ? HISTORY.minutes(minutes) : HISTORY.noMinutes}
                        </div>
                      </div>
                    </div>

                    {row.summary ? (
                      <div className={kid.pastFact}>
                        <span className={kid.pastFactIcon} aria-hidden="true">
                          📝
                        </span>
                        <div>
                          <div className={kid.pastFactLabel}>{HISTORY.whatYouDid}</div>
                          <div className={kid.pastFactValue}>{row.summary}</div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {row.recording_url ? (
                    <button
                      type="button"
                      className={kid.watchBtn}
                      onClick={() => openClassRecording({ classId: row.class_id, notify })}
                    >
                      <span aria-hidden="true">▶️</span> {HISTORY.watchAgain}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>

          {hidden > 0 ? (
            <button
              type="button"
              className={kid.moreBtn}
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
            >
              {HISTORY.showMore(Math.min(PAGE_SIZE, hidden))}
            </button>
          ) : null}
        </>
      )}

      {/* The filter window.
          !! Through ModalPortal, like every other window in this app: the
          !! page content sits inside an element that animates a transform,
          !! and a transformed element is the containing block for anything
          !! position: fixed inside it - so a backdrop rendered in place
          !! covers the page body and not the header. */}
      {filterOpen ? (
        <ModalPortal>
          <div className={kid.filterBackdrop} onClick={() => setFilterOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={HISTORY.filterTitle}
              className={kid.filterDialog}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={kid.filterHead}>
                <div>
                  <h3 className={kid.filterTitle}>{HISTORY.filterTitle}</h3>
                  <p className={kid.filterSub}>{HISTORY.filterSub}</p>
                </div>
                <button
                  type="button"
                  className={kid.filterClose}
                  onClick={() => setFilterOpen(false)}
                  aria-label={HISTORY.closeFilter}
                >
                  ×
                </button>
              </div>

              <div className={kid.filterBody}>
                <div className={kid.filterGroup}>
                  <span className={kid.filterLabel}>{HISTORY.filterByClass}</span>
                  <div className={kid.filterPills}>
                    <button
                      type="button"
                      className={pill(activeClass === "")}
                      aria-pressed={activeClass === ""}
                      onClick={() => pick(setClassFilter, "")}
                    >
                      {HOME.allClasses}
                      <span className={kid.filterNum}>
                        {rowsMatching({ outcome: activeOutcome, when: activeWhen }).length}
                      </span>
                    </button>

                    {classCounts.map(([name, count]) => (
                      <button
                        key={name}
                        type="button"
                        className={pill(activeClass === name)}
                        aria-pressed={activeClass === name}
                        onClick={() => pick(setClassFilter, name)}
                      >
                        {name}
                        <span className={kid.filterNum}>{count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={kid.filterGroup}>
                  <span className={kid.filterLabel}>{HISTORY.filterByOutcome}</span>
                  <div className={kid.filterPills}>
                    <button
                      type="button"
                      className={pill(activeOutcome === "")}
                      aria-pressed={activeOutcome === ""}
                      onClick={() => pick(setOutcomeFilter, "")}
                    >
                      {HISTORY.all}
                      <span className={kid.filterNum}>
                        {rowsMatching({ className: activeClass, when: activeWhen }).length}
                      </span>
                    </button>

                    {outcomeCounts.map(([word, count]) => (
                      <button
                        key={word}
                        type="button"
                        className={pill(activeOutcome === word)}
                        aria-pressed={activeOutcome === word}
                        onClick={() => pick(setOutcomeFilter, word)}
                      >
                        {word}
                        <span className={kid.filterNum}>{count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={kid.filterGroup}>
                  <span className={kid.filterLabel}>{HISTORY.filterByWhen}</span>
                  <div className={kid.filterPills}>
                    <button
                      type="button"
                      className={pill(activeWhen === "")}
                      aria-pressed={activeWhen === ""}
                      onClick={() => pick(setWhenFilter, "")}
                    >
                      {HISTORY.allTimes}
                      <span className={kid.filterNum}>
                        {rowsMatching({ className: activeClass, outcome: activeOutcome }).length}
                      </span>
                    </button>

                    {WHEN_FILTERS.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={pill(activeWhen === key)}
                        aria-pressed={activeWhen === key}
                        onClick={() => pick(setWhenFilter, key)}
                      >
                        {label}
                        <span className={kid.filterNum}>{whenCounts.get(key) || 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={kid.filterApply}
                onClick={() => setFilterOpen(false)}
              >
                {HISTORY.showClasses(filtered.length)}
              </button>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

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
import { readStoredUser } from "../utils/sessionUser.js";
import { dateKeyToLocalDate, daysBetween } from "../utils/studentSchedule.js";
import { HISTORY, HOME } from "../utils/studentCopy.js";

/** How many classes are on the screen at once. */
const PAGE_SIZE = 6;

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
     * !! One question, one row of big buttons: which class do you want to
     * !! look at? The teacher screen had eight status pills, a search box, a
     * !! date range and two dropdowns, which is a wall of choices and a
     * !! child picks nothing.
     *
     * !! The buttons are the class names the student actually has, so there
     * !! is nothing on the screen they do not understand.
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

  // A class that is no longer on the list is not a filter any more - the
  // list changed under the student, and a filter that shows nothing is a
  // dead end.
  const activeFilter = classNames.some(([name]) => name === classFilter) ? classFilter : "";

  const filtered = useMemo(
    () => (activeFilter ? history.filter((row) => row.class_name === activeFilter) : history),
    [activeFilter, history]
  );

  const shown = filtered.slice(0, visible);
  const hidden = Math.max(0, filtered.length - visible);

  const pickClass = (name) => {
    setClassFilter(name);
    // Six at a time starts again, or the student presses "show more" and
    // sees nothing new.
    setVisible(PAGE_SIZE);
  };

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
          <div className={kid.historyFilter}>
            <p className={kid.sectionTitle}>{HISTORY.whichClass}</p>
            <div className={kid.chipRow}>
              <button
                type="button"
                className={`${kid.chip} ${activeFilter ? "" : kid.chipActive}`}
                onClick={() => pickClass("")}
              >
                {HOME.allClasses}
                <span className={kid.chipCount}>{history.length}</span>
              </button>

              {classNames.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  className={`${kid.chip} ${activeFilter === name ? kid.chipActive : ""}`}
                  onClick={() => pickClass(name)}
                >
                  {name}
                  <span className={kid.chipCount}>{count}</span>
                </button>
              ))}
            </div>
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
    </div>
  );
}

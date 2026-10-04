// src/pages/Remarks.jsx
import { useEffect, useState } from "react";
import teacherPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/remarks.module.css";
import { getStoredUserTimezone } from "../utils/timezone.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;

// Mirrors profileSrc() in assignmentsDropbox.jsx: uploads paths come back from
// the API both with and without a leading slash, and Windows paths may use "\".
function profileSrc(url) {
  if (!url) return teacherPic;
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/uploads/")) return `${API}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API}/${cleaned}`;
  return cleaned;
}

function remarkCountLabel(count) {
  if (count === 1) return "1 remark";
  return `${count} remarks`;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

// Purely arithmetic on epoch millis, so the user's timezone only affects the
// absolute fallback text, never the "2 hours ago" result.
function relativeTime(value, nowMs) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;

  const elapsed = nowMs - then;
  // Clock skew or a slightly future timestamp - don't render "in -3 minutes".
  if (elapsed < MINUTE) return "just now";

  const plural = (amount, unit) => `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;

  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour");
  if (elapsed < WEEK) return plural(Math.floor(elapsed / DAY), "day");
  if (elapsed < MONTH) return plural(Math.floor(elapsed / WEEK), "week");
  if (elapsed < YEAR) return plural(Math.floor(elapsed / MONTH), "month");
  return plural(Math.floor(elapsed / YEAR), "year");
}

export default function Remarks() {
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Drives the "2 hours ago" labels. Ticks on a timer so they stay accurate
  // on a page left open, without refetching anything.
  const [now, setNow] = useState(() => Date.now());

  const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", {
      timeZone: getStoredUserTimezone(),
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  // The exact moment the teacher submitted the remark (created_at), rendered in
  // the student's timezone. Accepts an ISO string or a Date, and falls back to
  // a dash rather than printing "Invalid Date".
  const formatSubmittedAt = (value) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    const timeZone = getStoredUserTimezone();
    const dateText = date.toLocaleDateString("en-US", {
      timeZone,
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const timeText = date.toLocaleTimeString("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateText} at ${timeText}`;
  };

  useEffect(() => {
    const user = readStoredUser();
    if (!user) {
      setError("Please log in to view your remarks.");
      setLoading(false);
      return;
    }

    const studentId = user.id || user.user_id || null;
    if (!studentId) {
      setError("Student ID missing.");
      setLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/api/student/${studentId}/remarks`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Failed to load remarks.");
        }
        return res.json();
      })
      .then((data) => {
        setRemarks(data.remarks || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Error loading remarks.");
        setLoading(false);
      });
  }, []);

  // Refresh the relative labels twice a minute. Anything coarser than this
  // makes "x minutes ago" visibly lag; anything finer just burns renders.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const showEmptyState = !loading && !error && remarks.length === 0;
  // A lone remark gets a feature-card treatment instead of a grid cell, so the
  // panel fills the screen with something readable rather than one small card
  // floating in empty space.
  const isSingleRemark = !loading && !error && remarks.length === 1;

  return (
    <div className={styles.CenterContent}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderText}>
          <span className={styles.pageEyebrow}>
            <i className="bi bi-chat-quote" aria-hidden="true" />
            Feedback
          </span>
          <h1>Teacher&apos;s Remarks</h1>
          <p className={styles.pageSubtitle}>
            Notes your teachers left for you after class.
          </p>
        </div>
        {!loading && !error && remarks.length > 0 ? (
          <span className={styles.countPill}>{remarkCountLabel(remarks.length)}</span>
        ) : null}
      </header>

      {loading ? (
        <div className={styles.stateCard} role="status">
          <span className={styles.stateIcon} aria-hidden="true">
            <i className="bi bi-hourglass-split" />
          </span>
          <p className={styles.stateTitle}>Loading remarks…</p>
          <p className={styles.stateText}>Fetching the latest notes from your teachers.</p>
        </div>
      ) : null}

      {error ? (
        <div className={`${styles.stateCard} ${styles.stateCardError}`} role="alert">
          <span className={styles.stateIcon} aria-hidden="true">
            <i className="bi bi-exclamation-triangle" />
          </span>
          <p className={styles.stateTitle}>Couldn&apos;t load remarks</p>
          <p className={styles.stateText}>{error}</p>
        </div>
      ) : null}

      {showEmptyState ? (
        <div className={styles.stateCard}>
          <span className={styles.stateIcon} aria-hidden="true">
            <i className="bi bi-inbox" />
          </span>
          <p className={styles.stateTitle}>No remarks yet</p>
          <p className={styles.stateText}>
            When a teacher leaves you a note after class, it will show up here.
          </p>
        </div>
      ) : null}

      {!loading && !error && remarks.length > 0 ? (
        <ul
          className={`${styles.remarkList} ${isSingleRemark ? styles.remarkListSolo : ""}`}
        >
          {remarks.map((remark) => {
            const postedOn = formatDate(remark.created_at);
            const postedAgo = relativeTime(remark.created_at, now);
            return (
              <li
                key={remark.remark_id}
                className={`${styles.remarksCard} ${isSingleRemark ? styles.remarksCardFeatured : ""}`}
              >
                <div className={styles.remarksHeader}>
                  <div className={styles.teacherInfo}>
                    <img
                      src={profileSrc(remark.teacher_profile_image_url)}
                      alt=""
                      className={styles.avatar}
                      onError={(event) => {
                        event.currentTarget.src = teacherPic;
                      }}
                    />
                    <div className={styles.teacherNames}>
                      <h3>{remark.teacher_name || "Teacher"}</h3>
                      <span className={styles.teacherRole}>{remark.class_name || "General"}</span>
                    </div>
                  </div>
                  {postedAgo ? (
                    <time
                      className={styles.date}
                      dateTime={remark.created_at}
                      title={postedOn ? `Posted on ${postedOn}` : undefined}
                    >
                      {postedAgo}
                    </time>
                  ) : postedOn ? (
                    <span className={styles.date}>{postedOn}</span>
                  ) : null}
                </div>

                <blockquote className={styles.remarkBody}>
                  {remark.remarks || "No remark text was provided."}
                </blockquote>

                <div className={styles.metaRow}>
                  <span className={styles.metaItem}>
                    <i className="bi bi-collection" aria-hidden="true" />
                    <span className={styles.metaLabel}>Class</span>
                    <span className={styles.metaValue}>{remark.class_name || "N/A"}</span>
                  </span>
                  <span className={styles.metaDivider} aria-hidden="true" />
                  <span className={styles.metaItem}>
                    <i className="bi bi-calendar-event" aria-hidden="true" />
                    <span className={styles.metaLabel}>Date &amp; Time</span>
                    <span className={styles.metaValue}>{formatSubmittedAt(remark.created_at)}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Admin-facing reports for the closing contract reviews.
 *
 * Both sides are kept together on purpose. A teacher's score without the
 * student's rating is only half the story: the level tells the admin what the
 * student achieved, and the student's rating tells them how the contract went.
 *
 * The table is a summary. "View report" opens the full rubric for both people,
 * including every criterion and the comments they left.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import styles from "../assets/adminContractReviews.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import {
  formatComputedLevel,
  LEVEL_EVALUATION_CRITERIA,
} from "../utils/proficiencyEvaluation.js";
import { STUDENT_REVIEW_CRITERIA } from "../utils/contractReview.js";

const API = API_BASE_URL;

const REVIEW_FILTERS = [
  { value: "all", label: "All reviews" },
  { value: "complete", label: "Complete" },
  { value: "awaiting_teacher", label: "Awaiting teacher" },
  { value: "awaiting_student", label: "Awaiting student" },
];

const initials = (name) =>
  String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatAverage = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";

const scoreTone = (value) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return styles.scoreEmpty;
  if (score <= 2) return styles.scoreLow;
  if (score === 3) return styles.scoreMid;
  return styles.scoreHigh;
};

const statusFor = (review) => {
  if (review.review_complete) {
    return { label: "Complete", className: styles.statusComplete };
  }
  if (!review.teacher_review && !review.student_review) {
    return { label: "Awaiting both", className: styles.statusBoth };
  }
  if (!review.teacher_review) {
    return { label: "Awaiting teacher", className: styles.statusTeacher };
  }
  return { label: "Awaiting student", className: styles.statusStudent };
};

const matchesFilter = (review, filter) => {
  if (filter === "complete") return review.review_complete;
  if (filter === "awaiting_teacher") return !review.teacher_review;
  if (filter === "awaiting_student") return !review.student_review;
  return true;
};

function StatTile({ label, value, note, icon }) {
  return (
    <div className={styles.statTile}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>
        {icon && <i className={`bi bi-${icon}`} aria-hidden="true" />}
        {label}
      </span>
      {note && <span className={styles.statNote}>{note}</span>}
    </div>
  );
}

function ReviewSide({ title, subtitle, review, criteria, kind }) {
  const isTeacher = kind === "teacher";

  return (
    <section className={styles.reportColumn}>
      <div className={styles.reportHead}>
        <div>
          <p className={styles.eyebrow}>
            {isTeacher ? "Teacher's evaluation" : "Student's rating"}
          </p>
          <h3>{title}</h3>
          <p className={styles.reportSubtitle}>{subtitle}</p>
        </div>
        <span className={styles.averageBadge}>
          {formatAverage(review?.average)}
          <small>/5</small>
        </span>
      </div>

      {!review ? (
        <div className={styles.pendingBox}>
          <i className="bi bi-hourglass-split" aria-hidden="true" />
          <div>
            <strong>Not submitted yet</strong>
            <p>
              {isTeacher
                ? "The teacher has not submitted the closing evaluation."
                : "The student has not rated the teacher yet."}
            </p>
          </div>
        </div>
      ) : (
        <>
          {isTeacher && review.computed_level && (
            <div className={styles.levelBox}>
              <span>Updated proficiency level</span>
              <strong>{formatComputedLevel(review.computed_level)}</strong>
            </div>
          )}

          <dl className={styles.criteriaList}>
            {criteria.map((criterion) => (
              <div className={styles.criterionRow} key={criterion.key}>
                <dt>{criterion.label}</dt>
                <dd>
                  <span
                    className={`${styles.scoreChip} ${scoreTone(
                      review.scores?.[criterion.key]
                    )}`}
                  >
                    {review.scores?.[criterion.key] ?? "—"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <div className={styles.commentBox}>
            <p className={styles.commentLabel}>Comments</p>
            <p>{review.comments?.trim() || "No comment left."}</p>
          </div>

          <p className={styles.submittedAt}>
            Submitted {formatDate(review.submitted_at)}
          </p>
        </>
      )}
    </section>
  );
}

export default function AdminContractReviews() {
  const { notify } = useNotification() || {};
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  async function loadReports() {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${API}/api/admin/contract-reviews`);
      setReviews(Array.isArray(response.data?.reviews) ? response.data.reviews : []);
    } catch (err) {
      console.error("Error loading contract review reports:", err);
      const message =
        err?.response?.data?.message || "Could not load the contract review reports.";
      setError(message);
      notify?.(message, "error");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
    // loadReports is intentionally not in the dependency list: it closes over
    // notify, and including it would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const summary = useMemo(() => {
    const complete = reviews.filter((review) => review.review_complete).length;
    const awaitingTeacher = reviews.filter((review) => !review.teacher_review).length;
    const awaitingStudent = reviews.filter((review) => !review.student_review).length;
    const teacherScores = reviews
      .map((review) => review.teacher_review?.average)
      .filter((value) => Number.isFinite(Number(value)));
    const studentRatings = reviews
      .map((review) => review.student_review?.average)
      .filter((value) => Number.isFinite(Number(value)));

    const mean = (values) =>
      values.length
        ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
        : null;

    return {
      total: reviews.length,
      complete,
      awaitingTeacher,
      awaitingStudent,
      teacherAverage: mean(teacherScores),
      studentAverage: mean(studentRatings),
    };
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reviews.filter((review) => {
      if (!matchesFilter(review, filter)) return false;
      if (!query) return true;
      const status = statusFor(review).label.toLowerCase();
      return [
        review.student_name,
        review.teacher_name,
        review.course_name,
        review.computed_level,
        review.student_proficiency_level,
        status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [reviews, filter, search]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.head}>
        <div>
          <p className={styles.kicker}>Quality &amp; progress</p>
          <h2>Contract review reports</h2>
          <p className={styles.headText}>
            Read both sides of every completed contract: the teacher&apos;s level
            evaluation of the student, and the student&apos;s rating of the teacher.
          </p>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={loadReports}
          disabled={loading}
        >
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className={styles.statGrid}>
        <StatTile
          label="Completed contracts"
          value={summary.total}
          note="Reports available"
          icon="journal-check"
        />
        <StatTile
          label="Both reviews submitted"
          value={summary.complete}
          note="Fully closed"
          icon="check2-circle"
        />
        <StatTile
          label="Awaiting teacher"
          value={summary.awaitingTeacher}
          note="No level evaluation"
          icon="person-exclamation"
        />
        <StatTile
          label="Awaiting student"
          value={summary.awaitingStudent}
          note="No teacher rating"
          icon="hourglass-split"
        />
        <StatTile
          label="Avg teacher rating"
          value={formatAverage(summary.studentAverage)}
          note="Student rating of teacher"
          icon="star"
        />
        <StatTile
          label="Avg student score"
          value={formatAverage(summary.teacherAverage)}
          note="Teacher evaluation of student"
          icon="bar-chart"
        />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <i className="bi bi-search" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student, teacher, course, level, or status"
            aria-label="Search contract review reports"
          />
        </div>
        <div className={styles.filters} role="group" aria-label="Filter reviews">
          {REVIEW_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.filterButton} ${
                filter === option.value ? styles.filterActive : ""
              }`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}>Loading contract review reports...</div>
      ) : error ? (
        <div className={styles.errorBox}>
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>
            <strong>Reports could not load</strong>
            <p>{error}</p>
            <button type="button" className={styles.linkButton} onClick={loadReports}>
              Try again
            </button>
          </div>
        </div>
      ) : reviews.length === 0 ? (
        <div className={styles.empty}>
          No completed contracts yet. A report opens when every class in a contract
          has been used.
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className={styles.empty}>No reports match this search or filter.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Teacher</th>
                <th>Contract</th>
                <th>Teacher evaluation</th>
                <th>Student rating</th>
                <th>Status</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {filteredReviews.map((review) => {
                const status = statusFor(review);
                return (
                  <tr key={review.review_id}>
                    <td>
                      <div className={styles.person}>
                        <span className={styles.avatar} aria-hidden="true">
                          {initials(review.student_name)}
                        </span>
                        <div>
                          <strong>{review.student_name}</strong>
                          <span className={styles.muted}>
                            {review.course_name || "Course not set"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.person}>
                        <span className={styles.avatar} aria-hidden="true">
                          {initials(review.teacher_name)}
                        </span>
                        <strong>{review.teacher_name}</strong>
                      </div>
                    </td>
                    <td>
                      <strong>
                        {review.classes_used}/{review.total_classes} classes
                      </strong>
                      <span className={styles.muted}>
                        Completed {formatDate(review.completed_at)}
                      </span>
                    </td>
                    <td>
                      {review.teacher_review ? (
                        <div className={styles.resultCell}>
                          <span className={styles.levelBadge}>
                            {formatComputedLevel(review.teacher_review.computed_level) ||
                              "Level recorded"}
                          </span>
                          <span className={styles.muted}>
                            {formatAverage(review.teacher_review.average)}/5 average
                          </span>
                        </div>
                      ) : (
                        <span className={styles.pendingText}>Pending</span>
                      )}
                    </td>
                    <td>
                      {review.student_review ? (
                        <div className={styles.resultCell}>
                          <strong className={styles.ratingValue}>
                            {formatAverage(review.student_review.average)}/5
                          </strong>
                          <span className={styles.muted}>Overall rating</span>
                        </div>
                      ) : (
                        <span className={styles.pendingText}>Pending</span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.statusPill} ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.reportButton}
                        onClick={() => setSelected(review)}
                      >
                        View report
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ModalPortal>
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelected(null);
            }}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-contract-report-title"
            >
              <div className={styles.modalHead}>
                <div>
                  <p className={styles.eyebrow}>Contract review report</p>
                  <h2 id="admin-contract-report-title">
                    {selected.student_name}
                    <span className={styles.modalArrow} aria-hidden="true">
                      →
                    </span>
                    {selected.teacher_name}
                  </h2>
                  <p className={styles.modalMeta}>
                    {selected.course_name || "Course not set"} ·{" "}
                    {selected.classes_used}/{selected.total_classes} classes · Completed{" "}
                    {formatDate(selected.completed_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setSelected(null)}
                  aria-label="Close report"
                >
                  <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
              </div>

              <div className={styles.reportGrid}>
                <ReviewSide
                  kind="teacher"
                  title={`Evaluation of ${selected.student_name}`}
                  subtitle="Five level criteria used to update proficiency"
                  review={selected.teacher_review}
                  criteria={LEVEL_EVALUATION_CRITERIA}
                />
                <ReviewSide
                  kind="student"
                  title={`Rating of ${selected.teacher_name}`}
                  subtitle="Five teaching criteria from the student"
                  review={selected.student_review}
                  criteria={STUDENT_REVIEW_CRITERIA}
                />
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

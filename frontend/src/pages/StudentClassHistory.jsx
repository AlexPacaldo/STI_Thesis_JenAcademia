import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import styles from "../assets/AdminDashboard.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";
import { readStoredUser } from "../utils/sessionUser.js";

const API = API_BASE_URL;
const RECORDS_PER_PAGE = 10;

const STATUS_LABELS = {
  all: "All",
  verified: "Verified",
  needs_review: "Needs Review",
  student_confirmed: "Student Confirmed",
  in_progress: "In Progress",
  pending: "Pending",
  incomplete: "Incomplete",
  missing: "No Log",
};

const statusStyle = (status) => {
  const stylesByStatus = {
    verified: { background: "#dcfce7", color: "#166534" },
    needs_review: { background: "#fef3c7", color: "#92400e" },
    student_confirmed: { background: "#dbeafe", color: "#1d4ed8" },
    in_progress: { background: "#e0f2fe", color: "#0369a1" },
    pending: { background: "#f3f4f6", color: "#374151" },
    incomplete: { background: "#fee2e2", color: "#991b1b" },
    missing: { background: "#fee2e2", color: "#991b1b" },
  };
  return stylesByStatus[status] || stylesByStatus.pending;
};

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTime = (value) => {
  if (!value) return "-";
  const [hours, minutes] = String(value).split(":");
  const parsed = new Date();
  parsed.setHours(Number(hours || 0), Number(minutes || 0), 0, 0);
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const resolveUploadUrl = (url) => {
  if (!url) return "";
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/uploads/")) return `${API}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API}/${cleaned}`;
  return cleaned;
};

const getDisplayStatus = (row) => (
  row.teacher_started_at || row.student_joined_at || row.teacher_ended_at
    ? row.verification_status
    : "missing"
);

const getMissingItems = (row) => {
  const missing = [];
  if (!row.teacher_started_at) missing.push("teacher start");
  if (!row.student_joined_at) missing.push("student attendance");
  if (!row.teacher_ended_at) missing.push("teacher end");
  if (Number(row.duration_minutes || 0) <= 0) missing.push("duration");
  if (!row.summary) missing.push("summary");
  if (!row.proof_url) missing.push("screenshot");
  return missing;
};

const getRequiredClassMinutes = (duration) => {
  const parsedDuration = parseInt(duration, 10);
  const safeDuration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 50;
  return Math.max(1, Math.min(30, Math.ceil(safeDuration * 0.6)));
};

const getReviewReasons = (row) => {
  const reasons = [];
  const durationMinutes = Number(row.duration_minutes || 0);
  const requiredMinutes = getRequiredClassMinutes(row.duration);

  if (!row.teacher_started_at) reasons.push("Missing teacher start");
  if (!row.student_joined_at) reasons.push("Missing student attendance");
  if (!row.teacher_ended_at) reasons.push("Missing teacher end");
  if (durationMinutes < requiredMinutes) reasons.push(`Duration too short: ${durationMinutes} / ${requiredMinutes} min`);
  if (!row.summary) reasons.push("Missing class summary");
  if (!row.proof_url) reasons.push("Missing screenshot proof");

  return reasons;
};

export default function StudentClassHistory({ mode = "student" }) {
  const { notify } = useNotification() || {};
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [classStatusFilter, setClassStatusFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedProof, setSelectedProof] = useState(null);

  const user = readStoredUser();
  const currentUserId = user?.id || user?.user_id || user?.userId;
  const userRole = String(user?.role || "").toLowerCase();
  const isTeacherMode = mode === "teacher";
  const expectedRole = isTeacherMode ? "teacher" : "student";
  const otherPartyLabel = isTeacherMode ? "Student" : "Teacher";
  const title = "Class History";
  const description = isTeacherMode
    ? "Review your conducted classes, student attendance, verified duration, class summary, and screenshot proof."
    : "Review your past class attendance, verified duration, teacher summary, and screenshot proof.";

  const loadHistory = async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/${isTeacherMode ? "api/teacher" : "api/student"}/${currentUserId}/class-history`,
        {
          params: { limit: 200 },
        }
      );
      setHistory(response.data?.history || []);
    } catch (err) {
      console.error(err);
      setHistory([]);
      notify?.(err?.response?.data?.message || "Failed to load class history", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      window.location.href = "/";
      return;
    }
    if (userRole !== expectedRole) {
      window.location.href = userRole === "teacher" ? "/TeacherDashboard" : userRole === "student" ? "/StudentDashboard" : "/AdminDashboard";
      return;
    }
    loadHistory();
  }, [currentUserId, expectedRole, isTeacherMode, userRole]);

  useEffect(() => {
    setPage(1);
  }, [classStatusFilter, dateFrom, dateTo, filter, partyFilter, search]);

  const otherPartyOptions = useMemo(() => {
    const options = new Map();
    history.forEach((row) => {
      const id = isTeacherMode ? row.student_id : row.teacher_id;
      const name = isTeacherMode
        ? `${row.student_first_name || ""} ${row.student_last_name || ""}`.trim()
        : `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`.trim();
      const email = isTeacherMode ? row.student_email : row.teacher_email;
      const label = name || email || `${otherPartyLabel} ${id}`;
      if (id) options.set(String(id), label);
    });
    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [history, isTeacherMode, otherPartyLabel]);

  const classStatusOptions = useMemo(() => {
    const labels = {
      scheduled: "Scheduled",
      completed: "Completed",
      "no-show": "No-show",
      cancelled: "Cancelled",
    };
    return [...new Set(history.map((row) => row.class_status).filter(Boolean))]
      .sort()
      .map((status) => ({ value: status, label: labels[status] || status }));
  }, [history]);

  const hasAdvancedFilters = Boolean(
    search.trim() ||
    filter !== "all" ||
    classStatusFilter !== "all" ||
    partyFilter !== "all" ||
    dateFrom ||
    dateTo
  );

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
    setClassStatusFilter("all");
    setPartyFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredHistory = useMemo(() => {
    const term = search.trim().toLowerCase();
    return history.filter((row) => {
      const displayStatus = getDisplayStatus(row);
      if (filter !== "all" && displayStatus !== filter) return false;
      if (classStatusFilter !== "all" && row.class_status !== classStatusFilter) return false;
      if (dateFrom && (!row.scheduled_date || row.scheduled_date < dateFrom)) return false;
      if (dateTo && (!row.scheduled_date || row.scheduled_date > dateTo)) return false;
      const otherPartyId = isTeacherMode ? row.student_id : row.teacher_id;
      if (partyFilter !== "all" && String(otherPartyId) !== partyFilter) return false;
      if (!term) return true;
      const otherPartyName = isTeacherMode
        ? `${row.student_first_name || ""} ${row.student_last_name || ""}`
        : `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`;
      return [
        row.class_name,
        row.class_status,
        displayStatus,
        otherPartyName,
        isTeacherMode ? row.student_email : row.teacher_email,
        row.scheduled_date,
        row.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [classStatusFilter, dateFrom, dateTo, filter, history, isTeacherMode, partyFilter, search]);

  const counts = {
    all: history.length,
    verified: history.filter((row) => getDisplayStatus(row) === "verified").length,
    needs_review: history.filter((row) => getDisplayStatus(row) === "needs_review").length,
    student_confirmed: history.filter((row) => getDisplayStatus(row) === "student_confirmed").length,
    in_progress: history.filter((row) => getDisplayStatus(row) === "in_progress").length,
    pending: history.filter((row) => getDisplayStatus(row) === "pending").length,
    incomplete: history.filter((row) => getDisplayStatus(row) === "incomplete").length,
    missing: history.filter((row) => getDisplayStatus(row) === "missing").length,
  };

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / RECORDS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedHistory = filteredHistory.slice(
    (safePage - 1) * RECORDS_PER_PAGE,
    safePage * RECORDS_PER_PAGE
  );

  return (
    <div className={styles.Center}>
      <div className={styles.page}>
        <main className={styles.main}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>{title}</h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.9em", color: "#666" }}>
                  {description}
                </p>
              </div>
              <button className={styles.linkBtn} type="button" onClick={loadHistory}>
                Refresh
              </button>
            </div>

            <div className={styles.filterTabs} style={{ marginBottom: 14 }}>
              {["all", "verified", "needs_review", "incomplete", "student_confirmed", "in_progress", "pending", "missing"].map((status) => {
                const activeFilter = filter === status;
                const colors = statusStyle(status === "all" ? "pending" : status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilter(status)}
                    style={{
                      padding: "8px 12px",
                      border: activeFilter ? "1px solid #2f4d3e" : "1px solid #e5e7eb",
                      background: activeFilter ? "#2f4d3e" : colors.background,
                      color: activeFilter ? "#fff" : colors.color,
                      borderRadius: "999px",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: "0.82em",
                    }}
                  >
                    {STATUS_LABELS[status]} ({counts[status] || 0})
                  </button>
                );
              })}
            </div>

            <div className={styles.searchBar}>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search by class, ${otherPartyLabel.toLowerCase()}, status, date, or summary`}
                aria-label="Search class history"
              />
            </div>

            <div className={styles.historyFilters}>
              <label>
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
              <label>
                Class Status
                <select
                  value={classStatusFilter}
                  onChange={(event) => setClassStatusFilter(event.target.value)}
                >
                  <option value="all">All class statuses</option>
                  {classStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                {otherPartyLabel}
                <select
                  value={partyFilter}
                  onChange={(event) => setPartyFilter(event.target.value)}
                >
                  <option value="all">All {otherPartyLabel.toLowerCase()}s</option>
                  {otherPartyOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={clearFilters}
                disabled={!hasAdvancedFilters}
              >
                Clear Filters
              </button>
            </div>

            <div className={styles.verificationList}>
              {loading ? (
                <div className={styles.empty}>Loading class history...</div>
              ) : history.length === 0 ? (
                <div className={styles.empty}>No class history yet</div>
              ) : filteredHistory.length === 0 ? (
                <div className={styles.empty}>No class history matches your search</div>
              ) : (
                pagedHistory.map((row) => {
                  const displayStatus = getDisplayStatus(row);
                  const statusColor = statusStyle(displayStatus);
                  const otherPartyName = isTeacherMode
                    ? `${row.student_first_name || ""} ${row.student_last_name || ""}`.trim() || "Student"
                    : `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`.trim() || "Teacher";
                  const otherPartyEmail = isTeacherMode ? row.student_email : row.teacher_email;
                  const missingItems = getMissingItems(row);
                  const reviewReasons = getReviewReasons(row);
                  const hasRequiredEvidence = missingItems.length === 0;
                  const needsReview = displayStatus === "needs_review";

                  return (
                    <article key={row.class_id} className={styles.verificationItem}>
                      <div className={styles.verificationMain}>
                        <div className={styles.verificationTitleRow}>
                          <div>
                            <h3>{row.class_name || "Untitled Class"}</h3>
                            <p>{formatDate(row.scheduled_date)} · {formatTime(row.start_time)} - {formatTime(row.end_time)} · {row.duration || 0} min</p>
                          </div>
                          <span
                            className={styles.statusPill}
                            style={{ background: statusColor.background, color: statusColor.color }}
                          >
                            {STATUS_LABELS[displayStatus] || displayStatus}
                          </span>
                        </div>

                        <div className={styles.verificationMetaGrid}>
                          <div>
                            <span>{otherPartyLabel}</span>
                            <strong>{otherPartyName}</strong>
                            <small>{otherPartyEmail || "-"}</small>
                          </div>
                          <div>
                            <span>Class Status</span>
                            <strong>{row.class_status || "scheduled"}</strong>
                            <small>Calendar lifecycle</small>
                          </div>
                          <div>
                            <span>Proof</span>
                            <strong>{row.proof_url ? "Uploaded" : "Not uploaded"}</strong>
                            <small>{row.proof_url ? "Screenshot available" : "No screenshot"}</small>
                          </div>
                          <div>
                            <span>Evidence</span>
                            <strong>{hasRequiredEvidence ? "Complete" : "Needs details"}</strong>
                            <small>{hasRequiredEvidence ? "All checkpoints present" : `${missingItems.length} item(s) missing`}</small>
                          </div>
                        </div>

                        <div className={styles.evidenceGrid}>
                          <div><span>Start</span><strong>{formatDateTime(row.teacher_started_at)}</strong></div>
                          <div><span>Attendance</span><strong>{formatDateTime(row.student_joined_at)}</strong></div>
                          <div><span>End</span><strong>{formatDateTime(row.teacher_ended_at)}</strong></div>
                          <div><span>Duration</span><strong>{Number(row.duration_minutes || 0)} min</strong></div>
                        </div>

                        {needsReview ? (
                          <div className={styles.reviewReasonBox}>
                            <strong>Review reason</strong>
                            {reviewReasons.length
                              ? reviewReasons.map((reason) => (
                                  <span key={reason}>{reason}</span>
                                ))
                              : <span>Manual review required</span>}
                          </div>
                        ) : (
                          <div className={hasRequiredEvidence ? styles.goodEvidenceNote : styles.missingEvidenceNote}>
                            {hasRequiredEvidence ? "Evidence complete" : `Missing: ${missingItems.join(", ")}`}
                          </div>
                        )}

                        {row.summary && (
                          <p className={styles.verificationSummary}>{row.summary}</p>
                        )}
                      </div>

                      <div className={styles.verificationActions}>
                        {row.proof_url ? (
                          <button
                            type="button"
                            className={`${styles.linkBtn} ${styles.tableActionBtn}`}
                            onClick={() => setSelectedProof({
                              url: resolveUploadUrl(row.proof_url),
                              className: row.class_name || "Class",
                              otherPartyName,
                              schedule: `${formatDate(row.scheduled_date)} ${formatTime(row.start_time)}`,
                            })}
                          >
                            Open Screenshot
                          </button>
                        ) : (
                          <span className={styles.noProofText}>No screenshot</span>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {filteredHistory.length > RECORDS_PER_PAGE && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  disabled={safePage === 1}
                >
                  Previous
                </button>
                <span>Page {safePage} of {totalPages}</span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                  disabled={safePage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </main>
      </div>

      {selectedProof && (
        <div
          role="presentation"
          onClick={() => setSelectedProof(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.68)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Class screenshot"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(920px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 18px", borderBottom: "1px solid #e5e7eb" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1rem", color: "#10231d" }}>{selectedProof.className}</h3>
                <p style={{ margin: "4px 0 0", color: "#667085", fontSize: "0.86rem" }}>
                  {selectedProof.otherPartyName} / {selectedProof.schedule}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close screenshot preview"
                onClick={() => setSelectedProof(null)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid #d0d5dd",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </div>
            <div style={{ padding: 18, background: "#f8fafc" }}>
              <img
                src={selectedProof.url}
                alt="Class proof screenshot"
                style={{ display: "block", width: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: 10, background: "#fff" }}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// src/pages/Assignments.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../assets/assignments.module.css";
import useLiveRefresh from "../hooks/useLiveRefresh.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";
import { apiFetch } from "../utils/apiAuth.js";
import { formatServerTimestamp, getStoredUserTimezone } from "../utils/timezone.js";

const API = API_BASE_URL;

function getAssignmentDisplayText(row) {
  return row.instructions || row.description || row.name || "Assignment";
}

function formatDateGiven(value) {
  if (!value) return "Not available";
  return formatServerTimestamp(value, getStoredUserTimezone(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDueDate(dateValue, timeValue) {
  if (!dateValue) return "No due date";
  const [year, month, day] = String(dateValue).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "No due date";

  const date = new Date(year, month - 1, day, 12);
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (!timeValue) return formattedDate;

  const [hour = 0, minute = 0] = String(timeValue).split(":").map(Number);
  const dueTime = new Date(year, month - 1, day, hour, minute);
  return `${formattedDate} at ${dueTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function Assignments() {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const currentStudentId = useMemo(() => {
    const user = readStoredUser() || {};
    return user.id ?? user.user_id ?? null;
  }, []);

  const loadAssignments = useCallback(async (showLoading = false) => {
    if (!currentStudentId) return;
    if (showLoading) {
      setIsLoading(true);
      setError("");
    }

    try {
      const response = await apiFetch(`${API}/api/student/${currentStudentId}/assignments`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not load assignments");
      }

      setRows((data.assignments || []).filter(
        (assignment) => Number(assignment.isArchived ?? assignment.is_archived) !== 1
      ));
      setError("");
    } catch (err) {
      if (showLoading) {
        console.error("Load assignments error:", err);
        setRows([]);
        setError(err.message || "Could not load assignments.");
      } else {
        console.warn("Could not update student assignments:", err);
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [currentStudentId]);

  useEffect(() => {
    void loadAssignments(true);
  }, [loadAssignments]);

  useLiveRefresh(() => loadAssignments(false), { enabled: Boolean(currentStudentId) });

  return (
    <div className={styles.page}>
      {isLoading ? (
        <div className={styles.loadingCard}>
          <span className={styles.loadingText}>Loading your assignments...</span>
        </div>
      ) : error ? (
        <div className={styles.errorBanner}>{error}</div>
      ) : rows.length === 0 ? (
        <div className={styles.emptyCard}>
          <span className={styles.emptyIcon} aria-hidden="true"><i className="bi bi-inbox" /></span>
          <h2 className={styles.emptyTitle}>No assignments yet</h2>
          <p className={styles.emptyText}>
            When your teacher gives you homework, it will show up here.
          </p>
        </div>
      ) : (
        <>
          <h2 className={styles.sectionTitle}>Your assignments</h2>
          <div className={styles.assignmentGrid}>
            {rows.map((r) => (
              <article key={r.id} className={styles.assignmentCard}>
                <div className={styles.cardInfo}>
                  <span className={styles.cardTitle}>{getAssignmentDisplayText(r)}</span>
                  {r.subject && (
                    <span className={styles.cardSubject}>{r.subject}</span>
                  )}
                  <div className={styles.cardDates}>
                    <span>
                      <strong>Date given:</strong> {formatDateGiven(r.postedAt)}
                    </span>
                    <span>
                      <strong>Due date:</strong> {formatDueDate(r.dueDate, r.dueTime)}
                    </span>
                  </div>
                  <span className={styles.cardStatus}>
                    {r.submissionId ? "Done" : "Not done yet"}
                  </span>
                </div>
                <div className={styles.actions}>
                  <Link
                    to={`/assignmentsDropbox?assignmentId=${r.id}`}
                    className={styles.cardButton}
                    aria-label={`Open ${getAssignmentDisplayText(r)}`}
                  >
                    Open
                    <span className={styles.cardArrow} aria-hidden="true">&#9654;</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

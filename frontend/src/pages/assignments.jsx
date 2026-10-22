// src/pages/Assignments.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../assets/assignments.module.css";
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

  useEffect(() => {
    if (!currentStudentId) return;

    let ignore = false;
    setIsLoading(true);
    setError("");

    apiFetch(`${API}/api/student/${currentStudentId}/assignments`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || "Could not load assignments");
        }
        return data;
      })
      .then((data) => {
        if (!ignore) setRows(data.assignments || []);
      })
      .catch((err) => {
        console.error("Load assignments error:", err);
        if (!ignore) {
          setRows([]);
          setError(err.message || "Could not load assignments.");
        }
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [currentStudentId]);

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
          <span className={styles.emptyIcon} aria-hidden="true">📭</span>
          <h2 className={styles.emptyTitle}>No assignments yet</h2>
          <p className={styles.emptyText}>
            When your teacher gives you homework, it will show up here.
          </p>
        </div>
      ) : (
        <>
          <h2 className={styles.sectionTitle}>Your assignments</h2>
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
        </>
      )}
    </div>
  );
}

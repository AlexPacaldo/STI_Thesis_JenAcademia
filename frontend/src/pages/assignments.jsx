// src/pages/Assignments.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../assets/assignments.module.css";
import { getStoredUserTimezone } from "../utils/timezone.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;

function getAssignmentDisplayText(row) {
  return row.instructions || row.description || row.name || "Assignment";
}

function formatDueDate(row) {
  const dueDate = row.dueDate || "";
  const dueTime = row.dueTime || "";

  if (dueDate) {
    const [year, month, day] = dueDate.split("-").map(Number);
    const [hour = 0, minute = 0] = dueTime.split(":").map(Number);
    const date = new Date(year, month - 1, day, hour, minute);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(undefined, {
        timeZone: getStoredUserTimezone(),
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: dueTime ? "numeric" : undefined,
        minute: dueTime ? "2-digit" : undefined,
      });
    }
  }

  if (row.due) {
    return String(row.due).replace("T", " ");
  }

  return "No due date";
}

function formatDateGiven(row) {
  const postedAt = row.postedAt || row.createdAt || "";
  if (!postedAt) return "Not available";

  const normalized = String(postedAt).replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return String(postedAt);
  }

  return date.toLocaleString(undefined, {
    timeZone: getStoredUserTimezone(),
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function hasDueDate(row) {
  return Boolean(row.dueDate || row.due);
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

    fetch(`${API}/api/student/${currentStudentId}/assignments`)
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
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Assignment</th>
              <th scope="col">Date and Time</th>
              <th scope="col">Due</th>
              <th scope="col">Subject</th>
              <th scope="col" className={styles.actionHeader}>Action</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="5">
                  <p className={styles.stateCell}>Loading assignments…</p>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="5">
                  <p className={`${styles.stateCell} ${styles.stateCellError}`}>{error}</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan="5">
                  <div className={styles.emptyState}>
                    <span className={styles.emptyIcon} aria-hidden="true">
                      <i className="bi bi-inbox" />
                    </span>
                    <p className={styles.emptyTitle}>No assignments yet</p>
                    <p className={styles.emptyText}>
                      When a teacher posts homework, it will show up here.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={styles.assignmentTitle}>
                      {getAssignmentDisplayText(r)}
                    </span>
                  </td>
                  <td>
                    <time className={styles.dateCell} dateTime={r.postedAt || r.createdAt || undefined}>
                      {formatDateGiven(r)}
                    </time>
                  </td>
                  <td>
                    {hasDueDate(r) ? (
                      <span className={styles.duePill}>{formatDueDate(r)}</span>
                    ) : (
                      <span className={styles.noDue}>No due date</span>
                    )}
                  </td>
                  <td>
                    <span className={styles.subjectPill}>{r.subject || "General"}</span>
                  </td>
                  <td className={styles.actionCell}>
                    <Link
                      to={`/assignmentsDropbox?assignmentId=${r.id}`}
                      className={styles.submitButton}
                      aria-label={`View ${getAssignmentDisplayText(r)}`}
                    >
                      View
                      <i className="bi bi-arrow-right" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

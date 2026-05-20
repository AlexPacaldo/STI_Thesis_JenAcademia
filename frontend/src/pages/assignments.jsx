// src/pages/Assignments.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../assets/assignments.module.css";
import { getStoredUserTimezone } from "../utils/timezone.js";

const API = "http://localhost:3001";

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

export default function Assignments() {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const currentStudentId = useMemo(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return user.id ?? user.user_id ?? null;
    } catch {
      return null;
    }
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
    <>
      <div className={styles.Center}>
        <table className={styles.table}>
          <thead className={styles.theadLight}>
            <tr>
              <th scope="col">Assignments</th>
              <th scope="col">Due</th>
              <th scope="col">Subject</th>
              <th scope="col">Action</th>
              <th scope="col">Score</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "2rem" }}>
                  Loading assignments...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "2rem" }}>
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "2rem" }}>
                  No assignments have been posted to you yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{getAssignmentDisplayText(r)}</td>
                  <td>{formatDueDate(r)}</td>
                  <td>{r.subject || "General"}</td>
                  <td>
                    <Link
                      to={`/assignmentsDropbox?assignmentId=${r.id}`}
                      className={styles.submitButton}
                      aria-label="View assignment"
                    >
                      View
                    </Link>
                  </td>
                  <td>{r.score || "Pending"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

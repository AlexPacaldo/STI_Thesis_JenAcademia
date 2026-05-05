// src/pages/Assignments.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../assets/assignments.module.css";

function PenIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16" height="16" viewBox="0 0 16 16"
      fill="currentColor" aria-hidden="true" {...props}
    >
      <path d="M13.498.795l.149-.149a1.207 1.207 0 1 1 1.707 1.708l-.149.148a1.5 1.5 0 0 1-.059 2.059L4.854 14.854a.5.5 0 0 1-.233.131l-4 1a.5.5 0 0 1-.606-.606l1-4a.5.5 0 0 1 .131-.232l9.642-9.642a.5.5 0 0 0-.642.056L6.854 4.854a.5.5 0 1 1-.708-.708L9.44.854A1.5 1.5 0 0 1 11.5.796 1.5 1.5 0 0 1 13.498.795Zm-.644.766a.5.5 0 0 0-.707 0L1.95 11.756l-.764 3.057 3.057-.764L14.44 3.854a.5.5 0 0 0 0-.708z" />
    </svg>
  );
}

export default function Assignments() {
  const [currentStudent, setCurrentStudent] = useState("");

  // Get current logged-in student from localStorage
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const studentName = user.firstName || user.first_name
        ? `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim()
        : user.name || user.fullName || "";
      setCurrentStudent(studentName);
    } catch {
      setCurrentStudent("");
    }
  }, []);

  // ✅ Changed from useMemo to useState + useEffect so the list
  //    updates reactively when the teacher posts a new assignment.
  const [rows, setRows] = useState([]);

  // Initialize rows when currentStudent is set
  useEffect(() => {
    if (!currentStudent) return;
    const stored = localStorage.getItem("teacherAssignments");
    if (!stored) {
      setRows([]);
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      setRows(parsed.filter((a) => a.student === currentStudent));
    } catch {
      setRows([]);
    }
  }, [currentStudent]);

  // Cross-tab sync
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === "teacherAssignments" && e.newValue && currentStudent) {
        try {
          const parsed = JSON.parse(e.newValue);
          setRows(parsed.filter((a) => a.student === currentStudent));
        } catch {
          setRows([]);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [currentStudent]);

  // Same-tab polling
  useEffect(() => {
    if (!currentStudent) return;
    const interval = setInterval(() => {
      const stored = localStorage.getItem("teacherAssignments");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const filtered = parsed.filter((a) => a.student === currentStudent);
          setRows((prev) => {
            const prevStr = JSON.stringify(prev);
            const nextStr = JSON.stringify(filtered);
            return prevStr === nextStr ? prev : filtered;
          });
        } catch {
          // ignore
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [currentStudent]);

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
            {rows.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "2rem" }}>
                  No assignments have been posted to you yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.due}</td>
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

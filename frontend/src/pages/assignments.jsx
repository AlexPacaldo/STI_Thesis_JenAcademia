// src/pages/Assignments.jsx
import { Link } from "react-router-dom"; // remove if not using Router
import styles from "../assets/Assignments.module.css";

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
  const rows = [
    { id: 1, name: "Activity 1", due: "June 09, 2025", subject: "Business English", score: "50/60" },
    { id: 2, name: "Activity 1", due: "June 09, 2025", subject: "Business English", score: "50/60" },
    { id: 3, name: "Activity 1", due: "June 09, 2025", subject: "Business English", score: "50/60" },
    { id: 4, name: "Activity 1", due: "June 09, 2025", subject: "Business English", score: "50/60" },
    { id: 5, name: "Activity 1", due: "June 09, 2025", subject: "Business English", score: "50/60" },
    { id: 6, name: "Activity 1", due: "June 09, 2025", subject: "Business English", score: "50/60" },
    { id: 7, name: "Activity 1", due: "June 09, 2025", subject: "Business English", score: "50/60" },
    { id: 8, name: "Activity 1", due: "June 09, 2025", subject: "Business English", score: "50/60" },
  ];

  return (
    <>
      <div className={styles.Center}>
        <table className={styles.table}>
          <thead className={styles.theadLight}>
            <tr>
              <th scope="col">Assignments</th>
              <th scope="col">Due</th>
              <th scope="col">Subject</th>
              <th scope="col">Submitted</th>
              <th scope="col">Score</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.due}</td>
                <td>{r.subject}</td>
                <td>
                  {/* If not using Router, replace Link with <a href="/assignments-dropbox" ...> */}
                  <Link to="/assignmentsDropbox" className={styles.Icon} aria-label="Submit assignment">
                    <PenIcon />
                  </Link>
                </td>
                <td>{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

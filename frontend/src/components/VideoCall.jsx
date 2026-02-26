import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import styles from "../assets/videoCall.module.css";

// Optional: pass names/images via navigate(..., { state:{ teacher, student }})
export default function VideoCall() {
  const { state } = useLocation();
  const teacher = state?.teacher || { name: "Teacher Jen", img: "/img/call/teacher.jpg" };
  const student = state?.student || { name: "Santos", img: "/img/call/student.jpg" };
  const [user, setUser] = useState(null);
    const [role, setRole] = useState(null); // ✅ Track if user is student or teacher
    useEffect(() => {
        try {
          const stored = localStorage.getItem("user");
          if (stored) {
            const parsedUser = JSON.parse(stored);
            setUser(parsedUser);
            setRole(parsedUser.role); // fallback role
          }
        } catch (e) {
          console.warn("Failed to read user from localStorage:", e);
        }
      }, []);

  return (
    <div className={styles.Cont}>
    <main className={styles.page}>
      {/* Left: call stage */}
      <section className={styles.stage}>
        <div className={styles.tiles}>
          <div className={styles.tile}>
            {/* Replace <img> with <video> stream later */}
            <img className={styles.feed} src={teacher.img} alt={teacher.name} />
            <div className={styles.nameBar}>{teacher.name}</div>
          </div>

          <div className={styles.tile}>
            <img className={styles.feed} src={student.img} alt={student.name} />
            <div className={styles.nameBar}>{student.name}</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <button className={styles.btn} aria-label="Toggle speakers">🔊</button>
          <button className={styles.btn} aria-label="Toggle mic">🎤</button>
          <button className={styles.btn} aria-label="Toggle camera">📷</button>
          {role === "student" && (
            <>
                <Link to="/StudentDashboard" className={`${styles.btn} ${styles.end}`} aria-label="End call">📞</Link>
            </>
            )}
            {role === "teacher" && (
                <>
                    <Link to="/TeacherDashboard" className={`${styles.btn} ${styles.end}`} aria-label="End call">📞</Link>
                </>
            )}
          <button className={styles.btn} aria-label="Share screen">🖥️</button>
          <button className={styles.btn} aria-label="Chat">💬</button>
          <button className={styles.btn} aria-label="More">⋯</button>
        </div>
      </section>

      {/* Right: notes panel */}
      <aside className={styles.notes}>
        <h3>Notes:</h3>
        <textarea
          className={styles.noteBox}
          placeholder="Write your notes here..."
        />
      </aside>
    </main>
    </div>
  );
}

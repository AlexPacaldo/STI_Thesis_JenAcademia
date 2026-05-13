import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "../assets/StudentDashboard.module.css";

const API = "http://localhost:3001";

function getCurrentStudentId() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.id ?? user.user_id ?? null;
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString();
}

function getAssignmentText(assignment) {
  return assignment.instructions || assignment.description || assignment.name || "Assignment";
}

function isOpenAssignment(assignment) {
  return !assignment.submissionId && assignment.status !== "submitted";
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [rescheduleMode] = useState(false);
  const [latestRemarks, setLatestRemarks] = useState([]);
  const [openAssignments, setOpenAssignments] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      const user = JSON.parse(stored);
      if (!user.profileCompleted) {
        navigate("/account");
      }
    }
  }, [navigate]);

  useEffect(() => {
    const studentId = getCurrentStudentId();
    if (!studentId) return;

    let ignore = false;

    Promise.all([
      fetch(`${API}/api/student/${studentId}/remarks`).then((res) => res.json()),
      fetch(`${API}/api/student/${studentId}/assignments`).then((res) => res.json()),
    ])
      .then(([remarksData, assignmentsData]) => {
        if (ignore) return;
        setLatestRemarks((remarksData.remarks || []).slice(0, 3));
        setOpenAssignments((assignmentsData.assignments || []).filter(isOpenAssignment).slice(0, 3));
      })
      .catch((err) => {
        console.error("Load student dashboard summary error:", err);
        if (!ignore) {
          setLatestRemarks([]);
          setOpenAssignments([]);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const upcoming = [
    { id: 1, title: "Business English", teacher: "Teacher Jen", time: "9:00 AM - 10:00 AM" },
    { id: 2, title: "Travel English", teacher: "Teacher Shyla", time: "2:00 PM - 3:00 PM" },
    { id: 3, title: "IELTS", teacher: "Teacher Lovelyn", time: "10:00 AM - 11:00 AM" },
    { id: 4, title: "OPIc", teacher: "Teacher Mhelai", time: "4:00 PM - 5:00 PM" },
  ];

  const handleCardClick = (cls) => {
    if (rescheduleMode) {
      navigate(`/reschedule/${cls.id}`, { state: { cls } });
    } else {
      navigate(`/call/${cls.id}`, { state: { cls } });
    }
  };

  return (
    <main className={styles.mainn}>
      <section className={styles.Center}>
        <div className={styles.Title}>
          <h1><b>Your Classes Today</b></h1>
          <p>Stay organized with your classes and assignments.</p>
        </div>

        <div className={styles.CenterContent}>
          <div className={styles.LeftContent}>
            <h2>Upcoming Classes</h2>
            <p>
              Click a card to {rescheduleMode ? "reschedule your class" : "join your class"}.
            </p>
          </div>

          <div className={styles.RightContent}>
            {upcoming.map((cls) => (
              <div
                key={cls.id}
                className={`${styles.classCard} ${rescheduleMode ? styles.rescheduleMode : ""}`}
                onClick={() => handleCardClick(cls)}
              >
                <h3>{cls.title}</h3>
                <p>{cls.teacher}</p>
                <p>{cls.time}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.bottomRow}>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>Teacher's Latest Remarks</h3>
            {latestRemarks.length ? (
              latestRemarks.map((remark) => (
                <Link to="/remarks" className={styles.noteCard} key={remark.remark_id}>
                  <div className={styles.noteDate}>{formatDate(remark.created_at || remark.scheduled_date)}</div>
                  <div className={styles.noteText}>{remark.remarks}</div>
                </Link>
              ))
            ) : (
              <div className={styles.emptyCard}>No teacher remarks yet.</div>
            )}
          </section>

          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>New Assignments</h3>
            {openAssignments.length ? (
              openAssignments.map((assignment) => (
                <Link
                  to={`/assignmentsDropbox?assignmentId=${assignment.id}`}
                  className={styles.noteCard}
                  key={assignment.id}
                >
                  <div className={styles.noteDate}>{formatDate(assignment.dueDate)}</div>
                  <div className={styles.noteText}>{getAssignmentText(assignment)}</div>
                </Link>
              ))
            ) : (
              <div className={styles.emptyCard}>No new assignments.</div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

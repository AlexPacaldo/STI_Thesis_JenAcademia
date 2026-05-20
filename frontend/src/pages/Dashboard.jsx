import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import styles from "../assets/Dashboard.module.css";
import {
  DEFAULT_TIMEZONE,
  convertDateTime,
  formatDateInTimezone,
  getUserTimezone,
  humanTime as formatHumanTime,
} from "../utils/timezone.js";

const API = "http://localhost:3001";

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function getTodayDate() {
  const user = getCurrentUser();
  return formatDateInTimezone(new Date(), getUserTimezone(user));
}

function formatClassTime(cls, viewerTimezone) {
  const sourceTimezone = cls.teacher_timezone || DEFAULT_TIMEZONE;
  const start = convertDateTime(cls.scheduled_date, cls.start_time, sourceTimezone, viewerTimezone);
  const end = convertDateTime(cls.scheduled_date, cls.end_time, sourceTimezone, viewerTimezone);
  return `${formatHumanTime(start.time)} - ${formatHumanTime(end.time)}`;
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

export default function Dashboard({ mode }) {
  const navigate = useNavigate();
  const [rescheduleMode] = useState(false);
  const [latestRemarks, setLatestRemarks] = useState([]);
  const [openAssignments, setOpenAssignments] = useState([]);
  const [upcomingClasses, setUpcomingClasses] = useState([]);

  const user = getCurrentUser();
  const isTeacher = mode === "teacher";
  const viewerTimezone = getUserTimezone(user);

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
    const today = getTodayDate();
    const storedUser = getCurrentUser();
    const currentUserId = storedUser.id ?? storedUser.user_id ?? null;
    if (!currentUserId) return;

    let ignore = false;

    if (isTeacher) {
      axios
        .get(`${API}/api/calendar/classes-by-date`, {
          params: {
            teacher_id: currentUserId,
            scheduled_date: today,
          },
        })
        .then((response) => {
          if (ignore) return;
          const classes = (response.data.classes || []).map((cls) => ({
            id: cls.class_id || cls.id,
            student: cls.student_name ? `${cls.student_name} ${cls.student_last_name || ""}`.trim() : cls.studentName || "Student",
            subject: cls.class_name || cls.className || "Class",
            time: formatClassTime(cls, viewerTimezone),
            raw: cls,
          }));
          setUpcomingClasses(classes);
        })
        .catch((error) => {
          console.error("Error fetching today's classes:", error);
          if (!ignore) setUpcomingClasses([]);
        });
    } else {
      Promise.all([
        fetch(`${API}/api/student/${currentUserId}/remarks`).then((res) => res.json()),
        fetch(`${API}/api/student/${currentUserId}/assignments`).then((res) => res.json()),
        axios.get(`${API}/api/calendar/classes-by-date`, {
          params: {
            student_id: currentUserId,
            scheduled_date: today,
          },
        }),
      ])
        .then(([remarksData, assignmentsData, classesRes]) => {
          if (ignore) return;
          setLatestRemarks((remarksData.remarks || []).slice(0, 3));
          setOpenAssignments((assignmentsData.assignments || []).filter(isOpenAssignment).slice(0, 3));
          const classes = (classesRes.data.classes || []).map((cls) => ({
            id: cls.class_id || cls.id,
            title: cls.class_name || cls.className || cls.subject || "Class",
            teacher: cls.teacher_name ? `Teacher ${cls.teacher_name}` : cls.teacherName || "Teacher",
            time: formatClassTime(cls, viewerTimezone),
            scheduled_date: cls.scheduled_date || cls.date || null,
            raw: cls,
          }));
          setUpcomingClasses(classes);
        })
        .catch((err) => {
          console.error("Load student dashboard summary error:", err);
          if (!ignore) {
            setLatestRemarks([]);
            setOpenAssignments([]);
            setUpcomingClasses([]);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [isTeacher]);

  const upcoming = upcomingClasses.length
    ? upcomingClasses
    : [
        isTeacher
          ? { id: "empty-1", student: "No classes scheduled for today", subject: "", time: "" }
          : { id: "empty-1", title: "No classes scheduled for today", teacher: "", time: "" },
      ];

  const handleCardClick = (cls) => {
    if (rescheduleMode) {
      navigate(`/reschedule/${cls.id}`, { state: { cls } });
      return;
    }

    if (cls.raw && cls.raw.scheduled_date) {
      navigate("/Calendar", { state: { selectedDate: cls.raw.scheduled_date } });
      return;
    }
    navigate("/Calendar");
  };

  if (isTeacher) {
    return (
      <main className={styles.mainn}>
        <section className={styles.Center}>
          <div className={styles.Title}>
            <h1><b>Your Class Schedule</b></h1>
            <p>Stay organized with your classes.</p>
          </div>

          <div className={styles.CenterContent}>
            <div className={styles.LeftContent}>
              <h2>Today's Classes</h2>
              <p>Click a card to {rescheduleMode ? "reschedule the class" : "start the video call"}.</p>
            </div>

            <div className={styles.RightContent}>
              {upcoming.map((cls) => (
                <div
                  key={cls.id}
                  className={`${styles.classCard} ${rescheduleMode ? styles.rescheduleMode : ""}`}
                  onClick={() => handleCardClick(cls)}
                  title={rescheduleMode ? "Reschedule this class" : "Join the call"}
                >
                  <h3>{cls.student}</h3>
                  <p>{cls.subject}</p>
                  <p>{cls.time}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

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

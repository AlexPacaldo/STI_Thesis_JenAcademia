import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "../assets/StudentDashboard.module.css";

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [rescheduleMode, setRescheduleMode] = useState(false);

  const upcoming = [
    { id: 1, title: "Business English", teacher: "Teacher Jen", time: "9:00 AM – 10:00 AM" },
    { id: 2, title: "Travel English", teacher: "Teacher Shyla", time: "2:00 PM – 3:00 PM" },
    { id: 3, title: "IELTS", teacher: "Teacher Lovelyn", time: "10:00 AM – 11:00 AM" },
    { id: 4, title: "OPIc", teacher: "Teacher Mhelai", time: "4:00 PM – 5:00 PM" },
  ];

  const lastRemark = { date: "10/11/2025", text: "Great participation today! Focus on pronunciation next class." };
  const todos = [{ id: 1, date: "10/11/2025", text: "Review vocabulary list for Business English." }];

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

          {/* Toggle Button */}
          
        </div>

        {/* Classes */}
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

        {/* Remarks + To Do */}
        <div className={styles.bottomRow}>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>Teacher’s Last Remark</h3>
            <div className={styles.noteCard}>
              <div className={styles.noteDate}>{lastRemark.date}</div>
              <div className={styles.noteText}>{lastRemark.text}</div>
            </div>
          </section>

          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>To Do</h3>
            {todos.map((t) => (
              <div className={styles.noteCard} key={t.id}>
                <div className={styles.noteDate}>{t.date}</div>
                <div className={styles.noteText}>{t.text}</div>
              </div>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}

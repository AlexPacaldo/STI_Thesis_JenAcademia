import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "../assets/TeacherDashboard.module.css";

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [rescheduleMode, setRescheduleMode] = useState(false);

  const upcoming = [
    { id: 1, student: "Alexander John G. Pacaldo", subject: "Business English", time: "9:00 AM – 10:00 AM" },
    { id: 2, student: "Sophia Gail D. Santos",     subject: "Business English", time: "2:00 PM – 3:00 PM" },
    { id: 3, student: "Sophia Avegail Santos",      subject: "Business English", time: "10:00 AM – 11:00 AM" },
    { id: 4, student: "Karol Josef V. Tabio",       subject: "Business English", time: "4:00 PM – 5:00 PM" },
  ];

  const handleCardClick = (cls) => {
    if (rescheduleMode) {
      // Teacher flow: open the schedule editor and pass class info
      navigate(`/reschedule/${cls.id}`, { state: { cls } });
    } else {
      // Default = start the class call
      navigate(`/call/${cls.id}`, { state: { cls } });
    }
  };

  return (
    <main className={styles.mainn}>
      <section className={styles.Center}>
        <div className={styles.Title}>
          <h1><b>Your Class Schedule</b></h1>
          <p>Stay organized with your classes.</p>
        </div>

        <div className={styles.CenterContent}>
          <div className={styles.LeftContent}>
            <h2>Upcoming Classes</h2>
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

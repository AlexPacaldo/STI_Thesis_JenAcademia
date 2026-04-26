// src/pages/Remarks.jsx
import { useEffect, useState } from "react";
import teacherPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/remarks.module.css";

export default function Remarks() {
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (value) => {
    if (!value) return null;
    if (typeof value === "string" && value.includes("T")) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
      }
    }

    const [hour, minute] = value.split(":");
    if (hour == null || minute == null) return value;
    const hourNumber = parseInt(hour, 10);
    if (Number.isNaN(hourNumber)) return value;
    const ampm = hourNumber >= 12 ? "PM" : "AM";
    const hour12 = ((hourNumber + 11) % 12) + 1;
    return `${hour12}:${minute}${ampm}`;
  };

  const getScheduleText = (remark) => {
    const dateText = formatDate(remark.scheduled_date);
    const timeText = remark.start_time ? formatTime(remark.start_time) : formatTime(remark.scheduled_date);
    if (dateText && timeText) return `${dateText} at ${timeText}`;
    if (dateText) return dateText;
    if (timeText) return timeText;
    return "N/A";
  };

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      setError("Please log in to view your remarks.");
      setLoading(false);
      return;
    }

    let user;
    try {
      user = JSON.parse(stored);
    } catch (err) {
      setError("Unable to read current user information.");
      setLoading(false);
      return;
    }

    const studentId = user.id || user.user_id || null;
    if (!studentId) {
      setError("Student ID missing.");
      setLoading(false);
      return;
    }

    fetch(`http://localhost:3001/api/student/${studentId}/remarks`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Failed to load remarks.");
        }
        return res.json();
      })
      .then((data) => {
        setRemarks(data.remarks || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Error loading remarks.");
        setLoading(false);
      });
  }, []);

  return (
    <section className={styles.Center}>
      <div className={styles.CenterContent}>
        <br />
        <h1><b>Teacher’s Remarks</b></h1>

        {loading && <p>Loading remarks...</p>}
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        {!loading && !error && remarks.length === 0 && (
          <p>No teacher remarks have been posted yet.</p>
        )}

        {remarks.map((remark) => (
          <div key={remark.remark_id} className={styles.remarksCard}>
            <div className={styles.remarksHeader}>
              <div className={styles.teacherInfo}>
                <img src={teacherPic} alt={remark.teacher_name} className={styles.avatar} />
                <h3>{remark.teacher_name}</h3>
              </div>
              <span className={styles.date}>{new Date(remark.created_at).toLocaleDateString()}</span>
            </div>
            <p>{remark.remarks}</p>
            <div style={{ marginTop: 10, fontSize: "0.9rem", color: "#4b5563" }}>
              Class: {remark.class_name || "N/A"} · Scheduled: {getScheduleText(remark)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

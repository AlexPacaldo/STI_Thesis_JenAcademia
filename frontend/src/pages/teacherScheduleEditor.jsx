import { useMemo, useState, useEffect } from "react";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/studentSchedule.module.css";

// API base
const API = "http://localhost:3001";

// helper to format ISO date string
const fmtDate = (d) => (d ? d.toISOString().slice(0, 10) : "");


/**
 * Teacher schedule editor — displays a monthly calendar where teachers can set
 * availability and view scheduled classes. Data is pulled from the backend
 * using the calendar tables (teacher_availability, classes).
 *
 * Optional props:
 * - title: header text for the page
 */
export default function teacherScheduleEditor({ title = "Teacher Availability" } = {}) {
  const { notify } = useNotification() || {};
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [availability, setAvailability] = useState({});
  const [classesCache, setClassesCache] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [localUserId, setLocalUserId] = useState(null);

  // load teacher ID from local storage
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      if (u && u.id) setLocalUserId(u.id);
    } catch {}
  }, []);

  const viewDate = new Date(year, month, 1);
  const monthName = viewDate.toLocaleString("default", { month: "long" });

  // grid days
  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const statusOf = (d) => (d ? availability[fmtDate(d)] || "" : "");

  const handleCellClick = (d) => {
    if (!d) return;
    const dateStr = fmtDate(d);
    setSelectedDate(dateStr);
    loadClassesForDate(dateStr);
  };

  // fetch availability when month/year or teacher id changes
  useEffect(() => {
    if (!localUserId) return;
    const y = year;
    const m = month + 1;
    axios
      .get(`${API}/api/calendar/teacher-availability`, {
        params: { teacher_id: localUserId, year: y, month: m }
      })
      .then(r => {
        if (r.data && r.data.availability) setAvailability(r.data.availability);
      })
      .catch(() => {});
  }, [year, month, localUserId]);

  // helper to load classes for a date and cache them
  const loadClassesForDate = (dateStr) => {
    if (!dateStr || classesCache[dateStr]) return;
    axios
      .get(`${API}/api/calendar/classes-by-date`, {
        params: { scheduled_date: dateStr, teacher_id: localUserId }
      })
      .then(r => {
        if (r.data && r.data.classes) {
          setClassesCache(prev => ({ ...prev, [dateStr]: r.data.classes }));
        }
      })
      .catch(() => {
        setClassesCache(prev => ({ ...prev, [dateStr]: [] }));
      });
  };

  // Check if a date has classes (cached)
  const hasClassesOnDate = (d) => {
    if (!d) return false;
    const formatted = fmtDate(d);
    const classes = classesCache[formatted];
    return classes && classes.length > 0;
  };

  // month navigation
  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };
  const jumpToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const countAvailable = days.reduce(
    (acc, d) => (d && statusOf(d) === "available" ? acc + 1 : acc),
    0
  );
  const countUnavailable = days.reduce(
    (acc, d) => (d && statusOf(d) === "unavailable" ? acc + 1 : acc),
    0
  );

  // Get scheduled classes for selected date from cache
  const selectedClasses = selectedDate ? (classesCache[selectedDate] || []) : [];

  // Get selected class details
  const selectedClass = selectedClassId
    ? selectedClasses.find(cls => cls.id === selectedClassId)
    : null;

  return (
    <main className={styles.page}>
      <section className={styles.center}>
        <h1 className={styles.title}>Calendar</h1>

        <div className={styles.wrapper}>
          <div className={styles.calendarCard}>
            <div className={styles.calHeader}>
              <button onClick={prevMonth} className={styles.navBtn} aria-label="Previous month">
                ‹
              </button>
              <div className={styles.monthLabel}>
                {monthName} {year}
              </div>
              <button onClick={nextMonth} className={styles.navBtn} aria-label="Next month">
                ›
              </button>
            </div>

            <div className={styles.weekHeader}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className={styles.weekday}>
                  {d}
                </div>
              ))}
            </div>

            <div className={styles.grid}>
              {days.map((d, idx) => {
                const status = statusOf(d);
                const hasClasses = hasClassesOnDate(d);
                return (
                  <button
                    key={idx}
                    className={[
                      styles.cell,
                      !d && styles.empty,
                      styles.clickableCell,         // interactive for teacher
                      status === "available" && styles.available,
                      hasClasses && styles.available,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleCellClick(d)}
                    disabled={!d}
                    title={
                      !d
                        ? ""
                        : "Click to view scheduled classes"
                    }
                  >
                    {d ? d.getDate() : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className={styles.bookPanel}>
            {selectedClass ? (
              // Class selected view - show student info
              <>
                <div className={styles.legendTitle}>
                  Student Information
                </div>
                <div className={styles.slotList}>
                  <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                    <div><strong>Name:</strong></div>
                    <div style={{ fontSize: "0.95em", marginTop: "4px" }}>{selectedClass.studentName}</div>
                  </div>
                  <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                    <div><strong>Email:</strong></div>
                    <div style={{ fontSize: "0.85em", marginTop: "4px", wordBreak: "break-all" }}>{selectedClass.studentEmail}</div>
                  </div>
                  <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                    <div><strong>Class:</strong></div>
                    <div style={{ fontSize: "0.95em", marginTop: "4px" }}>{selectedClass.className}</div>
                  </div>
                  <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                    <div><strong>Time:</strong></div>
                    <div style={{ fontSize: "0.85em", marginTop: "4px" }}>{selectedClass.time} ({selectedClass.duration})</div>
                  </div>
                </div>
                <a
                  href={selectedClass.classLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.bookBtn}
                  style={{ textDecoration: "none", textAlign: "center", display: "block" }}
                >
                  Join Class
                </a>
                <button
                  className={styles.bookBtn}
                  onClick={() => {
                    notify(`Reschedule request sent for ${selectedClass.className}`, "success");
                  }}
                  style={{ marginTop: "8px" }}
                >
                  Request for Reschedule
                </button>
                <button
                  className={styles.slotBtn}
                  onClick={() => setSelectedClassId(null)}
                  style={{ marginTop: "8px" }}
                >
                  Back to Classes
                </button>
              </>
            ) : selectedDate ? (
              // Date selected view - show classes
              <>
                <div className={styles.legendTitle}>
                  Classes on {new Date(selectedDate + "T00:00:00").toLocaleDateString()}
                </div>
                <div className={styles.slotList}>
                  {selectedClasses && selectedClasses.length > 0 ? (
                    selectedClasses.map((cls, idx) => (
                      <button
                        key={idx}
                        className={styles.slotBtn}
                        onClick={() => setSelectedClassId(cls.id)}
                        style={{ textAlign: "left", cursor: "pointer" }}
                      >
                        <div><strong>{cls.className || cls.name || "Untitled"}</strong></div>
                        <div style={{ fontSize: "0.85em", marginTop: "4px" }}>
                          {cls.time || cls.startTime || ""} {cls.duration || ""}
                        </div>
                        {cls.studentName && <div style={{ fontSize: "0.85em", color: "#666" }}>Student: {cls.studentName}</div>}
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: "12px", color: "#999", fontSize: "0.9em" }}>
                      No classes scheduled for this day
                    </div>
                  )}
                </div>
                <button
                  className={styles.slotBtn}
                  onClick={() => setSelectedDate(null)}
                  style={{ marginTop: "12px" }}
                >
                  Close
                </button>
              </>
            ) : (
              // No selection view - show actions
              <>
                <div className={styles.legendTitle}>Actions</div>
                <div className={styles.slotList}>
                  <button className={styles.slotBtn} onClick={jumpToToday}>
                    Jump to Today
                  </button>
                </div>
              </>
            )}

            <div className={styles.legendBlock}>
              <div className={styles.legendRow}>
                <span className={`${styles.legendDot} ${styles.legendAvail}`} />
                <span>Classes</span>
              </div>

              <div className={styles.legendRow}>
                <span className={`${styles.legendDot}`} style={{ background: "#fff" }} />
                <span>Clear</span>
              </div>
              <div className={styles.legendRow} style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                Click a day to view classes, then click a class to see student info
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

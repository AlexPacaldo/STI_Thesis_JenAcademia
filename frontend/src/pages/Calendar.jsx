import { useMemo, useState, useEffect } from "react";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/studentSchedule.module.css";

// Sample data for demo
const SAMPLE_AVAILABILITY = {
  "2026-02-17": "available",
  "2026-02-18": "unavailable",
  "2026-02-19": "available",
  "2026-02-20": "available",
  "2026-02-25": "unavailable",
  "2026-02-26": "available",
  "2026-03-02": "available",
  "2026-03-05": "unavailable",
};

const SAMPLE_CLASSES = {
  "2026-02-17": [
    { id: 1, className: "Mathematics 101", time: "09:00 AM", duration: "1h 30m", studentId: 101, studentName: "John Doe", studentEmail: "john.doe@example.com", classLink: "https://zoom.us/j/1234567890" },
    { id: 2, className: "Physics Lab", time: "11:00 AM", duration: "2h", studentId: 102, studentName: "Jane Smith", studentEmail: "jane.smith@example.com", classLink: "https://zoom.us/j/0987654321" },
    { id: 3, className: "Chem Lab", time: "5:00 PM", duration: "2h", studentId: 102, studentName: "Jane Smith", studentEmail: "jane.smith@example.com", classLink: "https://zoom.us/j/0987654321" },
  ],
  "2026-02-19": [
    { id: 3, className: "English Literature", time: "10:00 AM", duration: "1h", studentId: 103, studentName: "Mike Johnson", studentEmail: "mike.j@example.com", classLink: "https://zoom.us/j/1111111111" },
  ],
  "2026-02-20": [
    { id: 4, className: "Biology", time: "02:00 PM", duration: "1h 30m", studentId: 104, studentName: "Sarah Williams", studentEmail: "sarah.w@example.com", classLink: "https://zoom.us/j/2222222222" },
    { id: 5, className: "Chemistry", time: "04:00 PM", duration: "1h", studentId: 105, studentName: "Alex Brown", studentEmail: "alex.b@example.com", classLink: "https://zoom.us/j/3333333333" },
    { id: 6, className: "Advanced Math", time: "05:30 PM", duration: "1h 30m", studentId: 106, studentName: "Emma Davis", studentEmail: "emma.d@example.com", classLink: "https://zoom.us/j/4444444444" },
  ],
  "2026-02-26": [
    { id: 7, className: "History", time: "11:00 AM", duration: "1h", studentId: 107, studentName: "Oliver Miller", studentEmail: "oliver.m@example.com", classLink: "https://zoom.us/j/5555555555" },
  ],
  "2026-03-02": [
    { id: 8, className: "Computer Science", time: "08:00 AM", duration: "2h", studentId: 108, studentName: "Sophia Wilson", studentEmail: "sophia.w@example.com", classLink: "https://zoom.us/j/6666666666" },
    { id: 9, className: "Web Development", time: "10:30 AM", duration: "1h 30m", studentId: 109, studentName: "Liam Taylor", studentEmail: "liam.t@example.com", classLink: "https://zoom.us/j/7777777777" },
  ],
};

// Sample student (used when no logged-in user present)
const SAMPLE_STUDENT = { id: 101, firstName: "John", lastName: "Doe", role: "student" };

// Helper: count classes for a student across SAMPLE_CLASSES
const countClassesForStudent = (studentId) => {
  if (!studentId) return 0;
  let count = 0;
  Object.values(SAMPLE_CLASSES).forEach((arr) => {
    arr.forEach((cls) => {
      if (cls.studentId === studentId) count++;
    });
  });
  return count;
};

// Mock function to get classes for a date
const mockGetClassesForDate = (dateStr) => {
  return SAMPLE_CLASSES[dateStr] || [];
};

// Helper: check if a class is joinable (within 30 mins before start time)
const isClassJoinable = (classObj, selectedDate) => {
  if (!classObj || !classObj.time || !selectedDate) return false;
  
  try {
    // Parse time format "HH:MM AM/PM" to minutes since midnight
    const timeMatch = classObj.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) return false;
    
    let hours = parseInt(timeMatch[1]);
    const mins = parseInt(timeMatch[2]);
    const period = timeMatch[3].toUpperCase();
    
    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    const classStartMins = hours * 60 + mins;
    
    // Get current time for the selected date
    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10);
    const currentHours = now.getHours();
    const currentMins = now.getMinutes();
    const currentTotalMins = currentHours * 60 + currentMins;
    
    // If it's not the class date, return false
    if (currentDate !== selectedDate) return false;
    
    // Class is joinable if current time is within 30 mins before start
    const thirtyMinsBefore = classStartMins - 30;
    return currentTotalMins >= thirtyMinsBefore && currentTotalMins < classStartMins;
  } catch (e) {
    return false;
  }
};

/**
 * Teacher editor for setting availability per day
 *
 * Props:
 * - initialAvailability: { "YYYY-MM-DD": "available" | "unavailable" }
 * - getClassesForDate: (dateStr: "YYYY-MM-DD") => Array of class objects
 * - title: string
 */
export default function teacherScheduleEditor({
  initialAvailability = SAMPLE_AVAILABILITY,
  getClassesForDate = mockGetClassesForDate,
  title = "Teacher Availability",
  role = "teacher", // 'teacher' or 'student'
  classesUsed = 0,
  classesLimit = 20,
}) {
  const { notify } = useNotification() || {};
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [availability, setAvailability] = useState(initialAvailability);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [localRole, setLocalRole] = useState(role);
  const [localUserId, setLocalUserId] = useState(null);

  // Read role from localStorage (matches Header.jsx behavior)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.role) setLocalRole(parsed.role);
        if (parsed && parsed.id) setLocalUserId(parsed.id);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // if parent updates initialAvailability (e.g., after fetch), sync it
  useEffect(() => {
    setAvailability(initialAvailability);
  }, [initialAvailability]);

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

  const fmtDate = (d) => (d ? d.toISOString().slice(0, 10) : "");
  const statusOf = (d) => (d ? availability[fmtDate(d)] || "" : "");

  const handleCellClick = (d) => {
    if (!d) return;
    setSelectedDate(fmtDate(d));
  };

  // Check if a date has classes
  const hasClassesOnDate = (d) => {
    if (!d) return false;
    const formatted = fmtDate(d);
    const classes = getClassesForDate(formatted);
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

  // Get scheduled classes for selected date
  const selectedClasses = selectedDate && getClassesForDate
    ? getClassesForDate(selectedDate)
    : [];

  // Get selected class details
  const selectedClass = selectedClassId
    ? selectedClasses.find(cls => cls.id === selectedClassId)
    : null;

  // Effective classesUsed for student view: prefer prop, else compute from sample data and local user
  const effectiveStudentId = localUserId || SAMPLE_STUDENT.id;
  const effectiveClassesUsed = (classesUsed && classesUsed > 0)
    ? classesUsed
    : countClassesForStudent(effectiveStudentId);
  const effectiveClassesLeft = Math.max(0, classesLimit - effectiveClassesUsed);
  const effectivePercent = classesLimit > 0 ? Math.min(100, Math.round((effectiveClassesUsed / classesLimit) * 100)) : 0;

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
            {localRole === "teacher" ? (
              selectedClass ? (
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
                  <button
                    disabled={!isClassJoinable(selectedClass, selectedDate)}
                    onClick={() => {
                      if (isClassJoinable(selectedClass, selectedDate)) {
                        window.open(selectedClass.classLink, "_blank");
                      }
                    }}
                    className={styles.bookBtn}
                    style={{
                      textAlign: "center",
                      display: "block",
                      width: "100%",
                      cursor: isClassJoinable(selectedClass, selectedDate) ? "pointer" : "not-allowed",
                      opacity: isClassJoinable(selectedClass, selectedDate) ? 1 : 0.5,
                      filter: isClassJoinable(selectedClass, selectedDate) ? "none" : "grayscale(100%)",
                    }}
                    title={isClassJoinable(selectedClass, selectedDate) ? "" : "Available 30 mins before class starts"}
                  >
                    Join Class
                  </button>
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
                <>
                  <div className={styles.legendTitle}>Actions</div>
                  <div className={styles.slotList}>
                    <button className={styles.slotBtn} onClick={jumpToToday}>
                      Jump to Today
                    </button>
                  </div>
                </>
              )
            ) : (
              <>
                {selectedClass ? (
                  // Selected class detail for student
                  <>
                    <div className={styles.legendTitle}>Class Details</div>
                    <div className={styles.slotList}>
                      <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                        <div><strong>{selectedClass.className}</strong></div>
                        <div style={{ fontSize: "0.85em", marginTop: "4px" }}>{selectedClass.time} ({selectedClass.duration})</div>
                        {selectedClass.teacher && <div style={{ fontSize: "0.85em", color: "#666" }}>Teacher: {selectedClass.teacher}</div>}
                      </div>
                    </div>
                    <button
                      disabled={!isClassJoinable(selectedClass, selectedDate)}
                      onClick={() => {
                        if (isClassJoinable(selectedClass, selectedDate)) {
                          window.open(selectedClass.classLink, "_blank");
                        }
                      }}
                      className={styles.bookBtn}
                      style={{
                        textAlign: "center",
                        display: "block",
                        width: "100%",
                        cursor: isClassJoinable(selectedClass, selectedDate) ? "pointer" : "not-allowed",
                        opacity: isClassJoinable(selectedClass, selectedDate) ? 1 : 0.5,
                        filter: isClassJoinable(selectedClass, selectedDate) ? "none" : "grayscale(100%)",
                      }}
                      title={isClassJoinable(selectedClass, selectedDate) ? "" : "Available 30 mins before class starts"}
                    >
                      Join Class
                    </button>
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
                  // Date selected view - clickable classes for student
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
                            {cls.teacher && <div style={{ fontSize: "0.85em", color: "#666" }}>Teacher: {cls.teacher}</div>}
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
                  // Student summary
                  <>
                    <div className={styles.legendTitle}>Your Classes</div>
                    <div className={styles.slotList}>
                      <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", textAlign: "center" }}>
                        <div style={{ fontSize: 14, color: "#666" }}>Used</div>
                        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{effectiveClassesUsed} / {classesLimit}</div>
                        <div style={{ marginTop: 6, color: "#374151", fontSize: 14 }}>Classes left: {effectiveClassesLeft}</div>
                        <div style={{ marginTop: 8 }}>
                          <div style={{ height: 8, background: "#eef2ff", borderRadius: 8, overflow: "hidden" }}>
                            <div style={{ width: `${effectivePercent}%`, height: "100%", background: "#6366f1" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>Tip: Contact your teacher to add or reschedule classes.</div>
                  </>
                )}
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

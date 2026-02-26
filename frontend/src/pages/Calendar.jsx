import { useMemo, useState, useEffect } from "react";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/studentSchedule.module.css";

// API base
const API = "http://localhost:3001";

// Helper to format date as YYYY-MM-DD in local timezone
const fmtDate = (d) => {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// convert 24‑hour time string (HH:MM:SS) to human format e.g. "2:30 PM"
const humanTime = (t24) => {
  if (!t24) return "";
  const [h, m] = t24.split(":");
  let hour = parseInt(h, 10);
  const mins = m || "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mins} ${ampm}`;
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
    const currentDate = fmtDate(now);
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
 * Calendar view for teachers and students. Data is loaded from the backend using
 * the SQL schema tables (teacher_availability, classes, student_class_packages).
 *
 * Optional props:
 * - classesUsed, classesLimit: for overriding package counts (primarily student)
 */
export default function Calendar({ classesUsed = 0, classesLimit = 20 }) {
  const { notify } = useNotification() || {};
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based

  // data pulled from server
  const [availability, setAvailability] = useState({});
  const [classesCache, setClassesCache] = useState({}); // map date->classes array
  const [studentPackage, setStudentPackage] = useState(null);

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);
  // reschedule request form
  const [requestMode, setRequestMode] = useState(false);
  const [requestDate, setRequestDate] = useState("");
  const [requestTime, setRequestTime] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [localRole, setLocalRole] = useState("");
  const [localUserId, setLocalUserId] = useState(null);
  const [me, setMe] = useState(null); // loaded from storage
  const isAdmin = localRole === "admin"; // helper for rendering

  // Read user info from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        setMe(parsed);
        if (parsed && parsed.role) setLocalRole(parsed.role);
        if (parsed && parsed.id) setLocalUserId(parsed.id);
      }
    } catch (e) {
      // ignore
    }
  }, []);


  // fetch teacher availability whenever month/year or user changes
  useEffect(() => {
    if (localRole !== "teacher" || !localUserId) return;
    const y = year;
    const m = month + 1; // 1-based for API
    axios
      .get(`${API}/api/calendar/teacher-availability`, {
        params: { teacher_id: localUserId, year: y, month: m }
      })
      .then(r => {
        if (r.data && r.data.availability) setAvailability(r.data.availability);
      })
      .catch(() => {});
  }, [year, month, localRole, localUserId]);

  // fetch student package when we know student id
  useEffect(() => {
    if (localRole === "student" && localUserId) {
      axios
        .get(`${API}/api/calendar/student-package/${localUserId}`)
        .then(r => setStudentPackage(r.data.package))
        .catch(() => setStudentPackage(null));
    }
  }, [localRole, localUserId]);

  // helper to load classes for a particular date
  const loadClassesForDate = (dateStr) => {
    if (!dateStr || classesCache[dateStr]) return;
    const params = { scheduled_date: dateStr };
    if (localRole === "student") params.student_id = localUserId;
    if (localRole === "teacher") params.teacher_id = localUserId;

    axios
      .get(`${API}/api/calendar/classes-by-date`, { params })
      .then(r => {
        if (r.data && r.data.classes) {
          // normalize the returned rows to camelCase / unified fields
          const formatted = r.data.classes.map(c => ({
            ...c,
            id: c.id || c.class_id,
            className: c.className || c.class_name || c.name,
            studentName: c.studentName || c.student_name,
            studentEmail: c.studentEmail || c.student_email,
            teacherName: c.teacherName || c.teacher_name,
            teacherEmail: c.teacherEmail || c.teacher_email,
            classLink: c.classLink || c.class_link,
            time: c.time || humanTime(c.start_time),
            duration: c.duration || c.duration,
          }));
          setClassesCache(prev => ({ ...prev, [dateStr]: formatted }));
        }
      })
      .catch(() => {
        setClassesCache(prev => ({ ...prev, [dateStr]: [] }));
      });
  };

  // whenever selectedDate changes we fetch if necessary
  useEffect(() => {
    if (selectedDate) loadClassesForDate(selectedDate);
  }, [selectedDate, localRole, localUserId]);

  // preload every day in the month so cells with classes are colored on load
  useEffect(() => {
    if (!localUserId) return;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = fmtDate(new Date(year, month, d));
      loadClassesForDate(dateStr);
    }
  }, [year, month, localRole, localUserId]);

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
    setSelectedDate(fmtDate(d));
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
    // also highlight today's cell
    setSelectedDate(fmtDate(today));
  };

  // handle request form submission
  const submitRequest = async () => {
    setRequestError("");
    
    // Validation
    if (!selectedClass || !selectedClass.id) {
      setRequestError("Please select a class first");
      return;
    }
    if (!requestDate) {
      setRequestError("Please select a new date");
      return;
    }
    if (!requestTime) {
      setRequestError("Please select a new time");
      return;
    }
    if (!requestReason || requestReason.trim().length < 5) {
      setRequestError("Please provide a reason (at least 5 characters)");
      return;
    }

    setIsSubmittingRequest(true);
    try {
      await axios.post(`${API}/api/calendar/reschedule-request`, {
        class_id: selectedClass.id,
        requested_by_id: localUserId,
        requested_date: requestDate,
        requested_time: requestTime,
        reason: requestReason,
      });
      
      notify("Reschedule request sent successfully! The teacher will review your request.", "success");
      setRequestMode(false);
      setRequestDate("");
      setRequestTime("");
      setRequestReason("");
      setRequestError("");
    } catch (error) {
      const errMsg = error.response?.data?.message || "Failed to send request. Please try again.";
      setRequestError(errMsg);
      notify(errMsg, "error");
    } finally {
      setIsSubmittingRequest(false);
    }
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
  const isTeacherOrAdmin = localRole === "teacher" || isAdmin;

  // student package based usage calculation
  const effectiveClassesUsed = (() => {
    if (classesUsed && classesUsed > 0) return classesUsed;
    if (studentPackage) return studentPackage.classes_used || 0;
    return 0;
  })();
  const effectiveClassesLeft = (() => {
    if (studentPackage) return studentPackage.classes_left != null ? studentPackage.classes_left : Math.max(0, classesLimit - effectiveClassesUsed);
    return Math.max(0, classesLimit - effectiveClassesUsed);
  })();
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
                const formatted = d ? fmtDate(d) : "";
                const isTodayCell = formatted === fmtDate(new Date());
                const isSelected = formatted === selectedDate;
                return (
                  <button
                    key={idx}
                    className={[
                      styles.cell,
                      !d && styles.empty,
                      styles.clickableCell,         // interactive for teacher
                      status === "available" && styles.available,
                      hasClasses && styles.available,
                      isTodayCell && styles.today,
                      isSelected && styles.selected,
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
            {isTeacherOrAdmin ? (
              selectedClass ? (
                <>
                  <div className={styles.legendTitle}>
                    {localRole === "teacher" ? "Student Information" : "Class Information"}
                  </div>
                  <div className={styles.slotList}>
                    {selectedClass.studentName && (
                      <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                        <div><strong>Student:</strong></div>
                        <div style={{ fontSize: "0.95em", marginTop: "4px" }}>{selectedClass.studentName}</div>
                      </div>
                    )}
                    {selectedClass.studentEmail && (
                      <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                        <div><strong>Student Email:</strong></div>
                        <div style={{ fontSize: "0.85em", marginTop: "4px", wordBreak: "break-all" }}>{selectedClass.studentEmail}</div>
                      </div>
                    )}
                    {isAdmin && selectedClass.teacherName && (
                      <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                        <div><strong>Teacher:</strong></div>
                        <div style={{ fontSize: "0.95em", marginTop: "4px" }}>{selectedClass.teacherName}</div>
                      </div>
                    )}
                    {isAdmin && selectedClass.teacherEmail && (
                      <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                        <div><strong>Teacher Email:</strong></div>
                        <div style={{ fontSize: "0.85em", marginTop: "4px", wordBreak: "break-all" }}>{selectedClass.teacherEmail}</div>
                      </div>
                    )}
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
                  { !isAdmin && !requestMode && (
                    <button
                      className={styles.bookBtn}
                      onClick={() => {
                        setRequestMode(true);
                        // preload fields with current class date/time
                        setRequestDate(selectedClass.scheduled_date || selectedDate);
                        setRequestTime(selectedClass.start_time || "");
                      }}
                      style={{ marginTop: "8px" }}
                    >
                      Request for Reschedule
                    </button>
                  ) }
                  { requestMode && (
                    <div style={{ marginTop: 12, padding: 14, border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa" }}>
                      <div style={{ marginBottom: 12 }}>
                        <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", color: "#333" }}>Request Reschedule</h4>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "#666", lineHeight: 1.4 }}>
                          Select your preferred date and time, and let your teacher know why you need the reschedule.
                        </p>
                      </div>
                      
                      {requestError && (
                        <div style={{ marginBottom: 10, padding: 8, background: "#ffebee", border: "1px solid #ffcdd2", borderRadius: 6, color: "#c62828", fontSize: "0.8rem" }}>
                          {requestError}
                        </div>
                      )}
                      
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Date *</label>
                        <input
                          type="date"
                          value={requestDate}
                          onChange={e => {
                            setRequestDate(e.target.value);
                            setRequestError("");
                          }}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                        />
                      </div>
                      
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Time *</label>
                        <input
                          type="time"
                          value={requestTime}
                          onChange={e => {
                            setRequestTime(e.target.value);
                            setRequestError("");
                          }}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                        />
                      </div>
                      
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Reason *</label>
                        <textarea
                          rows={3}
                          placeholder="Please explain why you need to reschedule (minimum 5 characters)"
                          value={requestReason}
                          onChange={e => {
                            setRequestReason(e.target.value);
                            setRequestError("");
                          }}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
                        />
                      </div>
                      
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button 
                          onClick={() => {
                            setRequestMode(false);
                            setRequestError("");
                          }}
                          disabled={isSubmittingRequest}
                          style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, cursor: isSubmittingRequest ? "not-allowed" : "pointer", opacity: isSubmittingRequest ? 0.6 : 1 }}
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={submitRequest}
                          disabled={isSubmittingRequest}
                          style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: isSubmittingRequest ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: isSubmittingRequest ? "not-allowed" : "pointer" }}
                        >
                          {isSubmittingRequest ? "Sending..." : "Send Request"}
                        </button>
                      </div>
                    </div>
                  ) }
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
                          {isAdmin && cls.teacherName && <div style={{ fontSize: "0.85em", color: "#666" }}>Teacher: {cls.teacherName}</div>}
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
                      </div>
                      {selectedClass.teacherName && (
                        <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                          <div><strong>Teacher:</strong></div>
                          <div style={{ fontSize: "0.85em", marginTop: "4px" }}>{selectedClass.teacherName}</div>
                        </div>
                      )}
                      {selectedClass.teacherEmail && (
                        <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                          <div><strong>Email:</strong></div>
                          <div style={{ fontSize: "0.75em", marginTop: "4px", wordBreak: "break-all" }}>{selectedClass.teacherEmail}</div>
                        </div>
                      )}
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
                        setRequestMode(true);
                        setRequestDate(selectedDate);
                        setRequestTime("");
                      }}
                      style={{ marginTop: "8px" }}
                    >
                      Request for Reschedule
                    </button>
                    { requestMode && (
                      <div style={{ marginTop: 12, padding: 14, border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa" }}>
                        <div style={{ marginBottom: 12 }}>
                          <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", color: "#333" }}>Request Reschedule</h4>
                          <p style={{ margin: 0, fontSize: "0.75rem", color: "#666", lineHeight: 1.4 }}>
                            Select your preferred date and time, and let your teacher know why you need the reschedule.
                          </p>
                        </div>
                        
                        {requestError && (
                          <div style={{ marginBottom: 10, padding: 8, background: "#ffebee", border: "1px solid #ffcdd2", borderRadius: 6, color: "#c62828", fontSize: "0.8rem" }}>
                            {requestError}
                          </div>
                        )}
                        
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Date *</label>
                          <input
                            type="date"
                            value={requestDate}
                            onChange={e => {
                              setRequestDate(e.target.value);
                              setRequestError("");
                            }}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                          />
                        </div>
                        
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Time *</label>
                          <input
                            type="time"
                            value={requestTime}
                            onChange={e => {
                              setRequestTime(e.target.value);
                              setRequestError("");
                            }}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                          />
                        </div>
                        
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Reason *</label>
                          <textarea
                            rows={3}
                            placeholder="Please explain why you need to reschedule (minimum 5 characters)"
                            value={requestReason}
                            onChange={e => {
                              setRequestReason(e.target.value);
                              setRequestError("");
                            }}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
                          />
                        </div>
                        
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button 
                            onClick={() => {
                              setRequestMode(false);
                              setRequestError("");
                            }}
                            disabled={isSubmittingRequest}
                            style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, cursor: isSubmittingRequest ? "not-allowed" : "pointer", opacity: isSubmittingRequest ? 0.6 : 1 }}
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={submitRequest}
                            disabled={isSubmittingRequest}
                            style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: isSubmittingRequest ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: isSubmittingRequest ? "not-allowed" : "pointer" }}
                          >
                            {isSubmittingRequest ? "Sending..." : "Send Request"}
                          </button>
                        </div>
                      </div>
                    ) }
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
                    <div style={{ marginTop: 12 }}>
                      <button className={styles.slotBtn} onClick={jumpToToday}>
                        Jump to Today
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            <div className={styles.legendBlock}>
              <div className={styles.legendRow}>
                <span className={`${styles.legendDot}`} style={{ background:"#0b6909"}} />
                <span>Today</span>
              </div>

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

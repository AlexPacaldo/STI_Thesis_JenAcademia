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

// Helper: calculate end time from start time and duration in minutes
const getEndTime = (startTime, durationMins) => {
  if (!startTime || !durationMins) return "";
  
  // Parse "HH:MM AM/PM" format
  const timeMatch = startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) return "";
  
  let hours = parseInt(timeMatch[1]);
  const mins = parseInt(timeMatch[2]);
  const period = timeMatch[3].toUpperCase();
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  // Add duration in minutes
  let totalMinutes = hours * 60 + mins + parseInt(durationMins);
  
  // Convert back to 12-hour format
  let endHours = Math.floor(totalMinutes / 60) % 24;
  let endMins = totalMinutes % 60;
  
  const endPeriod = endHours >= 12 ? "PM" : "AM";
  if (endHours > 12) endHours -= 12;
  if (endHours === 0) endHours = 12;
  
  return `${endHours}:${String(endMins).padStart(2, "0")} ${endPeriod}`;
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
 * - teacherId: for admin to view a specific teacher's schedule
 * - studentId: for admin to view a specific student's schedule
 * - onBookClass: callback for admin to book classes (date, time) => void
 */
export default function Calendar({ classesUsed = 0, classesLimit = 20, teacherId = null, studentId = null, onBookClass = null }) {
  const { notify } = useNotification() || {};
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based

  console.log("Calendar component loaded");

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
  const [bookedDates, setBookedDates] = useState([]); // booked dates for this user
  const [counterpartyBookedDates, setCounterpartyBookedDates] = useState([]); // booked dates for the other party (teacher/student)
  const [counterpartyId, setCounterpartyId] = useState(null); // the other party's user_id
  const isAdmin = localRole === "admin"; // helper for rendering

  // booking form state
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [bookingSubject, setBookingSubject] = useState("");
  const [bookingEndTime, setBookingEndTime] = useState("");
  const [availableTimeSlots, setAvailableTimeSlots] = useState([]);

  // Read user info from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log("User info from localStorage:", parsed);
        setMe(parsed);
        if (parsed && parsed.role) setLocalRole(parsed.role);
        if (parsed && parsed.id) setLocalUserId(parsed.id);
      }
    } catch (e) {
      console.error("Error reading user from localStorage:", e);
    }
  }, []);

  // Fetch booked dates when user changes
  useEffect(() => {
    if (!localUserId || localRole === "admin") return;
    axios
      .get(`${API}/api/calendar/booked-dates/${localUserId}`)
      .then(r => {
        if (r.data && r.data.bookedDates) {
          // Normalize dates to YYYY-MM-DD format
          const normalized = r.data.bookedDates.map(bd => ({
            ...bd,
            scheduled_date: normalizeDate(bd.scheduled_date)
          }));
          setBookedDates(normalized);
        }
      })
      .catch(() => setBookedDates([]));
  }, [localUserId, localRole]);

  // Helper to normalize date to YYYY-MM-DD format
  const normalizeDate = (dateVal) => {
    if (!dateVal) return "";
    let d;
    if (typeof dateVal === "string") {
      if (dateVal.includes("T")) {
        d = new Date(dateVal);
      } else {
        d = new Date(dateVal + "T00:00:00");
      }
    } else {
      d = new Date(dateVal);
    }
    if (isNaN(d.getTime())) return "";
    return fmtDate(d);
  };

  // fetch teacher availability whenever month/year or user changes
  useEffect(() => {
    // If teacherId prop is provided (admin viewing specific teacher), use that
    const targetTeacherId = teacherId || (localRole === "teacher" ? localUserId : null);
    if (!targetTeacherId) return;

    const y = year;
    const m = month + 1; // 1-based for API
    axios
      .get(`${API}/api/calendar/teacher-availability`, {
        params: { teacher_id: targetTeacherId, year: y, month: m }
      })
      .then(r => {
        if (r.data && r.data.availability) setAvailability(r.data.availability);
      })
      .catch(() => {});
  }, [year, month, localRole, localUserId, teacherId]);

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

    // If teacherId prop is provided (admin viewing specific teacher), show that teacher's classes
    if (teacherId) {
      params.teacher_id = teacherId;
    } else if (studentId) {
      // If studentId prop is provided (admin viewing specific student), show that student's classes
      params.student_id = studentId;
    } else {
      if (localRole === "student") params.student_id = localUserId;
      if (localRole === "teacher") params.teacher_id = localUserId;
    }

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

  // fetch available time slots for a specific date from teacher availability
  const loadAvailableTimeSlots = (dateStr, tId) => {
    if (!dateStr || !tId) {
      setAvailableTimeSlots([]);
      return;
    }
    
    // Check if teacher is explicitly unavailable on this date
    const dateStatus = availability[dateStr] || "";
    if (dateStatus === "unavailable") {
      setAvailableTimeSlots([]);
      return;
    }
    
    const classes = classesCache[dateStr] || [];
    console.log("=== loadAvailableTimeSlots ===");
    console.log("Date:", dateStr, "Teacher ID:", tId);
    console.log("All classes for date:", classes);
    
    // Get booked times for this specific teacher on this date
    const bookedClasses = classes.filter(cls => {
      const classTeacherId = cls.teacher_id;
      console.log("Checking class:", cls, "Teacher ID match:", classTeacherId, "===", tId, "?", classTeacherId === parseInt(tId));
      return classTeacherId === parseInt(tId);
    });
    
    console.log("Booked classes for this teacher:", bookedClasses);
    
    // Use start_time (24-hour format from DB) instead of formatted time
    // Normalize to HH:MM format (first 5 characters of HH:MM:SS)
    const bookedTimes = bookedClasses.map(cls => {
      let time = cls.start_time || cls.time || "";
      // Extract HH:MM from HH:MM:SS format
      if (time.length >= 5) {
        time = time.substring(0, 5);
      }
      return time;
    }).filter(t => t && t.length === 5); // Only keep valid HH:MM times
    
    console.log("Booked times (from start_time):", bookedTimes);
    
    // Generate standard time slots (7 AM to 11 PM, hourly in 24-hour format)
    const allSlots = [
      "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"
    ];
    
    // Filter out booked times
    const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
    console.log("Available slots after filtering:", availableSlots);
    setAvailableTimeSlots(availableSlots);
  };

  // whenever selectedDate changes we fetch if necessary
  useEffect(() => {
    if (selectedDate) {
      loadClassesForDate(selectedDate);
    }
  }, [selectedDate, localRole, localUserId, teacherId, studentId]);

  // Load available time slots AFTER classes are loaded for the selected date
  useEffect(() => {
    if (selectedDate && teacherId && classesCache[selectedDate] !== undefined) {
      loadAvailableTimeSlots(selectedDate, teacherId);
    }
  }, [selectedDate, teacherId, classesCache, availability]);

  // preload every day in the month so cells with classes are colored on load
  useEffect(() => {
    // If teacherId or studentId prop is provided, use those; otherwise use local user
    const targetUserId = teacherId || studentId || localUserId;
    if (!targetUserId) return;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = fmtDate(new Date(year, month, d));
      loadClassesForDate(dateStr);
    }
  }, [year, month, localRole, localUserId, teacherId, studentId]);

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

  // Helper: Get booked times for a specific date
  const getBookedTimesForDate = (dateStr) => {
    return bookedDates
      .filter(bd => bd.scheduled_date === dateStr)
      .map(bd => bd.start_time);
  };

  // Helper: Check if a specific date/time is booked
  const isDateTimeBooked = (dateStr, timeStr) => {
    return bookedDates.some(bd => 
      bd.scheduled_date === dateStr && 
      bd.start_time === timeStr
    );
  };

  // Helper: Check if counterparty has this date/time booked
  const isCounterpartyDateTimeBooked = (dateStr, timeStr) => {
    const normalizedDate = normalizeDate(dateStr);
    return counterpartyBookedDates.some(bd => 
      normalizeDate(bd.scheduled_date) === normalizedDate && 
      bd.start_time.slice(0, 5) === timeStr
    );
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

    // Check if requested date/time is already booked
    if (isDateTimeBooked(requestDate, requestTime)) {
      setRequestError("This date and time are already booked. Please choose another time.");
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
  
  if (selectedClass) {
    console.log("Selected class updated:", selectedClass);
  }
  
  const isTeacherOrAdmin = localRole === "teacher" || isAdmin;

  // student package based usage calculation
  const effectiveClassesUsed = (() => {
    if (classesUsed && classesUsed > 0) return classesUsed;
    if (studentPackage) return studentPackage.classes_used || 0;
    return 0;
  })();
  const effectiveClassesLimit = (() => {
    if (studentPackage && studentPackage.total_classes != null) return studentPackage.total_classes;
    return classesLimit;
  })();
  const effectiveClassesLeft = (() => {
    if (studentPackage) return studentPackage.classes_left != null ? studentPackage.classes_left : Math.max(0, effectiveClassesLimit - effectiveClassesUsed);
    return Math.max(0, effectiveClassesLimit - effectiveClassesUsed);
  })();
  const effectivePercent = effectiveClassesLimit > 0 ? Math.min(100, Math.round((effectiveClassesUsed / effectiveClassesLimit) * 100)) : 0;

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes slideIn {
            from { 
              opacity: 0;
              transform: translateY(-20px) scale(0.95);
            }
            to { 
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
      <main className={styles.page}>
      <section className={styles.center}>
        <h1 className={styles.title}>Calendar</h1>

        <div className={styles.wrapper}>
          <div className={styles.calendarCard}>
            <div className={styles.calHeader}>
              <button type="button" onClick={prevMonth} className={styles.navBtn} aria-label="Previous month">
                ‹
              </button>
              <div className={styles.monthLabel}>
                {monthName} {year}
              </div>
              <button type="button" onClick={nextMonth} className={styles.navBtn} aria-label="Next month">
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
                    type="button"
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
                      <div style={{ fontSize: "0.85em", marginTop: "4px" }}>{selectedClass.time} - {getEndTime(selectedClass.time, selectedClass.duration)}</div>
                    </div>
                  </div>
                  <button
                    type="button"
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
                        // Fetch counterparty's booked dates
                        const otherPartyId = localRole === "student" ? selectedClass.teacher_id : selectedClass.student_id;
                        console.log("selectedClass:", selectedClass);
                        console.log("otherPartyId:", otherPartyId);
                        console.log("localRole:", localRole);
                        setCounterpartyId(otherPartyId);
                        
                        // Load the other party's booked dates
                        axios
                          .get(`${API}/api/calendar/booked-dates/${otherPartyId}`)
                          .then(r => {
                            console.log("Booked dates response:", r.data);
                            if (r.data && r.data.bookedDates) {
                              // Normalize dates to YYYY-MM-DD format
                              const normalized = r.data.bookedDates.map(bd => ({
                                ...bd,
                                scheduled_date: normalizeDate(bd.scheduled_date)
                              }));
                              console.log("Normalized booked dates:", normalized);
                              setCounterpartyBookedDates(normalized);
                            }
                          })
                          .catch((err) => {
                            console.error("Error fetching booked dates:", err);
                            setCounterpartyBookedDates([]);
                          });
                        
                        setRequestMode(true);
                        // preload fields with current class date/time
                        setRequestDate(selectedClass.scheduled_date || selectedDate);
                        setRequestTime(selectedClass.start_time ? selectedClass.start_time.slice(0, 5) : "");
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
                        {requestDate && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666" }}>
                            {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).length > 0 ? (
                              <p style={{ margin: 0 }}>
                                ⚠️ {localRole === "student" ? "Teacher" : "Student"} booked: {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).map(bd => humanTime(bd.start_time)).join(", ")}  
                              </p>
                            ) : (
                              <p style={{ margin: 0, color: "#4caf50" }}>✓ All times available on this date</p>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Time *</label>
                        <input
                          type="time"
                          value={requestTime}
                          onChange={e => {
                            const time = e.target.value;
                            setRequestTime(time);
                            setRequestError("");
                            // Check if counterparty has this time booked
                            if (requestDate && isCounterpartyDateTimeBooked(requestDate, time)) {
                              setRequestError(`${localRole === "student" ? "Teacher" : "Student"} is not available at this time. Please choose another time.`);
                            }
                          }}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                        />
                        {requestDate && requestTime && isCounterpartyDateTimeBooked(requestDate, requestTime) && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#f44336" }}>
                            ✕ {localRole === "student" ? "Teacher" : "Student"} is already booked at this time
                          </div>
                        )}
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
                          type="button"
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
                          type="button"
                          onClick={submitRequest}
                          disabled={isSubmittingRequest || (requestDate && requestTime && isCounterpartyDateTimeBooked(requestDate, requestTime))}
                          style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: (isSubmittingRequest || (requestDate && requestTime && isCounterpartyDateTimeBooked(requestDate, requestTime))) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: (isSubmittingRequest || (requestDate && requestTime && isCounterpartyDateTimeBooked(requestDate, requestTime))) ? "not-allowed" : "pointer" }}
                        >
                          {isSubmittingRequest ? "Sending..." : "Send Request"}
                        </button>
                      </div>
                    </div>
                  ) }
                  <button
                    type="button"
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
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString()}
                  </div>
                  <div className={styles.slotList}>
                    {selectedClasses && selectedClasses.length > 0 ? (
                      selectedClasses.map((cls, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={styles.slotBtn}
                          onClick={() => setSelectedClassId(cls.id)}
                          style={{ textAlign: "left", cursor: "pointer" }}
                        >
                          <div><strong>{cls.className || cls.name || "Untitled"}</strong></div>
                          <div style={{ fontSize: "0.85em", marginTop: "4px" }}>
                            {cls.time || cls.startTime || ""} - {getEndTime(cls.time || cls.startTime, cls.duration) || ""}
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

                    {/* Admin booking interface */}
                    {onBookClass && selectedDate && (
                      <>
                        <div style={{ margin: "16px 0 8px 0", padding: "8px 0", borderTop: "1px solid #e0e0e0" }}>
                          <div style={{ fontSize: "0.9em", fontWeight: "600", color: "#333" }}>Available Time Slots</div>
                          <div style={{ fontSize: "0.8em", color: "#666", marginTop: "4px" }}>Click to book a class</div>
                        </div>
                        {availableTimeSlots && availableTimeSlots.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            {/* Group time slots by period */}
                            {(() => {
                              const morningSlots = availableTimeSlots.filter(time => {
                                const hour = parseInt(time.split(':')[0]);
                                return hour >= 7 && hour < 12;
                              });
                              const afternoonSlots = availableTimeSlots.filter(time => {
                                const hour = parseInt(time.split(':')[0]);
                                return hour >= 12 && hour < 17;
                              });
                              const eveningSlots = availableTimeSlots.filter(time => {
                                const hour = parseInt(time.split(':')[0]);
                                return hour >= 17 && hour <= 23;
                              });

                              const renderTimeGroup = (title, slots, icon) => (
                                slots.length > 0 && (
                                  <div>
                                    <div style={{
                                      fontSize: "0.8em",
                                      fontWeight: "600",
                                      color: "#666",
                                      marginBottom: "8px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px"
                                    }}>
                                      <span>{icon}</span>
                                      {title} ({slots.length})
                                    </div>
                                    <div style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                                      gap: "8px"
                                    }}>
                                      {slots.map(time => {
                                        const isBooked = selectedClasses.some(cls => cls.time === time || cls.startTime === time);
                                        return (
                                          <button
                                            key={time}
                                            type="button"
                                            onClick={() => {
                                              if (!isBooked && !bookingFormOpen) {
                                                setSelectedTimeSlot(time);
                                                setBookingFormOpen(true);
                                                setBookingSubject("");
                                                setBookingEndTime("");
                                              }
                                            }}
                                            disabled={isBooked}
                                            style={{
                                              padding: "12px 16px",
                                              border: isBooked ? "1px solid #e0e0e0" : "1px solid #4CAF50",
                                              borderRadius: "8px",
                                              background: isBooked ? "#f8f8f8" : "#f1f8f1",
                                              color: isBooked ? "#999" : "#2E7D32",
                                              fontSize: "0.9em",
                                              fontWeight: "600",
                                              cursor: isBooked ? "not-allowed" : "pointer",
                                              transition: "all 0.2s ease",
                                              textAlign: "center",
                                              display: "flex",
                                              flexDirection: "column",
                                              alignItems: "center",
                                              gap: "4px",
                                              minHeight: "60px",
                                              justifyContent: "center"
                                            }}
                                            onMouseEnter={(e) => {
                                              if (!isBooked) {
                                                e.target.style.background = "#e8f5e8";
                                                e.target.style.borderColor = "#388E3C";
                                                e.target.style.transform = "translateY(-1px)";
                                                e.target.style.boxShadow = "0 2px 8px rgba(76, 175, 80, 0.2)";
                                              }
                                            }}
                                            onMouseLeave={(e) => {
                                              if (!isBooked) {
                                                e.target.style.background = "#f1f8f1";
                                                e.target.style.borderColor = "#4CAF50";
                                                e.target.style.transform = "translateY(0)";
                                                e.target.style.boxShadow = "none";
                                              }
                                            }}
                                          >
                                            <div style={{ fontSize: "1em", fontWeight: "700" }}>
                                              {humanTime(time)}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )
                              );

                              return (
                                <>
                                  {renderTimeGroup("Morning", morningSlots)}
                                  {renderTimeGroup("Afternoon", afternoonSlots)}
                                  {renderTimeGroup("Evening", eveningSlots)}
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <div style={{
                            padding: "40px 20px",
                            textAlign: "center",
                            background: "#f8f9fa",
                            border: "2px dashed #dee2e6",
                            borderRadius: "12px",
                            color: "#6c757d",
                            fontSize: "0.9em"
                          }}>
                            <span style={{ fontSize: "2em", marginBottom: "12px", display: "block" }}>📅</span>
                            <p style={{ margin: "0", fontWeight: "500" }}>No available time slots for this day</p>
                            <p style={{ margin: "8px 0 0 0", fontSize: "0.8em", opacity: 0.8 }}>
                              The teacher may be unavailable or all slots are booked
                            </p>
                          </div>
                        )}

                        {/* Booking Modal */}
                        {bookingFormOpen && selectedTimeSlot && (
                          <div style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(0, 0, 0, 0.5)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 1000,
                            animation: "fadeIn 0.2s ease-out"
                          }}>
                            <div style={{
                              background: "#fff",
                              borderRadius: "16px",
                              padding: "24px",
                              maxWidth: "420px",
                              width: "90%",
                              maxHeight: "90vh",
                              overflow: "auto",
                              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                              animation: "slideIn 0.3s ease-out",
                              position: "relative"
                            }}>
                              {/* Close button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setBookingFormOpen(false);
                                  setSelectedTimeSlot(null);
                                  setBookingSubject("");
                                  setBookingEndTime("");
                                }}
                                style={{
                                  position: "absolute",
                                  top: "16px",
                                  right: "16px",
                                  background: "transparent",
                                  border: "none",
                                  fontSize: "24px",
                                  cursor: "pointer",
                                  color: "#666",
                                  padding: "4px",
                                  borderRadius: "50%",
                                  width: "32px",
                                  height: "32px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "all 0.2s ease"
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.background = "#f0f0f0";
                                  e.target.style.color = "#333";
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.background = "transparent";
                                  e.target.style.color = "#666";
                                }}
                              >
                                ×
                              </button>

                              {/* Header */}
                              <div style={{ marginBottom: "20px", paddingRight: "40px" }}>
                                <div style={{
                                  fontSize: "1.5em",
                                  fontWeight: "700",
                                  color: "#1a1a1a",
                                  marginBottom: "8px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px"
                                }}>
                                  Book Class
                                </div>
                                <div style={{
                                  fontSize: "0.9em",
                                  color: "#666",
                                  lineHeight: "1.5"
                                }}>
                                  Schedule a new class for {new Date(selectedDate + "T00:00:00").toLocaleDateString()} at {humanTime(selectedTimeSlot)}
                                </div>
                              </div>

                              {/* Form Fields */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                  <label style={{
                                    display: "block",
                                    fontSize: "0.9em",
                                    fontWeight: "600",
                                    marginBottom: "6px",
                                    color: "#333"
                                  }}>
                                    Subject <span style={{ color: "#e74c3c" }}>*</span>
                                  </label>
                                  <select
                                    value={bookingSubject}
                                    onChange={(e) => setBookingSubject(e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "12px 14px",
                                      fontSize: "0.95em",
                                      border: "2px solid #e1e5e9",
                                      borderRadius: "8px",
                                      boxSizing: "border-box",
                                      fontFamily: "inherit",
                                      background: "#fff",
                                      cursor: "pointer",
                                      transition: "border-color 0.2s ease, box-shadow 0.2s ease"
                                    }}
                                    onFocus={(e) => {
                                      e.target.style.borderColor = "#4CAF50";
                                      e.target.style.boxShadow = "0 0 0 3px rgba(76, 175, 80, 0.1)";
                                    }}
                                    onBlur={(e) => {
                                      e.target.style.borderColor = "#e1e5e9";
                                      e.target.style.boxShadow = "none";
                                    }}
                                  >
                                    <option value="">Select a subject...</option>
                                    <option value="Business English">Business English</option>
                                    <option value="Online English">Online English</option>
                                    <option value="News">News</option>
                                    <option value="TOEIC">TOEIC</option>
                                    <option value="IELTS">IELTS</option>
                                    <option value="OPIc">OPIc</option>
                                    <option value="Conversational English">Conversational English</option>
                                    <option value="Travel English">Travel English</option>
                                  </select>
                                </div>

                                <div>
                                  <label style={{
                                    display: "block",
                                    fontSize: "0.9em",
                                    fontWeight: "600",
                                    marginBottom: "6px",
                                    color: "#333"
                                  }}>
                                    End Time <span style={{ color: "#e74c3c" }}>*</span>
                                  </label>
                                  <input
                                    type="time"
                                    value={bookingEndTime}
                                    onChange={(e) => setBookingEndTime(e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "12px 14px",
                                      fontSize: "0.95em",
                                      border: "2px solid #e1e5e9",
                                      borderRadius: "8px",
                                      boxSizing: "border-box",
                                      fontFamily: "inherit",
                                      transition: "border-color 0.2s ease, box-shadow 0.2s ease"
                                    }}
                                    onFocus={(e) => {
                                      e.target.style.borderColor = "#4CAF50";
                                      e.target.style.boxShadow = "0 0 0 3px rgba(76, 175, 80, 0.1)";
                                    }}
                                    onBlur={(e) => {
                                      e.target.style.borderColor = "#e1e5e9";
                                      e.target.style.boxShadow = "none";
                                    }}
                                  />
                                  <div style={{
                                    fontSize: "0.8em",
                                    color: "#666",
                                    marginTop: "6px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px"
                                  }}>
                                    <span>🕐</span>
                                    Start: {humanTime(selectedTimeSlot)} • Duration: {bookingEndTime ? (() => {
                                      const start = new Date(`2000-01-01T${selectedTimeSlot}`);
                                      const end = new Date(`2000-01-01T${bookingEndTime}`);
                                      const diff = Math.round((end - start) / (1000 * 60));
                                      return diff > 0 ? `${diff} minutes` : 'Invalid duration';
                                    })() : 'Select end time'}
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div style={{
                                display: "flex",
                                gap: "12px",
                                justifyContent: "flex-end",
                                marginTop: "24px",
                                paddingTop: "16px",
                                borderTop: "1px solid #e1e5e9"
                              }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBookingFormOpen(false);
                                    setSelectedTimeSlot(null);
                                    setBookingSubject("");
                                    setBookingEndTime("");
                                  }}
                                  style={{
                                    padding: "10px 20px",
                                    fontSize: "0.9em",
                                    fontWeight: "600",
                                    border: "2px solid #e1e5e9",
                                    background: "#fff",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.target.style.borderColor = "#ccc";
                                    e.target.style.background = "#f8f9fa";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.target.style.borderColor = "#e1e5e9";
                                    e.target.style.background = "#fff";
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!bookingSubject.trim()) {
                                      notify("Please select a subject", "error");
                                      return;
                                    }
                                    if (!bookingEndTime) {
                                      notify("Please select an end time", "error");
                                      return;
                                    }
                                    onBookClass(selectedDate, selectedTimeSlot, bookingSubject, bookingEndTime);
                                    setBookingFormOpen(false);
                                    setSelectedTimeSlot(null);
                                    setBookingSubject("");
                                    setBookingEndTime("");
                                  }}
                                  style={{
                                    padding: "10px 20px",
                                    fontSize: "0.9em",
                                    fontWeight: "600",
                                    border: "none",
                                    background: "#4CAF50",
                                    color: "#fff",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                    boxShadow: "0 2px 8px rgba(76, 175, 80, 0.2)"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.target.style.background = "#45a049";
                                    e.target.style.transform = "translateY(-1px)";
                                    e.target.style.boxShadow = "0 4px 12px rgba(76, 175, 80, 0.3)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.target.style.background = "#4CAF50";
                                    e.target.style.transform = "translateY(0)";
                                    e.target.style.boxShadow = "0 2px 8px rgba(76, 175, 80, 0.2)";
                                  }}
                                >
                                  Book Class
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    type="button"
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
                    <button type="button" className={styles.slotBtn} onClick={jumpToToday}>
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
                        <div style={{ fontSize: "0.85em", marginTop: "4px" }}>{selectedClass.time} - {getEndTime(selectedClass.time, selectedClass.duration)}</div>
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
                      type="button"
                      className={styles.bookBtn}
                      onClick={() => {
                        // Fetch counterparty's (student's) booked dates
                        const studentId = selectedClass.student_id;
                        setCounterpartyId(studentId);
                        
                        // Load the student's booked dates
                        axios
                          .get(`${API}/api/calendar/booked-dates/${studentId}`)
                          .then(r => {
                            if (r.data && r.data.bookedDates) {
                              // Normalize dates to YYYY-MM-DD format
                              const normalized = r.data.bookedDates.map(bd => ({
                                ...bd,
                                scheduled_date: normalizeDate(bd.scheduled_date)
                              }));
                              setCounterpartyBookedDates(normalized);
                            }
                          })
                          .catch(() => setCounterpartyBookedDates([])); 
                        
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
                          {requestDate && (
                            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666" }}>
                              {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).length > 0 ? (
                                <p style={{ margin: 0 }}>
                                  ⚠️ Student booked: {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).map(bd => humanTime(bd.start_time)).join(", ")} 
                                </p>
                              ) : (
                                <p style={{ margin: 0, color: "#4caf50" }}>✓ All times available on this date</p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Time *</label>
                          <input
                            type="time"
                            value={requestTime}
                            onChange={e => {
                              const time = e.target.value;
                              setRequestTime(time);
                              setRequestError("");
                              // Check if student has this time booked
                              if (requestDate && isCounterpartyDateTimeBooked(requestDate, time)) {
                                setRequestError("Student is not available at this time. Please choose another time.");
                              }
                            }}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                          />
                          {requestDate && requestTime && isCounterpartyDateTimeBooked(requestDate, requestTime) && (
                            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#f44336" }}>
                              ✕ Student is already booked at this time
                            </div>
                          )}
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
                            type="button"
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
                            type="button"
                            onClick={submitRequest}
                            disabled={isSubmittingRequest || (requestDate && requestTime && isCounterpartyDateTimeBooked(requestDate, requestTime))}
                            style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: (isSubmittingRequest || (requestDate && requestTime && isCounterpartyDateTimeBooked(requestDate, requestTime))) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: (isSubmittingRequest || (requestDate && requestTime && isCounterpartyDateTimeBooked(requestDate, requestTime))) ? "not-allowed" : "pointer" }}
                          >
                            {isSubmittingRequest ? "Sending..." : "Send Request"}
                          </button>
                        </div>
                      </div>
                    ) }
                    <button
                      type="button"
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
                            type="button"
                            className={styles.slotBtn}
                            onClick={() => setSelectedClassId(cls.id)}
                            style={{ textAlign: "left", cursor: "pointer" }}
                          >
                            <div><strong>{cls.className || cls.name || "Untitled"}</strong></div>
                            <div style={{ fontSize: "0.85em", marginTop: "4px" }}>
                              {cls.time || cls.startTime || ""} - {getEndTime(cls.time || cls.startTime, cls.duration) || ""}
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
                      type="button"
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
                        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{effectiveClassesUsed} / {effectiveClassesLimit}</div>
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
                      <button type="button" className={styles.slotBtn} onClick={jumpToToday}>
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
    </>
  );
}

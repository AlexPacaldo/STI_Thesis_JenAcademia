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
  const [studentProfile, setStudentProfile] = useState(null);
  const [assignedTeacherId, setAssignedTeacherId] = useState(null);
  const [assignedTeacherName, setAssignedTeacherName] = useState("");
  const [teacherClassesCache, setTeacherClassesCache] = useState({});
  const [studentBookingMode, setStudentBookingMode] = useState(false);
  const [studentBookingDate, setStudentBookingDate] = useState(fmtDate(today));
  const [studentBookingTime, setStudentBookingTime] = useState("");
  const [studentBookingSubject, setStudentBookingSubject] = useState("");
  const [studentBookingError, setStudentBookingError] = useState("");
  const [isSubmittingStudentBooking, setIsSubmittingStudentBooking] = useState(false);
  const isAdmin = localRole === "admin"; // helper for rendering

  // booking form state
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [bookingSubject, setBookingSubject] = useState("");
  const [bookingEndTime, setBookingEndTime] = useState("");
  const [availableTimeSlots, setAvailableTimeSlots] = useState([]);

  // Teacher availability setting state
  const [setAvailabilityMode, setSetAvailabilityMode] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState(fmtDate(today));
  const [availabilityStartTime, setAvailabilityStartTime] = useState("");
  const [availabilityEndTime, setAvailabilityEndTime] = useState("");
  const [availabilityBreakStart, setAvailabilityBreakStart] = useState("");
  const [availabilityBreakEnd, setAvailabilityBreakEnd] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState("available"); // "available" or "unavailable"
  const [availabilityError, setAvailabilityError] = useState("");
  const [isSubmittingAvailability, setIsSubmittingAvailability] = useState(false);
  const [teacherSelectedDate, setTeacherSelectedDate] = useState(null);
  const [teacherAvailabilityList, setTeacherAvailabilityList] = useState([]); // list of availability records for current month
  const [teacherAvailabilityRecordForDate, setTeacherAvailabilityRecordForDate] = useState(null); // individual selected date record

  // Read user info from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log("User info from localStorage:", parsed);
        setMe(parsed);
        const normalizedRole = parsed?.role ? String(parsed.role).toLowerCase() : "";
        setLocalRole(normalizedRole);
        const userId = parsed?.id || parsed?.user_id || parsed?.userId || null;
        if (userId) setLocalUserId(userId);
        const teacherId = parsed?.assigned_teacher_id || parsed?.assignedTeacherId || parsed?.assignedTeacher_Id || null;
        if (teacherId) setAssignedTeacherId(teacherId);
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
    const targetTeacherId = teacherId || (localRole === "teacher" ? localUserId : (localRole === "student" ? assignedTeacherId : null));
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
  }, [year, month, localRole, localUserId, teacherId, assignedTeacherId]);

  // fetch student package when we know student id
  useEffect(() => {
    if (localRole === "student" && localUserId) {
      axios
        .get(`${API}/api/calendar/student-package/${localUserId}`)
        .then(r => setStudentPackage(r.data.package))
        .catch(() => setStudentPackage(null));
    }
  }, [localRole, localUserId]);

  // fetch assigned teacher directly from student_profiles using the resolved local user id
  useEffect(() => {
    if (localRole !== "student" || !localUserId) return;

    axios
      .get(`${API}/api/student/assigned-teacher/${localUserId}`)
      .then(r => {
        const teacherIdFromProfile = r.data?.assigned_teacher_id ?? null;
        setAssignedTeacherId(teacherIdFromProfile);

        if (teacherIdFromProfile) {
          try {
            const stored = localStorage.getItem("user");
            if (stored) {
              const parsed = JSON.parse(stored);
              const updated = {
                ...parsed,
                assignedTeacherId: teacherIdFromProfile,
                assigned_teacher_id: teacherIdFromProfile,
              };
              localStorage.setItem("user", JSON.stringify(updated));
            }
          } catch (e) {
            console.error("Error updating localStorage with assignedTeacherId:", e);
          }
        }
      })
      .catch(() => {
        setAssignedTeacherId(null);
      });
  }, [localRole, localUserId]);

  // fetch student profile and enrolled course information
  useEffect(() => {
    if (localRole !== "student" || !localUserId) return;

    axios
      .get(`${API}/api/student/profile/${localUserId}`)
      .then(r => {
        if (r.data && r.data.profile) {
          setStudentProfile(r.data.profile);
        }
      })
      .catch(() => {
        setStudentProfile(null);
      });
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

  const loadTeacherClassesForDate = (dateStr, tId) => {
    const dateKey = normalizeDate(dateStr);
    if (!dateKey || !tId || teacherClassesCache[dateKey]) return;

    axios
      .get(`${API}/api/calendar/classes-by-date`, {
        params: { scheduled_date: dateKey, teacher_id: tId }
      })
      .then(r => {
        if (r.data && r.data.classes) {
          setTeacherClassesCache(prev => ({ ...prev, [dateKey]: r.data.classes }));
        }
      })
      .catch(() => {
        setTeacherClassesCache(prev => ({ ...prev, [dateKey]: [] }));
      });
  };

  const loadTeacherAvailabilityRecordForDate = (dateStr, tId) => {
    const dateKey = normalizeDate(dateStr);
    if (!dateKey || !tId) {
      setTeacherAvailabilityRecordForDate(null);
      return;
    }

    axios
      .get(`${API}/api/calendar/teacher-availability-record`, {
        params: { teacher_id: tId, available_date: dateKey }
      })
      .then(r => {
        if (r.data && r.data.record) {
          setTeacherAvailabilityRecordForDate({
            ...r.data.record,
            available_date: normalizeDate(r.data.record.available_date),
          });
        } else {
          setTeacherAvailabilityRecordForDate(null);
        }
      })
      .catch(() => {
        setTeacherAvailabilityRecordForDate(null);
      });
  };

  // fetch available time slots for a specific date from teacher availability
  const loadAvailableTimeSlots = (dateStr, tId) => {
    const dateKey = normalizeDate(dateStr);
    if (!dateKey || !tId) {
      setAvailableTimeSlots([]);
      return;
    }
    
    // Check if teacher is explicitly unavailable on this date
    const dateStatus = availability[dateKey] || "";
    if (dateStatus === "unavailable") {
      setAvailableTimeSlots([]);
      return;
    }
    
    const classes = teacherClassesCache[dateKey] !== undefined ? teacherClassesCache[dateKey] : (classesCache[dateKey] || []);
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
    
    // Find teacher's availability record for this date (with time ranges and breaks)
    const teacherAvailabilityRecord = teacherAvailabilityList.find(
      record => normalizeDate(record.available_date) === dateKey && record.status === "available"
    ) || (teacherAvailabilityRecordForDate && teacherAvailabilityRecordForDate.status === "available" ? teacherAvailabilityRecordForDate : null);
    
    console.log("Teacher availability record:", teacherAvailabilityRecord);
    
    let allSlots = [];
    let teacherStartTime = "07:00"; // default start
    let teacherEndTime = "23:00";   // default end
    let breakStartTime = null;
    let breakEndTime = null;
    
    // If teacher has set specific availability hours for this date
    if (teacherAvailabilityRecord && teacherAvailabilityRecord.start_time && teacherAvailabilityRecord.end_time) {
      teacherStartTime = teacherAvailabilityRecord.start_time.substring(0, 5); // Extract HH:MM
      teacherEndTime = teacherAvailabilityRecord.end_time.substring(0, 5);
      
      if (teacherAvailabilityRecord.break_start && teacherAvailabilityRecord.break_end) {
        breakStartTime = teacherAvailabilityRecord.break_start.substring(0, 5);
        breakEndTime = teacherAvailabilityRecord.break_end.substring(0, 5);
      }
      
      // Generate time slots within teacher's availability window
      const startHour = parseInt(teacherStartTime.split(":")[0]);
      const endHour = parseInt(teacherEndTime.split(":")[0]);
      
      for (let hour = startHour; hour < endHour; hour++) {
        allSlots.push(`${String(hour).padStart(2, "0")}:00`);
      }
      
      console.log("Generated slots within teacher hours:", allSlots);
    } else {
      // No specific teacher availability set for this date, so there are no available slots.
      allSlots = [];
    }
    
    // Filter out booked times
    const afterBookingFilter = allSlots.filter(slot => !bookedTimes.includes(slot));
    console.log("Available slots after booking filter:", afterBookingFilter);
    
    // Filter out times within teacher's break
    const afterBreakFilter = afterBookingFilter.filter(slot => {
      if (!breakStartTime || !breakEndTime) return true;
      
      const slotMinutes = parseInt(slot.split(":")[0]) * 60 + parseInt(slot.split(":")[1]);
      const breakStartMinutes = parseInt(breakStartTime.split(":")[0]) * 60 + parseInt(breakStartTime.split(":")[1]);
      const breakEndMinutes = parseInt(breakEndTime.split(":")[0]) * 60 + parseInt(breakEndTime.split(":")[1]);
      
      // Include slot if it's NOT within break time
      return slotMinutes < breakStartMinutes || slotMinutes >= breakEndMinutes;
    });
    
    console.log("Available slots after break filter:", afterBreakFilter);
    
    // Also filter out student's own booked classes on this date
    const studentBookedClasses = classes.filter(cls => cls.student_id === localUserId);
    const studentBookedTimes = studentBookedClasses.map(cls => {
      let time = cls.start_time || cls.time || "";
      if (time.length >= 5) {
        time = time.substring(0, 5);
      }
      return time;
    }).filter(t => t && t.length === 5);
    
    const finalSlots = afterBreakFilter.filter(slot => !studentBookedTimes.includes(slot));
    
    console.log("Final available slots after all filters:", finalSlots);
    setAvailableTimeSlots(finalSlots);
  };

  // whenever selectedDate changes we fetch if necessary
  useEffect(() => {
    if (selectedDate) {
      loadClassesForDate(selectedDate);
    }
  }, [selectedDate, localRole, localUserId, teacherId, studentId]);

  useEffect(() => {
    if (studentBookingMode && studentBookingDate && assignedTeacherId) {
      loadTeacherClassesForDate(studentBookingDate, assignedTeacherId);
    }
  }, [studentBookingMode, studentBookingDate, assignedTeacherId]);

  // Load teacher availability records for the current month when student enters booking mode
  useEffect(() => {
    if (studentBookingMode && assignedTeacherId && localRole === "student" && studentBookingDate) {
      const bookingDate = new Date(studentBookingDate + "T00:00:00");
      if (isNaN(bookingDate.getTime())) return;

      const targetYear = bookingDate.getFullYear();
      const targetMonth = bookingDate.getMonth() + 1;

      axios
        .get(`${API}/api/calendar/teacher-availability-records`, {
          params: { teacher_id: assignedTeacherId, year: targetYear, month: targetMonth }
        })
        .then(r => {
          if (r.data && r.data.records) {
            const normalized = r.data.records.map(record => ({
              ...record,
              available_date: normalizeDate(record.available_date),
            }));
            setTeacherAvailabilityList(normalized);
            console.log("Loaded teacher availability records:", normalized);
          }
        })
        .catch(err => {
          console.error("Error loading teacher availability records:", err);
          setTeacherAvailabilityList([]);
        });
    }
  }, [studentBookingMode, assignedTeacherId, localRole, studentBookingDate]);

  useEffect(() => {
    if (studentBookingMode && studentBookingDate && assignedTeacherId && localRole === "student") {
      loadTeacherAvailabilityRecordForDate(studentBookingDate, assignedTeacherId);
    }
  }, [studentBookingMode, studentBookingDate, assignedTeacherId, localRole]);

  // Load available time slots AFTER classes are loaded for the selected date or student booking date
  useEffect(() => {
    if (selectedDate && teacherId && classesCache[selectedDate] !== undefined) {
      loadAvailableTimeSlots(selectedDate, teacherId);
    }
    if (studentBookingMode && studentBookingDate && assignedTeacherId && teacherClassesCache[studentBookingDate] !== undefined) {
      loadAvailableTimeSlots(studentBookingDate, assignedTeacherId);
    }
  }, [selectedDate, teacherId, classesCache, availability, studentBookingMode, studentBookingDate, assignedTeacherId, teacherClassesCache, teacherAvailabilityList]);

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

  // Load teacher availability records for current month when teacher enters availability mode
  useEffect(() => {
    if (setAvailabilityMode && localRole === "teacher" && localUserId) {
      loadTeacherAvailabilityForMonth();
    }
  }, [setAvailabilityMode, localRole, localUserId]);

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

  const isTeacherDateTimeBooked = (dateStr, timeStr) => {
    const classes = teacherClassesCache[dateStr] || [];
    return classes.some(cls => {
      const time = (cls.start_time || cls.time || "").substring(0, 5);
      return time === timeStr;
    });
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

  // Fetch teacher availability records for current month
  const loadTeacherAvailabilityForMonth = () => {
    if (localRole !== "teacher" || !localUserId) return;

    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    axios
      .get(`${API}/api/calendar/teacher-availability-records`, {
        params: { teacher_id: localUserId, year: currentYear, month: currentMonth }
      })
      .then(r => {
        if (r.data && r.data.records) {
          const normalized = r.data.records.map(record => ({
            ...record,
            available_date: normalizeDate(record.available_date),
          }));
          setTeacherAvailabilityList(normalized);
        }
      })
      .catch(err => {
        console.error("Error loading teacher availability:", err);
        setTeacherAvailabilityList([]);
      });
  };

  // Submit teacher availability
  const submitTeacherAvailability = async () => {
    setAvailabilityError("");

    // Validation
    if (!availabilityDate) {
      setAvailabilityError("Please select a date");
      return;
    }

    // Only allow current month
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const selectedDateObj = new Date(availabilityDate + "T00:00:00");
    if (
      selectedDateObj.getFullYear() !== currentYear ||
      selectedDateObj.getMonth() !== currentMonth
    ) {
      setAvailabilityError("You can only set availability for the current month");
      return;
    }

    // Don't allow past dates
    const selectedDateOnly = new Date(availabilityDate + "T00:00:00");
    const todayOnly = new Date(fmtDate(today) + "T00:00:00");
    if (selectedDateOnly < todayOnly) {
      setAvailabilityError("You cannot set availability for past dates");
      return;
    }

    // Validate times if available status
    if (availabilityStatus === "available") {
      if (!availabilityStartTime) {
        setAvailabilityError("Please select a start time");
        return;
      }
      if (!availabilityEndTime) {
        setAvailabilityError("Please select an end time");
        return;
      }

      // Validate end time is after start time
      const start = new Date(`2000-01-01T${availabilityStartTime}`);
      const end = new Date(`2000-01-01T${availabilityEndTime}`);
      if (end <= start) {
        setAvailabilityError("End time must be after start time");
        return;
      }

      // Validate break times if provided
      if (availabilityBreakStart || availabilityBreakEnd) {
        if (!availabilityBreakStart) {
          setAvailabilityError("Please select a break start time");
          return;
        }
        if (!availabilityBreakEnd) {
          setAvailabilityError("Please select a break end time");
          return;
        }

        const breakStart = new Date(`2000-01-01T${availabilityBreakStart}`);
        const breakEnd = new Date(`2000-01-01T${availabilityBreakEnd}`);

        // Break end must be after break start
        if (breakEnd <= breakStart) {
          setAvailabilityError("Break end time must be after break start time");
          return;
        }

        // Break must be within availability window
        if (breakStart < start || breakEnd > end) {
          setAvailabilityError("Break time must be within your availability window");
          return;
        }
      }

      // Check if there's already a booked class during this time
      const bookedClasses = classesCache[availabilityDate] || [];
      const hasConflict = bookedClasses.some(cls => {
        if (cls.teacher_id !== localUserId) return false;
        const classStart = new Date(`2000-01-01T${(cls.start_time || cls.time || "").substring(0, 5)}`);
        const classEnd = new Date(`2000-01-01T${(cls.end_time || "").substring(0, 5)}`);
        
        // Check if class overlaps with availability window
        return classStart < end && classEnd > start;
      });

      if (hasConflict) {
        setAvailabilityError("You have a booked class during this time period");
        return;
      }
    }

    setIsSubmittingAvailability(true);
    try {
      await axios.post(`${API}/api/calendar/set-availability`, {
        teacher_id: localUserId,
        available_date: availabilityDate,
        status: availabilityStatus,
        start_time: availabilityStartTime || null,
        end_time: availabilityEndTime || null,
        break_start: availabilityBreakStart || null,
        break_end: availabilityBreakEnd || null,
      });

      notify("Availability updated successfully", "success");
      setAvailabilityError("");
      setAvailabilityStartTime("");
      setAvailabilityEndTime("");
      setAvailabilityBreakStart("");
      setAvailabilityBreakEnd("");
      setAvailabilityDate(fmtDate(today));
      loadTeacherAvailabilityForMonth();
      
      // Refresh availability cache
      const y = year;
      const m = month + 1;
      axios.get(`${API}/api/calendar/teacher-availability`, {
        params: { teacher_id: localUserId, year: y, month: m }
      }).then(r => {
        if (r.data && r.data.availability) setAvailability(r.data.availability);
      });
    } catch (error) {
      const errMsg = error.response?.data?.message || "Failed to update availability. Please try again.";
      setAvailabilityError(errMsg);
      notify(errMsg, "error");
    } finally {
      setIsSubmittingAvailability(false);
    }
  };

  // Delete teacher availability
  const deleteTeacherAvailability = async (recordId) => {
    if (!window.confirm("Are you sure you want to delete this availability record?")) return;

    try {
      await axios.delete(`${API}/api/calendar/availability/${recordId}`);
      notify("Availability deleted successfully", "success");
      loadTeacherAvailabilityForMonth();
      
      // Refresh availability cache
      const y = year;
      const m = month + 1;
      axios.get(`${API}/api/calendar/teacher-availability`, {
        params: { teacher_id: localUserId, year: y, month: m }
      }).then(r => {
        if (r.data && r.data.availability) setAvailability(r.data.availability);
      });
    } catch (error) {
      notify("Failed to delete availability. Please try again.", "error");
    }
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

  const studentMonthMin = fmtDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const studentMonthMax = fmtDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const openMonthlyBooking = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setStudentBookingMode(true);
    setStudentBookingDate(fmtDate(today));
    setStudentBookingTime("");
    setStudentBookingSubject("");
    setStudentBookingError("");
    setSelectedDate(null);
    setSelectedClassId(null);
  };

  const submitStudentBooking = async () => {
    setStudentBookingError("");
    if (!studentBookingDate) {
      setStudentBookingError("Please select a date within the current month.");
      return;
    }
    if (!studentBookingTime) {
      setStudentBookingError("Please select a time slot.");
      return;
    }
    if (!assignedTeacherId) {
      setStudentBookingError("Unable to book because your assigned teacher is not available.");
      return;
    }
    if (studentBookingDate < studentMonthMin || studentBookingDate > studentMonthMax) {
      setStudentBookingError("Please pick a date in the current month only.");
      return;
    }
    if (isTeacherDateTimeBooked(studentBookingDate, studentBookingTime)) {
      setStudentBookingError("The teacher is already booked at this time. Please choose another slot.");
      return;
    }

    const [hour, min] = studentBookingTime.split(":").map(Number);
    const endDate = new Date(2000, 0, 1, hour + 1, min);
    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

    const start = new Date(`2000-01-01T${studentBookingTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    const duration = Math.max(0, Math.round((end - start) / (1000 * 60)));
    if (duration <= 0) {
      setStudentBookingError("End time must be after start time.");
      return;
    }

    setIsSubmittingStudentBooking(true);
    try {
      await axios.post(`${API}/api/calendar/class`, {
        class_name: studentProfile?.course_name || "General English",
        teacher_id: assignedTeacherId,
        student_id: localUserId,
        scheduled_date: studentBookingDate,
        start_time: studentBookingTime,
        end_time: endTime,
        duration,
        class_link: ""
      });

      notify?.("Class booked for the current month.", "success");
      setStudentBookingMode(false);
      setStudentBookingTime("");
      setStudentBookingSubject("");
      setSelectedDate(studentBookingDate);
      setBookedDates(prev => [
        ...prev,
        { scheduled_date: studentBookingDate, start_time: studentBookingTime }
      ]);
      // Clear cache for this date so the load functions re-fetch
      setClassesCache(prev => {
        const updated = { ...prev };
        delete updated[studentBookingDate];
        return updated;
      });
      setTeacherClassesCache(prev => {
        const updated = { ...prev };
        delete updated[studentBookingDate];
        return updated;
      });
      loadClassesForDate(studentBookingDate);
      loadTeacherClassesForDate(studentBookingDate, assignedTeacherId);
    } catch (err) {
      console.error(err);
      setStudentBookingError(err?.response?.data?.message || "Unable to book class. Please try again.");
    } finally {
      setIsSubmittingStudentBooking(false);
    }
  };

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
                    {localRole === "teacher" && (
                      <button 
                        type="button" 
                        className={styles.slotBtn} 
                        onClick={() => {
                          setSetAvailabilityMode(!setAvailabilityMode);
                          if (!setAvailabilityMode) {
                            setAvailabilityDate(fmtDate(today));
                            setAvailabilityStartTime("");
                            setAvailabilityEndTime("");
                            setAvailabilityBreakStart("");
                            setAvailabilityBreakEnd("");
                            setAvailabilityStatus("available");
                            setAvailabilityError("");
                            loadTeacherAvailabilityForMonth();
                          }
                        }}
                        style={{ background: setAvailabilityMode ? "#e8f5e9" : "#fff", borderColor: setAvailabilityMode ? "#4CAF50" : "#ccc" }}
                      >
                        {setAvailabilityMode ? "Close Availability Manager" : "Set Availability"}
                      </button>
                    )}
                    <button type="button" className={styles.slotBtn} onClick={jumpToToday}>
                      Jump to Today
                    </button>
                  </div>

                  {/* Teacher Availability Manager */}
                  {setAvailabilityMode && localRole === "teacher" && (
                    <div style={{ marginTop: 16, padding: 14, border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa" }}>
                      <div style={{ marginBottom: 12 }}>
                        <h4 style={{ margin: "0 0 8px 0", fontSize: "0.95rem", color: "#333" }}>Set Your Schedule</h4>
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#666", lineHeight: 1.4 }}>
                          Set your available times for the current month. You cannot set availability on dates with existing bookings or past dates.
                        </p>
                      </div>

                      {availabilityError && (
                        <div style={{ marginBottom: 10, padding: 10, background: "#ffebee", border: "1px solid #ffcdd2", borderRadius: 6, color: "#c62828", fontSize: "0.8rem" }}>
                          {availabilityError}
                        </div>
                      )}

                      <div style={{ marginBottom: 12, display: "grid", gap: 10 }}>
                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Date *</label>
                          <input
                            type="date"
                            min={fmtDate(today)}
                            max={fmtDate(new Date(today.getFullYear(), today.getMonth() + 1, 0))}
                            value={availabilityDate}
                            onChange={e => {
                              setAvailabilityDate(e.target.value);
                              setAvailabilityError("");
                            }}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                          />
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666" }}>
                            Only current month dates allowed
                          </div>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Availability Status *</label>
                          <div style={{ display: "flex", gap: 12 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityStatus("available");
                                setAvailabilityError("");
                              }}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                fontSize: "0.9rem",
                                border: availabilityStatus === "available" ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                borderRadius: 6,
                                background: availabilityStatus === "available" ? "#e8f5e9" : "#fff",
                                color: availabilityStatus === "available" ? "#2E7D32" : "#666",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Available
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityStatus("unavailable");
                                setAvailabilityError("");
                              }}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                fontSize: "0.9rem",
                                border: availabilityStatus === "unavailable" ? "2px solid #f44336" : "1px solid #d0d0d0",
                                borderRadius: 6,
                                background: availabilityStatus === "unavailable" ? "#ffebee" : "#fff",
                                color: availabilityStatus === "unavailable" ? "#c62828" : "#666",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Unavailable
                            </button>
                          </div>
                        </div>

                        {availabilityStatus === "available" && (
                          <>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Start Time *</label>
                              <input
                                type="time"
                                value={availabilityStartTime}
                                onChange={e => {
                                  setAvailabilityStartTime(e.target.value);
                                  setAvailabilityError("");
                                }}
                                style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>End Time *</label>
                              <input
                                type="time"
                                value={availabilityEndTime}
                                onChange={e => {
                                  setAvailabilityEndTime(e.target.value);
                                  setAvailabilityError("");
                                }}
                                style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                              />
                              {availabilityStartTime && availabilityEndTime && (
                                <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666" }}>
                                  Duration: {(() => {
                                    const start = new Date(`2000-01-01T${availabilityStartTime}`);
                                    const end = new Date(`2000-01-01T${availabilityEndTime}`);
                                    const diffMinutes = Math.round((end - start) / (1000 * 60));
                                    const hours = Math.floor(diffMinutes / 60);
                                    const mins = diffMinutes % 60;
                                    if (hours === 0) return `${mins} minutes`;
                                    return `${hours}h ${mins}m`;
                                  })()}
                                </div>
                              )}
                            </div>

                            <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: 10, marginTop: 5 }}>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Break Time (Optional)</label>
                              
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                                <div>
                                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: 3, color: "#666" }}>Break Start</label>
                                  <input
                                    type="time"
                                    value={availabilityBreakStart}
                                    onChange={e => {
                                      setAvailabilityBreakStart(e.target.value);
                                      setAvailabilityError("");
                                    }}
                                    style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: 3, color: "#666" }}>Break End</label>
                                  <input
                                    type="time"
                                    value={availabilityBreakEnd}
                                    onChange={e => {
                                      setAvailabilityBreakEnd(e.target.value);
                                      setAvailabilityError("");
                                    }}
                                    style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                                  />
                                </div>
                              </div>

                              {availabilityBreakStart && availabilityBreakEnd && (
                                <div style={{ lineHeight: 1.4, fontSize: "0.75rem", padding: 8, background: "#f5f5f5", borderRadius: 6, color: "#666" }}>
                                  Break: {humanTime(availabilityBreakStart)} - {humanTime(availabilityBreakEnd)}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 16 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSetAvailabilityMode(false);
                            setAvailabilityError("");
                            setAvailabilityStartTime("");
                            setAvailabilityEndTime("");
                            setAvailabilityBreakStart("");
                            setAvailabilityBreakEnd("");
                          }}
                          disabled={isSubmittingAvailability}
                          style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, cursor: isSubmittingAvailability ? "not-allowed" : "pointer", opacity: isSubmittingAvailability ? 0.6 : 1 }}
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={submitTeacherAvailability}
                          disabled={isSubmittingAvailability}
                          style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: isSubmittingAvailability ? "#999" : "#4CAF50", color: "#fff", borderRadius: 6, cursor: isSubmittingAvailability ? "not-allowed" : "pointer" }}
                        >
                          {isSubmittingAvailability ? "Saving..." : "Save Availability"}
                        </button>
                      </div>

                      {/* Show current month's availability records */}
                      {teacherAvailabilityList && teacherAvailabilityList.length > 0 && (
                        <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: 12 }}>
                          <h5 style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "#333", fontWeight: 600 }}>
                            Your Availability This Month
                          </h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "200px", overflowY: "auto" }}>
                            {teacherAvailabilityList.map(record => (
                              <div
                                key={record.id || record.availability_id}
                                style={{
                                  padding: 10,
                                  background: record.status === "available" ? "#e8f5e9" : "#ffebee",
                                  border: `1px solid ${record.status === "available" ? "#c8e6c9" : "#ffcdd2"}`,
                                  borderRadius: 6,
                                  fontSize: "0.8rem",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                                  <div>
                                    <strong>{new Date(record.available_date + "T00:00:00").toLocaleDateString()}</strong>
                                    {record.status === "available" ? (
                                      <span style={{ color: "#2E7D32", marginLeft: 8 }}>✓ Available</span>
                                    ) : (
                                      <span style={{ color: "#c62828", marginLeft: 8 }}>✗ Unavailable</span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteTeacherAvailability(record.id || record.availability_id)}
                                    style={{
                                      padding: "4px 8px",
                                      fontSize: "0.75rem",
                                      border: "none",
                                      background: "#f44336",
                                      color: "#fff",
                                      borderRadius: 4,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                                {record.status === "available" && (record.start_time || record.end_time) ? (
                                  <div style={{ color: "#555", marginTop: 6, lineHeight: 1.5 }}>
                                    <div>⏰ {humanTime(record.start_time)} - {humanTime(record.end_time)}</div>
                                    {record.break_start && record.break_end && (
                                      <div style={{ color: "#666", fontSize: "0.75rem", marginTop: 4 }}>☕ Break: {humanTime(record.break_start)} - {humanTime(record.break_end)}</div>
                                    )}
                                  </div>
                                ) : record.status === "available" ? (
                                  <div style={{ color: "#555", marginTop: 6, lineHeight: 1.5 }}>
                                    ⏰ Available all day
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                ) : studentBookingMode ? (
                  <>
                    <div className={styles.legendTitle}>Book Classes for This Month</div>
                    <div className={styles.slotList}>
                      <div style={{ padding: 12, color: "#333", fontSize: "0.95em" }}>
                        {assignedTeacherName ? (
                          <p style={{ margin: 0 }}>Choose a date and time for {assignedTeacherName}. Only current month dates are allowed.</p>
                        ) : (
                          <p style={{ margin: 0 }}>You don&apos;t have an assigned teacher yet. Contact support to enable booking.</p>
                        )}
                      </div>
                      <div style={{ display: "grid", gap: 12 }}>
                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Date *</label>
                          <input
                            type="date"
                            min={studentMonthMin}
                            max={studentMonthMax}
                            value={studentBookingDate}
                            onChange={e => {
                              setStudentBookingDate(e.target.value);
                              setStudentBookingTime("");
                              setStudentBookingError("");
                            }}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Available Times *</label>
                          {availability[studentBookingDate] === "unavailable" ? (
                            <div style={{ padding: 12, background: "#fff3e0", borderRadius: 8, color: "#b65f00" }}>
                              Teacher is unavailable on this date.
                            </div>
                          ) : availableTimeSlots && availableTimeSlots.length > 0 ? (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                              {availableTimeSlots.map(time => {
                                const isBooked = isTeacherDateTimeBooked(studentBookingDate, time);
                                return (
                                  <button
                                    key={time}
                                    type="button"
                                    onClick={() => {
                                      if (!isBooked) {
                                        setStudentBookingTime(time);
                                        setStudentBookingError("");
                                      }
                                    }}
                                    disabled={isBooked}
                                    style={{
                                      padding: "12px 14px",
                                      border: studentBookingTime === time ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                      borderRadius: "8px",
                                      background: studentBookingTime === time ? "#e8f5e9" : isBooked ? "#f8f8f8" : "#fff",
                                      color: isBooked ? "#999" : "#111",
                                      cursor: isBooked ? "not-allowed" : "pointer",
                                      textAlign: "center"
                                    }}
                                  >
                                    {humanTime(time)}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ padding: 12, background: "#f4f6f8", borderRadius: 8, color: "#555" }}>
                              No available slots found for this date. Choose another day in the current month.
                            </div>
                          )}
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Course</label>
                          <div style={{ width: "100%", padding: "12px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, background: "#f7fafc", color: "#111", minHeight: "42px", display: "flex", alignItems: "center" }}>
                            {studentProfile?.course_name || "Course not set"}
                          </div>
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Class Duration</label>
                          <div style={{ width: "100%", padding: "12px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, background: "#f7fafc", color: "#111", minHeight: "42px", display: "flex", alignItems: "center" }}>
                            {studentBookingTime ? (
                              <span style={{ fontWeight: 500 }}>
                                {humanTime(studentBookingTime)} → {humanTime(`${String((Number(studentBookingTime.split(":")[0]) + 1)).padStart(2, "0")}:${studentBookingTime.split(":")[1]}`)}
                              </span>
                            ) : (
                              <span style={{ color: "#999" }}>Choose a slot first.</span>
                            )}
                          </div>
                        </div>
                        {studentBookingError && (
                          <div style={{ padding: 10, background: "#ffebee", border: "1px solid #ffcdd2", borderRadius: 6, color: "#c62828", fontSize: "0.85em" }}>
                            {studentBookingError}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => setStudentBookingMode(false)}
                            disabled={isSubmittingStudentBooking}
                            style={{ padding: "10px 16px", fontSize: "0.9em", border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, cursor: isSubmittingStudentBooking ? "not-allowed" : "pointer" }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={submitStudentBooking}
                            disabled={isSubmittingStudentBooking || !studentBookingTime || assignedTeacherId == null}
                            style={{ padding: "10px 16px", fontSize: "0.9em", border: "none", background: "#4CAF50", color: "#fff", borderRadius: 6, cursor: (isSubmittingStudentBooking || !studentBookingTime || assignedTeacherId == null) ? "not-allowed" : "pointer" }}
                          >
                            {isSubmittingStudentBooking ? "Booking..." : "Book Class"}
                          </button>
                        </div>
                      </div>
                    </div>
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
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      <button
                        type="button"
                        className={styles.slotBtn}
                        onClick={openMonthlyBooking}
                        disabled={!assignedTeacherId}
                        style={{ width: "100%", textAlign: "center" }}
                      >
                        Book Classes for This Month
                      </button>
                      <button type="button" className={styles.slotBtn} onClick={jumpToToday}>
                        Jump to Today
                      </button>
                    </div>
                    {!assignedTeacherId && (
                      <div style={{ marginTop: 10, fontSize: "0.8em", color: "#b65f00" }}>
                        Your assigned teacher is not available yet. Please contact support.
                      </div>
                    )}
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

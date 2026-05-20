import { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/studentSchedule.module.css";
import {
  DEFAULT_TIMEZONE,
  convertDateTime,
  getUserTimezone,
  humanTime as formatHumanTime,
  normalizeTimeKey,
} from "../utils/timezone.js";

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

// convert 24‑hour time string (HH:MM:SS or ISO datetime) to human format e.g. "2:30 PM"
const humanTime = (t24) => {
  if (!t24) return "";
  const trimmed = t24.trim();
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (isoMatch) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      let hour = date.getHours();
      const mins = String(date.getMinutes()).padStart(2, '0');
      const ampm = hour >= 12 ? "PM" : "AM";
      if (hour > 12) hour -= 12;
      if (hour === 0) hour = 12;
      return `${hour}:${mins} ${ampm}`;
    }
  }
  const [h, m] = trimmed.split(":");
  let hour = parseInt(h, 10);
  const mins = m || "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mins} ${ampm}`;
};

const normalizeTime = (timeStr) => {
  if (!timeStr) return "";
  const t = timeStr.trim();
  const isoMatch = t.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (isoMatch) {
    const date = new Date(t);
    if (!isNaN(date.getTime())) {
      const hour = String(date.getHours()).padStart(2, '0');
      const mins = String(date.getMinutes()).padStart(2, '0');
      return `${hour}:${mins}`;
    }
  }

  const ampmMatch = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const mins = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${mins}`;
  }
  const plainMatch = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (plainMatch) {
    const hour = String(parseInt(plainMatch[1], 10)).padStart(2, "0");
    const mins = plainMatch[2];
    return `${hour}:${mins}`;
  }
  return "";
};

const parse24HourTime = (timeStr) => normalizeTime(timeStr);

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

// Helper: check if a class is joinable (30 mins before start until class end)
const isClassJoinable = (classObj, selectedDate) => {
  if (!classObj || !selectedDate) return false;

  try {
    const now = new Date();

    const parseTimeString = (timeStr) => {
      if (!timeStr) return null;
      const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const mins = parseInt(ampmMatch[2], 10);
        const period = ampmMatch[3].toUpperCase();
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + mins;
      }

      const twentyFourMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (twentyFourMatch) {
        const hours = parseInt(twentyFourMatch[1], 10);
        const mins = parseInt(twentyFourMatch[2], 10);
        return hours * 60 + mins;
      }

      return null;
    };

    const parseDateString = (dateStr) => {
      if (dateStr instanceof Date && !Number.isNaN(dateStr.getTime())) {
        return {
          year: dateStr.getFullYear(),
          month: dateStr.getMonth(),
          day: dateStr.getDate(),
        };
      }

      const dateMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!dateMatch) return null;

      return {
        year: Number(dateMatch[1]),
        month: Number(dateMatch[2]) - 1,
        day: Number(dateMatch[3]),
      };
    };

    const selectedDateParts = parseDateString(selectedDate);
    const classStartMins = parseTimeString(classObj.time || classObj.start_time);
    if (!selectedDateParts || classStartMins == null) return false;

    const startHour = Math.floor(classStartMins / 60);
    const startMinute = classStartMins % 60;
    const classStart = new Date(
      selectedDateParts.year,
      selectedDateParts.month,
      selectedDateParts.day,
      startHour,
      startMinute,
      0,
      0
    );

    let classEnd = null;

    if (classObj.duration && !Number.isNaN(Number(classObj.duration))) {
      classEnd = new Date(classStart.getTime() + Number(classObj.duration) * 60 * 1000);
    } else if (classObj.end_time) {
      const classEndMins = parseTimeString(classObj.end_time);
      if (classEndMins != null) {
        const endHour = Math.floor(classEndMins / 60);
        const endMinute = classEndMins % 60;
        classEnd = new Date(
          selectedDateParts.year,
          selectedDateParts.month,
          selectedDateParts.day,
          endHour,
          endMinute,
          0,
          0
        );

        if (classEnd <= classStart) {
          classEnd.setDate(classEnd.getDate() + 1);
        }
      }
    }

    if (!classEnd) {
      classEnd = new Date(classStart.getTime() + 60 * 60 * 1000);
    }

    const windowStart = new Date(classStart.getTime() - 30 * 60 * 1000);

    return now >= windowStart && now < classEnd;
  } catch (e) {
    return false;
  }
};

const addSeconds = (time) => {
  const normalized = normalizeTimeKey(time);
  return normalized ? `${normalized}:00` : "";
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

  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialDateApplied = useRef(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);
  // reschedule request form
  const [requestMode, setRequestMode] = useState(false);
  const [requestDate, setRequestDate] = useState("");
  const [requestTime, setRequestTime] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isMarkingClassDone, setIsMarkingClassDone] = useState(false);
  const [classDoneConfirmOpen, setClassDoneConfirmOpen] = useState(false);
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
  const [courses, setCourses] = useState([]);
  const [contractRequestOpen, setContractRequestOpen] = useState(false);
  const [contractCourseId, setContractCourseId] = useState("");
  const [contractClassCount, setContractClassCount] = useState("10");
  const [contractRequestError, setContractRequestError] = useState("");
  const [contractRequests, setContractRequests] = useState([]);
  const [isSubmittingContractRequest, setIsSubmittingContractRequest] = useState(false);
  const isAdmin = localRole === "admin"; // helper for rendering
  const viewerTimezone = useMemo(() => getUserTimezone(me), [me]);

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

  useEffect(() => {
    const handleProfileUpdate = (event) => {
      const updated = event.detail;
      if (updated) setMe(updated);
    };

    window.addEventListener("userProfileUpdated", handleProfileUpdate);
    return () => window.removeEventListener("userProfileUpdated", handleProfileUpdate);
  }, []);

  // Fetch booked dates when user changes
  useEffect(() => {
    if (!localUserId || localRole === "admin") return;
    axios
      .get(`${API}/api/calendar/booked-dates/${localUserId}`)
      .then(r => {
        if (r.data && r.data.bookedDates) {
          // Normalize dates to YYYY-MM-DD format
          const normalized = r.data.bookedDates.map(bd => {
            const sourceTimezone = bd.teacher_timezone || DEFAULT_TIMEZONE;
            const start = convertDateTime(bd.scheduled_date, bd.start_time, sourceTimezone, viewerTimezone);
            const end = convertDateTime(bd.scheduled_date, bd.end_time, sourceTimezone, viewerTimezone);

            return {
              ...bd,
              source_scheduled_date: normalizeDate(bd.scheduled_date),
              source_start_time: bd.start_time,
              scheduled_date: start.date,
              start_time: addSeconds(start.time),
              end_time: addSeconds(end.time),
            };
          });
          setBookedDates(normalized);
        }
      })
      .catch(() => setBookedDates([]));
  }, [localUserId, localRole, viewerTimezone]);

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
    
    console.log("🔍 Availability fetch triggered:", {
      localRole,
      localUserId,
      assignedTeacherId,
      teacherId,
      targetTeacherId,
      year,
      month: month + 1
    });
    
    if (!targetTeacherId) {
      console.log("⚠️ No targetTeacherId, skipping availability fetch");
      return;
    }

    const y = year;
    const m = month + 1; // 1-based for API
    axios
      .get(`${API}/api/calendar/teacher-availability`, {
        params: { teacher_id: targetTeacherId, year: y, month: m }
      })
      .then(r => {
        console.log("✅ Availability data received:", r.data);
        if (r.data && r.data.availability) {
          setAvailability(r.data.availability);
        }
      })
      .catch((err) => {
        console.error("❌ Error fetching availability:", err);
      });
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

  useEffect(() => {
    if (localRole !== "student") return;

    axios
      .get(`${API}/api/courses`)
      .then(r => setCourses(r.data?.courses || []))
      .catch(() => setCourses([]));
  }, [localRole]);

  const loadContractRequests = () => {
    if (localRole !== "student" || !localUserId) return;

    axios
      .get(`${API}/api/student/contract-requests/${localUserId}`)
      .then(r => setContractRequests(r.data?.requests || []))
      .catch(() => setContractRequests([]));
  };

  useEffect(() => {
    loadContractRequests();
  }, [localRole, localUserId]);

  // fetch assigned teacher directly from student_profiles using the resolved local user id
  useEffect(() => {
    if (localRole !== "student" || !localUserId) return;

    console.log("📚 Fetching assigned teacher for student:", localUserId);
    
    axios
      .get(`${API}/api/student/assigned-teacher/${localUserId}`)
      .then(r => {
        const teacherIdFromProfile = r.data?.assigned_teacher_id ?? null;
        console.log("✅ Assigned teacher fetched:", teacherIdFromProfile, "Full response:", r.data);
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
        if (r.data && r.data.package) {
          setStudentPackage(r.data.package);
        }
      })
      .catch(() => {
        setStudentProfile(null);
      });
  }, [localRole, localUserId]);

  const formatClassForViewer = (c) => {
    const sourceTimezone = c.teacher_timezone || DEFAULT_TIMEZONE;
    const start = convertDateTime(c.scheduled_date, c.start_time || c.time, sourceTimezone, viewerTimezone);
    const end = convertDateTime(c.scheduled_date, c.end_time, sourceTimezone, viewerTimezone);

    return {
      ...c,
      id: c.id || c.class_id,
      className: c.className || c.class_name || c.name,
      studentName: c.studentName || c.student_name,
      studentEmail: c.studentEmail || c.student_email,
      teacherName: c.teacherName || c.teacher_name,
      teacherEmail: c.teacherEmail || c.teacher_email,
      classLink: c.classLink || c.class_link,
      source_scheduled_date: normalizeDate(c.scheduled_date),
      source_start_time: c.start_time,
      source_end_time: c.end_time,
      scheduled_date: start.date,
      start_time: addSeconds(start.time),
      end_time: addSeconds(end.time),
      time: c.time || formatHumanTime(start.time),
      duration: c.duration,
      status: c.status,
      teacher_id: c.teacher_id,
      student_id: c.student_id,
      viewer_timezone: viewerTimezone,
      source_timezone: sourceTimezone,
    };
  };

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
          const formatted = r.data.classes.map(formatClassForViewer);
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
    const dateStatus = getAvailabilityStatusForDate(dateKey);
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
    
    const finalSlotsInTeacherTimezone = afterBreakFilter.filter(slot => !studentBookedTimes.includes(slot));
    const teacherTimezone = teacherAvailabilityRecord?.teacher_timezone || DEFAULT_TIMEZONE;
    const finalSlots = finalSlotsInTeacherTimezone
      .map(slot => {
        const converted = convertDateTime(dateKey, slot, teacherTimezone, viewerTimezone);
        return converted.date === dateKey ? converted.time : null;
      })
      .filter(Boolean);
    
    console.log("Final available slots after all filters:", finalSlots);
    setAvailableTimeSlots(finalSlots);
  };

  // whenever selectedDate changes we fetch if necessary
  useEffect(() => {
    if (!initialDateApplied.current) {
      const dateFromState = location.state?.selectedDate || location.state?.date || searchParams.get("date");
      const normalizedDate = dateFromState ? normalizeDate(dateFromState) : null;

      if (normalizedDate) {
        setSelectedDate(normalizedDate);
        setSelectedClassId(null);
      }

      initialDateApplied.current = true;
      return;
    }

    if (selectedDate) {
      loadClassesForDate(selectedDate);
    }
  }, [selectedDate, localRole, localUserId, teacherId, studentId, searchParams]);

  useEffect(() => {
    if (selectedDate) {
      const [yearPart, monthPart] = selectedDate.split("-");
      const parsedYear = Number(yearPart);
      const parsedMonth = Number(monthPart) - 1;
      if (!Number.isNaN(parsedYear) && !Number.isNaN(parsedMonth)) {
        setYear(parsedYear);
        setMonth(parsedMonth);
      }
    }
  }, [selectedDate]);

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

  // Load teacher's own availability records when entering reschedule request mode
  useEffect(() => {
    if (!requestMode) return;

    let targetYear = year;
    let targetMonth = month + 1; // month is 0-based
    if (requestDate) {
      const requestDateObj = new Date(requestDate + "T00:00:00");
      if (!isNaN(requestDateObj.getTime())) {
        targetYear = requestDateObj.getFullYear();
        targetMonth = requestDateObj.getMonth() + 1;
      }
    }

    console.log(`🔄 Reschedule mode activated. Loading availability for year=${targetYear}, month=${targetMonth}, role=${localRole}, localUserId=${localUserId}, assignedTeacherId=${assignedTeacherId}, requestDate=${requestDate}`);

    let teacherIdToLoad;
    if (localRole === "teacher" && localUserId) {
      teacherIdToLoad = localUserId;
    } else if (localRole === "admin" && teacherId) {
      teacherIdToLoad = teacherId;
    } else if (localRole === "student" && assignedTeacherId) {
      teacherIdToLoad = assignedTeacherId;
    }

    if (teacherIdToLoad) {
      console.log(`📡 Fetching availability records for teacher_id=${teacherIdToLoad}, year=${targetYear}, month=${targetMonth}`);
      axios
        .get(`${API}/api/calendar/teacher-availability-records`, {
          params: { teacher_id: teacherIdToLoad, year: targetYear, month: targetMonth }
        })
        .then(r => {
          console.log(`✅ Raw API response:`, r.data);
          if (r.data && r.data.records) {
            const normalized = r.data.records.map(record => ({
              ...record,
              available_date: normalizeDate(record.available_date),
            }));
            setTeacherAvailabilityList(normalized);
            console.log("✅ Loaded teacher availability records for reschedule validation:", normalized);
          } else {
            console.log("⚠️ No records in response");
            setTeacherAvailabilityList([]);
          }
        })
        .catch(err => {
          console.error("❌ Error loading teacher availability records:", err);
          setTeacherAvailabilityList([]);
        });
    } else {
      console.log("⚠️ No teacherId to load. localUserId=" + localUserId + ", role=" + localRole);
    }
  }, [requestMode, requestDate, localRole, localUserId, teacherId, assignedTeacherId, year, month]);

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
  const isPastDate = (d) => {
    if (!d) return false;
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    return d < todayMidnight;
  };

  const handleCellClick = (d) => {
    if (!d || isPastDate(d)) return;
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
      const converted = convertDateTime(
        cls.scheduled_date || dateStr,
        cls.start_time || cls.time || "",
        cls.teacher_timezone || DEFAULT_TIMEZONE,
        viewerTimezone
      );
      return converted.date === dateStr && converted.time === normalizeTimeKey(timeStr);
    });
  };

  // Helper: Check if reschedule date/time is the same as current schedule (not allowed)
  const isRescheduleToSameDateTime = (dateStr, timeStr) => {
    if (!selectedClass) return false;

    const normalizedSelectedDate = normalizeDate(dateStr);
    const normalizedCurrentDate = normalizeDate(selectedClass.scheduled_date || selectedDate || "");
    const currentTime = normalizeTime(selectedClass.start_time || selectedClass.time || "");
    const requestedTime = normalizeTime(timeStr);

    return normalizedSelectedDate === normalizedCurrentDate && requestedTime && currentTime && requestedTime === currentTime;
  };

  // Helper: Check if a specific date/time is booked (for reschedule requests)
  // For students: checks all classes on the teacher's schedule, excluding the current class
  // For teachers: checks all classes they have, excluding the current class
  const isTimeBookedForReschedule = (dateStr, timeStr) => {
    if (!selectedClass || !selectedClass.id) return false;
    
    const dateKey = normalizeDate(dateStr);
    const classesOnDate = classesCache[dateKey] || [];
    const requestedTime = normalizeTime(timeStr);
    
    // Filter classes: 
    // - Exclude the current class being rescheduled
    // - Only include classes with the same teacher
    return classesOnDate.some(cls => 
      cls.id !== selectedClass.id &&  // Not the current class being rescheduled
      cls.teacher_id === selectedClass.teacher_id &&  // Same teacher
      normalizeTime(cls.start_time || cls.time || "") === requestedTime  // Same time
    );
  };

  // Helper: Check if counterparty has this date/time booked
  const isCounterpartyDateTimeBooked = (dateStr, timeStr) => {
    const normalizedDate = normalizeDate(dateStr);
    const requestedTime = normalizeTime(timeStr);
    return counterpartyBookedDates.some(bd => 
      normalizeDate(bd.scheduled_date) === normalizedDate && 
      normalizeTime(bd.start_time || bd.time || "") === requestedTime
    );
  };

  const getBookedSlotErrorMessage = () => {
    return localRole === "teacher"
      ? "This time slot is already booked on your schedule. Please choose another time."
      : "This time slot is already booked with your teacher. Please choose another time.";
  };

  const getCounterpartyUnavailableMessage = () => {
    return localRole === "teacher"
      ? "Student is not available at this time. Please choose another time."
      : "Teacher is not available at this time. Please choose another time.";
  };

  // Helper: Check if a time falls within teacher's break on the selected date
  const isTimeConflictingWithTeacherBreak = (dateStr, timeStr) => {
    if (!dateStr || !timeStr || !teacherAvailabilityList) return false;
    
    const normalizedDate = normalizeDate(dateStr);
    const availabilityRecord = teacherAvailabilityList.find(record => 
      normalizeDate(record.available_date) === normalizedDate
    );
    
    if (!availabilityRecord || !availabilityRecord.break_start || !availabilityRecord.break_end) {
      return false;
    }
    
    // Ensure break times are valid (break_start < break_end)
    const breakStart = availabilityRecord.break_start.substring(0, 5);
    const breakEnd = availabilityRecord.break_end.substring(0, 5);
    
    if (breakStart >= breakEnd) {
      return false; // Invalid break times
    }
    
    return timeStr >= breakStart && timeStr < breakEnd;
  };

  // Helper: Check if a time falls within teacher's availability window (start_time to end_time)
  // This should NOT penalize times within the break - let isTimeConflictingWithTeacherBreak handle breaks
  const isTimeOutsideTeacherAvailability = (dateStr, timeStr) => {
    if (!dateStr || !timeStr || !teacherAvailabilityList) {
      console.log(`⚠️ isTimeOutsideTeacherAvailability: Missing data - dateStr=${dateStr}, timeStr=${timeStr}, listExists=${!!teacherAvailabilityList}`);
      return false;
    }
    
    const normalizedDate = normalizeDate(dateStr);
    console.log(`🔍 Looking for availability record for date: ${normalizedDate}`);
    console.log(`📊 Available records:`, teacherAvailabilityList.map(r => ({ date: r.available_date, status: r.status })));
    
    const availabilityRecord = teacherAvailabilityList.find(record => 
      normalizeDate(record.available_date) === normalizedDate
    );
    
    console.log(`📌 Found availability record for ${normalizedDate}:`, availabilityRecord);
    
    // If no record or status is unavailable, return true (time is outside availability)
    if (!availabilityRecord || availabilityRecord.status !== "available") {
      console.log(`❌ No record or unavailable status`);
      return true;
    }
    
    // If no start/end time set, assume available all day
    if (!availabilityRecord.start_time || !availabilityRecord.end_time) {
      console.log(`✅ All-day availability (no specific times set)`);
      return false;
    }
    
    const availStart = availabilityRecord.start_time.substring(0, 5);
    const availEnd = availabilityRecord.end_time.substring(0, 5);
    
    console.log(`⏰ Availability window: ${availStart} - ${availEnd}, Requested time: ${timeStr}`);
    
    // Ensure times are properly ordered (start < end)
    if (availStart >= availEnd) {
      console.log(`⚠️ Invalid availability window: start ${availStart} >= end ${availEnd}`);
      return true; // Invalid availability window
    }
    
    // Check if time is within the availability window (including break time - break is checked separately)
    const isWithinWindow = timeStr >= availStart && timeStr < availEnd;
    console.log(`📍 Is ${timeStr} within ${availStart}-${availEnd}? ${isWithinWindow}`);
    
    // Return true if OUTSIDE the window
    return !isWithinWindow;
  };

  const getAvailabilityStatusForDate = (dateStr) => {
    const dateKey = normalizeDate(dateStr);
    if (!dateKey) return "";
    if (availability[dateKey]) return availability[dateKey];
    const record = teacherAvailabilityList.find(record => normalizeDate(record.available_date) === dateKey);
    return record?.status || "";
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

  const isPastDateString = (dateStr) => {
    const normalized = normalizeDate(dateStr);
    return Boolean(normalized) && normalized < fmtDate(new Date());
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
          const normalized = r.data.records
            .map(record => ({
              ...record,
              available_date: normalizeDate(record.available_date),
            }))
            .filter(record => !isPastDateString(record.available_date));
          setTeacherAvailabilityList(normalized);
        }
      })
      .catch(err => {
        console.error("Error loading teacher availability:", err);
        setTeacherAvailabilityList([]);
      });
  };

  // Fetch a specific teacher's availability records (used by students for reschedule validation)
  const loadSpecificTeacherAvailability = (teacherId, yearOverride = null, monthOverride = null) => {
    if (!teacherId) {
      console.warn(`⚠️ loadSpecificTeacherAvailability called with null/undefined teacherId`);
      return;
    }

    let targetYear = yearOverride;
    let targetMonth = monthOverride;
    if (!targetYear || !targetMonth) {
      const refDate = requestDate ? new Date(requestDate + "T00:00:00") : today;
      if (!isNaN(refDate.getTime())) {
        targetYear = refDate.getFullYear();
        targetMonth = refDate.getMonth() + 1;
      } else {
        targetYear = today.getFullYear();
        targetMonth = today.getMonth() + 1;
      }
    }

    console.log(`🔄 Loading teacher availability for teacher_id=${teacherId}, year=${targetYear}, month=${targetMonth}`);

    axios
      .get(`${API}/api/calendar/teacher-availability-records`, {
        params: { teacher_id: teacherId, year: targetYear, month: targetMonth }
      })
      .then(r => {
        console.log(`✅ Full API response:`, r.data);
        console.log(`📦 Records array:`, r.data?.records);
        console.log(`📊 Number of records:`, r.data?.records?.length || 0);
        if (r.data && r.data.records && r.data.records.length > 0) {
          const normalized = r.data.records
            .map(record => ({
              ...record,
              available_date: normalizeDate(record.available_date),
            }))
            .filter(record => !isPastDateString(record.available_date));
          console.log(`✨ Setting normalized availability list:`, normalized);
          setTeacherAvailabilityList(normalized);
        } else {
          console.warn(`⚠️ No records returned from API for teacher_id ${teacherId}`);
          setTeacherAvailabilityList([]);
        }
      })
      .catch(err => {
        console.error("❌ Error loading teacher availability:", err);
        setTeacherAvailabilityList([]);
      });
  };

  const validateAvailabilityInputs = ({
    availabilityDate: date = availabilityDate,
    availabilityStatus: status = availabilityStatus,
    availabilityStartTime: startTime = availabilityStartTime,
    availabilityEndTime: endTime = availabilityEndTime,
    availabilityBreakStart: breakStart = availabilityBreakStart,
    availabilityBreakEnd: breakEnd = availabilityBreakEnd,
  } = {}) => {
    if (!date) {
      return "Please select a date";
    }

    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const [selYear, selMonth, selDay] = date.split('-').map(Number);
    const selectedDateObj = new Date(selYear, selMonth - 1, selDay, 0, 0, 0, 0);

    if (
      selectedDateObj.getFullYear() !== currentYear ||
      selectedDateObj.getMonth() !== currentMonth
    ) {
      return "You can only set availability for the current month";
    }

    if (status === "available") {
      if (!startTime) {
        return "Please select a start time";
      }
      if (!endTime) {
        return "Please select an end time";
      }

      const start = new Date(`2000-01-01T${startTime}`);
      const end = new Date(`2000-01-01T${endTime}`);
      if (end <= start) {
        return "End time must be after start time";
      }

      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      if (selectedDateObj.getTime() === todayMidnight.getTime()) {
        const currentHours = today.getHours();
        const currentMins = today.getMinutes();
        const currentTotalMins = currentHours * 60 + currentMins;

        const [startHours, startMins] = startTime.split(":").map(Number);
        const startTotalMins = startHours * 60 + startMins;
        if (startTotalMins <= currentTotalMins) {
          return "Start time must be after the current time";
        }

        const [endHours, endMins] = endTime.split(":").map(Number);
        const endTotalMins = endHours * 60 + endMins;
        if (endTotalMins <= currentTotalMins) {
          return "End time must be after the current time";
        }
      }

      if (breakStart || breakEnd) {
        if (!breakStart) {
          return "Please select a break start time";
        }
        if (!breakEnd) {
          return "Please select a break end time";
        }

        const breakStartDate = new Date(`2000-01-01T${breakStart}`);
        const breakEndDate = new Date(`2000-01-01T${breakEnd}`);
        if (breakEndDate <= breakStartDate) {
          return "Break end time must be after break start time";
        }
        if (breakStartDate < start || breakEndDate > end) {
          return "Break time must be within your availability window";
        }
      }

      const bookedClasses = classesCache[date] || [];
      const hasConflict = bookedClasses.some(cls => {
        if (cls.teacher_id !== localUserId) return false;
        const classStart = new Date(`2000-01-01T${(cls.start_time || cls.time || "").substring(0, 5)}`);
        const classEnd = new Date(`2000-01-01T${(cls.end_time || "").substring(0, 5)}`);
        return classStart < end && classEnd > start;
      });
      if (hasConflict) {
        return "You have a booked class during this time period";
      }
    }

    return "";
  };

  const getAvailabilityFieldError = (field) => {
    const error = validateAvailabilityInputs();
    if (!error) return "";

    const fieldErrors = {
      availabilityDate: [
        "Please select a date",
        "You can only set availability for the current month",
      ],
      availabilityStartTime: [
        "Please select a start time",
        "Start time must be after the current time",
      ],
      availabilityEndTime: [
        "Please select an end time",
        "End time must be after start time",
        "End time must be after the current time",
      ],
      availabilityBreakStart: [
        "Please select a break start time",
        "Break time must be within your availability window",
      ],
      availabilityBreakEnd: [
        "Please select a break end time",
        "Break end time must be after break start time",
        "Break time must be within your availability window",
      ],
    };

    return fieldErrors[field]?.includes(error) ? error : "";
  };

  // Submit teacher availability
  const submitTeacherAvailability = async () => {
    const error = validateAvailabilityInputs();
    if (error) {
      setAvailabilityError(error);
      return;
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

    // Check if requested time slot is already booked by another student with this teacher
    if (isTimeBookedForReschedule(requestDate, requestTime)) {
      setRequestError("This time slot is already booked by another student with this teacher. Please choose another time.");
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const targetTimezone = selectedClass.teacher_timezone || selectedClass.source_timezone || DEFAULT_TIMEZONE;
      const requestedInTeacherTimezone = convertDateTime(requestDate, requestTime, viewerTimezone, targetTimezone);
      await axios.post(`${API}/api/calendar/reschedule-request`, {
        class_id: selectedClass.id,
        requested_by_id: localUserId,
        requested_date: requestedInTeacherTimezone.date || requestDate,
        requested_time: requestedInTeacherTimezone.time || requestTime,
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
  const isSelectedClassCompleted = selectedClass?.status === "completed";
  const isSelectedClassConfirmable = isClassJoinable(selectedClass, selectedDate);

  const openClassDoneConfirmation = () => {
    if (!selectedClass?.id || !selectedClass?.student_id) {
      notify?.("Please select a class first.", "error");
      return;
    }

    if (!isSelectedClassConfirmable) {
      notify?.("You can confirm the class 30 minutes before it starts until it ends.", "error");
      return;
    }

    setClassDoneConfirmOpen(true);
  };

  const markSelectedClassDone = async () => {
    setIsMarkingClassDone(true);
    try {
      const response = await axios.put(`${API}/api/calendar/classes/${selectedClass.id}/complete`, {
        teacher_id: localUserId,
      });

      setClassesCache(prev => ({
        ...prev,
        [selectedDate]: (prev[selectedDate] || []).filter(cls => String(cls.id) !== String(selectedClass.id)),
      }));
      setTeacherClassesCache(prev => ({
        ...prev,
        [selectedDate]: (prev[selectedDate] || []).filter(cls => String(cls.id || cls.class_id) !== String(selectedClass.id)),
      }));
      setBookedDates(prev =>
        prev.filter(bd =>
          normalizeDate(bd.scheduled_date) !== normalizeDate(selectedDate) ||
          normalizeTime(bd.start_time) !== normalizeTime(selectedClass.start_time || selectedClass.time)
        )
      );
      setSelectedClassId(null);

      if (response.data?.package && localRole === "student") {
        setStudentPackage(response.data.package);
      }

      setClassDoneConfirmOpen(false);
      notify?.("Class marked as done. Student class count updated.", "success");
    } catch (error) {
      const message = error.response?.data?.message || "Unable to mark class as done. Please try again.";
      notify?.(message, "error");
    } finally {
      setIsMarkingClassDone(false);
    }
  };

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
  const hasNoClassesLeft = localRole === "student" && Number(effectiveClassesLeft) <= 0;

  const studentMonthMin = fmtDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const studentMonthMax = fmtDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const openMonthlyBooking = () => {
    if (hasNoClassesLeft) {
      setStudentBookingError("Contact the admin for a new contract before booking more classes.");
      return;
    }

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

  const submitContractRequest = async () => {
    setContractRequestError("");

    if (!contractCourseId) {
      setContractRequestError("Please choose your desired course.");
      return;
    }

    if (!contractClassCount || Number(contractClassCount) <= 0) {
      setContractRequestError("Please choose the number of classes.");
      return;
    }

    setIsSubmittingContractRequest(true);
    try {
      await axios.post(`${API}/api/student/contract-requests`, {
        student_id: localUserId,
        course_id: contractCourseId,
        requested_classes: contractClassCount,
      });

      notify?.("Contract request sent to the admin.", "success");
      setContractRequestOpen(false);
      loadContractRequests();
    } catch (err) {
      setContractRequestError(err?.response?.data?.message || "Unable to send contract request.");
    } finally {
      setIsSubmittingContractRequest(false);
    }
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
    if (hasNoClassesLeft) {
      setStudentBookingError("Contact the admin for a new contract before booking more classes.");
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

    const selectedAvailabilityRecord = teacherAvailabilityList.find(
      record => normalizeDate(record.available_date) === studentBookingDate
    ) || teacherAvailabilityRecordForDate;
    const teacherTimezone = selectedAvailabilityRecord?.teacher_timezone || DEFAULT_TIMEZONE;
    const teacherStart = convertDateTime(studentBookingDate, studentBookingTime, viewerTimezone, teacherTimezone);
    const teacherBookingDate = teacherStart.date || studentBookingDate;
    const teacherBookingTime = teacherStart.time || studentBookingTime;

    const [hour, min] = teacherBookingTime.split(":").map(Number);
    const endDate = new Date(2000, 0, 1, hour + 1, min);
    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

    const start = new Date(`2000-01-01T${teacherBookingTime}`);
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
        scheduled_date: teacherBookingDate,
        start_time: teacherBookingTime,
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
        delete updated[teacherBookingDate];
        return updated;
      });
      setTeacherClassesCache(prev => {
        const updated = { ...prev };
        delete updated[studentBookingDate];
        delete updated[teacherBookingDate];
        return updated;
      });
      loadClassesForDate(teacherBookingDate);
      loadTeacherClassesForDate(teacherBookingDate, assignedTeacherId);
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
                
                // Check if date is in the past
                const isPast = isPastDate(d);
                
                // Check if teacher has set schedule for this date (status exists)
                const teacherHasSchedule = d && (status === "available" || status === "unavailable");
                
                // Determine color coding for the calendar
                let cellClass = styles.cell;
                if (!d) {
                  cellClass = [styles.cell, styles.empty].join(" ");
                } else if (isPast) {
                  cellClass = [styles.cell, styles.pastCell].join(" ");
                } else if (status === "unavailable") {
                  cellClass = [styles.cell, styles.clickableCell, styles.unavailable].join(" ");
                } else if (hasClasses) {
                  cellClass = [styles.cell, styles.clickableCell, styles.hasClasses].join(" ");
                } else if (status === "available") {
                  cellClass = [styles.cell, styles.clickableCell, styles.available].join(" ");
                } else if (!teacherHasSchedule) {
                  cellClass = [styles.cell, styles.clickableCell, styles.unscheduled].join(" ");
                } else {
                  cellClass = [styles.cell, styles.clickableCell].join(" ");
                }
                
                if (isTodayCell) cellClass += " " + styles.today;
                if (isSelected) cellClass += " " + styles.selected;
                
                let tooltipText = "";
                if (d) {
                  if (isPast) {
                    tooltipText = "Past date";
                  } else if (status === "unavailable") {
                    tooltipText = "Teacher unavailable";
                  } else if (hasClasses) {
                    tooltipText = "Classes scheduled";
                  } else if (status === "available") {
                    tooltipText = "Teacher available";
                  } else if (!teacherHasSchedule) {
                    tooltipText = "Teacher schedule not set";
                  }
                }
                
                return (
                  <button
                    key={idx}
                    type="button"
                    className={cellClass}
                    onClick={() => handleCellClick(d)}
                    disabled={!d || isPast}
                    title={tooltipText}
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
                    {selectedClass.classLink && (
                      <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                        <div><strong>Meeting Link:</strong></div>
                        <div style={{ fontSize: "0.75em", marginTop: "4px", wordBreak: "break-all" }}>
                          <a href={selectedClass.classLink} target="_blank" rel="noreferrer" style={{ color: "#0052cc", textDecoration: "underline" }}>
                            Open Teams Meeting
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isSelectedClassCompleted || !isClassJoinable(selectedClass, selectedDate)}
                    onClick={() => {
                      if (!isSelectedClassCompleted && isClassJoinable(selectedClass, selectedDate)) {
                        window.open(selectedClass.classLink, "_blank");
                      }
                    }}
                    className={`${styles.bookBtn} ${styles.joinBtn}`}
                    style={{
                      textAlign: "center",
                      display: "block",
                      width: "100%",
                      cursor: !isSelectedClassCompleted && isClassJoinable(selectedClass, selectedDate) ? "pointer" : "not-allowed",
                      opacity: !isSelectedClassCompleted && isClassJoinable(selectedClass, selectedDate) ? 1 : 0.5,
                      filter: !isSelectedClassCompleted && isClassJoinable(selectedClass, selectedDate) ? "none" : "grayscale(100%)",
                    }}
                    title={isSelectedClassCompleted ? "This class is already done" : isClassJoinable(selectedClass, selectedDate) ? "" : "Available 30 mins before class starts"}
                  >
                    Join Class
                  </button>
                  { !isAdmin && !requestMode && (
                    <button
                      className={`${styles.bookBtn} ${styles.rescheduleBtn}`}
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
                        // preload date only; clear time so user chooses a new slot
                        setRequestDate(selectedClass.scheduled_date || selectedDate);
                        setRequestTime("");
                      }}
                      style={{ marginTop: "8px" }}
                    >
                      Request for Reschedule
                    </button>
                  ) }
                  { localRole === "teacher" && !isAdmin && !requestMode && (
                    <button
                      type="button"
                      className={`${styles.bookBtn} ${styles.doneBtn}`}
                      disabled={isSelectedClassCompleted || isMarkingClassDone || !isSelectedClassConfirmable}
                      onClick={openClassDoneConfirmation}
                      style={{
                        marginTop: "8px",
                        opacity: isSelectedClassCompleted || isMarkingClassDone || !isSelectedClassConfirmable ? 0.6 : 1,
                        cursor: isSelectedClassCompleted || isMarkingClassDone || !isSelectedClassConfirmable ? "not-allowed" : "pointer",
                      }}
                      title={isSelectedClassConfirmable ? "" : "Available 30 mins before class starts until class ends"}
                    >
                      {isSelectedClassCompleted ? "Class Done" : isMarkingClassDone ? "Saving..." : "Confirm Class Done"}
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
                            loadClassesForDate(e.target.value);
                          }}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                        />
                        {requestDate && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666", lineHeight: 1.4 }}>
                            {getAvailabilityStatusForDate(requestDate) === "unavailable" ? (
                              <p style={{ margin: 0, color: "#f44336" }}>✕ You are unavailable on this date</p>
                            ) : getAvailabilityStatusForDate(requestDate) === "available" ? (
                              <p style={{ margin: 0, color: "#4caf50" }}>✓ You are available on this date</p>
                            ) : (
                              <p style={{ margin: 0, color: "#999" }}>• Your availability not set</p>
                            )}
                            {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).length > 0 && (
                              <p style={{ margin: "4px 0 0 0", color: "#ff9800" }}>
                                ⚠️ {localRole === "student" ? "Teacher" : "Student"} booked: {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).map(bd => humanTime(bd.start_time)).join(", ")}  
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Time *</label>
                        <input
                          type="time"
                          step="3600"
                          value={requestTime}
                          onChange={e => {
                            const time = e.target.value;
                            const [hours] = time.split(':');
                            const roundedTime = `${hours}:00`;
                            setRequestTime(roundedTime);
                            setRequestError("");
                            // Check if reschedule is to the same date/time as current schedule
                            if (requestDate && isRescheduleToSameDateTime(requestDate, roundedTime)) {
                              setRequestError("Cannot reschedule to the same date and time. Please choose a different time.");
                            }
                            // Check if this time is already booked with the same teacher
                            else if (requestDate && isTimeBookedForReschedule(requestDate, roundedTime)) {
                              setRequestError(getBookedSlotErrorMessage());
                            }
                            // Check if time conflicts with break
                            else if (requestDate && isTimeConflictingWithTeacherBreak(requestDate, roundedTime)) {
                              setRequestError("This time conflicts with your break. Please choose another time.");
                            }
                            // Check if time is outside availability window
                            else if (requestDate && isTimeOutsideTeacherAvailability(requestDate, roundedTime)) {
                              setRequestError("This time is outside your availability window. Please choose another time.");
                            }
                          }}
                          disabled={requestDate && getAvailabilityStatusForDate(requestDate) === "unavailable"}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit", opacity: requestDate && getAvailabilityStatusForDate(requestDate) === "unavailable" ? 0.5 : 1, cursor: requestDate && getAvailabilityStatusForDate(requestDate) === "unavailable" ? "not-allowed" : "auto" }}
                        />
                        {requestDate && getAvailabilityStatusForDate(requestDate) === "unavailable" && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#f44336" }}>
                            ✕ Cannot select time - you are unavailable on this date
                          </div>
                        )}
                        {requestError && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#f44336" }}>
                            ✕ {requestError}
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
                          disabled={isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getAvailabilityStatusForDate(requestDate) !== "available" || !!requestError}
                          style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getAvailabilityStatusForDate(requestDate) !== "available" || !!requestError) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getAvailabilityStatusForDate(requestDate) !== "available" || !!requestError) ? "not-allowed" : "pointer" }}
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
                              const nextDate = e.target.value;
                              setAvailabilityDate(nextDate);
                              setAvailabilityError(validateAvailabilityInputs({ availabilityDate: nextDate }));
                            }}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                          />
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666" }}>
                            Only current month dates allowed
                          </div>
                          {getAvailabilityFieldError("availabilityDate") && (
                            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#d32f2f" }}>
                              {getAvailabilityFieldError("availabilityDate")}
                            </div>
                          )}
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Availability Status *</label>
                          <div style={{ display: "flex", gap: 12 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityStatus("available");
                                setAvailabilityError(validateAvailabilityInputs({ availabilityStatus: "available" }));
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
                                setAvailabilityError(validateAvailabilityInputs({ availabilityStatus: "unavailable" }));
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
                                step="3600"
                                value={availabilityStartTime}
                                onChange={e => {
                                  const time = e.target.value;
                                  const roundedTime = time ? `${time.split(':')[0]}:00` : "";
                                  setAvailabilityStartTime(roundedTime);
                                  setAvailabilityError(validateAvailabilityInputs({ availabilityStartTime: roundedTime }));
                                }}
                                style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                              />
                              {getAvailabilityFieldError("availabilityStartTime") && (
                                <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#d32f2f" }}>
                                  {getAvailabilityFieldError("availabilityStartTime")}
                                </div>
                              )}
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>End Time *</label>
                              <input
                                type="time"
                                step="3600"
                                value={availabilityEndTime}
                                onChange={e => {
                                  const time = e.target.value;
                                  const roundedTime = time ? `${time.split(':')[0]}:00` : "";
                                  setAvailabilityEndTime(roundedTime);
                                  setAvailabilityError(validateAvailabilityInputs({ availabilityEndTime: roundedTime }));
                                }}
                                style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                              />
                              {getAvailabilityFieldError("availabilityEndTime") && (
                                <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#d32f2f" }}>
                                  {getAvailabilityFieldError("availabilityEndTime")}
                                </div>
                              )}
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
                                    step="3600"
                                    value={availabilityBreakStart}
                                    onChange={e => {
                                      const time = e.target.value;
                                      const roundedTime = time ? `${time.split(':')[0]}:00` : "";
                                      setAvailabilityBreakStart(roundedTime);
                                      setAvailabilityError(validateAvailabilityInputs({ availabilityBreakStart: roundedTime }));
                                    }}
                                    style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                                  />
                                  {getAvailabilityFieldError("availabilityBreakStart") && (
                                    <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#d32f2f" }}>
                                      {getAvailabilityFieldError("availabilityBreakStart")}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: 3, color: "#666" }}>Break End</label>
                                  <input
                                    type="time"
                                    step="3600"
                                    value={availabilityBreakEnd}
                                    onChange={e => {
                                      const time = e.target.value;
                                      const roundedTime = time ? `${time.split(':')[0]}:00` : "";
                                      setAvailabilityBreakEnd(roundedTime);
                                      setAvailabilityError(validateAvailabilityInputs({ availabilityBreakEnd: roundedTime }));
                                    }}
                                    style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                                  />
                                  {getAvailabilityFieldError("availabilityBreakEnd") && (
                                    <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#d32f2f" }}>
                                      {getAvailabilityFieldError("availabilityBreakEnd")}
                                    </div>
                                  )}
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
                      disabled={isSelectedClassCompleted || !isClassJoinable(selectedClass, selectedDate)}
                      onClick={() => {
                        if (!isSelectedClassCompleted && isClassJoinable(selectedClass, selectedDate)) {
                          window.open(selectedClass.classLink, "_blank");
                        }
                      }}
                      className={`${styles.bookBtn} ${styles.joinBtn}`}
                      style={{
                        textAlign: "center",
                        display: "block",
                        width: "100%",
                        cursor: !isSelectedClassCompleted && isClassJoinable(selectedClass, selectedDate) ? "pointer" : "not-allowed",
                        opacity: !isSelectedClassCompleted && isClassJoinable(selectedClass, selectedDate) ? 1 : 0.5,
                        filter: !isSelectedClassCompleted && isClassJoinable(selectedClass, selectedDate) ? "none" : "grayscale(100%)",
                      }}
                      title={isSelectedClassCompleted ? "This class is already done" : isClassJoinable(selectedClass, selectedDate) ? "" : "Available 30 mins before class starts"}
                    >
                      Join Class
                    </button>
                    <button
                      type="button"
                      className={`${styles.bookBtn} ${styles.rescheduleBtn}`}
                      onClick={() => {
                        // Fetch counterparty's booked dates
                        const otherPartyId = localRole === "student" ? selectedClass.teacher_id : selectedClass.student_id;
                        setCounterpartyId(otherPartyId);
                        
                        console.log(`🔍 Request Reschedule clicked - localRole: ${localRole}, selectedClass:`, selectedClass);
                        console.log(`👨‍🏫 selectedClass.teacher_id = ${selectedClass.teacher_id}`);
                        console.log(`👤 otherPartyId = ${otherPartyId}`);
                        
                        // Load the other party's booked dates
                        axios
                          .get(`${API}/api/calendar/booked-dates/${otherPartyId}`)
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
                        
                        // Always load teacher's availability (for both student and teacher making reschedule)
                        const teacherIdToLoad = selectedClass.teacher_id;
                        console.log(`🎯 teacherIdToLoad = ${teacherIdToLoad}`);
                        if (teacherIdToLoad) {
                          console.log(`📚 Calling loadSpecificTeacherAvailability with teacherId: ${teacherIdToLoad}`);
                          loadSpecificTeacherAvailability(teacherIdToLoad);
                        } else {
                          console.warn(`⚠️ teacherIdToLoad is null/undefined, skipping availability fetch`);
                        }
                        
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
                              loadClassesForDate(e.target.value);
                            }}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit" }}
                          />
                          {requestDate && (
                            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666", lineHeight: 1.4 }}>
                              {getAvailabilityStatusForDate(requestDate) === "unavailable" ? (
                                <p style={{ margin: 0, color: "#f44336" }}>✕ Teacher is unavailable on this date</p>
                              ) : getAvailabilityStatusForDate(requestDate) === "available" ? (
                                <p style={{ margin: 0, color: "#4caf50" }}>✓ Teacher is available on this date</p>
                              ) : (
                                <p style={{ margin: 0, color: "#999" }}>• Availability not set</p>
                              )}
                              {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).length > 0 && (
                                <p style={{ margin: "4px 0 0 0", color: "#ff9800" }}>
                                  ⚠️ Student booked: {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).map(bd => humanTime(bd.start_time)).join(", ")} 
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Time *</label>
                          <input
                            type="time"
                            step="3600"
                            value={requestTime}
                            onChange={e => {
                              const time = e.target.value;
                              const [hours] = time.split(':');
                              const roundedTime = `${hours}:00`;
                              setRequestTime(roundedTime);
                              setRequestError("");
                              // Check if reschedule is to the same date/time as current schedule
                              if (requestDate && isRescheduleToSameDateTime(requestDate, roundedTime)) {
                                setRequestError("Cannot reschedule to the same date and time. Please choose a different time.");
                              }
                              // Check if counterparty has this time booked
                              else if (requestDate && isCounterpartyDateTimeBooked(requestDate, roundedTime)) {
                                setRequestError(getCounterpartyUnavailableMessage());
                              }
                              // Check if time conflicts with teacher's break
                              else if (requestDate && isTimeConflictingWithTeacherBreak(requestDate, roundedTime)) {
                                setRequestError("This time conflicts with teacher's break. Please choose another time.");
                              }
                              // Check if time is outside teacher's availability window
                              else if (requestDate && isTimeOutsideTeacherAvailability(requestDate, roundedTime)) {
                                setRequestError("This time is outside the teacher's availability window. Please choose another time.");
                              }
                            }}
                            disabled={requestDate && getAvailabilityStatusForDate(requestDate) === "unavailable"}
                            style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit", opacity: requestDate && getAvailabilityStatusForDate(requestDate) === "unavailable" ? 0.5 : 1, cursor: requestDate && getAvailabilityStatusForDate(requestDate) === "unavailable" ? "not-allowed" : "auto" }}
                          />
                          {requestDate && getAvailabilityStatusForDate(requestDate) === "unavailable" && (
                            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#f44336" }}>
                              ✕ Cannot select time - teacher is unavailable on this date
                            </div>
                          )}
                          {requestError && (
                            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#f44336" }}>
                              ✕ {requestError}
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
                            disabled={isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getAvailabilityStatusForDate(requestDate) !== "available" || !!requestError}
                            style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getAvailabilityStatusForDate(requestDate) !== "available" || !!requestError) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getAvailabilityStatusForDate(requestDate) !== "available" || !!requestError) ? "not-allowed" : "pointer" }}
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
                    <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
                      {hasNoClassesLeft ? "Booking is locked until a new contract is added." : "Tip: Contact your teacher to add or reschedule classes."}
                    </div>
                    {hasNoClassesLeft && (
                      <div style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
                        {contractRequests[0] && (
                          <div style={{ marginBottom: 10, fontSize: 12, color: "#4b5563" }}>
                            Latest request: <strong style={{ textTransform: "capitalize" }}>{contractRequests[0].status}</strong>
                            {contractRequests[0].course_name ? ` - ${contractRequests[0].course_name}` : ""}
                            {contractRequests[0].requested_classes ? ` (${contractRequests[0].requested_classes} classes)` : ""}
                          </div>
                        )}
                        {!contractRequestOpen ? (
                          <button
                            type="button"
                            className={styles.slotBtn}
                            onClick={() => {
                              setContractRequestOpen(true);
                              setContractRequestError("");
                              setContractCourseId(studentProfile?.course_id || "");
                            }}
                            style={{ width: "100%", textAlign: "center", background: "#111827", color: "#fff" }}
                          >
                            Request New Contract
                          </button>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Desired Course</label>
                              <select
                                value={contractCourseId}
                                onChange={(e) => setContractCourseId(e.target.value)}
                                style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontFamily: "inherit" }}
                              >
                                <option value="">Select course</option>
                                {courses.map((course) => (
                                  <option key={course.course_id} value={course.course_id}>
                                    {course.course_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Number of Classes</label>
                              <select
                                value={contractClassCount}
                                onChange={(e) => setContractClassCount(e.target.value)}
                                style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontFamily: "inherit" }}
                              >
                                <option value="10">10 classes</option>
                                <option value="15">15 classes</option>
                                <option value="20">20 classes</option>
                              </select>
                            </div>
                            {contractRequestError && (
                              <div style={{ padding: 8, border: "1px solid #fecaca", borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 12 }}>
                                {contractRequestError}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => setContractRequestOpen(false)}
                                disabled={isSubmittingContractRequest}
                                style={{ flex: 1, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: isSubmittingContractRequest ? "not-allowed" : "pointer" }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={submitContractRequest}
                                disabled={isSubmittingContractRequest}
                                style={{ flex: 1, padding: "9px 10px", border: "none", borderRadius: 8, background: "#111827", color: "#fff", cursor: isSubmittingContractRequest ? "not-allowed" : "pointer" }}
                              >
                                {isSubmittingContractRequest ? "Sending..." : "Send Request"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      <button
                        type="button"
                        className={styles.slotBtn}
                        onClick={openMonthlyBooking}
                        disabled={!assignedTeacherId || hasNoClassesLeft}
                        style={{
                          width: "100%",
                          textAlign: "center",
                          opacity: !assignedTeacherId || hasNoClassesLeft ? 0.55 : 1,
                          cursor: !assignedTeacherId || hasNoClassesLeft ? "not-allowed" : "pointer",
                        }}
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
              <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 8 }}>Calendar Color Guide:</div>
              
              <div className={styles.legendRow}>
                <span className={`${styles.legendDot} ${styles.legendAvail}`} />
                <span>Available</span>
              </div>

              <div className={styles.legendRow}>
                <span className={`${styles.legendDot} ${styles.legendClasses}`} />
                <span>Classes Scheduled</span>
              </div>

              <div className={styles.legendRow}>
                <span className={`${styles.legendDot} ${styles.legendUnavail}`} />
                <span>Teacher Unavailable</span>
              </div>

              <div className={styles.legendRow}>
                <span className={`${styles.legendDot} ${styles.legendUnscheduled}`} />
                <span>Schedule Not Set</span>
              </div>

              <div className={styles.legendRow}>
                <span className={`${styles.legendDot} ${styles.legendPast}`} />
                <span>Past Date</span>
              </div>

              <div className={styles.legendRow} style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                Click a day to view details
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
    {classDoneConfirmOpen && selectedClass && (
      <div
        role="presentation"
        onClick={() => {
          if (!isMarkingClassDone) setClassDoneConfirmOpen(false);
        }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          zIndex: 2000,
          animation: "fadeIn 0.2s ease-out",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="class-done-title"
          onClick={(event) => event.stopPropagation()}
          style={{
            width: "min(420px, 100%)",
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
            padding: 24,
            animation: "slideIn 0.22s ease-out",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "#e7f5ff",
              color: "#1864ab",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 20,
              marginBottom: 14,
            }}
          >
            OK
          </div>
          <h3 id="class-done-title" style={{ margin: "0 0 8px", fontSize: "1.15rem", color: "#111827" }}>
            Confirm class completion
          </h3>
          <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.5, fontSize: "0.92rem" }}>
            This will mark the class as done and count one used class from the student's package.
          </p>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#f9fafb",
              padding: "12px 14px",
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>
              {selectedClass.className || "Selected class"}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#4b5563" }}>
              {selectedClass.studentName ? `${selectedClass.studentName} - ` : ""}
              {selectedClass.time} - {getEndTime(selectedClass.time, selectedClass.duration)}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={() => setClassDoneConfirmOpen(false)}
              disabled={isMarkingClassDone}
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                borderRadius: 8,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: isMarkingClassDone ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={markSelectedClassDone}
              disabled={isMarkingClassDone}
              style={{
                border: "none",
                background: "#1864ab",
                color: "#fff",
                borderRadius: 8,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: isMarkingClassDone ? "not-allowed" : "pointer",
                boxShadow: "0 8px 18px rgba(24, 100, 171, 0.22)",
              }}
            >
              {isMarkingClassDone ? "Confirming..." : "Confirm Done"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

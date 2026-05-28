import { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser, writeStoredUser } from "../utils/sessionUser.js";
import { PROFICIENCY_LEVEL_OPTIONS, formatProficiencyLevel } from "../utils/proficiencyLevels.js";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/studentSchedule.module.css";
import {
  DEFAULT_TIMEZONE,
  convertDateTime,
  formatDateInTimezone,
  formatTimeInTimezone,
  getUserTimezone,
  humanTime as formatHumanTime,
  normalizeTimeKey,
} from "../utils/timezone.js";

// API base
const API = "http://localhost:3001";

const AI_CRITERIA_OPTIONS = {
  learningGoal: [
    ["school-support", "School Support", ["Online English", "OPIc"]],
    ["conversation", "Conversation", ["Conversational English", "Travel English", "Online English", "OPIc"]],
    ["exam-prep", "Exam Preparation", ["IELTS", "TOEIC", "OPIc"]],
    ["business", "Business English", ["Business English", "Job Interview", "TOEIC"]],
    ["confidence", "Confidence Building", ["Conversational English", "Travel English", "Online English"]],
    ["interview-readiness", "Interview Readiness", ["Job Interview", "Business English"]],
    ["news-discussion", "News Discussion", ["News", "Conversational English"]],
  ],
  learningStyle: [
    ["", "Select Learning Style"],
    ["structured", "Structured Lessons"],
    ["conversational", "Conversational Practice"],
    ["visual", "Visual Activities"],
    ["interactive", "Interactive Activities"],
    ["independent", "Independent Practice"],
  ],
  personality: [
    ["", "Select Personality"],
    ["shy", "Shy / Needs Encouragement"],
    ["outgoing", "Outgoing"],
    ["focused", "Focused"],
    ["energetic", "Energetic"],
    ["anxious", "Anxious / Needs Patience"],
  ],
  focusArea: [
    ["speaking", "Speaking", ["Conversational English", "Travel English", "Online English", "OPIc", "Job Interview"]],
    ["grammar", "Grammar", ["Online English", "IELTS", "TOEIC", "Business English"]],
    ["reading", "Reading", ["IELTS", "TOEIC", "News", "Online English"]],
    ["writing", "Writing", ["IELTS", "Business English", "Online English", "Job Interview"]],
    ["listening", "Listening", ["IELTS", "TOEIC", "Conversational English", "OPIc", "News"]],
    ["vocabulary", "Vocabulary", ["Business English", "Travel English", "News", "TOEIC", "IELTS"]],
    ["pronunciation", "Pronunciation", ["Conversational English", "OPIc", "Travel English", "Online English"]],
    ["interview-answers", "Interview Answers", ["Job Interview", "Business English"]],
  ],
  pace: [
    ["", "Select Pace"],
    ["slow", "Slow and Guided"],
    ["balanced", "Balanced"],
    ["fast", "Fast-paced"],
    ["review-heavy", "Review-heavy"],
  ],
};

const optionAppliesToCourses = (option, selectedCourseNames) => {
  const allowedCourses = option[2] || [];
  if (!selectedCourseNames.length) return false;
  if (!allowedCourses.length) return true;
  return allowedCourses.some((courseName) => selectedCourseNames.includes(courseName));
};

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
const CLASS_DURATION_OPTIONS = [25, 50];
const DEFAULT_CLASS_DURATION = 50;
const SLOT_STEP_MINUTES = 25;

const normalizeClassDuration = (value) => {
  const parsed = parseInt(value, 10);
  return CLASS_DURATION_OPTIONS.includes(parsed) ? parsed : DEFAULT_CLASS_DURATION;
};

const timeToMinutes = (timeStr) => {
  const normalized = normalizeTime(timeStr);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const safeMinutes = ((Number(minutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const rangesOverlap = (startA, endA, startB, endB) => startA < endB && endA > startB;

const getClassRange = (classObj) => {
  const start = timeToMinutes(classObj?.start_time || classObj?.startTime || classObj?.time);
  if (start == null) return null;
  const duration = parseInt(classObj?.duration, 10);
  let end = Number.isFinite(duration) && duration > 0
    ? start + duration
    : timeToMinutes(classObj?.end_time || classObj?.endTime);
  if (end == null || end <= start) return null;
  return { start, end };
};

// Helper: calculate end time from start time and duration in minutes
const getEndTime = (startTime, durationMins) => {
  if (!startTime || !durationMins) return "";
  const start = timeToMinutes(startTime);
  const duration = parseInt(durationMins, 10);
  if (start == null || !Number.isFinite(duration) || duration <= 0) return "";
  return humanTime(minutesToTime(start + duration));
};

const resolveProfileImageSrc = (url) => {
  if (!url) return userPic;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url}`;
};

const formatRemarkDate = (value) => {
  if (!value) return "";
  const datePart = String(value).slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString();
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

const isClassPast = (classObj, selectedDate) => {
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
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
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
      }
    }

    if (!classEnd) return false;
    return now >= classEnd;
  } catch {
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
  const [classDoneAssessmentOpen, setClassDoneAssessmentOpen] = useState(false);
  const [classDoneAssessmentLevel, setClassDoneAssessmentLevel] = useState("");
  const [classDoneAssessmentNotes, setClassDoneAssessmentNotes] = useState("");
  const [classDoneAssessmentError, setClassDoneAssessmentError] = useState("");
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
  const [studentRemarks, setStudentRemarks] = useState([]);
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
  const [contractClassDuration, setContractClassDuration] = useState("50");
  const [contractTrialNotes, setContractTrialNotes] = useState("");
  const [contractAiCriteria, setContractAiCriteria] = useState({
    learningGoal: [],
    learningStyle: "",
    personality: "",
    focusArea: [],
    pace: "",
  });
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
  const studentClassDuration = useMemo(
    () => normalizeClassDuration(studentPackage?.class_duration ?? studentProfile?.course_duration),
    [studentPackage?.class_duration, studentProfile?.course_duration]
  );
  const selectedContractCourseNames = useMemo(
    () => courses
      .filter((course) => String(course.course_id) === String(contractCourseId))
      .map((course) => course.course_name),
    [courses, contractCourseId]
  );
  const selectedClasses = selectedDate ? (classesCache[selectedDate] || []) : [];
  const selectedClass = selectedClassId
    ? selectedClasses.find(cls => cls.id === selectedClassId)
    : null;
  const selectedClassDuration = Number(selectedClass?.duration) > 0
    ? Number(selectedClass.duration)
    : studentClassDuration;
  const latestRemark = selectedClass?.id
    ? (studentRemarks.find((remark) => String(remark.class_id) === String(selectedClass.id)) || studentRemarks[0] || null)
    : (studentRemarks[0] || null);
  const selectedTeacherFullName = selectedClass
    ? [selectedClass.teacherName, selectedClass.teacherLastName]
        .filter(Boolean)
        .join(" ")
        .trim() || selectedClass.teacherFullName || selectedClass.teacherName
    : "";
  const contractLearningGoalOptions = useMemo(
    () => AI_CRITERIA_OPTIONS.learningGoal.filter((option) => optionAppliesToCourses(option, selectedContractCourseNames)),
    [selectedContractCourseNames]
  );
  const contractFocusAreaOptions = useMemo(
    () => AI_CRITERIA_OPTIONS.focusArea.filter((option) => optionAppliesToCourses(option, selectedContractCourseNames)),
    [selectedContractCourseNames]
  );

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
      const parsed = readStoredUser();
      if (parsed) {
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
    if (!selectedClass?.student_id) {
      setStudentRemarks([]);
      return;
    }

    let active = true;
    axios
      .get(`${API}/api/student/${selectedClass.student_id}/remarks`)
      .then((response) => {
        if (!active) return;
        setStudentRemarks(response.data?.remarks || []);
      })
      .catch(() => {
        if (active) setStudentRemarks([]);
      });

    return () => {
      active = false;
    };
  }, [selectedClass?.student_id]);

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
            const parsed = readStoredUser();
            if (parsed) {
              const updated = {
                ...parsed,
                assignedTeacherId: teacherIdFromProfile,
                assigned_teacher_id: teacherIdFromProfile,
              };
              writeStoredUser(updated);
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
  const studentFullName = [c.student_name || c.studentName, c.student_last_name || c.studentLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const teacherFullName = [c.teacher_first_name || c.teacherName || c.teacher_name, c.teacher_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    ...c,
    id: c.id || c.class_id,
    className: c.className || c.class_name || c.name,
    studentName: studentFullName || c.studentName || c.student_name,
    studentFullName: studentFullName || c.studentFullName || c.studentName || c.student_name,
    studentEmail: c.studentEmail || c.student_email,
    studentProficiencyLevel: c.studentProficiencyLevel || c.student_proficiency_level || "",
    teacherName: teacherFullName || c.teacherName || c.teacher_name,
    teacherFullName: teacherFullName || c.teacherFullName || c.teacherName || c.teacher_name,
    teacherLastName: c.teacherLastName || c.teacher_last_name || "",
    teacherEmail: c.teacherEmail || c.teacher_email,
    teacherProfileImageUrl: c.teacherProfileImageUrl || c.teacher_profile_image_url || "",
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
  const loadAvailableTimeSlots = (dateStr, tId, durationOverride = null, excludeClassId = null) => {
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
    const teacherAvailabilityRecord = teacherAvailabilityList.find(
      record => normalizeDate(record.available_date) === dateKey && record.status === "available"
    ) || (teacherAvailabilityRecordForDate && teacherAvailabilityRecordForDate.status === "available" ? teacherAvailabilityRecordForDate : null);

    if (!teacherAvailabilityRecord?.start_time || !teacherAvailabilityRecord?.end_time) {
      setAvailableTimeSlots([]);
      return;
    }

    const duration = normalizeClassDuration(durationOverride ?? studentPackage?.class_duration ?? studentProfile?.course_duration);
    const availabilityStart = timeToMinutes(teacherAvailabilityRecord.start_time);
    const availabilityEnd = timeToMinutes(teacherAvailabilityRecord.end_time);
    if (availabilityStart == null || availabilityEnd == null || availabilityEnd <= availabilityStart) {
      setAvailableTimeSlots([]);
      return;
    }

    const breakStart = teacherAvailabilityRecord.break_start ? timeToMinutes(teacherAvailabilityRecord.break_start) : null;
    const breakEnd = teacherAvailabilityRecord.break_end ? timeToMinutes(teacherAvailabilityRecord.break_end) : null;
    const occupiedRanges = classes
      .filter(cls => cls?.id !== excludeClassId && (Number(cls.teacher_id) === Number(tId) || Number(cls.student_id) === Number(localUserId)))
      .map(getClassRange)
      .filter(Boolean);

    const finalSlotsInTeacherTimezone = [];
    for (let minute = availabilityStart; minute + duration <= availabilityEnd; minute += SLOT_STEP_MINUTES) {
      const slotEnd = minute + duration;
      const conflictsWithBreak = breakStart != null && breakEnd != null && rangesOverlap(minute, slotEnd, breakStart, breakEnd);
      const conflictsWithClass = occupiedRanges.some(range => rangesOverlap(minute, slotEnd, range.start, range.end));
      if (!conflictsWithBreak && !conflictsWithClass) {
        finalSlotsInTeacherTimezone.push(minutesToTime(minute));
      }
    }

    const teacherTimezone = teacherAvailabilityRecord?.teacher_timezone || DEFAULT_TIMEZONE;
    const currentViewerDate = formatDateInTimezone(new Date(), viewerTimezone);
    const currentViewerTime = formatTimeInTimezone(new Date(), viewerTimezone);
    const currentViewerMinutes = timeToMinutes(currentViewerTime);
    const finalSlots = finalSlotsInTeacherTimezone
      .map(slot => {
        const converted = convertDateTime(dateKey, slot, teacherTimezone, viewerTimezone);
        return converted.date === dateKey ? converted.time : null;
      })
      .filter(Boolean)
      .filter((slot) => {
        if (!slot) return false;
        if (dateKey < currentViewerDate) return false;
        if (dateKey === currentViewerDate && currentViewerMinutes != null) {
          const slotMinutes = timeToMinutes(slot);
          return slotMinutes != null && slotMinutes > currentViewerMinutes;
        }
        return true;
      });

    setAvailableTimeSlots(finalSlots);
  };

  const handleSelectTimeSlot = (time, setTime, setError, isBooked, conflictMessage, sameDateTimeCheck) => {
    if (isBooked) return;
    setTime(time);
    setError("");
    if (sameDateTimeCheck?.()) {
      setError("Cannot reschedule to the same date and time. Please choose a different time.");
    } else if (conflictMessage) {
      setError(conflictMessage);
    }
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
    if (requestMode && requestDate && selectedClass?.teacher_id && classesCache[requestDate] !== undefined) {
      loadAvailableTimeSlots(requestDate, selectedClass.teacher_id, selectedClassDuration, selectedClass.id);
    }
  }, [selectedDate, teacherId, classesCache, availability, studentBookingMode, studentBookingDate, assignedTeacherId, teacherClassesCache, teacherAvailabilityList, studentPackage, studentProfile, requestMode, requestDate, selectedClass?.teacher_id, selectedClass?.id, selectedClassDuration]);

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
    // If teacher is in availability manager, selecting a calendar cell chooses
    // the availability date.
    if (setAvailabilityMode && localRole === "teacher") {
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const chosen = fmtDate(d);
      setAvailabilityDate(chosen);
      setAvailabilityError(validateAvailabilityInputs({ availabilityDate: chosen }));
      setTeacherSelectedDate(chosen);
      // preload availability record and classes for the chosen date
      if (localUserId) loadTeacherAvailabilityRecordForDate(chosen, localUserId);
      loadClassesForDate(chosen);
      return;
    }

    // If user is in reschedule request mode, selecting a calendar cell chooses
    // the requested date (works for both student and teacher sides).
    if (requestMode) {
      const chosen = fmtDate(d);
      setRequestDate(chosen);
      setRequestTime("");
      setRequestError("");
      loadClassesForDate(chosen);
      // attempt to preload teacher availability for the selected class/party
      const teacherIdToLoad = selectedClass?.teacher_id || counterpartyId || assignedTeacherId || selectedClass?.teacher_id;
      if (teacherIdToLoad) loadSpecificTeacherAvailability(teacherIdToLoad);
      return;
    }

    // If student is in monthly booking mode, selecting a calendar cell chooses the
    // booking date instead of opening the regular day view.
    if (studentBookingMode) {
      // only allow selecting dates within the currently visible month
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const chosen = fmtDate(d);
      setStudentBookingDate(chosen);
      setStudentBookingTime("");
      setSelectedDate(null);
      // preload teacher classes for the chosen date if we already know the teacher
      if (assignedTeacherId) loadTeacherClassesForDate(chosen, assignedTeacherId);
      return;
    }

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
    const requestedStart = timeToMinutes(timeStr);
    const requestedEnd = requestedStart == null ? null : requestedStart + studentClassDuration;
    if (requestedStart == null || requestedEnd == null) return false;

    return classes.some(cls => {
      const range = getClassRange(cls);
      return range && rangesOverlap(requestedStart, requestedEnd, range.start, range.end);
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
    const requestedStart = timeToMinutes(timeStr);
    const requestedEnd = requestedStart == null ? null : requestedStart + selectedClassDuration;
    if (requestedStart == null || requestedEnd == null) return false;
    
    // Filter classes: 
    // - Exclude the current class being rescheduled
    // - Only include classes with the same teacher
    return classesOnDate.some(cls => {
      if (cls.id === selectedClass.id || cls.teacher_id !== selectedClass.teacher_id) return false;
      const range = getClassRange(cls);
      return range && rangesOverlap(requestedStart, requestedEnd, range.start, range.end);
    });
  };

  // Helper: Check if counterparty has this date/time booked
  const isCounterpartyDateTimeBooked = (dateStr, timeStr) => {
    const normalizedDate = normalizeDate(dateStr);
    const requestedStart = timeToMinutes(timeStr);
    const requestedEnd = requestedStart == null ? null : requestedStart + selectedClassDuration;
    if (requestedStart == null || requestedEnd == null) return false;
    return counterpartyBookedDates.some(bd => {
      if (normalizeDate(bd.scheduled_date) !== normalizedDate) return false;
      const range = getClassRange(bd);
      return range && rangesOverlap(requestedStart, requestedEnd, range.start, range.end);
    });
  };

  const getRescheduleTeacherDateTime = (dateStr, timeStr = "00:00") => {
    const teacherTimezone = selectedClass?.teacher_timezone || selectedClass?.source_timezone || DEFAULT_TIMEZONE;
    return convertDateTime(dateStr, timeStr, viewerTimezone, teacherTimezone);
  };

  const getRescheduleAvailabilityRecord = (dateStr, timeStr = "00:00") => {
    const teacherDateTime = getRescheduleTeacherDateTime(dateStr, timeStr);
    const teacherDate = normalizeDate(teacherDateTime.date || dateStr);
    return teacherAvailabilityList.find(record => normalizeDate(record.available_date) === teacherDate);
  };

  const getRescheduleAvailabilityStatus = (dateStr) => {
    const teacherDateTime = getRescheduleTeacherDateTime(dateStr, "00:00");
    const teacherDate = normalizeDate(teacherDateTime.date || dateStr);
    if (!teacherDate) return "";
    if (availability[teacherDate]) return availability[teacherDate];
    const record = teacherAvailabilityList.find(record => normalizeDate(record.available_date) === teacherDate);
    return record?.status || "";
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
    
    const teacherDateTime = getRescheduleTeacherDateTime(dateStr, timeStr);
    const teacherTime = normalizeTime(teacherDateTime.time || timeStr);
    const availabilityRecord = getRescheduleAvailabilityRecord(dateStr, timeStr);
    
    if (!availabilityRecord || !availabilityRecord.break_start || !availabilityRecord.break_end) {
      return false;
    }
    
    // Ensure break times are valid (break_start < break_end)
    const breakStart = availabilityRecord.break_start.substring(0, 5);
    const breakEnd = availabilityRecord.break_end.substring(0, 5);
    
    if (breakStart >= breakEnd) {
      return false; // Invalid break times
    }
    
    const teacherStart = timeToMinutes(teacherTime);
    const breakStartMinutes = timeToMinutes(breakStart);
    const breakEndMinutes = timeToMinutes(breakEnd);
    if (teacherStart == null || breakStartMinutes == null || breakEndMinutes == null) return false;
    return rangesOverlap(teacherStart, teacherStart + selectedClassDuration, breakStartMinutes, breakEndMinutes);
  };

  // Helper: Check if a time falls within teacher's availability window (start_time to end_time)
  // This should NOT penalize times within the break - let isTimeConflictingWithTeacherBreak handle breaks
  const isTimeOutsideTeacherAvailability = (dateStr, timeStr) => {
    if (!dateStr || !timeStr || !teacherAvailabilityList) {
      console.log(`⚠️ isTimeOutsideTeacherAvailability: Missing data - dateStr=${dateStr}, timeStr=${timeStr}, listExists=${!!teacherAvailabilityList}`);
      return false;
    }
    
    const teacherDateTime = getRescheduleTeacherDateTime(dateStr, timeStr);
    const normalizedDate = normalizeDate(teacherDateTime.date || dateStr);
    const teacherTime = normalizeTime(teacherDateTime.time || timeStr);
    console.log(`🔍 Looking for availability record for date: ${normalizedDate}`);
    console.log(`📊 Available records:`, teacherAvailabilityList.map(r => ({ date: r.available_date, status: r.status })));
    
    const availabilityRecord = getRescheduleAvailabilityRecord(dateStr, timeStr);
    
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
    const teacherStart = timeToMinutes(teacherTime);
    const availStartMinutes = timeToMinutes(availStart);
    const availEndMinutes = timeToMinutes(availEnd);
    const isWithinWindow = teacherStart != null && availStartMinutes != null && availEndMinutes != null
      && teacherStart >= availStartMinutes
      && teacherStart + selectedClassDuration <= availEndMinutes;
    console.log(`📍 Is ${timeStr} within ${availStart}-${availEnd}? ${isWithinWindow}`);
    
    // Return true if OUTSIDE the window
    return !isWithinWindow;
  };

  const isRescheduleTimeSlotBookable = (dateStr, timeStr) => {
    if (!dateStr || !timeStr || !selectedClass) return false;

    if (isRescheduleToSameDateTime(dateStr, timeStr)) return false;

    if (isTimeBookedForReschedule(dateStr, timeStr)) return false;
    if (isCounterpartyDateTimeBooked(dateStr, timeStr)) return false;

    if (isTimeConflictingWithTeacherBreak(dateStr, timeStr)) return false;
    if (isTimeOutsideTeacherAvailability(dateStr, timeStr)) return false;

    return true;
  };

  const rescheduleTimeSlots = useMemo(() => {
    if (!requestMode || !requestDate || !availableTimeSlots?.length) return [];
    return availableTimeSlots.filter((time) => isRescheduleTimeSlotBookable(requestDate, time));
  }, [requestMode, requestDate, availableTimeSlots, selectedClass, selectedClassDuration, localRole, classesCache, counterpartyBookedDates, teacherAvailabilityList, availability]);

  useEffect(() => {
    if (!requestMode || !requestTime) return;
    if (!rescheduleTimeSlots.includes(requestTime)) {
      setRequestTime("");
      setRequestError("");
    }
  }, [requestMode, requestTime, rescheduleTimeSlots]);

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
    if (isCounterpartyDateTimeBooked(requestDate, requestTime)) {
      setRequestError(getCounterpartyUnavailableMessage());
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

  if (selectedClass) {
    console.log("Selected class updated:", selectedClass);
  }
  
  const isTeacherOrAdmin = localRole === "teacher" || isAdmin;
  const isSelectedClassCompleted = selectedClass?.status === "completed";
  const isSelectedClassConfirmable = isClassJoinable(selectedClass, selectedDate);
  const isSelectedClassNoShowable = selectedClass?.status === "scheduled" && isClassPast(selectedClass, selectedDate);

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

  const handleConfirmClassDone = async () => {
    if (!selectedClass?.id || !selectedClass?.student_id) {
      notify?.("Please select a class first.", "error");
      return;
    }

    setIsMarkingClassDone(true);
    try {
      const profileResponse = await axios.get(`${API}/api/student/profile/${selectedClass.student_id}`);
      const packageInfo = profileResponse.data?.package || null;
      const isFinalClass = Number(packageInfo?.classes_left) === 1;

      if (isFinalClass) {
        setClassDoneAssessmentError("");
        setClassDoneAssessmentLevel(profileResponse.data?.profile?.proficiency_level || "novice-low");
        setClassDoneAssessmentNotes("");
        setClassDoneConfirmOpen(false);
        setClassDoneAssessmentOpen(true);
        return;
      }
    } catch (error) {
      console.warn("Could not load final-class assessment context:", error);
    } finally {
      setIsMarkingClassDone(false);
    }

    await markSelectedClassDone();
  };

  const markSelectedClassDone = async ({ proficiencyLevel = "", assessmentNotes = "" } = {}) => {
    setIsMarkingClassDone(true);
    try {
      const response = await axios.put(`${API}/api/calendar/classes/${selectedClass.id}/complete`, {
        teacher_id: localUserId,
        proficiency_level: proficiencyLevel,
        assessment_notes: assessmentNotes,
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
      setClassDoneAssessmentOpen(false);
      setClassDoneAssessmentError("");
      notify?.(
        response.data?.assessment_updated
          ? "Class marked as done. Student proficiency updated."
          : "Class marked as done. Student class count updated.",
        "success"
      );
    } catch (error) {
      const message = error.response?.data?.message || "Unable to mark class as done. Please try again.";
      notify?.(message, "error");
    } finally {
      setIsMarkingClassDone(false);
    }
  };

  const submitClassDoneAssessment = async () => {
    if (!classDoneAssessmentLevel) {
      setClassDoneAssessmentError("Please choose a proficiency level before completing the class.");
      return;
    }

    setClassDoneAssessmentError("");
    await markSelectedClassDone({
      proficiencyLevel: classDoneAssessmentLevel,
      assessmentNotes: classDoneAssessmentNotes,
    });
  };

  const markSelectedClassNoShow = async () => {
    if (!selectedClass?.id || !selectedClass?.student_id) {
      notify?.("Please select a class first.", "error");
      return;
    }

    if (!window.confirm("Mark this class as no-show and return the student's booking credit?")) {
      return;
    }

    setIsMarkingClassDone(true);
    try {
      const response = await axios.put(`${API}/api/calendar/classes/${selectedClass.id}/no-show`, {
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

      notify?.("Class marked as no-show. The booking credit was returned.", "success");
    } catch (error) {
      const message = error.response?.data?.message || "Unable to mark class as no-show. Please try again.";
      notify?.(message, "error");
    } finally {
      setIsMarkingClassDone(false);
    }
  };

  // student package based usage calculation
  const effectiveClassesUsed = (() => {
    if (studentPackage) {
      if (studentPackage.booked_classes != null) return studentPackage.booked_classes;
      if (studentPackage.classes_used != null) return studentPackage.classes_used;
      return 0;
    }
    if (classesUsed && classesUsed > 0) return classesUsed;
    return 0;
  })();
  const effectiveClassesLimit = (() => {
    if (studentPackage && studentPackage.total_classes != null) return studentPackage.total_classes;
    if (localRole === "student") return 0;
    return classesLimit;
  })();
  const effectiveClassesLeft = (() => {
    if (studentPackage) {
      if (studentPackage.classes_left != null) return studentPackage.classes_left;
      return Math.max(0, effectiveClassesLimit - effectiveClassesUsed);
    }
    if (localRole === "student") return 0;
    return Math.max(0, effectiveClassesLimit - effectiveClassesUsed);
  })();
  const effectiveBookableClasses = (() => {
    if (studentPackage) {
      if (studentPackage.bookable_classes != null) return studentPackage.bookable_classes;
      return Math.max(0, effectiveClassesLimit - effectiveClassesUsed);
    }
    if (localRole === "student") return 0;
    return Math.max(0, effectiveClassesLeft);
  })();
  const effectivePercent = effectiveClassesLimit > 0 ? Math.min(100, Math.round((effectiveClassesUsed / effectiveClassesLimit) * 100)) : 0;
  const hasNoClassesLeft = localRole === "student" && Number(effectiveBookableClasses) <= 0;

  const studentMonthMin = fmtDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const studentMonthMax = fmtDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const openMonthlyBooking = () => {
    if (hasNoClassesLeft) {
      setStudentBookingError("You have no classes left to book. Contact the admin for a new contract.");
      return;
    }

    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setStudentBookingMode(true);
    // Clear date so user selects a day from the calendar cells
    setStudentBookingDate("");
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
        class_duration: contractClassDuration,
        trial_notes: contractTrialNotes,
        ai_criteria: contractAiCriteria,
      });

      notify?.("Contract request sent to the admin.", "success");
      setContractRequestOpen(false);
      setContractClassDuration("50");
      setContractTrialNotes("");
      setContractAiCriteria({
        learningGoal: [],
        learningStyle: "",
        personality: "",
        focusArea: [],
        pace: "",
      });
      loadContractRequests();
    } catch (err) {
      setContractRequestError(err?.response?.data?.message || "Unable to send contract request.");
    } finally {
      setIsSubmittingContractRequest(false);
    }
  };

  const updateContractCourse = (courseId) => {
    const selectedCourseNames = courses
      .filter((course) => String(course.course_id) === String(courseId))
      .map((course) => course.course_name);
    const filterValues = (key, options) => {
      const selected = Array.isArray(contractAiCriteria[key]) ? contractAiCriteria[key] : [];
      return selected.filter((value) => {
        const option = options.find(([optionValue]) => optionValue === value);
        return option ? optionAppliesToCourses(option, selectedCourseNames) : false;
      });
    };

    setContractCourseId(courseId);
    setContractAiCriteria((current) => ({
      ...current,
      learningGoal: filterValues("learningGoal", AI_CRITERIA_OPTIONS.learningGoal),
      focusArea: filterValues("focusArea", AI_CRITERIA_OPTIONS.focusArea),
    }));
  };

  const updateContractAiCriterion = (key, value) => {
    setContractAiCriteria((current) => ({ ...current, [key]: value }));
  };

  const toggleContractAiCriterionValue = (key, value) => {
    setContractAiCriteria((current) => {
      const selected = Array.isArray(current[key]) ? current[key] : [];
      const exists = selected.includes(value);
      return {
        ...current,
        [key]: exists ? selected.filter((item) => item !== value) : [...selected, value],
      };
    });
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
      setStudentBookingError("You have no classes left to book. Contact the admin for a new contract.");
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

    const teacherStartMinutes = timeToMinutes(teacherBookingTime);
    const duration = studentClassDuration;
    if (teacherStartMinutes == null || duration <= 0) {
      setStudentBookingError("Invalid class time or duration.");
      return;
    }
    const endTime = minutesToTime(teacherStartMinutes + duration);

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
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <img
                            src={resolveProfileImageSrc(selectedClass.student_profile_image_url || selectedClass.studentProfileImageUrl)}
                            alt={selectedClass.studentFullName || selectedClass.studentName}
                            style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
                          />
                          <div>
                            <div><strong>Student:</strong></div>
                            <div style={{ fontSize: "0.95em", marginTop: "4px" }}>{selectedClass.studentFullName || selectedClass.studentName}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {(selectedClass.studentProficiencyLevel || selectedClass.student_proficiency_level) && (
                      <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                        <div><strong>Proficiency Level:</strong></div>
                        <div style={{ fontSize: "0.85em", marginTop: "4px" }}>
                          {formatProficiencyLevel(selectedClass.studentProficiencyLevel || selectedClass.student_proficiency_level)}
                        </div>
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
                  {isTeacherOrAdmin && (
                    <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8, color: "#111827" }}>Latest Remark</div>
                      {latestRemark ? (
                        <div
                          style={{
                            padding: 10,
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            background: "#fafafa",
                          }}
                        >
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#111827" }}>
                            {latestRemark.class_name || "Class"}
                          </div>
                                                    <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>
                            {formatRemarkDate(latestRemark.scheduled_date) || "Date unavailable"}
                            {latestRemark.start_time ? ` - ${humanTime(latestRemark.start_time)}` : ""}
                          </div>
                          <div style={{ marginTop: 6, fontSize: "0.82rem", color: "#374151", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                            {latestRemark.remarks || "No remark text"}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: 10, fontSize: "0.82rem", color: "#6b7280", background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                          No remarks yet.
                        </div>
                      )}
                    </div>
                  )}
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
                  { isTeacherOrAdmin && isSelectedClassNoShowable && !requestMode && (
                    <button
                      type="button"
                      className={`${styles.bookBtn} ${styles.doneBtn}`}
                      disabled={isMarkingClassDone}
                      onClick={markSelectedClassNoShow}
                      style={{
                        marginTop: "8px",
                        opacity: isMarkingClassDone ? 0.6 : 1,
                        cursor: isMarkingClassDone ? "not-allowed" : "pointer",
                        background: "#f59e0b",
                      }}
                      title="Mark this class as no-show and return the credit"
                    >
                      Mark No-Show
                    </button>
                  ) }
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
                        <div style={{ width: "100%", padding: "10px", fontSize: "0.95rem", border: "1px solid #d0d0d0", borderRadius: 6, background: "#fff", minHeight: "42px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ color: requestDate ? "#111" : "#666" }}>
                            {requestDate ? new Date(requestDate + "T00:00:00").toLocaleDateString() : "Select a date on the calendar"}
                          </div>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#999", marginTop: 4 }}>Click a day on the calendar</div>
                        {requestDate && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666", lineHeight: 1.4 }}>
                            {getRescheduleAvailabilityStatus(requestDate) === "unavailable" ? (
                              <p style={{ margin: 0, color: "#f44336" }}>{localRole === "student" ? "Teacher" : "You are"} unavailable on this date</p>
                            ) : getRescheduleAvailabilityStatus(requestDate) === "available" ? (
                              <p style={{ margin: 0, color: "#4caf50" }}>Available on this date</p>
                            ) : (
                              <p style={{ margin: 0, color: "#999" }}>Availability not set</p>
                            )}
                            {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).length > 0 && (
                              <p style={{ margin: "4px 0 0 0", color: "#ff9800" }}>
                                {localRole === "student" ? "Teacher" : "Student"} booked: {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).map(bd => humanTime(bd.start_time)).join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Time *</label>
                        {requestDate && getRescheduleAvailabilityStatus(requestDate) === "unavailable" ? (
                          <div style={{ padding: 12, background: "#fff3e0", borderRadius: 8, color: "#b65f00" }}>
                            You are unavailable on this date.
                          </div>
                        ) : rescheduleTimeSlots.length > 0 ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                            {rescheduleTimeSlots.map(time => {
                              const isSelected = requestTime === time;
                              return (
                                <button
                                  key={time}
                                  type="button"
                                  onClick={() => {
                                    setRequestTime(time);
                                    setRequestError("");
                                    if (requestDate && isRescheduleToSameDateTime(requestDate, time)) {
                                      setRequestError("Cannot reschedule to the same date and time. Please choose a different time.");
                                    } else if (requestDate && isTimeBookedForReschedule(requestDate, time)) {
                                      setRequestError(getBookedSlotErrorMessage());
                                    } else if (requestDate && isTimeConflictingWithTeacherBreak(requestDate, time)) {
                                      setRequestError("This time conflicts with your break. Please choose another time.");
                                    } else if (requestDate && isTimeOutsideTeacherAvailability(requestDate, time)) {
                                      setRequestError("This time is outside your availability window. Please choose another time.");
                                    }
                                  }}
                                  style={{ padding: "12px 14px", border: isSelected ? "2px solid #4CAF50" : "1px solid #d0d0d0", borderRadius: "8px", background: isSelected ? "#e8f5e9" : "#fff", color: "#111", cursor: "pointer", textAlign: "center" }}
                                >
                                  {humanTime(time)}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ padding: 12, background: "#f4f6f8", borderRadius: 8, color: "#555" }}>
                            No available slots found for this date. Choose another day.
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
                        <textarea rows={3} placeholder="Please explain why you need to reschedule (minimum 5 characters)" value={requestReason} onChange={e => { setRequestReason(e.target.value); setRequestError(""); }} style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => { setRequestMode(false); setRequestError(""); }} disabled={isSubmittingRequest} style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, cursor: isSubmittingRequest ? "not-allowed" : "pointer", opacity: isSubmittingRequest ? 0.6 : 1 }}>
                          Cancel
                        </button>
                        <button type="button" onClick={submitRequest} disabled={isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError} style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "not-allowed" : "pointer" }}>
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
<div style={{ width: "100%", padding: "10px", fontSize: "0.95rem", border: "1px solid #d0d0d0", borderRadius: 6, background: "#fff", minHeight: "42px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                             <div style={{ color: availabilityDate ? "#111" : "#666" }}>
                               {availabilityDate ? new Date(availabilityDate + "T00:00:00").toLocaleDateString() : "Select a date on the calendar"}
                             </div>
                           </div>
                           <div style={{ fontSize: "0.7rem", color: "#999", marginTop: 4 }}>Click a day on the calendar</div>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <img
                              src={resolveProfileImageSrc(selectedClass.teacherProfileImageUrl)}
                              alt={selectedTeacherFullName || selectedClass.teacherFullName || selectedClass.teacherName}
                              style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
                            />
                            <div>
                              <div><strong>Teacher:</strong></div>
                              <div style={{ fontSize: "0.85em", marginTop: "4px" }}>{selectedTeacherFullName || selectedClass.teacherFullName || selectedClass.teacherName}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedClass.teacherEmail && (
                        <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                          <div><strong>Email:</strong></div>
                          <div style={{ fontSize: "0.75em", marginTop: "4px", wordBreak: "break-all" }}>{selectedClass.teacherEmail}</div>
                        </div>
                      )}
                      {latestRemark && (
                        <div className={styles.slotBtn} style={{ cursor: "default", pointerEvents: "none", background: "#f5f5f5" }}>
                          <div><strong>Latest Remark:</strong></div>
                          <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>
                            {latestRemark.class_name || "Class"}
                            {formatRemarkDate(latestRemark.scheduled_date) || "Date unavailable"}
                            {latestRemark.start_time ? ` - ${humanTime(latestRemark.start_time)}` : ""}
                          </div>
                          <div style={{ marginTop: 6, fontSize: "0.82rem", color: "#374151", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                            {latestRemark.remarks || "No remark text"}
                          </div>
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
                    {isTeacherOrAdmin && isSelectedClassNoShowable && !requestMode && (
                      <button
                        type="button"
                        className={`${styles.bookBtn} ${styles.doneBtn}`}
                        disabled={isMarkingClassDone}
                        onClick={markSelectedClassNoShow}
                        style={{
                          marginTop: "8px",
                          opacity: isMarkingClassDone ? 0.6 : 1,
                          cursor: isMarkingClassDone ? "not-allowed" : "pointer",
                          background: "#f59e0b",
                        }}
                        title="Mark this class as no-show and return the credit"
                      >
                        Mark No-Show
                      </button>
                    )}
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
                        <div style={{ width: "100%", padding: "10px", fontSize: "0.95rem", border: "1px solid #d0d0d0", borderRadius: 6, background: "#fff", minHeight: "42px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ color: requestDate ? "#111" : "#666" }}>
                            {requestDate ? new Date(requestDate + "T00:00:00").toLocaleDateString() : "Select a date on the calendar"}
                          </div>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#999", marginTop: 4 }}>Click a day on the calendar</div>
                        {requestDate && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666", lineHeight: 1.4 }}>
                            {getRescheduleAvailabilityStatus(requestDate) === "unavailable" ? (
                              <p style={{ margin: 0, color: "#f44336" }}>Teacher is unavailable on this date</p>
                            ) : getRescheduleAvailabilityStatus(requestDate) === "available" ? (
                              <p style={{ margin: 0, color: "#4caf50" }}>Available on this date</p>
                            ) : (
                              <p style={{ margin: 0, color: "#999" }}>Availability not set</p>
                            )}
                            {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).length > 0 && (
                              <p style={{ margin: "4px 0 0 0", color: "#ff9800" }}>
                                Student booked: {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).map(bd => humanTime(bd.start_time)).join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>New Time *</label>
                        {requestDate && getRescheduleAvailabilityStatus(requestDate) === "unavailable" ? (
                          <div style={{ padding: 12, background: "#fff3e0", borderRadius: 8, color: "#b65f00" }}>
                            Teacher is unavailable on this date.
                          </div>
                        ) : rescheduleTimeSlots.length > 0 ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                            {rescheduleTimeSlots.map(time => {
                              const isSelected = requestTime === time;
                              return (
                                <button
                                  key={time}
                                  type="button"
                                  onClick={() => {
                                    setRequestTime(time);
                                    setRequestError("");
                                    if (requestDate && isRescheduleToSameDateTime(requestDate, time)) {
                                      setRequestError("Cannot reschedule to the same date and time. Please choose a different time.");
                                    } else if (requestDate && isCounterpartyDateTimeBooked(requestDate, time)) {
                                      setRequestError(getCounterpartyUnavailableMessage());
                                    } else if (requestDate && isTimeConflictingWithTeacherBreak(requestDate, time)) {
                                      setRequestError("This time conflicts with teacher's break. Please choose another time.");
                                    } else if (requestDate && isTimeOutsideTeacherAvailability(requestDate, time)) {
                                      setRequestError("This time is outside the teacher's availability window. Please choose another time.");
                                    }
                                  }}
                                  style={{ padding: "12px 14px", border: isSelected ? "2px solid #4CAF50" : "1px solid #d0d0d0", borderRadius: "8px", background: isSelected ? "#e8f5e9" : "#fff", color: "#111", cursor: "pointer", textAlign: "center" }}
                                >
                                  {humanTime(time)}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ padding: 12, background: "#f4f6f8", borderRadius: 8, color: "#555" }}>
                            No available slots found for this date. Choose another day.
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
                        <textarea rows={3} placeholder="Please explain why you need to reschedule (minimum 5 characters)" value={requestReason} onChange={e => { setRequestReason(e.target.value); setRequestError(""); }} style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => { setRequestMode(false); setRequestError(""); }} disabled={isSubmittingRequest} style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, cursor: isSubmittingRequest ? "not-allowed" : "pointer", opacity: isSubmittingRequest ? 0.6 : 1 }}>
                          Cancel
                        </button>
                        <button type="button" onClick={submitRequest} disabled={isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError} style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "not-allowed" : "pointer" }}>
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
<div style={{ width: "100%", padding: "10px", fontSize: "0.95rem", border: "1px solid #d0d0d0", borderRadius: 6, background: "#fff", minHeight: "42px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                             <div style={{ color: studentBookingDate ? "#111" : "#666" }}>
                               {studentBookingDate ? new Date(studentBookingDate + "T00:00:00").toLocaleDateString() : "Select a date on the calendar"}
                             </div>
                           </div>
                           <div style={{ fontSize: "0.7rem", color: "#999", marginTop: 4 }}>Click a day on the calendar</div>
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
                                {studentClassDuration} minutes ({humanTime(studentBookingTime)} - {humanTime(minutesToTime(timeToMinutes(studentBookingTime) + studentClassDuration))})
                              </span>
                            ) : studentBookingTime ? (
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
                            disabled={isSubmittingStudentBooking || !studentBookingTime || assignedTeacherId == null || hasNoClassesLeft}
                            style={{ padding: "10px 16px", fontSize: "0.9em", border: "none", background: "#4CAF50", color: "#fff", borderRadius: 6, cursor: (isSubmittingStudentBooking || !studentBookingTime || assignedTeacherId == null || hasNoClassesLeft) ? "not-allowed" : "pointer" }}
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
                        <div style={{ fontSize: 14, color: "#666" }}>Booked</div>
                        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{effectiveClassesUsed} / {effectiveClassesLimit}</div>
                        <div style={{ marginTop: 6, color: "#374151", fontSize: 14 }}>Classes left: {effectiveClassesLeft}</div>
                        <div style={{ marginTop: 4, color: "#2563eb", fontSize: 14, fontWeight: 600 }}>Available to book: {effectiveBookableClasses}</div>
                        <div style={{ marginTop: 8 }}>
                          <div style={{ height: 8, background: "#eef2ff", borderRadius: 8, overflow: "hidden" }}>
                            <div style={{ width: `${effectivePercent}%`, height: "100%", background: "#6366f1" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
                      {hasNoClassesLeft ? "No active contract or bookable classes remain." : "Tip: Contact your teacher to add or reschedule classes."}
                    </div>
                    {hasNoClassesLeft && (
                      <div style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
                        {contractRequests[0] && (
                          <div style={{ marginBottom: 10, fontSize: 12, color: "#4b5563" }}>
                            Latest request: <strong style={{ textTransform: "capitalize" }}>{contractRequests[0].status}</strong>
                            {contractRequests[0].course_name ? ` - ${contractRequests[0].course_name}` : ""}
                            {contractRequests[0].requested_classes ? ` (${contractRequests[0].requested_classes} classes)` : ""}
                            {contractRequests[0].class_duration ? ` - ${contractRequests[0].class_duration} min` : ""}
                          </div>
                        )}
                        {!contractRequestOpen ? (
                          <button
                            type="button"
                            className={styles.slotBtn}
                            onClick={() => {
                              setContractRequestOpen(true);
                              setContractRequestError("");
                              updateContractCourse(studentProfile?.course_id || "");
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
                                onChange={(e) => updateContractCourse(e.target.value)}
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
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Learning Goal</label>
                              <div style={{ display: "grid", gap: 6 }}>
                                {contractLearningGoalOptions.length ? contractLearningGoalOptions.map(([value, label]) => (
                                  <label key={value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 8, background: contractAiCriteria.learningGoal.includes(value) ? "#f0fdf4" : "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                    <input
                                      type="checkbox"
                                      checked={contractAiCriteria.learningGoal.includes(value)}
                                      onChange={() => toggleContractAiCriterionValue("learningGoal", value)}
                                      style={{ width: "auto" }}
                                    />
                                    <span>{label}</span>
                                  </label>
                                )) : (
                                  <div style={{ color: "#6b7280", fontSize: 12 }}>Select a course to show matching goals.</div>
                                )}
                              </div>
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Learning Style</label>
                              <select
                                value={contractAiCriteria.learningStyle}
                                onChange={(e) => updateContractAiCriterion("learningStyle", e.target.value)}
                                style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontFamily: "inherit" }}
                              >
                                {AI_CRITERIA_OPTIONS.learningStyle.map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Student Personality</label>
                              <select
                                value={contractAiCriteria.personality}
                                onChange={(e) => updateContractAiCriterion("personality", e.target.value)}
                                style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontFamily: "inherit" }}
                              >
                                {AI_CRITERIA_OPTIONS.personality.map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Focus Area</label>
                              <div style={{ display: "grid", gap: 6 }}>
                                {contractFocusAreaOptions.length ? contractFocusAreaOptions.map(([value, label]) => (
                                  <label key={value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 8, background: contractAiCriteria.focusArea.includes(value) ? "#f0fdf4" : "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                    <input
                                      type="checkbox"
                                      checked={contractAiCriteria.focusArea.includes(value)}
                                      onChange={() => toggleContractAiCriterionValue("focusArea", value)}
                                      style={{ width: "auto" }}
                                    />
                                    <span>{label}</span>
                                  </label>
                                )) : (
                                  <div style={{ color: "#6b7280", fontSize: 12 }}>Select a course to show matching focus areas.</div>
                                )}
                              </div>
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Learning Pace</label>
                              <select
                                value={contractAiCriteria.pace}
                                onChange={(e) => updateContractAiCriterion("pace", e.target.value)}
                                style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontFamily: "inherit" }}
                              >
                                {AI_CRITERIA_OPTIONS.pace.map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Request Notes</label>
                              <textarea
                                value={contractTrialNotes}
                                onChange={(e) => setContractTrialNotes(e.target.value)}
                                rows={3}
                                placeholder="Add updated goals, focus areas, or notes for teacher matching..."
                                style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Class Duration</label>
                              <select
                                value={contractClassDuration}
                                onChange={(e) => setContractClassDuration(e.target.value)}
                                style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontFamily: "inherit" }}
                              >
                                <option value="25">25 minutes</option>
                                <option value="50">50 minutes</option>
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
              onClick={handleConfirmClassDone}
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
    {classDoneAssessmentOpen && selectedClass && (
      <div
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          zIndex: 2100,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="assessment-title"
          style={{
            width: "min(520px, 100%)",
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
            padding: 24,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "#eef2ff",
              color: "#4338ca",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              marginBottom: 14,
            }}
          >
            QA
          </div>
          <h3 id="assessment-title" style={{ margin: "0 0 8px", fontSize: "1.15rem", color: "#111827" }}>
            Final class assessment
          </h3>
          <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.5, fontSize: "0.92rem" }}>
            This is the student's last class in the current contract. Please choose the updated proficiency level before finishing.
          </p>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb", padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>
              {selectedClass.studentName || "Selected student"}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#4b5563" }}>
              {selectedClass.className || "Class"} - {selectedClass.time} - {getEndTime(selectedClass.time, selectedClass.duration)}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6, color: "#374151" }}>
              Proficiency level
            </label>
            <select
              value={classDoneAssessmentLevel}
              onChange={(e) => setClassDoneAssessmentLevel(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontFamily: "inherit",
                background: "#fff",
              }}
            >
              <option value="">Select level</option>
              {PROFICIENCY_LEVEL_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6, color: "#374151" }}>
              Notes
            </label>
            <textarea
              value={classDoneAssessmentNotes}
              onChange={(e) => setClassDoneAssessmentNotes(e.target.value)}
              rows={4}
              placeholder="Optional quick notes about the student's performance..."
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>
          {classDoneAssessmentError && (
            <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 12 }}>
              {classDoneAssessmentError}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                setClassDoneAssessmentOpen(false);
                setClassDoneConfirmOpen(true);
                setClassDoneAssessmentError("");
              }}
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
              Back
            </button>
            <button
              type="button"
              onClick={submitClassDoneAssessment}
              disabled={isMarkingClassDone}
              style={{
                border: "none",
                background: "#4338ca",
                color: "#fff",
                borderRadius: 8,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: isMarkingClassDone ? "not-allowed" : "pointer",
                boxShadow: "0 8px 18px rgba(67, 56, 202, 0.22)",
              }}
            >
              {isMarkingClassDone ? "Saving..." : "Save Assessment & Complete"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}




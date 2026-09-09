import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser, writeStoredUser } from "../utils/sessionUser.js";
import { PROFICIENCY_LEVEL_OPTIONS, formatProficiencyLevel } from "../utils/proficiencyLevels.js";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/studentSchedule.module.css";
import { API_BASE_URL } from "../utils/api.js";
import { compressImageFile } from "../utils/imageCompression.js";
import useClassRecording from "../components/useClassRecording.js";
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
const API = API_BASE_URL;

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
const CLASS_BREAK_BUFFER_MINUTES = 10;
const SCHEDULE_WINDOW_MONTHS = 3;
const WEEKDAY_OPTIONS = [
  [0, "Sun"],
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
];

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

const describeTimeDistance = (requestedTime, suggestedTime) => {
  const requestedMinutes = timeToMinutes(requestedTime);
  const suggestedMinutes = timeToMinutes(suggestedTime);
  if (requestedMinutes == null || suggestedMinutes == null) return "";
  const diff = suggestedMinutes - requestedMinutes;
  if (diff === 0) return "Exact match";
  const absDiff = Math.abs(diff);
  return `${absDiff} min ${diff > 0 ? "later" : "earlier"}`;
};

const formatLongDate = (dateKey) => {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "long",
  });
};

const formatScheduleDate = (dateKey) => {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatRecordingDuration = (secondsValue) => {
  const seconds = Math.max(0, Math.round(Number(secondsValue || 0)));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return `${remainingSeconds} sec`;
  return `${minutes} min ${String(remainingSeconds).padStart(2, "0")} sec`;
};

const rangesOverlap = (startA, endA, startB, endB) => startA < endB && endA > startB;
const rangesOverlapWithClassBuffer = (startA, endA, startB, endB) =>
  rangesOverlap(startA, endA, startB - CLASS_BREAK_BUFFER_MINUTES, endB + CLASS_BREAK_BUFFER_MINUTES);
const getCandidateSlotMinutes = (start, end, duration, occupiedRanges = []) => {
  const candidates = new Set();
  for (let minute = start; minute + duration <= end; minute += SLOT_STEP_MINUTES) {
    candidates.add(minute);
  }
  occupiedRanges.forEach((range) => {
    const afterClass = range.end + CLASS_BREAK_BUFFER_MINUTES;
    const beforeClass = range.start - CLASS_BREAK_BUFFER_MINUTES - duration;
    if (afterClass + duration <= end) candidates.add(afterClass);
    if (beforeClass >= start) candidates.add(beforeClass);
  });
  return Array.from(candidates)
    .filter((minute) => minute >= start && minute + duration <= end)
    .sort((a, b) => a - b);
};

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

const formatVerificationTimestamp = (value, includeDate = false) => {
  if (!value) return "";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  if (includeDate) {
    return parsed.toLocaleString([], {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
  }
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const hasCompleteSentence = (value) => {
  const text = String(value || "").trim();
  const words = text.match(/[A-Za-z0-9]+/g) || [];
  return words.length >= 4 && /[.!?]$/.test(text);
};

const remarkSectionStyle = {
  marginTop: 12,
  borderTop: "1px solid #d7e5d9",
  paddingTop: 12,
};

const remarkHeadingStyle = {
  fontSize: "0.9rem",
  fontWeight: 700,
  marginBottom: 8,
  color: "#23443a",
};

const remarkCardStyle = {
  padding: 12,
  border: "1px solid #d7e5d9",
  borderRadius: 18,
  background: "#f6fbf8",
  boxShadow: "0 1px 0 rgba(35, 68, 58, 0.04)",
};

const remarkTitleStyle = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: "#23443a",
};

const remarkMetaStyle = {
  fontSize: "0.72rem",
  color: "#587068",
  marginTop: 2,
};

const remarkBodyStyle = {
  marginTop: 6,
  fontSize: "0.82rem",
  color: "#294238",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const verificationStatusLabels = {
  pending: "Pending",
  in_progress: "In Progress",
  student_confirmed: "Student Confirmed",
  verified: "Verified",
  needs_review: "Needs Review",
  incomplete: "Incomplete",
};

const verificationPanelStyle = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #dbe4ea",
  borderRadius: 10,
  background: "#f8fbfd",
};

// Helper: check if a class is joinable (30 mins before start until class end)
const isClassJoinable = (classObj, selectedDate, nowValue = Date.now()) => {
  if (!classObj || !selectedDate) return false;

  try {
    const now = new Date(nowValue);

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

const isClassPast = (classObj, selectedDate, nowValue = Date.now()) => {
  if (!classObj || !selectedDate) return false;

  try {
    const now = new Date(nowValue);
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

const addDaysToDateKey = (dateKey, days) => {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return fmtDate(date);
};

const nearbyDateKeys = (dateKey) => {
  const normalized = String(dateKey || "").slice(0, 10);
  return [addDaysToDateKey(normalized, -1), normalized, addDaysToDateKey(normalized, 1)].filter(Boolean);
};

const dateKeyToLocalDate = (dateKey) => {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const addMonthsClamped = (date, months) => {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const targetMonth = base.getMonth() + months;
  const lastDay = new Date(base.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(base.getFullYear(), targetMonth, Math.min(base.getDate(), lastDay));
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
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0);
  const [isUserReady, setIsUserReady] = useState(false);
  const [isInitialCalendarLoading, setIsInitialCalendarLoading] = useState(true);

  const location = useLocation();
  const navigate = useNavigate();
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
  const [requestConfirmOpen, setRequestConfirmOpen] = useState(false);
  const [isMarkingClassDone, setIsMarkingClassDone] = useState(false);
  const [classEntryConfirmOpen, setClassEntryConfirmOpen] = useState(false);
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
  const [studentBookingSelections, setStudentBookingSelections] = useState([]);
  const [studentBookingSuggestions, setStudentBookingSuggestions] = useState([]);
  const [studentBookingApplyMode, setStudentBookingApplyMode] = useState("manual");
  const [studentBookingWeeklyWeekdays, setStudentBookingWeeklyWeekdays] = useState([1, 3, 5]);
  const [studentBookingWeeklyTime, setStudentBookingWeeklyTime] = useState("");
  const [studentBookingSubject, setStudentBookingSubject] = useState("");
  const [studentBookingError, setStudentBookingError] = useState("");
  const [isSubmittingStudentBooking, setIsSubmittingStudentBooking] = useState(false);
  const [studentBookingConfirmOpen, setStudentBookingConfirmOpen] = useState(false);
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
  const [currentTimeTick, setCurrentTimeTick] = useState(() => Date.now());
  const isAdmin = localRole === "admin"; // helper for rendering
  const viewerTimezone = useMemo(() => getUserTimezone(me), [me]);
  const viewerTodayKey = useMemo(() => formatDateInTimezone(new Date(currentTimeTick), viewerTimezone), [viewerTimezone, currentTimeTick]);
  const viewerToday = useMemo(() => dateKeyToLocalDate(viewerTodayKey) || new Date(), [viewerTodayKey]);
  const scheduleWindowEndKey = useMemo(() => fmtDate(addMonthsClamped(viewerToday, SCHEDULE_WINDOW_MONTHS)), [viewerToday]);
  const initialBrowserToday = useRef(today);
  const initialBrowserTodayKey = useRef(fmtDate(today));

  useEffect(() => {
    const refreshCurrentTime = () => setCurrentTimeTick(Date.now());
    const intervalId = window.setInterval(refreshCurrentTime, 30 * 1000);
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshCurrentTime();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
  // Keep reserved classes in the cache for overlap checks, but hide incomplete
  // sessions from the active class list.
  const selectedClasses = selectedDate
    ? (classesCache[selectedDate] || []).filter(cls => cls.verification_status !== "incomplete")
    : [];
  const selectedClass = selectedClassId
    ? selectedClasses.find(cls => cls.id === selectedClassId)
    : null;
  const [classVerification, setClassVerification] = useState(null);
  const [evidenceChoice, setEvidenceChoice] = useState("screenshots");
  const [isUploadingStartProof, setIsUploadingStartProof] = useState(false);
  const evidenceReminders = useRef(new Set());
  const [classVerificationRefreshToken, setClassVerificationRefreshToken] = useState(0);
  const [isUpdatingVerification, setIsUpdatingVerification] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [verificationProofUrl, setVerificationProofUrl] = useState("");
  const [verificationProofFile, setVerificationProofFile] = useState(null);
  const [verificationProofPreview, setVerificationProofPreview] = useState("");
  const verificationProofFileRef = useRef(null);
  const verificationProofPreviewRef = useRef("");
  const [verificationRecordingUrl, setVerificationRecordingUrl] = useState("");
  const [verificationRecordingExpiresAt, setVerificationRecordingExpiresAt] = useState("");
  const selectedClassDuration = Number(selectedClass?.duration) > 0
    ? Number(selectedClass.duration)
    : studentClassDuration;
  const selectedClassVerification = classVerification || (
    selectedClass?.verification_status
      ? {
          teacher_started_at: selectedClass.teacher_started_at,
          student_joined_at: selectedClass.student_joined_at,
          teacher_ended_at: selectedClass.teacher_ended_at,
          duration_minutes: selectedClass.verified_duration_minutes,
          proof_url: selectedClass.class_proof_url,
          recording_url: selectedClass.class_recording_url,
          recording_uploaded_at: selectedClass.class_recording_uploaded_at,
          recording_expires_at: selectedClass.class_recording_expires_at,
          summary: selectedClass.class_summary,
          verification_status: selectedClass.verification_status,
        }
      : null
  );
  const selectedVerificationStatus = selectedClassVerification?.verification_status || "pending";
  const selectedClassStarted = Boolean(selectedClassVerification?.teacher_started_at);
  const selectedClassStudentConfirmed = Boolean(selectedClassVerification?.student_joined_at);
  const selectedClassEnded = Boolean(selectedClassVerification?.teacher_ended_at);
  const selectedClassVerified = selectedVerificationStatus === "verified";
  const canShowClassEntryAction = !selectedClassEnded;
  const canShowRescheduleAction = !selectedClassEnded && !isAdmin && !requestMode;
  const shouldRemindStartScreenshot =
    localRole === "teacher" &&
    !isAdmin &&
    selectedClassStarted &&
    selectedClassStudentConfirmed &&
    !selectedClassEnded &&
    selectedClassVerification?.evidence_mode === "screenshots" &&
    !selectedClassVerification?.start_proof_url;
  const shouldRemindEndScreenshot =
    localRole === "teacher" &&
    !isAdmin &&
    selectedClassStarted &&
    selectedClassStudentConfirmed &&
    !selectedClassEnded &&
    selectedClassVerification?.evidence_mode === "screenshots" &&
    Boolean(selectedClassVerification?.start_proof_url) &&
    !verificationProofFile &&
    !verificationProofUrl;

  useEffect(() => {
    if (localRole !== "teacher" || isAdmin || !selectedClass?.id) return;
    if (selectedClassVerification?.evidence_mode !== "screenshots" || selectedClassEnded) return;

    const classId = selectedClass.id;
    const remind = () => {
      if (shouldRemindStartScreenshot && !evidenceReminders.current.has(`${classId}-start`)) {
        evidenceReminders.current.add(`${classId}-start`);
        notify?.(
          "The student has joined. Capture and upload your start screenshot now, showing participants and system time.",
          "warning",
          8000
        );
      }

      if (!shouldRemindEndScreenshot || evidenceReminders.current.has(`${classId}-end`)) return;

      const dateKey = String(selectedClass.scheduled_date || selectedDate || "").slice(0, 10);
      const endTime = selectedClass.end_time || (
        timeToMinutes(selectedClass.start_time || selectedClass.time) != null
          ? minutesToTime(timeToMinutes(selectedClass.start_time || selectedClass.time) + selectedClassDuration)
          : ""
      );
      const normalizedEndTime = normalizeTime(endTime);
      if (!dateKey || !normalizedEndTime) return;

      const classEndAt = new Date(`${dateKey}T${normalizedEndTime}:00`).getTime();
      if (!Number.isFinite(classEndAt)) return;

      const remainingMs = classEndAt - Date.now();
      if (remainingMs <= 5 * 60_000) {
        evidenceReminders.current.add(`${classId}-end`);
        notify?.(
          "Before leaving the meeting, capture your end screenshot with participants and system time.",
          "warning",
          8000
        );
      }
    };

    remind();
    const timer = window.setInterval(remind, 30_000);
    return () => window.clearInterval(timer);
  }, [
    isAdmin,
    localRole,
    notify,
    selectedClass?.id,
    selectedClass?.scheduled_date,
    selectedClass?.start_time,
    selectedClass?.time,
    selectedClass?.end_time,
    selectedClassDuration,
    selectedClassEnded,
    selectedClassVerification?.evidence_mode,
    selectedDate,
    shouldRemindEndScreenshot,
    shouldRemindStartScreenshot,
  ]);

  const latestRemark = selectedClass?.id
    ? (studentRemarks.find((remark) => String(remark.class_id) === String(selectedClass.id)) || studentRemarks[0] || null)
    : (studentRemarks[0] || null);
  const selectedTeacherFullName = selectedClass
    ? selectedClass.teacherFullName || selectedClass.teacherName || [selectedClass.teacher_first_name, selectedClass.teacher_last_name]
        .filter(Boolean)
        .join(" ")
        .trim()
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
  const [availabilityConfirmOpen, setAvailabilityConfirmOpen] = useState(false);
  const [availabilityApplyMode, setAvailabilityApplyMode] = useState("single");
  const [bulkAvailabilityWeekdays, setBulkAvailabilityWeekdays] = useState([1, 2, 3, 4, 5]);
  const [teacherSelectedDate, setTeacherSelectedDate] = useState(null);
  const [teacherAvailabilityList, setTeacherAvailabilityList] = useState([]); // list of availability records for the visible month
  const [teacherAvailabilityRecordForDate, setTeacherAvailabilityRecordForDate] = useState(null); // individual selected date record
  const triggerCalendarRefresh = useCallback(() => {
    setClassesCache({});
    setTeacherClassesCache({});
    setTeacherAvailabilityRecordForDate(null);
    setCalendarRefreshToken(token => token + 1);
  }, []);

  const applyVerificationToSelectedClass = useCallback((verification) => {
    if (!selectedClass?.id || !selectedDate || !verification) return;
    const applyToList = (list = []) => list.map((cls) => {
      const classId = cls.id || cls.class_id;
      if (String(classId) !== String(selectedClass.id)) return cls;
      return {
        ...cls,
        teacher_started_at: verification.teacher_started_at,
        student_joined_at: verification.student_joined_at,
        teacher_ended_at: verification.teacher_ended_at,
        verified_duration_minutes: verification.duration_minutes,
        class_proof_url: verification.proof_url,
        class_recording_url: verification.recording_url,
        class_recording_uploaded_at: verification.recording_uploaded_at,
        class_recording_expires_at: verification.recording_expires_at,
        class_summary: verification.summary,
        verification_status: verification.verification_status,
      };
    });

    setClassesCache((prev) => ({
      ...prev,
      [selectedDate]: applyToList(prev[selectedDate]),
    }));
    setTeacherClassesCache((prev) => ({
      ...prev,
      [selectedDate]: applyToList(prev[selectedDate]),
    }));
  }, [selectedClass?.id, selectedDate]);

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
    } finally {
      setIsUserReady(true);
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

  useEffect(() => {
    if (!localUserId || localRole === "admin") return;

    const stream = new EventSource(`${API}/api/calendar/stream/${localUserId}`);
    const handleCalendarChange = () => {
      triggerCalendarRefresh();
    };
    const handleClassVerificationChange = () => {
      setClassVerificationRefreshToken(token => token + 1);
      triggerCalendarRefresh();
    };

    ["class-booked", "class-rescheduled", "availability-changed", "class-completed", "class-no-show"].forEach(eventName => {
      stream.addEventListener(eventName, handleCalendarChange);
    });
    stream.addEventListener("class-verification-changed", handleClassVerificationChange);

    stream.onerror = () => {};

    return () => {
      ["class-booked", "class-rescheduled", "availability-changed", "class-completed", "class-no-show"].forEach(eventName => {
        stream.removeEventListener(eventName, handleCalendarChange);
      });
      stream.removeEventListener("class-verification-changed", handleClassVerificationChange);
      stream.close();
    };
  }, [localUserId, localRole, triggerCalendarRefresh]);

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
  }, [localUserId, localRole, viewerTimezone, calendarRefreshToken]);

  useEffect(() => {
    if (!me || viewerTodayKey === initialBrowserTodayKey.current) return;

    setYear((currentYear) => (
      currentYear === initialBrowserToday.current.getFullYear() ? viewerToday.getFullYear() : currentYear
    ));
    setMonth((currentMonth) => (
      currentMonth === initialBrowserToday.current.getMonth() ? viewerToday.getMonth() : currentMonth
    ));
    setStudentBookingDate((currentDate) => (
      currentDate === initialBrowserTodayKey.current ? viewerTodayKey : currentDate
    ));
    setAvailabilityDate((currentDate) => (
      currentDate === initialBrowserTodayKey.current ? viewerTodayKey : currentDate
    ));
  }, [me, viewerToday, viewerTodayKey]);

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

  const formatAvailabilityRecordForViewer = (record) => {
    const sourceDate = normalizeDate(record?.source_available_date || record?.available_date);
    const sourceTimezone = record?.teacher_timezone || record?.source_timezone || DEFAULT_TIMEZONE;
    const start = convertDateTime(sourceDate, record?.start_time || "00:00", sourceTimezone, viewerTimezone);
    const end = record?.end_time
      ? convertDateTime(sourceDate, record.end_time, sourceTimezone, viewerTimezone)
      : null;

    return {
      ...record,
      source_available_date: sourceDate,
      source_start_time: record?.start_time || null,
      source_end_time: record?.end_time || null,
      source_break_start: record?.break_start || null,
      source_break_end: record?.break_end || null,
      available_date: start.date || sourceDate,
      start_time: start.time ? addSeconds(start.time) : record?.start_time,
      end_time: end?.time ? addSeconds(end.time) : record?.end_time,
      source_timezone: sourceTimezone,
    };
  };

  const buildAvailabilityMapForViewer = (records = []) => (
    records.map(formatAvailabilityRecordForViewer).reduce((acc, record) => {
      const dateKey = normalizeDate(record.available_date);
      if (dateKey) acc[dateKey] = record.status;
      return acc;
    }, {})
  );

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
      .get(`${API}/api/calendar/teacher-availability-records`, {
        params: { teacher_id: targetTeacherId, year: y, month: m }
      })
      .then(r => {
        console.log("✅ Availability data received:", r.data);
        if (r.data?.records) {
          setAvailability(buildAvailabilityMapForViewer(r.data.records));
        } else {
          setAvailability({});
        }
      })
      .catch((err) => {
        console.error("❌ Error fetching availability:", err);
      });
  }, [year, month, localRole, localUserId, teacherId, assignedTeacherId, calendarRefreshToken]);

  // fetch student package when we know student id
  useEffect(() => {
    if (localRole === "student" && localUserId) {
      axios
        .get(`${API}/api/calendar/student-package/${localUserId}`)
        .then(r => setStudentPackage(r.data.package))
        .catch(() => setStudentPackage(null));
    }
  }, [localRole, localUserId, calendarRefreshToken]);

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
    if (!selectedClass?.id) {
      setClassVerification(null);
      setVerificationSummary("");
      setReviewReason("");
      setVerificationProofUrl("");
      setVerificationProofFile(null);
      setVerificationProofPreview("");
      setVerificationRecordingUrl("");
      setVerificationRecordingExpiresAt("");
      return;
    }

    let active = true;
    axios
      .get(`${API}/api/calendar/classes/${selectedClass.id}/verification`)
      .then((response) => {
        if (!active) return;
        const verification = response.data?.verification || null;
        setClassVerification(verification);
        setVerificationSummary(verification?.summary || "");
        setReviewReason("");
        setVerificationProofUrl(currentUrl => {
          if (verification?.proof_url) return verification.proof_url;
          return verificationProofFileRef.current || verificationProofPreviewRef.current ? currentUrl : "";
        });
        setVerificationRecordingUrl(verification?.recording_url || "");
        setVerificationRecordingExpiresAt(verification?.recording_expires_at || "");
        if (verification?.proof_url) {
          setVerificationProofFile(null);
          setVerificationProofPreview("");
        }
        if (verification) applyVerificationToSelectedClass(verification);
      })
      .catch(() => {
        if (active) setClassVerification(null);
      });

    return () => {
      active = false;
    };
  }, [selectedClass?.id, classVerificationRefreshToken, applyVerificationToSelectedClass]);

  useEffect(() => {
    return () => {
      if (verificationProofPreview) {
        URL.revokeObjectURL(verificationProofPreview);
      }
    };
  }, [verificationProofPreview]);

  useEffect(() => {
    verificationProofFileRef.current = verificationProofFile;
  }, [verificationProofFile]);

  useEffect(() => {
    verificationProofPreviewRef.current = verificationProofPreview;
  }, [verificationProofPreview]);

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
  }, [localRole, localUserId, calendarRefreshToken]);

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
    class_recording_url: c.class_recording_url || c.recording_url || "",
    class_recording_uploaded_at: c.class_recording_uploaded_at || c.recording_uploaded_at || "",
    class_recording_expires_at: c.class_recording_expires_at || c.recording_expires_at || "",
    source_scheduled_date: normalizeDate(c.scheduled_date),
    source_start_time: c.start_time,
    source_end_time: c.end_time,
    scheduled_date: start.date,
    start_time: addSeconds(start.time),
    end_time: addSeconds(end.time),
    time: formatHumanTime(start.time),
    duration: c.duration,
    status: c.status,
    teacher_id: c.teacher_id,
    student_id: c.student_id,
    viewer_timezone: viewerTimezone,
    source_timezone: sourceTimezone,
  };
};

  const buildClassQueryParams = (scheduledDate) => {
    const params = { scheduled_date: scheduledDate };

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

    return params;
  };

// helper to load classes for a particular viewer date
  const loadClassesForDate = (dateStr, force = false) => {
    if (!dateStr || (!force && classesCache[dateStr])) return;

    Promise.all(
      nearbyDateKeys(dateStr).map(sourceDate =>
        axios
          .get(`${API}/api/calendar/classes-by-date`, { params: { ...buildClassQueryParams(sourceDate), include_reserved: true } })
          .then(r => r.data?.classes || [])
          .catch(() => [])
      )
    )
      .then(results => {
        const byId = new Map();
        results
          .flat()
          .map(formatClassForViewer)
          .filter(cls => normalizeDate(cls.scheduled_date) === normalizeDate(dateStr))
          .forEach(cls => byId.set(String(cls.id || cls.class_id), cls));
        setClassesCache(prev => ({ ...prev, [dateStr]: Array.from(byId.values()) }));
      })
      .catch(() => {
        setClassesCache(prev => ({ ...prev, [dateStr]: [] }));
      });
  };

  const loadTeacherClassesForDate = (dateStr, tId, force = false) => {
    const dateKey = normalizeDate(dateStr);
    if (!dateKey || !tId || (!force && teacherClassesCache[dateKey])) return Promise.resolve();

    return Promise.all(
      nearbyDateKeys(dateKey).map(sourceDate =>
        axios
          .get(`${API}/api/calendar/classes-by-date`, {
            params: { scheduled_date: sourceDate, teacher_id: tId, include_reserved: true }
          })
          .then(r => r.data?.classes || [])
          .catch(() => [])
      )
    )
      .then(results => {
        const byId = new Map();
        results
          .flat()
          .map(formatClassForViewer)
          .filter(cls => normalizeDate(cls.scheduled_date) === dateKey)
          .forEach(cls => byId.set(String(cls.id || cls.class_id), cls));
        setTeacherClassesCache(prev => ({ ...prev, [dateKey]: Array.from(byId.values()) }));
      })
      .catch(() => {
        setTeacherClassesCache(prev => ({ ...prev, [dateKey]: [] }));
      });
  };

  const loadTeacherClassesForDates = async (dateKeys, tId) => {
    const uniqueDateKeys = [...new Set(dateKeys.map(normalizeDate).filter(Boolean))];
    if (!uniqueDateKeys.length || !tId) return new Map();

    const entries = await Promise.all(uniqueDateKeys.map(async (dateKey) => {
      if (teacherClassesCache[dateKey] !== undefined) {
        return [dateKey, teacherClassesCache[dateKey]];
      }

      const results = await Promise.all(
        nearbyDateKeys(dateKey).map(sourceDate =>
          axios
            .get(`${API}/api/calendar/classes-by-date`, {
              params: { scheduled_date: sourceDate, teacher_id: tId, include_reserved: true }
            })
            .then(r => r.data?.classes || [])
            .catch(() => [])
        )
      );

      const byId = new Map();
      results
        .flat()
        .map(formatClassForViewer)
        .filter(cls => normalizeDate(cls.scheduled_date) === dateKey)
        .forEach(cls => byId.set(String(cls.id || cls.class_id), cls));

      return [dateKey, Array.from(byId.values())];
    }));

    const loadedClasses = new Map(entries);
    setTeacherClassesCache(prev => {
      const next = { ...prev };
      entries.forEach(([dateKey, classes]) => {
        next[dateKey] = classes;
      });
      return next;
    });
    return loadedClasses;
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
          setTeacherAvailabilityRecordForDate(formatAvailabilityRecordForViewer(r.data.record));
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

    if (
      !(teacherAvailabilityRecord?.source_start_time || teacherAvailabilityRecord?.start_time) ||
      !(teacherAvailabilityRecord?.source_end_time || teacherAvailabilityRecord?.end_time)
    ) {
      setAvailableTimeSlots([]);
      return;
    }

    const duration = normalizeClassDuration(durationOverride ?? studentPackage?.class_duration ?? studentProfile?.course_duration);
    const availabilityStart = timeToMinutes(teacherAvailabilityRecord.source_start_time || teacherAvailabilityRecord.start_time);
    const availabilityEnd = timeToMinutes(teacherAvailabilityRecord.source_end_time || teacherAvailabilityRecord.end_time);
    if (availabilityStart == null || availabilityEnd == null || availabilityEnd <= availabilityStart) {
      setAvailableTimeSlots([]);
      return;
    }

    const breakStart = teacherAvailabilityRecord.source_break_start || teacherAvailabilityRecord.break_start
      ? timeToMinutes(teacherAvailabilityRecord.source_break_start || teacherAvailabilityRecord.break_start)
      : null;
    const breakEnd = teacherAvailabilityRecord.source_break_end || teacherAvailabilityRecord.break_end
      ? timeToMinutes(teacherAvailabilityRecord.source_break_end || teacherAvailabilityRecord.break_end)
      : null;
    const occupiedRanges = classes
      .filter(cls => cls?.id !== excludeClassId && (Number(cls.teacher_id) === Number(tId) || Number(cls.student_id) === Number(localUserId)))
      .map(getClassRange)
      .filter(Boolean);

    const availabilityRanges = [];
    const hasValidBreak = breakStart != null && breakEnd != null && breakStart < breakEnd;
    if (hasValidBreak && breakStart > availabilityStart && breakEnd < availabilityEnd) {
      availabilityRanges.push({ start: availabilityStart, end: breakStart });
      availabilityRanges.push({ start: breakEnd, end: availabilityEnd });
    } else {
      availabilityRanges.push({ start: availabilityStart, end: availabilityEnd });
    }

    const finalSlotsInTeacherTimezone = [];
    availabilityRanges.forEach(({ start, end }) => {
      getCandidateSlotMinutes(start, end, duration, occupiedRanges).forEach((minute) => {
        const slotEnd = minute + duration;
        const conflictsWithClass = occupiedRanges.some(range => rangesOverlapWithClassBuffer(minute, slotEnd, range.start, range.end));
        if (!conflictsWithClass) {
          finalSlotsInTeacherTimezone.push(minutesToTime(minute));
        }
      });
    });

    const teacherTimezone = teacherAvailabilityRecord?.source_timezone || teacherAvailabilityRecord?.teacher_timezone || DEFAULT_TIMEZONE;
    const currentViewerDate = formatDateInTimezone(new Date(), viewerTimezone);
    const currentViewerTime = formatTimeInTimezone(new Date(), viewerTimezone);
    const currentViewerMinutes = timeToMinutes(currentViewerTime);
    const finalSlots = finalSlotsInTeacherTimezone
      .map(slot => {
        const converted = convertDateTime(
          teacherAvailabilityRecord.source_available_date || dateKey,
          slot,
          teacherTimezone,
          viewerTimezone
        );
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
  }, [selectedDate, localRole, localUserId, teacherId, studentId, searchParams, calendarRefreshToken]);

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
  }, [studentBookingMode, studentBookingDate, assignedTeacherId, calendarRefreshToken]);

  // Load teacher availability records for the selected booking month
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
            const normalized = r.data.records.map(formatAvailabilityRecordForViewer);
            setTeacherAvailabilityList(normalized);
            console.log("Loaded teacher availability records:", normalized);
          }
        })
        .catch(err => {
          console.error("Error loading teacher availability records:", err);
          setTeacherAvailabilityList([]);
        });
    }
  }, [studentBookingMode, assignedTeacherId, localRole, studentBookingDate, calendarRefreshToken]);

  useEffect(() => {
    if (studentBookingMode && studentBookingDate && assignedTeacherId && localRole === "student") {
      loadTeacherAvailabilityRecordForDate(studentBookingDate, assignedTeacherId);
    }
  }, [studentBookingMode, studentBookingDate, assignedTeacherId, localRole, calendarRefreshToken]);

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
            const normalized = r.data.records.map(formatAvailabilityRecordForViewer);
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
  }, [requestMode, requestDate, localRole, localUserId, teacherId, assignedTeacherId, year, month, calendarRefreshToken]);

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
  }, [selectedDate, teacherId, classesCache, availability, studentBookingMode, studentBookingDate, assignedTeacherId, teacherClassesCache, teacherAvailabilityList, studentPackage, studentProfile, requestMode, requestDate, selectedClass?.teacher_id, selectedClass?.id, selectedClassDuration, calendarRefreshToken]);

  // preload every day in the month so cells with classes are colored on load
  useEffect(() => {
    // If teacherId or studentId prop is provided, use those; otherwise use local user
    if (!isUserReady) return;

    const targetUserId = teacherId || studentId || localUserId;
    if (!targetUserId) {
      setIsInitialCalendarLoading(false);
      return;
    }

    const params = { year, month: month + 1 };
    if (teacherId) {
      params.teacher_id = teacherId;
    } else if (studentId) {
      params.student_id = studentId;
    } else {
      if (localRole === "student") params.student_id = localUserId;
      if (localRole === "teacher") params.teacher_id = localUserId;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const emptyMonthCache = {};
    for (let d = 1; d <= daysInMonth; d++) {
      emptyMonthCache[fmtDate(new Date(year, month, d))] = [];
    }

    let active = true;
    axios
      .get(`${API}/api/calendar/classes-by-month`, { params: { ...params, include_reserved: true } })
      .then(r => {
        if (!active) return;
        const monthlyClasses = r.data?.classesByDate || {};
        const nextMonthCache = { ...emptyMonthCache };

        Object.entries(monthlyClasses).forEach(([dateStr, classes]) => {
          (classes || []).map(formatClassForViewer).forEach((cls) => {
            const viewerDate = normalizeDate(cls.scheduled_date || dateStr);
            if (!viewerDate || nextMonthCache[viewerDate] === undefined) return;
            const existingIndex = nextMonthCache[viewerDate].findIndex(
              existing => String(existing.id || existing.class_id) === String(cls.id || cls.class_id)
            );
            if (existingIndex >= 0) {
              nextMonthCache[viewerDate][existingIndex] = cls;
            } else {
              nextMonthCache[viewerDate].push(cls);
            }
          });
        });

        setClassesCache(prev => ({ ...prev, ...nextMonthCache }));
        setIsInitialCalendarLoading(false);
      })
      .catch(() => {
        if (active) {
          setClassesCache(prev => ({ ...prev, ...emptyMonthCache }));
          setIsInitialCalendarLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [year, month, localRole, localUserId, teacherId, studentId, calendarRefreshToken, isUserReady]);

  // Load teacher availability records for the visible month when teacher enters availability mode
  useEffect(() => {
    if (setAvailabilityMode && localRole === "teacher" && localUserId) {
      loadTeacherAvailabilityForMonth();
    }
  }, [setAvailabilityMode, localRole, localUserId, year, month, calendarRefreshToken]);

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
    return fmtDate(d) < viewerTodayKey;
  };

  const handleCellClick = (d) => {
    if (!d || isPastDate(d)) return;
    // If teacher is in availability manager, selecting a calendar cell chooses
    // the availability date.
    if (setAvailabilityMode && localRole === "teacher") {
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const chosen = fmtDate(d);
      if (isOutsideScheduleWindow(chosen)) {
        setAvailabilityDate(chosen);
        setAvailabilityError(validateAvailabilityInputs({ availabilityDate: chosen }));
        return;
      }
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
      if (isOutsideScheduleWindow(chosen)) {
        setStudentBookingDate(chosen);
        setStudentBookingTime("");
        setStudentBookingError(`Please pick a date from today up to ${SCHEDULE_WINDOW_MONTHS} months ahead.`);
        return;
      }
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
    return classes && classes.some(cls => cls.verification_status !== "incomplete");
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
      return range && rangesOverlapWithClassBuffer(requestedStart, requestedEnd, range.start, range.end);
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
      return range && rangesOverlapWithClassBuffer(requestedStart, requestedEnd, range.start, range.end);
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
      return range && rangesOverlapWithClassBuffer(requestedStart, requestedEnd, range.start, range.end);
    });
  };

  const getRescheduleTeacherDateTime = (dateStr, timeStr = "00:00") => {
    const teacherTimezone = selectedClass?.teacher_timezone || selectedClass?.source_timezone || DEFAULT_TIMEZONE;
    return convertDateTime(dateStr, timeStr, viewerTimezone, teacherTimezone);
  };

  const getRescheduleAvailabilityRecord = (dateStr, timeStr = "00:00") => {
    const teacherDateTime = getRescheduleTeacherDateTime(dateStr, timeStr);
    const teacherDate = normalizeDate(teacherDateTime.date || dateStr);
    return teacherAvailabilityList.find(record => (
      normalizeDate(record.source_available_date) === teacherDate ||
      normalizeDate(record.available_date) === normalizeDate(dateStr)
    ));
  };

  const getRescheduleAvailabilityStatus = (dateStr) => {
    const teacherDateTime = getRescheduleTeacherDateTime(dateStr, "00:00");
    const teacherDate = normalizeDate(teacherDateTime.date || dateStr);
    if (!teacherDate) return "";
    const record = teacherAvailabilityList.find(record => (
      normalizeDate(record.source_available_date) === teacherDate ||
      normalizeDate(record.available_date) === normalizeDate(dateStr)
    ));
    if (record?.status) return record.status;
    if (availability[normalizeDate(dateStr)]) return availability[normalizeDate(dateStr)];
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
    
    const breakStartValue = availabilityRecord?.source_break_start || availabilityRecord?.break_start;
    const breakEndValue = availabilityRecord?.source_break_end || availabilityRecord?.break_end;

    if (!availabilityRecord || !breakStartValue || !breakEndValue) {
      return false;
    }
    
    // Ensure break times are valid (break_start < break_end)
    const breakStart = breakStartValue.substring(0, 5);
    const breakEnd = breakEndValue.substring(0, 5);
    
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
    const availabilityStartValue = availabilityRecord.source_start_time || availabilityRecord.start_time;
    const availabilityEndValue = availabilityRecord.source_end_time || availabilityRecord.end_time;

    if (!availabilityStartValue || !availabilityEndValue) {
      console.log(`✅ All-day availability (no specific times set)`);
      return false;
    }
    
    const availStart = availabilityStartValue.substring(0, 5);
    const availEnd = availabilityEndValue.substring(0, 5);
    
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
    setYear(viewerToday.getFullYear());
    setMonth(viewerToday.getMonth());
    // also highlight today's cell
    setSelectedDate(viewerTodayKey);
  };

  const isPastDateString = (dateStr) => {
    const normalized = normalizeDate(dateStr);
    return Boolean(normalized) && normalized < viewerTodayKey;
  };

  const isOutsideScheduleWindow = (dateStr) => {
    const normalized = normalizeDate(dateStr);
    return Boolean(normalized) && (normalized < viewerTodayKey || normalized > scheduleWindowEndKey);
  };

  const bulkAvailabilityDates = useMemo(() => {
    if (localRole !== "teacher") return [];
    const selectedWeekdays = new Set(bulkAvailabilityWeekdays.map(Number));
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dateKeys = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const dateKey = fmtDate(date);
      if (selectedWeekdays.has(date.getDay()) && !isOutsideScheduleWindow(dateKey)) {
        dateKeys.push(dateKey);
      }
    }
    return dateKeys;
  }, [bulkAvailabilityWeekdays, localRole, month, scheduleWindowEndKey, viewerTodayKey, year]);

  const toggleBulkAvailabilityWeekday = (weekday) => {
    setBulkAvailabilityWeekdays((current) => {
      const exists = current.includes(weekday);
      const next = exists ? current.filter((value) => value !== weekday) : [...current, weekday];
      return next.sort((a, b) => a - b);
    });
    setAvailabilityError("");
  };

  // Fetch teacher availability records for the visible month
  const loadTeacherAvailabilityForMonth = () => {
    if (localRole !== "teacher" || !localUserId) return;

    const visibleYear = year;
    const visibleMonth = month + 1;

    axios
      .get(`${API}/api/calendar/teacher-availability-records`, {
        params: { teacher_id: localUserId, year: visibleYear, month: visibleMonth }
      })
      .then(r => {
        if (r.data && r.data.records) {
          const normalized = r.data.records
            .map(formatAvailabilityRecordForViewer)
            .filter(record => !isPastDateString(record.available_date) && !isOutsideScheduleWindow(record.available_date));
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
      const refDate = requestDate ? new Date(requestDate + "T00:00:00") : viewerToday;
      if (!isNaN(refDate.getTime())) {
        targetYear = refDate.getFullYear();
        targetMonth = refDate.getMonth() + 1;
      } else {
        targetYear = viewerToday.getFullYear();
        targetMonth = viewerToday.getMonth() + 1;
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
            .map(formatAvailabilityRecordForViewer)
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

    const [selYear, selMonth, selDay] = date.split('-').map(Number);
    const selectedDateObj = new Date(selYear, selMonth - 1, selDay, 0, 0, 0, 0);
    const selectedDateKey = fmtDate(selectedDateObj);

    if (selectedDateKey < viewerTodayKey) {
      return "Cannot set availability for past dates";
    }

    if (selectedDateKey > scheduleWindowEndKey) {
      return `You can only set availability up to ${SCHEDULE_WINDOW_MONTHS} months ahead`;
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

      const todayMidnight = new Date(viewerToday.getFullYear(), viewerToday.getMonth(), viewerToday.getDate(), 0, 0, 0, 0);
      if (selectedDateObj.getTime() === todayMidnight.getTime()) {
        const [currentHours, currentMins] = formatTimeInTimezone(new Date(), viewerTimezone).split(":").map(Number);
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
        "Cannot set availability for past dates",
        `You can only set availability up to ${SCHEDULE_WINDOW_MONTHS} months ahead`,
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

  const validateBulkAvailabilityInputs = () => {
    if (!bulkAvailabilityWeekdays.length) {
      return "Please select at least one weekday";
    }
    if (!bulkAvailabilityDates.length) {
      return `No valid dates in ${monthName} within the 3-month scheduling window`;
    }
    return validateAvailabilityInputs({ availabilityDate: bulkAvailabilityDates[0] });
  };

  // Submit teacher availability
  const submitTeacherAvailability = async () => {
    const isBulkMode = availabilityApplyMode === "bulk";
    const error = isBulkMode ? validateBulkAvailabilityInputs() : validateAvailabilityInputs();
    if (error) {
      setAvailabilityError(error);
      return;
    }

    setIsSubmittingAvailability(true);
    try {
      let bulkResult = null;
      if (isBulkMode) {
        const response = await axios.post(`${API}/api/calendar/set-availability-bulk`, {
          teacher_id: localUserId,
          year,
          month: month + 1,
          weekdays: bulkAvailabilityWeekdays,
          status: availabilityStatus,
          start_time: availabilityStartTime || null,
          end_time: availabilityEndTime || null,
          break_start: availabilityBreakStart || null,
          break_end: availabilityBreakEnd || null,
        });
        bulkResult = response.data;
      } else {
        await axios.post(`${API}/api/calendar/set-availability`, {
          teacher_id: localUserId,
          available_date: availabilityDate,
          status: availabilityStatus,
          start_time: availabilityStartTime || null,
          end_time: availabilityEndTime || null,
          break_start: availabilityBreakStart || null,
          break_end: availabilityBreakEnd || null,
        });
      }

      const savedCount = Number(bulkResult?.saved_dates?.length || 0);
      const skippedCount = Number(bulkResult?.skipped_dates?.length || 0);
      notify(
        isBulkMode
          ? `Availability applied to ${savedCount} date${savedCount === 1 ? "" : "s"}${skippedCount ? `; ${skippedCount} skipped` : ""}.`
          : "Availability updated successfully",
        "success"
      );
      setAvailabilityConfirmOpen(false);
      setAvailabilityError("");
      setAvailabilityStartTime("");
      setAvailabilityEndTime("");
      setAvailabilityBreakStart("");
      setAvailabilityBreakEnd("");
      setAvailabilityDate(viewerTodayKey);
      triggerCalendarRefresh();
      loadTeacherAvailabilityForMonth();
      
      // Refresh availability cache
      const y = year;
      const m = month + 1;
      axios.get(`${API}/api/calendar/teacher-availability-records`, {
        params: { teacher_id: localUserId, year: y, month: m }
      }).then(r => {
        if (r.data?.records) {
          setAvailability(buildAvailabilityMapForViewer(r.data.records));
        } else {
          setAvailability({});
        }
      });
    } catch (error) {
      const errMsg = error.response?.data?.message || "Failed to update availability. Please try again.";
      setAvailabilityError(errMsg);
      notify(errMsg, "error");
    } finally {
      setIsSubmittingAvailability(false);
    }
  };

  const openAvailabilityConfirmation = () => {
    const error = availabilityApplyMode === "bulk" ? validateBulkAvailabilityInputs() : validateAvailabilityInputs();
    if (error) {
      setAvailabilityError(error);
      return;
    }
    setAvailabilityConfirmOpen(true);
  };

  const confirmTeacherAvailability = async () => {
    setAvailabilityConfirmOpen(false);
    await submitTeacherAvailability();
  };

  // Delete teacher availability
  const deleteTeacherAvailability = async (recordId) => {
    if (!window.confirm("Are you sure you want to delete this availability record?")) return;

    try {
      await axios.delete(`${API}/api/calendar/availability/${recordId}`);
      notify("Availability deleted successfully", "success");
      triggerCalendarRefresh();
      loadTeacherAvailabilityForMonth();
      
      // Refresh availability cache
      const y = year;
      const m = month + 1;
      axios.get(`${API}/api/calendar/teacher-availability-records`, {
        params: { teacher_id: localUserId, year: y, month: m }
      }).then(r => {
        if (r.data?.records) {
          setAvailability(buildAvailabilityMapForViewer(r.data.records));
        } else {
          setAvailability({});
        }
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
      setRequestConfirmOpen(false);
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

  const openRequestConfirmation = () => {
    setRequestError("");
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
    if (getRescheduleAvailabilityStatus(requestDate) !== "available") {
      setRequestError("Please choose a date with available schedule.");
      return;
    }
    if (isRescheduleToSameDateTime(requestDate, requestTime)) {
      setRequestError("Cannot reschedule to the same date and time. Please choose a different time.");
      return;
    }
    if (isTimeBookedForReschedule(requestDate, requestTime)) {
      setRequestError(getBookedSlotErrorMessage());
      return;
    }
    if (isCounterpartyDateTimeBooked(requestDate, requestTime)) {
      setRequestError(getCounterpartyUnavailableMessage());
      return;
    }
    if (isTimeConflictingWithTeacherBreak(requestDate, requestTime)) {
      setRequestError(localRole === "teacher" ? "This time conflicts with your break. Please choose another time." : "This time conflicts with teacher's break. Please choose another time.");
      return;
    }
    if (isTimeOutsideTeacherAvailability(requestDate, requestTime)) {
      setRequestError(localRole === "teacher" ? "This time is outside your availability window. Please choose another time." : "This time is outside the teacher's availability window. Please choose another time.");
      return;
    }

    setRequestConfirmOpen(true);
  };

  const confirmRequestReschedule = async () => {
    setRequestConfirmOpen(false);
    await submitRequest();
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
  
  const recording = useClassRecording({
    teacherId: localUserId,
    notify,
    onUploaded: (classId, verification) => {
      if (String(selectedClass?.id) === String(classId)) {
        setClassVerification(verification);
        setVerificationRecordingUrl(verification?.recording_url || "");
        setVerificationRecordingExpiresAt(verification?.recording_expires_at || "");
        applyVerificationToSelectedClass(verification);
      }
    },
  });
  const isTeacherOrAdmin = localRole === "teacher" || isAdmin;
  const isSelectedClassCompleted = selectedClass?.status === "completed";
  const isSelectedClassConfirmable = isClassJoinable(selectedClass, selectedDate, currentTimeTick);
  const isSelectedClassNoShowable = selectedClass?.status === "scheduled" && isClassPast(selectedClass, selectedDate, currentTimeTick);
  const hasVerificationSummarySentence = hasCompleteSentence(verificationSummary);
  const hasVerificationScreenshot = Boolean(verificationProofFile || verificationProofUrl);
  const hasStartScreenshot = Boolean(selectedClassVerification?.start_proof_url);
  const hasEndScreenshot = hasVerificationScreenshot;
  const hasVerificationRecording = Boolean(verificationRecordingUrl || selectedClassVerification?.recording_url);
  const evidenceMode = selectedClassVerification?.evidence_mode || (selectedClassStarted ? "recording" : evidenceChoice);
  const requiredRecordingMinutes = Math.max(1, Math.min(30, Math.ceil(Number(selectedClass?.duration || 50) * 0.6)));
  const hasVerificationProof = evidenceMode === "recording" ? hasVerificationRecording && Number(selectedClassVerification?.recording_duration_seconds || 0) >= requiredRecordingMinutes * 60
    : Boolean(hasStartScreenshot && hasEndScreenshot);
  const canEndVerifyAndComplete =
    selectedClassStarted &&
    selectedClassStudentConfirmed &&
    hasVerificationSummarySentence &&
    hasVerificationProof &&
    !recording.session &&
    !isUpdatingVerification;
  const canSubmitClassForReview =
    selectedClassStarted &&
    !selectedClassEnded &&
    hasVerificationSummarySentence &&
    !isUpdatingVerification &&
    (
      recording.session?.status === "failed" ||
      !selectedClassStudentConfirmed ||
      !hasVerificationProof
    );
  const missingVerificationItems = [
    !selectedClassStudentConfirmed ? "student attendance" : "",
    evidenceMode === "screenshots" && !hasStartScreenshot ? "start screenshot" : "",
    evidenceMode === "screenshots" && !hasEndScreenshot ? "end screenshot" : "",
    evidenceMode === "recording" && !hasVerificationRecording ? "recording" : "",
    !hasVerificationSummarySentence ? "class summary" : "",
  ].filter(Boolean);
  const endVerifyDisabledReason = (() => {
    if (recording.session) return "Stop recording and finish uploading before completing the class.";
    if (!selectedClassStudentConfirmed) return "Student must join and confirm attendance first.";
    if (!hasVerificationSummarySentence) return "Enter at least one complete sentence in the class summary.";
    if (!hasVerificationProof) return evidenceMode === "recording" ? `Upload a recording covering at least ${requiredRecordingMinutes} minutes, or submit for review.` : "Upload both the start and end screenshots.";
    return "";
  })();
  const isClassEntryDisabled =
    isSelectedClassCompleted ||
    !isSelectedClassConfirmable ||
    isUpdatingVerification ||
    (localRole === "student" && !selectedClassStarted);
  const selectedClassEntryLabel = (() => {
    if (isUpdatingVerification) return "Saving...";
    if (isSelectedClassCompleted) return "Class Done";
    if (localRole === "teacher" && !selectedClassStarted) return "Start & Join Class";
    if (localRole === "student" && !selectedClassStarted) return "Waiting for Teacher";
    if (localRole === "student" && !selectedClassStudentConfirmed) return "Join & Confirm Attendance";
    return "Join Class";
  })();
  const selectedClassEntryTitle = (() => {
    if (isSelectedClassCompleted) return "This class is already done";
    if (!isSelectedClassConfirmable) return "Available 30 mins before class starts";
    if (localRole === "student" && !selectedClassStarted) return "The teacher must start the class first";
    return "";
  })();
  const classEntryConfirmMode =
    localRole === "teacher" && !selectedClassStarted && evidenceChoice === "screenshots"
      ? "screenshots"
      : "recording";
  const classEntryConfirmContent = classEntryConfirmMode === "screenshots"
    ? {
        badge: "SS",
        title: "Start class with screenshots?",
        message: "After the student confirms attendance, capture the start screenshot right away. It must show the meeting, participants, and visible system time.",
        details: [
          "Upload the start screenshot within 5 minutes of student confirmation.",
          "Capture the end screenshot before leaving the meeting.",
          "Keep this Calendar page open so you can upload both screenshots.",
        ],
        confirmLabel: "Start & Join Class",
      }
    : {
        badge: "REC",
        title: "Recording consent",
        message: "This class may be recorded for attendance verification and can be viewed by the admin, teacher, and student.",
        details: [
          "The recording is used only for class verification.",
          "The recording will be deleted after 7 days.",
          "By continuing, you consent to join with recording verification.",
        ],
        confirmLabel: localRole === "teacher" && !selectedClassStarted ? "Consent & Start Class" : "Consent & Join Class",
      };

  const refreshSelectedVerification = (verification) => {
    setClassVerification(verification || null);
    if (verification) {
      setVerificationSummary(verification.summary || "");
      setVerificationProofUrl(verification.proof_url || "");
      setVerificationRecordingUrl(verification.recording_url || "");
      setVerificationRecordingExpiresAt(verification.recording_expires_at || "");
      applyVerificationToSelectedClass(verification);
    }
  };

  const startSelectedClassSession = async () => {
    if (!selectedClass?.id) {
      notify?.("Please select a class first.", "error");
      return;
    }
    if (!isSelectedClassConfirmable) {
      notify?.("You can start the class 30 minutes before it starts until it ends.", "error");
      return;
    }

    setIsUpdatingVerification(true);
    try {
      const response = await axios.post(`${API}/api/calendar/classes/${selectedClass.id}/start`, {
        teacher_id: localUserId,
        recording_consent: true,
        evidence_mode: evidenceChoice,
      });
      refreshSelectedVerification(response.data?.verification);
      notify?.("Class session started.", "success");
      return response.data?.verification || null;
    } catch (error) {
      notify?.(error.response?.data?.message || "Unable to start class session.", "error");
      return null;
    } finally {
      setIsUpdatingVerification(false);
    }
  };

  const confirmSelectedClassAttendance = async () => {
    if (!selectedClass?.id) {
      notify?.("Please select a class first.", "error");
      return;
    }
    if (!isSelectedClassConfirmable) {
      notify?.("You can confirm attendance 30 minutes before class starts until it ends.", "error");
      return;
    }

    setIsUpdatingVerification(true);
    try {
      const response = await axios.post(`${API}/api/calendar/classes/${selectedClass.id}/join`, {
        student_id: localUserId,
        recording_consent: true,
      });
      refreshSelectedVerification(response.data?.verification);
      notify?.("Attendance confirmed.", "success");
      return response.data?.verification || null;
    } catch (error) {
      notify?.(error.response?.data?.message || "Unable to confirm attendance.", "error");
      return null;
    } finally {
      setIsUpdatingVerification(false);
    }
  };

  const prepareVerificationProofFile = async (file) => {
    if (!file) {
      setVerificationProofFile(null);
      setVerificationProofPreview("");
      return;
    }

    try {
      const compressedFile = await compressImageFile(file);
      setVerificationProofFile(compressedFile);
      setVerificationProofPreview(URL.createObjectURL(compressedFile));
      const originalKb = Math.round(file.size / 1024);
      const compressedKb = Math.round(compressedFile.size / 1024);
      notify?.(`Screenshot ready (${originalKb} KB to ${compressedKb} KB).`, "success");
    } catch (error) {
      setVerificationProofFile(null);
      setVerificationProofPreview("");
      notify?.(error.message || "Unable to prepare screenshot.", "error");
    }
  };

  const handleVerificationProofFileChange = async (event) => {
    await prepareVerificationProofFile(event.target.files?.[0] || null);
  };

  const handleVerificationProofPaste = async (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;

    event.preventDefault();
    await prepareVerificationProofFile(imageItem.getAsFile());
  };

  const clearVerificationProofImage = () => {
    if (verificationProofPreview) {
      URL.revokeObjectURL(verificationProofPreview);
    }
    setVerificationProofFile(null);
    setVerificationProofPreview("");
    setVerificationProofUrl("");
  };

  const handleStartProofPaste = async (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem || !selectedClassStudentConfirmed || isUploadingStartProof || selectedClassVerification?.start_proof_url) return;

    event.preventDefault();
    await uploadStartProof(imageItem.getAsFile());
  };

  const handleStartProofFileChange = async (event) => {
    await uploadStartProof(event.target.files?.[0]);
    event.target.value = "";
  };

  const removeStartProof = async () => {
    if (!selectedClass?.id || !selectedClassVerification?.start_proof_url || isUploadingStartProof) return;
    const preservedEndProofFile = verificationProofFile;
    const preservedEndProofPreview = verificationProofPreview;
    const preservedEndProofUrl = verificationProofUrl;
    setIsUploadingStartProof(true);
    try {
      const response = await axios.delete(`${API}/api/calendar/classes/${selectedClass.id}/start-proof`, {
        data: { teacher_id: localUserId },
      });
      const verification = response.data?.verification || null;
      const nextVerification = verification
        ? {
            ...verification,
            proof_url: verification.proof_url || preservedEndProofUrl || selectedClassVerification?.proof_url || "",
          }
        : null;

      setClassVerification(nextVerification);
      if (nextVerification) applyVerificationToSelectedClass(nextVerification);
      setVerificationProofFile(preservedEndProofFile);
      setVerificationProofPreview(preservedEndProofPreview);
      setVerificationProofUrl(nextVerification?.proof_url || preservedEndProofUrl);
      notify?.("Start screenshot removed.", "success");
    } catch (error) {
      notify?.(error.response?.data?.message || "Unable to remove start screenshot.", "error");
    } finally {
      setIsUploadingStartProof(false);
    }
  };

  const openScreenshotPreview = (url) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openSelectedClassMeeting = async (meetingTab) => {
    try {
      const response = await axios.get(`${API}/api/calendar/classes/${selectedClass.id}/classroom`, {
        params: { user_id: localUserId },
      });
      const url = new URL(response.data?.class?.class_link);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid meeting link");
      url.searchParams.delete("embed");
      if (response.data?.jitsi_jwt) url.searchParams.set("jwt", response.data.jitsi_jwt);
      url.hash = "";
      meetingTab.location.replace(url.toString());
      return true;
    } catch (error) {
      meetingTab.close();
      notify?.(error.response?.data?.message || "Unable to open the meeting link.", "error");
      return false;
    }
  };

  const enterSelectedClass = async () => {
    if (!selectedClass?.id) {
      notify?.("Please select a class first.", "error");
      return;
    }
    if (isSelectedClassCompleted || !isSelectedClassConfirmable) return;

    setClassEntryConfirmOpen(true);
  };

  const continueSelectedClassEntry = async () => {
    if (!selectedClass?.id || isSelectedClassCompleted || !isSelectedClassConfirmable) {
      setClassEntryConfirmOpen(false);
      return;
    }

    setClassEntryConfirmOpen(false);
    const meetingTab = window.open("about:blank", "_blank");
    if (!meetingTab) {
      notify?.("Allow pop-ups for this site, then click Join Class again.", "warning");
      return;
    }
    meetingTab.opener = null;
    if (localRole === "teacher" && !selectedClassStarted) {
      const verification = await startSelectedClassSession();
      if (!verification) { meetingTab.close(); return; }
    } else if (localRole === "student" && selectedClassStarted && !selectedClassStudentConfirmed) {
      const verification = await confirmSelectedClassAttendance();
      if (!verification) { meetingTab.close(); return; }
    }

    const meetingOpened = await openSelectedClassMeeting(meetingTab);
    if (
      meetingOpened &&
      localRole === "teacher" &&
      !selectedClassStarted &&
      evidenceChoice === "recording"
    ) {
      window.setTimeout(() => {
        recording.start(selectedClass.id);
      }, 900);
    }
  };

  const endSelectedClassSession = async ({ completeAfterVerify = false, reviewReason = "" } = {}) => {
    if (recording.session && !(reviewReason && recording.session.status === "failed")) return;
    if (!selectedClass?.id) {
      notify?.("Please select a class first.", "error");
      return;
    }
    if (!verificationSummary.trim() && !verificationProofFile && !verificationProofUrl && !hasVerificationRecording) {
      notify?.("Add a class summary and recording or screenshot before ending the class.", "error");
      return;
    }
    if (!selectedClassStudentConfirmed && !reviewReason) {
      notify?.("The student must join and confirm attendance before you can end and complete the class.", "error");
      return;
    }
    if (!hasVerificationSummarySentence) {
      notify?.("Please enter at least one complete sentence in the class summary.", "error");
      return;
    }
    if (!hasVerificationProof && !reviewReason) {
      notify?.("Please record the class or upload screenshot proof.", "error");
      return;
    }

    setIsUpdatingVerification(true);
    try {
      const formData = new FormData();
      formData.append("teacher_id", localUserId);
      formData.append("summary", verificationSummary);
      if (reviewReason) formData.append("review_reason", reviewReason);
      if (verificationProofFile) {
        formData.append("proof_image", verificationProofFile);
      }

      const response = await axios.post(`${API}/api/calendar/classes/${selectedClass.id}/end`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const verification = response.data?.verification;
      refreshSelectedVerification(verification);
      if (reviewReason) recording.discardFailed();
      if (verification?.verification_status === "verified" && completeAfterVerify) {
        await handleConfirmClassDone({ verifiedOverride: true });
        return verification;
      }

      notify?.(
        verification?.verification_status === "verified"
          ? "Class evidence verified."
          : "Class ended but still needs review. Check attendance, duration, and proof.",
        verification?.verification_status === "verified" ? "success" : "warning"
      );
      return verification || null;
    } catch (error) {
      notify?.(error.response?.data?.message || "Unable to end class session.", "error");
      return null;
    } finally {
      setIsUpdatingVerification(false);
    }
  };

  const openClassDoneConfirmation = () => {
    if (!selectedClass?.id || !selectedClass?.student_id) {
      notify?.("Please select a class first.", "error");
      return;
    }

    if (!selectedClassVerified) {
      notify?.("Verify the class first: start, student attendance, end, and proof or summary.", "error");
      return;
    }

    setClassDoneConfirmOpen(true);
  };

  const handleConfirmClassDone = async ({ verifiedOverride = false } = {}) => {
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

    await markSelectedClassDone({ verifiedOverride });
  };

  const markSelectedClassDone = async ({ proficiencyLevel = "", assessmentNotes = "", verifiedOverride = false } = {}) => {
    if (!selectedClassVerified && !verifiedOverride) {
      notify?.("Verify the class first before marking it done.", "error");
      return;
    }

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
  // Reserved incomplete sessions still block time, but are not active bookings.
  const activeBookedClasses = bookedDates.filter(cls => cls.verification_status !== "incomplete").length;
  const effectiveBookableClasses = (() => {
    if (studentPackage?.bookable_classes != null) return Math.max(0, Number(studentPackage.bookable_classes || 0));
    if (studentPackage) return Math.max(0, Number(effectiveClassesLeft || 0) - activeBookedClasses);
    if (localRole === "student") return 0;
    return Math.max(0, Number(effectiveClassesLeft || 0) - activeBookedClasses);
  })();
  const effectivePercent = effectiveClassesLimit > 0 ? Math.min(100, Math.round((effectiveClassesLeft / effectiveClassesLimit) * 100)) : 0;
  const hasNoActiveStudentPackage = localRole === "student" && !studentPackage;
  const hasNoBookableClasses = localRole === "student" && Number(effectiveBookableClasses) <= 0;
  const contractExhausted = localRole === "student" && !!studentPackage && Number(effectiveClassesLeft) <= 0;
  const allRemainingClassesReserved =
    localRole === "student" &&
    !!studentPackage &&
    Number(effectiveClassesLeft) > 0 &&
    Number(effectiveBookableClasses) <= 0;
  const canRequestNewContract = hasNoActiveStudentPackage || contractExhausted;
  const hasNoClassesLeft = hasNoBookableClasses;
  const studentBookingLimit = Math.max(0, Number(effectiveBookableClasses || 0));
  const studentBookingSelectionFull = studentBookingLimit > 0 && studentBookingSelections.length >= studentBookingLimit;
  const studentBookingSelectionKey = (date, time) => `${normalizeDate(date)}|${normalizeTime(time)}`;
  const isStudentBookingSelected = (date, time) => {
    const key = studentBookingSelectionKey(date, time);
    return studentBookingSelections.some((slot) => studentBookingSelectionKey(slot.date, slot.time) === key);
  };
  const studentSlotOverlapsSelections = (slots, date, time) => {
    const normalizedDate = normalizeDate(date);
    const normalizedTime = normalizeTime(time);
    const nextStart = timeToMinutes(normalizedTime);
    const nextEnd = nextStart == null ? null : nextStart + studentClassDuration;
    return slots.some((slot) => {
      if (normalizeDate(slot.date) !== normalizedDate) return false;
      const slotStart = timeToMinutes(slot.time);
      const slotEnd = slotStart == null ? null : slotStart + studentClassDuration;
      return nextStart != null && nextEnd != null && slotStart != null && slotEnd != null
        && rangesOverlapWithClassBuffer(nextStart, nextEnd, slotStart, slotEnd);
    });
  };
  const studentSlotOverlapsClassList = (classes, time) => {
    const requestedStart = timeToMinutes(time);
    const requestedEnd = requestedStart == null ? null : requestedStart + studentClassDuration;
    if (requestedStart == null || requestedEnd == null) return false;

    return (classes || []).some((cls) => {
      const range = getClassRange(cls);
      return range && rangesOverlapWithClassBuffer(requestedStart, requestedEnd, range.start, range.end);
    });
  };
  const getAvailabilitySlotsForRecord = (record, duration = studentClassDuration, occupiedClasses = []) => {
    if (!record || record.status !== "available") return [];
    const dateKey = normalizeDate(record.available_date);
    const availabilityStart = timeToMinutes(record.source_start_time || record.start_time);
    const availabilityEnd = timeToMinutes(record.source_end_time || record.end_time);
    if (!dateKey || availabilityStart == null || availabilityEnd == null || availabilityEnd <= availabilityStart) return [];

    const breakStart = record.source_break_start || record.break_start
      ? timeToMinutes(record.source_break_start || record.break_start)
      : null;
    const breakEnd = record.source_break_end || record.break_end
      ? timeToMinutes(record.source_break_end || record.break_end)
      : null;
    const ranges = [];
    if (breakStart != null && breakEnd != null && breakStart < breakEnd && breakStart > availabilityStart && breakEnd < availabilityEnd) {
      ranges.push({ start: availabilityStart, end: breakStart });
      ranges.push({ start: breakEnd, end: availabilityEnd });
    } else {
      ranges.push({ start: availabilityStart, end: availabilityEnd });
    }

    const teacherTimezone = record.source_timezone || record.teacher_timezone || DEFAULT_TIMEZONE;
    const sourceDate = record.source_available_date || dateKey;
    const occupiedRanges = (occupiedClasses || [])
      .map(getClassRange)
      .filter(Boolean);
    const currentViewerDate = formatDateInTimezone(new Date(), viewerTimezone);
    const currentViewerTime = formatTimeInTimezone(new Date(), viewerTimezone);
    const currentViewerMinutes = timeToMinutes(currentViewerTime);
    const slots = [];

    ranges.forEach(({ start, end }) => {
      getCandidateSlotMinutes(start, end, duration, occupiedRanges).forEach((minute) => {
        const slotEnd = minute + duration;
        if (occupiedRanges.some(range => rangesOverlapWithClassBuffer(minute, slotEnd, range.start, range.end))) return;
        const converted = convertDateTime(sourceDate, minutesToTime(minute), teacherTimezone, viewerTimezone);
        const convertedDate = normalizeDate(converted.date);
        const convertedTime = normalizeTime(converted.time);
        if (!convertedDate || !convertedTime) return;
        if (convertedDate < currentViewerDate || convertedDate > scheduleWindowEndKey) return;
        if (convertedDate === currentViewerDate && currentViewerMinutes != null) {
          const slotMinutes = timeToMinutes(convertedTime);
          if (slotMinutes == null || slotMinutes <= currentViewerMinutes) return;
        }
        slots.push({
          date: convertedDate,
          time: convertedTime,
          teacher_timezone: teacherTimezone,
        });
      });
    });

    return slots;
  };
  const toggleStudentBookingSelection = (date, time) => {
    const normalizedDate = normalizeDate(date);
    const normalizedTime = normalizeTime(time);
    if (!normalizedDate || !normalizedTime) return;

    setStudentBookingSelections((current) => {
      const key = studentBookingSelectionKey(normalizedDate, normalizedTime);
      const exists = current.some((slot) => studentBookingSelectionKey(slot.date, slot.time) === key);
      if (exists) {
        return current.filter((slot) => studentBookingSelectionKey(slot.date, slot.time) !== key);
      }
      if (current.length >= studentBookingLimit) {
        setStudentBookingError(`You can only select ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"} based on your remaining package.`);
        return current;
      }
      const nextStart = timeToMinutes(normalizedTime);
      const nextEnd = nextStart == null ? null : nextStart + studentClassDuration;
      const overlapsSelected = current.some((slot) => {
        if (normalizeDate(slot.date) !== normalizedDate) return false;
        const slotStart = timeToMinutes(slot.time);
        const slotEnd = slotStart == null ? null : slotStart + studentClassDuration;
        return nextStart != null && nextEnd != null && slotStart != null && slotEnd != null
          && rangesOverlapWithClassBuffer(nextStart, nextEnd, slotStart, slotEnd);
      });
      if (overlapsSelected) {
        setStudentBookingError(`This class overlaps with another selected slot or its ${CLASS_BREAK_BUFFER_MINUTES}-minute teacher break.`);
        return current;
      }
      setStudentBookingError("");
      const selectedAvailabilityRecord = teacherAvailabilityList.find(
        record => normalizeDate(record.available_date) === normalizedDate
      ) || (
        normalizeDate(teacherAvailabilityRecordForDate?.available_date) === normalizedDate
          ? teacherAvailabilityRecordForDate
          : null
      );
      return [...current, {
        date: normalizedDate,
        time: normalizedTime,
        teacher_timezone: selectedAvailabilityRecord?.teacher_timezone || DEFAULT_TIMEZONE,
      }]
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    });
  };
  const toggleStudentBookingWeekday = (weekday) => {
    setStudentBookingWeeklyWeekdays((current) => {
      const exists = current.includes(weekday);
      const next = exists ? current.filter((value) => value !== weekday) : [...current, weekday];
      return next.sort((a, b) => a - b);
    });
    setStudentBookingError("");
    setStudentBookingSuggestions([]);
  };
  const loadTeacherAvailabilityRecordsForScheduleWindow = async () => {
    if (!assignedTeacherId) return [];
    const monthKeys = [];
    const cursor = new Date(viewerToday.getFullYear(), viewerToday.getMonth(), 1);
    const end = dateKeyToLocalDate(scheduleWindowEndKey);
    while (end && cursor <= end) {
      monthKeys.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const responses = await Promise.all(monthKeys.map(({ year: targetYear, month: targetMonth }) => (
      axios.get(`${API}/api/calendar/teacher-availability-records`, {
        params: { teacher_id: assignedTeacherId, year: targetYear, month: targetMonth }
      })
    )));

    return responses
      .flatMap((response) => response.data?.records || [])
      .map(formatAvailabilityRecordForViewer)
      .filter((record) => {
        const dateKey = normalizeDate(record.available_date);
        return dateKey >= scheduleWindowStart && dateKey <= scheduleWindowEnd;
      });
  };
  const applyStudentWeeklyPattern = async () => {
    setStudentBookingError("");
    setStudentBookingSuggestions([]);
    const preferredTime = normalizeTime(studentBookingWeeklyTime);
    if (!studentBookingWeeklyWeekdays.length) {
      setStudentBookingError("Please select at least one weekday.");
      return;
    }
    if (!preferredTime) {
      setStudentBookingError("Please select a preferred time.");
      return;
    }
    if (!studentBookingLimit) {
      setStudentBookingError("You have no classes left to book. Contact the admin for a new contract.");
      return;
    }
    if (studentBookingSelections.length >= studentBookingLimit) {
      setStudentBookingError(`You already selected ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"}, which matches your remaining package.`);
      return;
    }

    try {
      const records = await loadTeacherAvailabilityRecordsForScheduleWindow();
      const recordDates = records
        .map((record) => normalizeDate(record.available_date))
        .filter(Boolean);
      const classesByDate = await loadTeacherClassesForDates(recordDates, assignedTeacherId);
      const selectedWeekdays = new Set(studentBookingWeeklyWeekdays);
      const existingKeys = new Set(studentBookingSelections.map((slot) => studentBookingSelectionKey(slot.date, slot.time)));
      const preferredMinutes = timeToMinutes(preferredTime);
      const candidateSlots = records
        .flatMap((record) => {
          const recordDate = normalizeDate(record.available_date);
          return getAvailabilitySlotsForRecord(record, studentClassDuration, classesByDate.get(recordDate) || []);
        })
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
        .filter((slot) => {
          const slotDate = dateKeyToLocalDate(slot.date);
          if (!slotDate || !selectedWeekdays.has(slotDate.getDay())) return false;
          const key = studentBookingSelectionKey(slot.date, slot.time);
          if (existingKeys.has(key)) return false;
          if (studentSlotOverlapsSelections(studentBookingSelections, slot.date, slot.time)) return false;
          return true;
        });
      const slotsByDate = new Map();

      candidateSlots.forEach((slot) => {
          const classesForDate = classesByDate.get(slot.date) || [];
          if (studentSlotOverlapsClassList(classesForDate, slot.time)) return;
          const slotMinutes = timeToMinutes(slot.time);
          if (preferredMinutes == null || slotMinutes == null) return;
          const distance = Math.abs(slotMinutes - preferredMinutes);
          const existing = slotsByDate.get(slot.date);
          if (!existing || distance < existing.distance || (distance === existing.distance && slotMinutes > preferredMinutes)) {
            slotsByDate.set(slot.date, {
              ...slot,
              requested_time: preferredTime,
              distance,
            });
          }
        });

      const suggestions = Array.from(slotsByDate.values())
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

      if (!suggestions.length) {
        setStudentBookingError("No available weekly suggestions found for the selected days and preferred time.");
        return;
      }

      setStudentBookingSuggestions(suggestions);
      setStudentBookingTime(preferredTime);
      notify?.(`${suggestions.length} weekly suggestion${suggestions.length === 1 ? "" : "s"} found. You can add up to ${studentBookingLimit - studentBookingSelections.length}.`, "success");
    } catch (err) {
      console.error(err);
      setStudentBookingError("Unable to load weekly availability. Please try again.");
    }
  };
  const addStudentBookingSuggestions = () => {
    if (!studentBookingSuggestions.length) return;
    setStudentBookingSelections((current) => {
      const accepted = [];
      const keys = new Set(current.map((slot) => studentBookingSelectionKey(slot.date, slot.time)));
      studentBookingSuggestions.forEach((slot) => {
        if (current.length + accepted.length >= studentBookingLimit) return;
        const key = studentBookingSelectionKey(slot.date, slot.time);
        if (keys.has(key)) return;
        if (studentSlotOverlapsSelections([...current, ...accepted], slot.date, slot.time)) return;
        keys.add(key);
        accepted.push(slot);
      });
      if (!accepted.length) return current;
      return [...current, ...accepted]
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    });
    setStudentBookingSuggestions([]);
    setStudentBookingError("");
  };
  const addStudentBookingSuggestion = (suggestion) => {
    if (!suggestion) return;
    setStudentBookingSelections((current) => {
      const key = studentBookingSelectionKey(suggestion.date, suggestion.time);
      if (current.some((slot) => studentBookingSelectionKey(slot.date, slot.time) === key)) {
        return current;
      }
      if (current.length >= studentBookingLimit) {
        setStudentBookingError(`You can only select ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"} based on your remaining package.`);
        return current;
      }
      if (studentSlotOverlapsSelections(current, suggestion.date, suggestion.time)) {
        setStudentBookingError(`This class overlaps with another selected slot or its ${CLASS_BREAK_BUFFER_MINUTES}-minute teacher break.`);
        return current;
      }
      setStudentBookingError("");
      return [...current, suggestion]
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    });
  };
  const requestEndTime = requestTime && timeToMinutes(requestTime) != null
    ? minutesToTime(timeToMinutes(requestTime) + selectedClassDuration)
    : "";

  const scheduleWindowStart = viewerTodayKey;
  const scheduleWindowEnd = scheduleWindowEndKey;

  const openMonthlyBooking = () => {
    if (hasNoClassesLeft) {
      setStudentBookingError("You have no classes left to book. Contact the admin for a new contract.");
      return;
    }

    setYear(viewerToday.getFullYear());
    setMonth(viewerToday.getMonth());
    setStudentBookingMode(true);
    // Clear date so user selects a day from the calendar cells
    setStudentBookingDate("");
    setStudentBookingTime("");
    setStudentBookingSelections([]);
    setStudentBookingSuggestions([]);
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
    const slotsToBook = studentBookingSelections.length
      ? studentBookingSelections
      : studentBookingDate && studentBookingTime
        ? [{ date: studentBookingDate, time: studentBookingTime }]
        : [];

    if (!slotsToBook.length) {
      setStudentBookingError("Please select at least one time slot.");
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
    if (slotsToBook.length > studentBookingLimit) {
      setStudentBookingError(`You can only book ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"} based on your remaining package.`);
      return;
    }

    const invalidSlot = slotsToBook.find((slot) => slot.date < scheduleWindowStart || slot.date > scheduleWindowEnd);
    if (invalidSlot) {
      setStudentBookingError(`Please pick a date from today up to ${SCHEDULE_WINDOW_MONTHS} months ahead.`);
      return;
    }

    const bookedSlot = slotsToBook.find((slot) => isTeacherDateTimeBooked(slot.date, slot.time));
    if (bookedSlot) {
      setStudentBookingError("The teacher is already booked at this time. Please choose another slot.");
      return;
    }

    setIsSubmittingStudentBooking(true);
    try {
      const bookedClasses = [];
      const failedBookings = [];
      for (const slot of slotsToBook) {
        try {
          const selectedAvailabilityRecord = teacherAvailabilityList.find(
            record => normalizeDate(record.available_date) === slot.date
          ) || (
            normalizeDate(teacherAvailabilityRecordForDate?.available_date) === slot.date
              ? teacherAvailabilityRecordForDate
              : null
          );
          const teacherTimezone = slot.teacher_timezone || selectedAvailabilityRecord?.teacher_timezone || DEFAULT_TIMEZONE;
          const teacherStart = convertDateTime(slot.date, slot.time, viewerTimezone, teacherTimezone);
          const teacherBookingDate = teacherStart.date || slot.date;
          const teacherBookingTime = teacherStart.time || slot.time;

          const teacherStartMinutes = timeToMinutes(teacherBookingTime);
          const duration = studentClassDuration;
          if (teacherStartMinutes == null || duration <= 0) {
            throw new Error("Invalid class time or duration.");
          }
          const endTime = minutesToTime(teacherStartMinutes + duration);

          const response = await axios.post(`${API}/api/calendar/class`, {
            class_name: studentProfile?.course_name || "General English",
            teacher_id: assignedTeacherId,
            student_id: localUserId,
            scheduled_date: teacherBookingDate,
            start_time: teacherBookingTime,
            end_time: endTime,
            duration,
            class_link: ""
          });

          const bookedClass = formatClassForViewer({
            class_id: response.data?.class_id,
            class_name: studentProfile?.course_name || "General English",
            teacher_id: assignedTeacherId,
            student_id: localUserId,
            scheduled_date: teacherBookingDate,
            start_time: teacherBookingTime,
            end_time: endTime,
            duration,
            status: "scheduled",
            teacher_timezone: teacherTimezone,
          });

          bookedClasses.push({
            classInfo: bookedClass,
            viewerDate: normalizeDate(bookedClass.scheduled_date || slot.date),
            viewerTime: bookedClass.start_time || slot.time,
            requestedStart: timeToMinutes(slot.time),
            requestedEnd: timeToMinutes(slot.time) == null ? null : timeToMinutes(slot.time) + duration,
          });

          if (response.data?.package && localRole === "student") {
            setStudentPackage(response.data.package);
          }
        } catch (slotError) {
          failedBookings.push({
            slot,
            message: slotError?.response?.data?.message || slotError?.message || "Unable to book this slot.",
          });
        }
      }

      if (!bookedClasses.length) {
        setStudentBookingError(failedBookings[0]?.message || "Unable to book the selected classes. Please try again.");
        return;
      }

      const successMessage = bookedClasses.length === 1 ? "Class booked successfully." : `${bookedClasses.length} classes booked successfully.`;
      notify?.(failedBookings.length ? `${successMessage} ${failedBookings.length} skipped.` : successMessage, failedBookings.length ? "info" : "success");
      setStudentBookingMode(failedBookings.length > 0);
      setStudentBookingTime("");
      setStudentBookingSelections(failedBookings.map(({ slot }) => slot));
      setStudentBookingSuggestions([]);
      setStudentBookingSubject("");
      setSelectedDate(bookedClasses[0]?.viewerDate || studentBookingDate);
      setBookedDates(prev => [
        ...prev,
        ...bookedClasses.map(({ classInfo, viewerDate, viewerTime }) => ({
          scheduled_date: viewerDate,
          start_time: viewerTime,
          end_time: classInfo.end_time,
          duration: classInfo.duration,
          teacher_id: assignedTeacherId,
          student_id: localUserId,
        })),
      ]);
      setAvailableTimeSlots(prev => prev.filter((slot) => {
        const slotStart = timeToMinutes(slot);
        const slotEnd = slotStart == null ? null : slotStart + studentClassDuration;
        return !bookedClasses.some(({ requestedStart, requestedEnd }) => (
          requestedStart != null && requestedEnd != null && slotStart != null && slotEnd != null
          && rangesOverlapWithClassBuffer(slotStart, slotEnd, requestedStart, requestedEnd)
        ));
      }));
      setClassesCache(prev => {
        const next = { ...prev };
        bookedClasses.forEach(({ classInfo, viewerDate }) => {
          next[viewerDate] = [
            ...(next[viewerDate] || []).filter(cls => String(cls.id || cls.class_id) !== String(classInfo.id || classInfo.class_id)),
            classInfo,
          ];
        });
        return next;
      });
      setTeacherClassesCache(prev => {
        const next = { ...prev };
        bookedClasses.forEach(({ classInfo, viewerDate }) => {
          next[viewerDate] = [
            ...(next[viewerDate] || []).filter(cls => String(cls.id || cls.class_id) !== String(classInfo.id || classInfo.class_id)),
            classInfo,
          ];
        });
        return next;
      });
      [...new Set(bookedClasses.map(({ viewerDate }) => viewerDate))].forEach((bookedViewerDate) => {
        loadClassesForDate(bookedViewerDate, true);
        loadTeacherClassesForDate(bookedViewerDate, assignedTeacherId, true);
      });
      triggerCalendarRefresh();
    } catch (err) {
      console.error(err);
      setStudentBookingError(err?.response?.data?.message || err?.message || "Unable to book class. Please try again.");
    } finally {
      setIsSubmittingStudentBooking(false);
    }
  };

  const openStudentBookingConfirmation = () => {
    setStudentBookingError("");
    const slotsToBook = studentBookingSelections.length
      ? studentBookingSelections
      : studentBookingDate && studentBookingTime
        ? [{ date: studentBookingDate, time: studentBookingTime }]
        : [];
    if (!slotsToBook.length) {
      setStudentBookingError("Please select at least one time slot.");
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
    if (slotsToBook.length > studentBookingLimit) {
      setStudentBookingError(`You can only book ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"} based on your remaining package.`);
      return;
    }
    if (slotsToBook.some((slot) => slot.date < scheduleWindowStart || slot.date > scheduleWindowEnd)) {
      setStudentBookingError(`Please pick a date from today up to ${SCHEDULE_WINDOW_MONTHS} months ahead.`);
      return;
    }
    if (slotsToBook.some((slot) => isTeacherDateTimeBooked(slot.date, slot.time))) {
      setStudentBookingError("The teacher is already booked at this time. Please choose another slot.");
      return;
    }

    setStudentBookingConfirmOpen(true);
  };

  const confirmStudentBooking = async () => {
    setStudentBookingConfirmOpen(false);
    await submitStudentBooking();
  };

  const uploadStartProof = async (file) => {
    if (!file || !selectedClass?.id) return;
    setIsUploadingStartProof(true);
    try {
      const form = new FormData();
      form.append("teacher_id", localUserId);
      form.append("proof_image", await compressImageFile(file));
      const response = await axios.post(`${API}/api/calendar/classes/${selectedClass.id}/start-proof`, form);
      setClassVerification(response.data.verification);
      notify?.("Start screenshot uploaded. Remember the end screenshot before leaving the meeting.", "success");
    } catch (error) {
      notify?.(error.response?.data?.message || "Unable to upload start screenshot.", "error");
    } finally { setIsUploadingStartProof(false); }
  };

  const renderVerificationPanel = () => {
    if (!selectedClass || isSelectedClassCompleted) return null;
    const statusLabel = verificationStatusLabels[selectedVerificationStatus] || "Pending";
    const statusColor = selectedClassVerified
      ? "#2e7d32"
      : selectedVerificationStatus === "needs_review"
        ? "#b45309"
        : "#1864ab";
    const checklistItems = [
      { label: "Teacher start", done: selectedClassStarted, value: selectedClassStarted ? formatVerificationTimestamp(selectedClassVerification.teacher_started_at) : "Not started" },
      { label: "Student attendance", done: selectedClassStudentConfirmed, value: selectedClassStudentConfirmed ? formatVerificationTimestamp(selectedClassVerification.student_joined_at) : "Not confirmed" },
      { label: "Teacher end", done: selectedClassEnded, value: selectedClassEnded ? formatVerificationTimestamp(selectedClassVerification.teacher_ended_at) : "Not ended" },
      ...(evidenceMode === "screenshots"
        ? [
            { label: "Start screenshot", done: hasStartScreenshot, value: hasStartScreenshot ? "Uploaded" : "Missing" },
            { label: "End screenshot", done: hasEndScreenshot, value: hasEndScreenshot ? "Ready" : "Missing" },
          ]
        : [
            { label: "Recording", done: hasVerificationRecording, value: hasVerificationRecording ? "Uploaded" : "Not uploaded" },
          ]),
      { label: "Class summary", done: hasVerificationSummarySentence, value: hasVerificationSummarySentence ? "Ready" : "Missing" },
    ];

    return (
      <div style={verificationPanelStyle}>
        <div className={styles.verificationHeader}>
          <div>
            <div className={styles.verificationTitle}>Class Verification</div>
            <div className={styles.verificationMeta}>Duration verified: {Number(selectedClassVerification?.duration_minutes || 0)} min</div>
          </div>
          <span className={styles.verificationStatusPill} style={{ background: `${statusColor}18`, color: statusColor }}>
            {statusLabel}
          </span>
        </div>
        <div className={styles.verificationChecklist}>
          {checklistItems.map((item) => (
            <div key={item.label} className={styles.verificationCheckRow}>
              <span className={`${styles.verificationCheckIcon} ${item.done ? styles.verificationCheckDone : ""}`}>
                {item.done ? "✓" : ""}
              </span>
              <span className={styles.verificationCheckLabel}>{item.label}</span>
              <span className={styles.verificationCheckValue}>{item.value}</span>
            </div>
          ))}
          {hasVerificationRecording && verificationRecordingExpiresAt && (
            <div className={styles.verificationFootnote}>
              Recording deletes automatically on{" "}
              {formatVerificationTimestamp(verificationRecordingExpiresAt, true)}
            </div>
          )}
        </div>

        {localRole === "teacher" && !isAdmin && (
          <div className={styles.verificationBody}>
            {!selectedClassStarted && (
              <label className={styles.verificationField}>Class evidence
                <select value={evidenceChoice} onChange={event => setEvidenceChoice(event.target.value)} className={styles.verificationSelect}>
                  <option value="screenshots">Start and end screenshots</option>
                  <option value="recording">Video recording</option>
                </select>
              </label>
            )}
            {selectedClassStarted && <div className={styles.verificationSectionTitle}>Evidence: {evidenceMode === "recording" ? "Video recording" : "Start and end screenshots"}</div>}
            {evidenceMode === "recording" && <small className={styles.verificationHelpText}>Minimum recording: {requiredRecordingMinutes} minutes. Uploaded capture: {formatRecordingDuration(selectedClassVerification?.recording_duration_seconds)}.</small>}
            {selectedClassStarted && !selectedClassEnded && evidenceMode === "screenshots" && (
              <div className={styles.evidenceGrid}>
                <div className={styles.verificationHelpText}>Show the meeting, participants, and visible system time in both screenshots.</div>
                {shouldRemindStartScreenshot && (
                  <div role="alert" className={styles.verificationAlert}>
                    Upload the start screenshot within 5 minutes of student confirmation.
                  </div>
                )}
                <div
                  tabIndex={0}
                  onPaste={handleStartProofPaste}
                  onClick={(event) => {
                    if (event.target === event.currentTarget) {
                      event.currentTarget.focus();
                    }
                  }}
                  className={styles.evidenceUploadCard}
                >
                  <div className={styles.evidenceCardHeader}>
                    <span>Start Screenshot</span>
                    <span className={`${styles.evidenceStatus} ${hasStartScreenshot ? styles.evidenceStatusReady : ""}`}>{hasStartScreenshot ? "Uploaded" : "Missing"}</span>
                  </div>
                  <span className={styles.evidenceCardText}>Meeting, participants, and system time</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!selectedClassStudentConfirmed || isUploadingStartProof || Boolean(selectedClassVerification?.start_proof_url)}
                    onChange={handleStartProofFileChange}
                    className={styles.evidenceFileInput}
                  />
                  <span className={hasStartScreenshot ? styles.evidenceReadyText : styles.evidenceHintText}>
                    {selectedClassVerification?.start_proof_url
                      ? "Start screenshot uploaded."
                      : isUploadingStartProof
                        ? "Uploading..."
                        : "Click this area and press Ctrl+V to paste, or use Choose File."}
                  </span>
                </div>
                {selectedClassVerification?.start_proof_url && (
                  <div className={styles.evidencePreview}>
                    <div className={styles.evidencePreviewActions}>
                      <a
                        href={`${API}${selectedClassVerification.start_proof_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.evidenceViewBtn}
                      >
                        View
                      </a>
                      <button
                        type="button"
                        onClick={removeStartProof}
                        disabled={isUploadingStartProof}
                        aria-label="Remove start screenshot"
                        title="Remove start screenshot"
                        className={styles.evidenceRemoveBtn}
                      >
                        x
                      </button>
                    </div>
                    <img
                      src={`${API}${selectedClassVerification.start_proof_url}`}
                      alt="Start screenshot preview"
                      className={styles.evidencePreviewImage}
                    />
                  </div>
                )}
                {selectedClassVerification?.__unused_start_proof_ui && (selectedClassVerification?.start_proof_url ? (
                  <a href={`${API}${selectedClassVerification.start_proof_url}`} target="_blank" rel="noopener noreferrer">View start screenshot ✓</a>
                ) : (
                  <label onPaste={event => {
                    const item = Array.from(event.clipboardData?.items || []).find(item => item.type.startsWith("image/"));
                    if (item && selectedClassStudentConfirmed && !isUploadingStartProof) { event.preventDefault(); uploadStartProof(item.getAsFile()); }
                  }} tabIndex={0}>
                    Start screenshot (upload within 5 minutes of student confirmation)
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!selectedClassStudentConfirmed || isUploadingStartProof} onChange={event => uploadStartProof(event.target.files?.[0])} style={{ width: "100%" }} />
                    <small>{isUploadingStartProof ? "Uploading..." : "Choose File or focus here and paste with Ctrl+V. Join the meeting first and wait for the student."}</small>
                  </label>
                ))}
                {shouldRemindEndScreenshot && <div role="alert" className={styles.verificationAlert}>Capture the end screenshot before leaving the meeting.</div>}
              </div>
            )}
            {hasVerificationRecording && (
              <div style={{ display: "grid", gap: 8 }}>
                <strong style={{ color: "#166534", fontSize: "0.85rem" }}>Recording uploaded ✓</strong>
                <a
                  href={`${API}/api/calendar/classes/${selectedClass.id}/recording?user_id=${encodeURIComponent(localUserId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderRadius: 8, padding: "12px 14px", background: "#1864ab", color: "#fff", textAlign: "center", textDecoration: "none", fontWeight: 800 }}
                >
                  View Recording
                </a>
                {!recording.session && selectedClassStarted && !selectedClassEnded && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Record a replacement? Your current recording will be replaced only after the new recording uploads successfully.")) {
                          recording.start(selectedClass.id);
                        }
                      }}
                      style={{ border: "1px solid #cfd8dc", borderRadius: 8, padding: "8px 12px", background: "#fff", color: "#344054", fontWeight: 600, cursor: "pointer" }}
                    >
                      Replace Recording
                    </button>
                    <span style={{ fontSize: "0.78rem", color: "#166534" }}>Next, write your class summary and select End, Verify &amp; Complete.</span>
                  </>
                )}
              </div>
            )}
            {(recording.session || (evidenceMode === "recording" && !hasVerificationRecording && selectedClassStarted && !selectedClassEnded)) && (
              <div style={{ display: "grid", gap: 8 }}>
                {recording.session && String(recording.session.classId) !== String(selectedClass.id) && (
                  <span>Recording for class #{recording.session.classId}</span>
                )}
                <button
                  type="button"
                  disabled={["starting", "uploading"].includes(recording.session?.status)}
                  onClick={() => recording.session?.status === "recording" ? recording.stop() : recording.session?.status === "failed" ? recording.retry() : recording.start(selectedClass.id)}
                  style={{ border: "none", borderRadius: 8, padding: "12px 14px", background: recording.session?.status === "recording" ? "#b42318" : "#1864ab", color: "#fff", fontWeight: 800, cursor: "pointer" }}
                >
                  {recording.session?.status === "recording" ? "Stop Recording" : recording.session?.status === "uploading" ? "Uploading Recording..." : recording.session?.status === "starting" ? "Starting Recording..." : recording.session?.status === "failed" ? "Retry Recording Upload" : "Start Recording"}
                </button>
                <span style={{ fontSize: "0.74rem", color: "#667085" }}>Select the meeting tab with audio. Keep Calendar open until the upload finishes.</span>
              </div>
            )}
            {selectedClassStarted && !selectedClassEnded && (
              <>
                {evidenceMode === "screenshots" && <div className={styles.evidenceGrid}>
                  <div
                    tabIndex={0}
                    onPaste={handleVerificationProofPaste}
                    onClick={(event) => {
                      if (event.target === event.currentTarget) {
                        event.currentTarget.focus();
                      }
                    }}
                    className={styles.evidenceUploadCard}
                  >
                    <div className={styles.evidenceCardHeader}>
                      <span>End Screenshot</span>
                      <span className={`${styles.evidenceStatus} ${hasEndScreenshot ? styles.evidenceStatusReady : ""}`}>{hasEndScreenshot ? "Ready" : "Missing"}</span>
                    </div>
                    <span className={styles.evidenceCardText}>Meeting, participants, and system time</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleVerificationProofFileChange}
                      className={styles.evidenceFileInput}
                    />
                    <span className={hasEndScreenshot ? styles.evidenceReadyText : styles.evidenceHintText}>
                      {hasEndScreenshot ? "End screenshot ready." : "Click this area and press Ctrl+V to paste, or use Choose File."}
                    </span>
                  </div>
                </div>}
                {evidenceMode === "screenshots" && hasEndScreenshot && (
                  <div className={styles.evidencePreview}>
                    <div className={styles.evidencePreviewActions}>
                      <button
                        type="button"
                        onClick={() => openScreenshotPreview(verificationProofPreview || `${API}${verificationProofUrl}`)}
                        className={styles.evidenceViewBtn}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={clearVerificationProofImage}
                        aria-label="Remove end screenshot"
                        title="Remove end screenshot"
                        className={styles.evidenceRemoveBtn}
                      >
                        x
                      </button>
                    </div>
                    <img
                      src={verificationProofPreview || `${API}${verificationProofUrl}`}
                      alt="End screenshot preview"
                      className={styles.evidencePreviewImage}
                    />
                  </div>
                )}
                <div className={styles.verificationSectionTitle}>Class Summary</div>
                <textarea
                  value={verificationSummary}
                  onChange={(event) => setVerificationSummary(event.target.value)}
                  rows={3}
                  placeholder="Write at least one complete sentence about what happened in class."
                  className={styles.verificationTextarea}
                />
                <span className={hasVerificationSummarySentence ? styles.evidenceReadyText : styles.evidenceWarningText}>
                  Summary must be at least one complete sentence.
                </span>
                {evidenceMode === "__unused_screenshots" && <div
                  tabIndex={0}
                  onPaste={handleVerificationProofPaste}
                  onClick={(event) => {
                    if (event.target === event.currentTarget) {
                      event.currentTarget.focus();
                    }
                  }}
                  style={{ display: "grid", gap: 6, fontSize: "0.82rem", fontWeight: 700, color: "#344054", outline: "none" }}
                >
                  <span>End screenshot — meeting, participants, and system time</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleVerificationProofFileChange}
                    style={{ width: "100%", boxSizing: "border-box", padding: 9, border: "1px solid #cfd8dc", borderRadius: 8, fontFamily: "inherit", background: "#fff" }}
                  />
                  <span style={{ fontSize: "0.74rem", fontWeight: 600, color: "#667085" }}>
                    Click this area and press Ctrl+V to paste, or use Choose File.
                  </span>
                </div>}
                {evidenceMode === "__unused_screenshots" && (verificationProofPreview || verificationProofUrl) && (
                  <div style={{ position: "relative", border: "1px solid #dbe4ea", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, alignItems: "center", zIndex: 1 }}>
                      <button
                        type="button"
                        onClick={() => openScreenshotPreview(verificationProofPreview || `${API}${verificationProofUrl}`)}
                        style={{ border: "none", borderRadius: 999, background: "rgba(15, 23, 42, 0.82)", color: "#fff", padding: "5px 10px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={clearVerificationProofImage}
                        aria-label="Remove end screenshot"
                        title="Remove end screenshot"
                        style={{
                          width: 28,
                          height: 28,
                          border: "none",
                          borderRadius: "50%",
                          background: "rgba(15, 23, 42, 0.82)",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 18,
                          lineHeight: "28px",
                          fontWeight: 800,
                        }}
                      >
                        x
                      </button>
                    </div>
                    <img
                      src={verificationProofPreview || `${API}${verificationProofUrl}`}
                      alt="Class proof screenshot preview"
                      style={{ display: "block", width: "100%", maxHeight: 180, objectFit: "contain", background: "#f8fafc" }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className={`${styles.bookBtn} ${styles.doneBtn}`}
                  disabled={!canEndVerifyAndComplete}
                  onClick={() => endSelectedClassSession({ completeAfterVerify: true })}
                  title={endVerifyDisabledReason}
                  style={{
                    opacity: canEndVerifyAndComplete ? 1 : 0.6,
                    cursor: canEndVerifyAndComplete ? "pointer" : "not-allowed",
                  }}
                >
                  {isUpdatingVerification ? "Saving..." : "End, Verify & Complete"}
                </button>
                {endVerifyDisabledReason && (
                  <span className={styles.verificationMissingText}>
                    Missing: {missingVerificationItems.length ? missingVerificationItems.join(", ") : endVerifyDisabledReason}
                  </span>
                )}
                {canSubmitClassForReview && (
                  <div className={styles.reviewActionBox}>
                    <div className={styles.reviewActionText}>
                      Use admin review only when attendance or proof is missing, late, incomplete, or the recording failed.
                    </div>
                    <label className={styles.reviewReasonField}>
                      Explain what happened
                      <textarea
                        value={reviewReason}
                        onChange={(event) => setReviewReason(event.target.value)}
                        rows={3}
                        placeholder="Example: The student joined late, so the start screenshot was not captured within 5 minutes."
                        className={styles.reviewReasonTextarea}
                      />
                    </label>
                    <button type="button" className={`${styles.bookBtn} ${styles.reviewBtn}`} onClick={() => {
                      const reason = reviewReason.trim();
                      if (!reason) {
                        notify?.("Please explain why this class needs admin review.", "warning");
                        return;
                      }
                      endSelectedClassSession({ reviewReason: reason });
                    }} disabled={!reviewReason.trim() || isUpdatingVerification}>
                      {isUpdatingVerification ? "Sending..." : "Send to Admin Review"}
                    </button>
                    {!reviewReason.trim() && (
                      <div className={styles.reviewReasonHint}>Required before sending to admin.</div>
                    )}
                  </div>
                )}
              </>
            )}
            {selectedClassEnded && selectedClassVerified && (
              <button
                type="button"
                className={`${styles.bookBtn} ${styles.doneBtn}`}
                disabled={isMarkingClassDone}
                onClick={() => handleConfirmClassDone()}
                style={{ opacity: isMarkingClassDone ? 0.6 : 1 }}
              >
                {isMarkingClassDone ? "Saving..." : "Complete Verified Class"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isInitialCalendarLoading) {
    return (
      <main className={styles.page}>
        <section className={styles.loadingScreen} aria-live="polite" aria-busy="true">
          <div className={styles.loadingCalendar}>
            <div className={styles.loadingCalendarHeader}>
              <span></span>
              <span></span>
            </div>
            <div className={styles.loadingCalendarGrid}>
              {Array.from({ length: 35 }).map((_, index) => (
                <span key={index}></span>
              ))}
            </div>
          </div>
          <div className={styles.loadingText}>
            <h1>Loading calendar</h1>
            <p>Preparing your schedule...</p>
          </div>
        </section>
      </main>
    );
  }

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
                const isTodayCell = formatted === viewerTodayKey;
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
                  {renderVerificationPanel()}
                  {isTeacherOrAdmin && (
                    <div style={remarkSectionStyle}>
                      <div style={remarkHeadingStyle}>Latest Remark</div>
                      {latestRemark ? (
                        <div style={remarkCardStyle}>
                          <div style={remarkTitleStyle}>
                            {latestRemark.class_name || "Class"}
                          </div>
                          <div style={remarkMetaStyle}>
                            {latestRemark.class_name || "Class"}{" "}
                            {formatRemarkDate(latestRemark.scheduled_date) || "Date unavailable"}
                            {latestRemark.start_time ? ` - ${humanTime(latestRemark.start_time)}` : ""}
                          </div>
                          <div style={remarkBodyStyle}>
                            {latestRemark.remarks || "No remark text"}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: 10, fontSize: "0.82rem", color: "#587068", background: "#f6fbf8", border: "1px solid #d7e5d9", borderRadius: 18 }}>
                          No remarks yet.
                        </div>
                      )}
                    </div>
                  )}
                  {canShowClassEntryAction && (
                    <button
                      type="button"
                      disabled={isClassEntryDisabled}
                      onClick={enterSelectedClass}
                      className={`${styles.bookBtn} ${styles.joinBtn}`}
                      style={{
                        textAlign: "center",
                        display: "block",
                        width: "100%",
                        cursor: isClassEntryDisabled ? "not-allowed" : "pointer",
                        opacity: isClassEntryDisabled ? 0.5 : 1,
                        filter: isClassEntryDisabled ? "grayscale(100%)" : "none",
                      }}
                      title={selectedClassEntryTitle}
                    >
                      {selectedClassEntryLabel}
                    </button>
                  )}
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
                  { canShowRescheduleAction && (
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
                  { requestMode && !selectedClassEnded && (
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
                        <button type="button" onClick={openRequestConfirmation} disabled={isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError} style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "not-allowed" : "pointer" }}>
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
                          {(cls.teacherFullName || cls.teacherName || cls.teacher) && (
                            <div style={{ fontSize: "0.85em", color: "#666" }}>
                              Teacher: {cls.teacherFullName || cls.teacherName || cls.teacher}
                            </div>
                          )}
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
                            setAvailabilityDate(viewerTodayKey);
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
                    <div className={styles.availabilityManager} style={{ marginTop: 16, padding: 14, border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa" }}>
                      <div style={{ marginBottom: 12 }}>
                        <h4 style={{ margin: "0 0 8px 0", fontSize: "0.95rem", color: "#333" }}>Set Your Schedule</h4>
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#666", lineHeight: 1.4 }}>
                          Set your available times from today up to 3 months ahead. You cannot set availability on dates with existing bookings or past dates.
                        </p>
                      </div>

                      {availabilityError && (
                        <div style={{ marginBottom: 10, padding: 10, background: "#ffebee", border: "1px solid #ffcdd2", borderRadius: 6, color: "#c62828", fontSize: "0.8rem" }}>
                          {availabilityError}
                        </div>
                      )}

                      <div style={{ marginBottom: 12, display: "grid", gap: 10 }}>
                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Apply To *</label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityApplyMode("single");
                                setAvailabilityError("");
                              }}
                              style={{
                                padding: "8px 10px",
                                fontSize: "0.85rem",
                                border: availabilityApplyMode === "single" ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                borderRadius: 6,
                                background: availabilityApplyMode === "single" ? "#e8f5e9" : "#fff",
                                color: availabilityApplyMode === "single" ? "#2E7D32" : "#555",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Single Day
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityApplyMode("bulk");
                                setAvailabilityError("");
                              }}
                              style={{
                                padding: "8px 10px",
                                fontSize: "0.85rem",
                                border: availabilityApplyMode === "bulk" ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                borderRadius: 6,
                                background: availabilityApplyMode === "bulk" ? "#e8f5e9" : "#fff",
                                color: availabilityApplyMode === "bulk" ? "#2E7D32" : "#555",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Weekly Pattern
                            </button>
                          </div>
                        </div>

                        {availabilityApplyMode === "bulk" && (
                          <div>
                            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Weekdays *</label>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 5 }}>
                              {[
                                [0, "Sun"],
                                [1, "Mon"],
                                [2, "Tue"],
                                [3, "Wed"],
                                [4, "Thu"],
                                [5, "Fri"],
                                [6, "Sat"],
                              ].map(([weekday, label]) => {
                                const active = bulkAvailabilityWeekdays.includes(weekday);
                                return (
                                  <button
                                    key={weekday}
                                    type="button"
                                    onClick={() => toggleBulkAvailabilityWeekday(weekday)}
                                    style={{
                                      padding: "8px 4px",
                                      fontSize: "0.72rem",
                                      border: active ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                      borderRadius: 6,
                                      background: active ? "#e8f5e9" : "#fff",
                                      color: active ? "#2E7D32" : "#555",
                                      cursor: "pointer",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666" }}>
                              Applies to {bulkAvailabilityDates.length} date{bulkAvailabilityDates.length === 1 ? "" : "s"} in {monthName} {year}
                            </div>
                          </div>
                        )}

                        {availabilityApplyMode === "single" && (
                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Date *</label>
<div style={{ width: "100%", padding: "10px", fontSize: "0.95rem", border: "1px solid #d0d0d0", borderRadius: 6, background: "#fff", minHeight: "42px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                             <div style={{ color: availabilityDate ? "#111" : "#666" }}>
                               {availabilityDate ? new Date(availabilityDate + "T00:00:00").toLocaleDateString() : "Select a date on the calendar"}
                             </div>
                           </div>
                           <div style={{ fontSize: "0.7rem", color: "#999", marginTop: 4 }}>Click a day on the calendar</div>
                           <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666" }}>
                            Dates allowed from today to {new Date(scheduleWindowEndKey + "T00:00:00").toLocaleDateString()}
                          </div>
                          {getAvailabilityFieldError("availabilityDate") && (
                            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#d32f2f" }}>
                              {getAvailabilityFieldError("availabilityDate")}
                            </div>
                          )}
                        </div>
                        )}

                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Availability Status *</label>
                          <div className={styles.availabilityStatus} style={{ display: "flex", gap: 12 }}>
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
                              
                              <div className={styles.breakTimeFields} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
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

                      <div className={styles.availabilityActions} style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 16 }}>
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
                          onClick={openAvailabilityConfirmation}
                          disabled={isSubmittingAvailability}
                          style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: isSubmittingAvailability ? "#999" : "#4CAF50", color: "#fff", borderRadius: 6, cursor: isSubmittingAvailability ? "not-allowed" : "pointer" }}
                        >
                          {isSubmittingAvailability ? "Saving..." : "Save Availability"}
                        </button>
                      </div>

                      {/* Show visible month's availability records */}
                      {teacherAvailabilityList && teacherAvailabilityList.length > 0 && (
                        <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: 12 }}>
                          <h5 style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "#333", fontWeight: 600 }}>
                            Your Availability for {monthName}
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
                                <div className={styles.availabilityRecordHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <strong style={{ display: "block", lineHeight: 1.25 }}>{formatScheduleDate(record.available_date)}</strong>
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        marginTop: 4,
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        background: record.status === "available" ? "#d8e8df" : "#fde2e2",
                                        color: record.status === "available" ? "#26423b" : "#b91c1c",
                                        fontSize: "0.72rem",
                                        fontWeight: 700,
                                        lineHeight: 1.3,
                                      }}
                                    >
                                      {record.status === "available" ? "Available" : "Unavailable"}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteTeacherAvailability(record.id || record.availability_id)}
                                    style={{
                                      padding: "6px 10px",
                                      fontSize: "0.75rem",
                                      fontWeight: 700,
                                      border: "none",
                                      background: "#f44336",
                                      color: "#fff",
                                      borderRadius: 4,
                                      cursor: "pointer",
                                      minWidth: 62,
                                      lineHeight: 1,
                                      whiteSpace: "nowrap",
                                      flex: "0 0 auto",
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                                {record.status === "available" && (record.start_time || record.end_time) ? (
                                  <div style={{ color: "#555", marginTop: 6, lineHeight: 1.5 }}>
                                    <div style={{ fontWeight: 700 }}>{humanTime(record.start_time)} - {humanTime(record.end_time)}</div>
                                    {record.break_start && record.break_end && (
                                      <div style={{ color: "#666", fontSize: "0.75rem", marginTop: 4 }}>Break: {humanTime(record.break_start)} - {humanTime(record.break_end)}</div>
                                    )}
                                  </div>
                                ) : record.status === "available" ? (
                                  <div style={{ color: "#555", marginTop: 6, lineHeight: 1.5 }}>
                                    Available all day
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
                      {selectedTeacherFullName && (
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
                      <div style={remarkSectionStyle}>
                        <div style={remarkHeadingStyle}>Latest Remark</div>
                        <div style={remarkCardStyle}>
                          <div style={remarkTitleStyle}>
                            {latestRemark.class_name || "Class"}
                          </div>
                          <div style={remarkMetaStyle}>
                            {latestRemark.class_name || "Class"}{" "}
                            {formatRemarkDate(latestRemark.scheduled_date) || "Date unavailable"}
                            {latestRemark.start_time ? ` - ${humanTime(latestRemark.start_time)}` : ""}
                          </div>
                          <div style={remarkBodyStyle}>
                            {latestRemark.remarks || "No remark text"}
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                    {renderVerificationPanel()}
                    {canShowClassEntryAction && (
                      <button
                        disabled={isClassEntryDisabled}
                        onClick={enterSelectedClass}
                        className={`${styles.bookBtn} ${styles.joinBtn}`}
                        style={{
                          textAlign: "center",
                          display: "block",
                          width: "100%",
                          cursor: isClassEntryDisabled ? "not-allowed" : "pointer",
                          opacity: isClassEntryDisabled ? 0.5 : 1,
                          filter: isClassEntryDisabled ? "grayscale(100%)" : "none",
                        }}
                        title={selectedClassEntryTitle}
                      >
                        {selectedClassEntryLabel}
                      </button>
                    )}
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
                    {canShowRescheduleAction && (
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
                    )}
                    { requestMode && !selectedClassEnded && (
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
                        <button type="button" onClick={openRequestConfirmation} disabled={isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError} style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", background: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 6, cursor: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "not-allowed" : "pointer" }}>
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
                            {(cls.teacherFullName || cls.teacherName || cls.teacher) && (
                              <div style={{ fontSize: "0.85em", color: "#666" }}>
                                Teacher: {cls.teacherFullName || cls.teacherName || cls.teacher}
                              </div>
                            )}
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
                    <div className={styles.legendTitle}>Book Classes</div>
                    <div className={styles.slotList}>
                      <div style={{ padding: 12, color: "#333", fontSize: "0.95em" }}>
                        {assignedTeacherName ? (
                          <p style={{ margin: 0 }}>Choose a date and time for {assignedTeacherName}. Dates are available from today up to 3 months ahead.</p>
                        ) : (
                          <p style={{ margin: 0 }}>You don&apos;t have an assigned teacher yet. Contact support to enable booking.</p>
                        )}
                      </div>
                      <div style={{ display: "grid", gap: 12 }}>
                        <div>
                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Booking Mode *</label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <button
                              type="button"
                            onClick={() => {
                              setStudentBookingApplyMode("manual");
                              setStudentBookingError("");
                              setStudentBookingSuggestions([]);
                            }}
                              style={{
                                padding: "8px 10px",
                                fontSize: "0.85rem",
                                border: studentBookingApplyMode === "manual" ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                borderRadius: 6,
                                background: studentBookingApplyMode === "manual" ? "#e8f5e9" : "#fff",
                                color: studentBookingApplyMode === "manual" ? "#2E7D32" : "#555",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Manual Slots
                            </button>
                            <button
                              type="button"
                            onClick={() => {
                              setStudentBookingApplyMode("weekly");
                              setStudentBookingError("");
                              setStudentBookingSuggestions([]);
                            }}
                              style={{
                                padding: "8px 10px",
                                fontSize: "0.85rem",
                                border: studentBookingApplyMode === "weekly" ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                borderRadius: 6,
                                background: studentBookingApplyMode === "weekly" ? "#e8f5e9" : "#fff",
                                color: studentBookingApplyMode === "weekly" ? "#2E7D32" : "#555",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Weekly Pattern
                            </button>
                          </div>
                        </div>

                        {studentBookingApplyMode === "weekly" && studentBookingSelectionFull && (
                          <div style={{ display: "grid", gap: 6, padding: "10px 11px", border: "1px solid #d7e5d9", borderRadius: 8, background: "#f6fbf8", color: "#26423b" }}>
                            <div style={{ fontSize: "0.82rem", fontWeight: 800 }}>Selection full</div>
                            <div style={{ fontSize: "0.74rem", lineHeight: 1.35, color: "#5e7268" }}>
                              You selected all {studentBookingLimit} bookable class{studentBookingLimit === 1 ? "" : "es"}. Remove a class or clear selected to search again.
                            </div>
                          </div>
                        )}

                        {studentBookingApplyMode === "weekly" && !studentBookingSelectionFull && (
                          <div style={{ display: "grid", gap: 10, padding: 10, border: "1px solid #d7e5d9", borderRadius: 8, background: "#f6fbf8" }}>
                            {studentBookingSuggestions.length > 0 ? (
                              <div style={{ display: "grid", gap: 8, padding: "10px 11px", border: "1px solid #d7e5d9", borderRadius: 6, background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ color: "#5e7268", fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.25 }}>Search Criteria</div>
                                    <div style={{ color: "#10231d", fontSize: "0.86rem", fontWeight: 800, lineHeight: 1.3, marginTop: 3 }}>
                                      {studentBookingWeeklyWeekdays
                                        .map((weekday) => WEEKDAY_OPTIONS.find(([value]) => value === weekday)?.[1])
                                        .filter(Boolean)
                                        .join(", ")} at {humanTime(studentBookingWeeklyTime)}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStudentBookingSuggestions([]);
                                      setStudentBookingError("");
                                    }}
                                    style={{ border: "1px solid #91a79a", background: "#fff", color: "#26423b", borderRadius: 6, padding: "6px 9px", cursor: "pointer", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap" }}
                                  >
                                    Edit Search
                                  </button>
                                </div>
                                {studentBookingSelections.length > 0 && (
                                  <div style={{ color: "#66756e", fontSize: "0.72rem", lineHeight: 1.35 }}>
                                    Suggestions skip times that overlap with selected classes.
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                <div>
                                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Weekdays *</label>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 5 }}>
                                    {WEEKDAY_OPTIONS.map(([weekday, label]) => {
                                      const active = studentBookingWeeklyWeekdays.includes(weekday);
                                      return (
                                        <button
                                          key={weekday}
                                          type="button"
                                          onClick={() => toggleStudentBookingWeekday(weekday)}
                                          style={{
                                            padding: "8px 4px",
                                            fontSize: "0.72rem",
                                            border: active ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                            borderRadius: 6,
                                            background: active ? "#e8f5e9" : "#fff",
                                            color: active ? "#2E7D32" : "#555",
                                            cursor: "pointer",
                                            fontWeight: 700,
                                          }}
                                        >
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Preferred Time *</label>
                                  <input
                                    type="time"
                                    value={studentBookingWeeklyTime}
                                    onChange={e => {
                                      setStudentBookingWeeklyTime(normalizeTime(e.target.value));
                                      setStudentBookingError("");
                                    }}
                                    style={{ width: "100%", padding: "8px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit", background: "#fff" }}
                                  />
                                  <div style={{ fontSize: "0.7rem", color: "#666", marginTop: 4 }}>
                                    The system will suggest the closest available teacher slot for each selected weekday.
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={applyStudentWeeklyPattern}
                                  disabled={isSubmittingStudentBooking || hasNoClassesLeft}
                                  style={{ padding: "10px 12px", fontSize: "0.85rem", fontWeight: 700, border: "none", borderRadius: 6, background: "#2E7D32", color: "#fff", cursor: (isSubmittingStudentBooking || hasNoClassesLeft) ? "not-allowed" : "pointer", opacity: (isSubmittingStudentBooking || hasNoClassesLeft) ? 0.6 : 1 }}
                                >
                                  Find Closest Slots
                                </button>
                                <div style={{ fontSize: "0.72rem", color: "#666", lineHeight: 1.4 }}>
                                  Finds matching teacher availability from today up to 3 months ahead, capped by your remaining classes.
                                </div>
                                {studentBookingSelections.length > 0 && (
                                  <div style={{ padding: "8px 10px", border: "1px solid #d7e5d9", borderRadius: 6, background: "#fff", color: "#5e7268", fontSize: "0.74rem", lineHeight: 1.35 }}>
                                    New suggestions will skip times that overlap with your selected classes.
                                  </div>
                                )}
                              </>
                            )}
                            {studentBookingSuggestions.length > 0 && (
                              <div style={{ display: "grid", gap: 8, paddingTop: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#333" }}>
                                    Suggested Slots ({studentBookingSuggestions.length})
                                  </label>
                                  <button
                                    type="button"
                                    onClick={addStudentBookingSuggestions}
                                    disabled={isSubmittingStudentBooking || hasNoClassesLeft}
                                    style={{ padding: "6px 9px", fontSize: "0.72rem", fontWeight: 700, border: "1px solid #4CAF50", borderRadius: 6, background: "#fff", color: "#2E7D32", cursor: (isSubmittingStudentBooking || hasNoClassesLeft) ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                                  >
                                    Add Earliest
                                  </button>
                                </div>
                                <div style={{ display: "grid", gap: 7, maxHeight: 230, overflowY: "auto", paddingRight: 3 }}>
                                  {studentBookingSuggestions.map((slot) => {
                                    const slotEnd = timeToMinutes(slot.time) == null ? "" : minutesToTime(timeToMinutes(slot.time) + studentClassDuration);
                                    const selected = isStudentBookingSelected(slot.date, slot.time);
                                    const limitReached = studentBookingSelections.length >= studentBookingLimit;
                                    const timeDistance = describeTimeDistance(slot.requested_time, slot.time);
                                    return (
                                      <div
                                        key={studentBookingSelectionKey(slot.date, slot.time)}
                                        style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10, padding: "10px 11px", border: selected ? "2px solid #4CAF50" : "1px solid #cddfd2", borderRadius: 6, background: selected ? "#e8f5e9" : "#fff", fontSize: "0.8rem" }}
                                      >
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ color: "#5e7268", fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.25 }}>
                                            {formatLongDate(slot.date)}
                                          </div>
                                          <div style={{ color: "#10231d", fontWeight: 800, fontSize: "0.88rem", lineHeight: 1.3, marginTop: 3 }}>
                                            {humanTime(slot.time)}{slotEnd ? ` - ${humanTime(slotEnd)}` : ""}
                                          </div>
                                          <div style={{ color: "#66756e", marginTop: 4, lineHeight: 1.3 }}>
                                            Preferred {humanTime(slot.requested_time)}
                                            {timeDistance ? ` · ${timeDistance}` : ""}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => addStudentBookingSuggestion(slot)}
                                          disabled={selected || limitReached}
                                          style={{ border: "1px solid #4CAF50", background: selected ? "#4CAF50" : "#fff", color: selected ? "#fff" : "#2E7D32", borderRadius: 6, padding: "6px 9px", cursor: (selected || limitReached) ? "not-allowed" : "pointer", fontSize: "0.74rem", fontWeight: 700, opacity: (!selected && limitReached) ? 0.55 : 1 }}
                                        >
                                          {selected ? "Added" : "Add"}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {studentBookingApplyMode === "manual" && (
                        <>
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
                          <div style={{ fontSize: "0.72rem", color: "#666", marginBottom: 6 }}>
                            Select one or more slots. Overlapping slots are blocked automatically.
                          </div>
                          {availability[studentBookingDate] === "unavailable" ? (
                            <div style={{ padding: 12, background: "#fff3e0", borderRadius: 8, color: "#b65f00" }}>
                              Teacher is unavailable on this date.
                            </div>
                          ) : availableTimeSlots && availableTimeSlots.length > 0 ? (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                              {availableTimeSlots.map(time => {
                                const isBooked = isTeacherDateTimeBooked(studentBookingDate, time);
                                const isSelected = isStudentBookingSelected(studentBookingDate, time);
                                return (
                                  <button
                                    key={time}
                                    type="button"
                                    onClick={() => {
                                      if (!isBooked) {
                                        setStudentBookingTime(time);
                                        toggleStudentBookingSelection(studentBookingDate, time);
                                      }
                                    }}
                                    disabled={isBooked}
                                    style={{
                                      padding: "12px 14px",
                                      border: isSelected ? "2px solid #4CAF50" : "1px solid #d0d0d0",
                                      borderRadius: "8px",
                                      background: isSelected ? "#e8f5e9" : isBooked ? "#f8f8f8" : "#fff",
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
                              No available slots found for this date. Choose another day within the scheduling window.
                            </div>
                          )}
                        </div>
                        </>
                        )}
                        {studentBookingSelections.length > 0 && (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#333" }}>
                                Selected Classes ({studentBookingSelections.length}/{studentBookingLimit})
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setStudentBookingSelections([]);
                                  setStudentBookingTime("");
                                  setStudentBookingError("");
                                }}
                                disabled={isSubmittingStudentBooking}
                                style={{ border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, padding: "4px 7px", cursor: isSubmittingStudentBooking ? "not-allowed" : "pointer", fontSize: "0.72rem", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}
                              >
                                Clear Selected
                              </button>
                            </div>
                            <div style={{ display: "grid", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                              {studentBookingSelections.map((slot) => {
                                const slotEnd = timeToMinutes(slot.time) == null ? "" : minutesToTime(timeToMinutes(slot.time) + studentClassDuration);
                                return (
                                  <div
                                    key={studentBookingSelectionKey(slot.date, slot.time)}
                                    style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10, padding: "10px 11px", border: "1px solid #d7e5d9", borderRadius: 6, background: "#f6fbf8", fontSize: "0.82rem" }}
                                  >
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ color: "#5e7268", fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.25 }}>
                                        {formatLongDate(slot.date)}
                                      </div>
                                      <div style={{ color: "#10231d", fontWeight: 800, fontSize: "0.88rem", lineHeight: 1.3, marginTop: 3 }}>
                                        {humanTime(slot.time)}{slotEnd ? ` - ${humanTime(slotEnd)}` : ""}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleStudentBookingSelection(slot.date, slot.time)}
                                      style={{ border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700 }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
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
                            onClick={() => {
                              setStudentBookingMode(false);
                              setStudentBookingSelections([]);
                              setStudentBookingSuggestions([]);
                            }}
                            disabled={isSubmittingStudentBooking}
                            style={{ padding: "10px 16px", fontSize: "0.9em", border: "1px solid #d0d0d0", background: "#fff", borderRadius: 6, cursor: isSubmittingStudentBooking ? "not-allowed" : "pointer" }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={openStudentBookingConfirmation}
                            disabled={isSubmittingStudentBooking || studentBookingSelections.length === 0 || assignedTeacherId == null || hasNoClassesLeft}
                            style={{ padding: "10px 16px", fontSize: "0.9em", border: "none", background: "#4CAF50", color: "#fff", borderRadius: 6, cursor: (isSubmittingStudentBooking || studentBookingSelections.length === 0 || assignedTeacherId == null || hasNoClassesLeft) ? "not-allowed" : "pointer" }}
                          >
                            {isSubmittingStudentBooking ? "Booking..." : studentBookingSelections.length > 1 ? `Book ${studentBookingSelections.length} Classes` : "Book Class"}
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
                        <div style={{ fontSize: 14, color: "#666" }}>Classes Left</div>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3, fontSize: 22, fontWeight: 750, marginTop: 6, lineHeight: 1.15, letterSpacing: 0, color: "#5f7f70" }}>
                          <span>{effectiveClassesLeft}</span>
                          <span style={{ fontSize: 20, fontWeight: 500, color: "#5f7f70" }}>/</span>
                          <span>{effectiveClassesLimit}</span>
                        </div>
                        <div style={{ marginTop: 6, color: "#374151", fontSize: 14, fontWeight: 600 }}>
                          Available to book: {effectiveBookableClasses}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <div style={{ height: 8, background: "#eef2ff", borderRadius: 8, overflow: "hidden" }}>
                            <div style={{ width: `${effectivePercent}%`, height: "100%", background: "#5f7f70" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
                      {hasNoActiveStudentPackage
                        ? "No active contract is available."
                        : contractExhausted
                          ? "All classes in this contract have been used."
                          : allRemainingClassesReserved
                            ? "All remaining classes are already scheduled. Reschedule or cancel a booked class to free a slot."
                            : "Tip: Contact your teacher to add or reschedule classes."}
                    </div>
                    {canRequestNewContract && (
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
                        Book Classes
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
    {classEntryConfirmOpen && selectedClass && (
      <div
        role="presentation"
        className={styles.confirmOverlay}
        onClick={() => setClassEntryConfirmOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="class-entry-confirm-title"
          className={styles.classEntryDialog}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={`${styles.classEntryBadge} ${classEntryConfirmMode === "screenshots" ? styles.classEntryBadgeScreenshots : styles.classEntryBadgeRecording}`}>
            {classEntryConfirmContent.badge}
          </div>
          <h3 id="class-entry-confirm-title">{classEntryConfirmContent.title}</h3>
          <p>{classEntryConfirmContent.message}</p>

          <div className={styles.classEntryDetails}>
            <div>
              <span>Class</span>
              <strong>{selectedClass.className || selectedClass.class_name || "Selected class"}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>{humanTime(selectedClass.start_time || selectedClass.time)} - {humanTime(selectedClass.end_time) || getEndTime(selectedClass.start_time || selectedClass.time, selectedClass.duration)}</strong>
            </div>
          </div>

          <ul className={styles.classEntryChecklist}>
            {classEntryConfirmContent.details.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div className={styles.classEntryTerms}>
            By joining this class, you agree to the class verification terms and evidence requirements.
          </div>

          <div className={styles.classEntryActions}>
            <button type="button" className={styles.confirmSecondaryBtn} onClick={() => setClassEntryConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className={styles.confirmPrimaryBtn} onClick={continueSelectedClassEntry}>
              {classEntryConfirmContent.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )}
    {availabilityConfirmOpen && (
      <div
        role="presentation"
        onClick={() => {
          if (!isSubmittingAvailability) setAvailabilityConfirmOpen(false);
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
          aria-labelledby="availability-confirm-title"
          onClick={(event) => event.stopPropagation()}
          style={{
            width: "min(460px, 100%)",
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
              background: "#e8f5e9",
              color: "#2e7d32",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              marginBottom: 14,
            }}
          >
            SCH
          </div>
          <h3 id="availability-confirm-title" style={{ margin: "0 0 8px", fontSize: "1.15rem", color: "#111827" }}>
            Confirm availability
          </h3>
          <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.5, fontSize: "0.92rem" }}>
            Please review the schedule before saving it.
          </p>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#f9fafb",
              padding: "12px 14px",
              marginBottom: 20,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827" }}>
              {availabilityApplyMode === "bulk"
                ? `${monthName} ${year}: ${bulkAvailabilityDates.length} date${bulkAvailabilityDates.length === 1 ? "" : "s"}`
                : availabilityDate ? new Date(availabilityDate + "T00:00:00").toLocaleDateString() : "Selected date"}
            </div>
            {availabilityApplyMode === "bulk" && (
              <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
                Days: {[
                  [0, "Sun"],
                  [1, "Mon"],
                  [2, "Tue"],
                  [3, "Wed"],
                  [4, "Thu"],
                  [5, "Fri"],
                  [6, "Sat"],
                ].filter(([weekday]) => bulkAvailabilityWeekdays.includes(weekday)).map(([, label]) => label).join(", ")}
              </div>
            )}
            <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
              Status: {availabilityStatus === "available" ? "Available" : "Unavailable"}
            </div>
            {availabilityStatus === "available" && (
              <>
                <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
                  Time: {humanTime(availabilityStartTime)} - {humanTime(availabilityEndTime)}
                </div>
                <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
                  Break: {availabilityBreakStart && availabilityBreakEnd ? `${humanTime(availabilityBreakStart)} - ${humanTime(availabilityBreakEnd)}` : "None"}
                </div>
              </>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setAvailabilityConfirmOpen(false)}
              disabled={isSubmittingAvailability}
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                borderRadius: 8,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: isSubmittingAvailability ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmTeacherAvailability}
              disabled={isSubmittingAvailability}
              style={{
                border: "none",
                background: "#2e7d32",
                color: "#fff",
                borderRadius: 8,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: isSubmittingAvailability ? "not-allowed" : "pointer",
                boxShadow: "0 8px 18px rgba(46, 125, 50, 0.22)",
              }}
            >
              {isSubmittingAvailability ? "Saving..." : "Save Availability"}
            </button>
          </div>
        </div>
      </div>
    )}
    {requestConfirmOpen && selectedClass && (
      <div
        role="presentation"
        onClick={() => {
          if (!isSubmittingRequest) setRequestConfirmOpen(false);
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
          aria-labelledby="reschedule-confirm-title"
          onClick={(event) => event.stopPropagation()}
          style={{
            width: "min(460px, 100%)",
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
            RS
          </div>
          <h3 id="reschedule-confirm-title" style={{ margin: "0 0 8px", fontSize: "1.15rem", color: "#111827" }}>
            Send reschedule request?
          </h3>
          <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.5, fontSize: "0.92rem" }}>
            This will send the request to {localRole === "teacher" ? "the student" : "your teacher"} for review.
          </p>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#f9fafb",
              padding: "12px 14px",
              marginBottom: 20,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827" }}>
              {selectedClass.className || "Selected class"}
            </div>
            <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
              Current: {selectedClass.scheduled_date ? new Date(selectedClass.scheduled_date + "T00:00:00").toLocaleDateString() : "Current date"} at {humanTime(selectedClass.start_time || selectedClass.time)}
            </div>
            <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
              Requested: {requestDate ? new Date(requestDate + "T00:00:00").toLocaleDateString() : "Not selected"} at {humanTime(requestTime)}{requestEndTime ? ` - ${humanTime(requestEndTime)}` : ""}
            </div>
            <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
              Duration: {selectedClassDuration} minutes
            </div>
            <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
              {localRole === "teacher" ? "Student" : "Teacher"}: {localRole === "teacher" ? selectedClass.studentName || selectedClass.studentFullName || "Student" : selectedTeacherFullName || "Teacher"}
            </div>
            <div style={{ fontSize: "0.88rem", color: "#4b5563", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
              Reason: {requestReason.trim()}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setRequestConfirmOpen(false)}
              disabled={isSubmittingRequest}
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                borderRadius: 8,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: isSubmittingRequest ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRequestReschedule}
              disabled={isSubmittingRequest}
              style={{
                border: "none",
                background: "#4338ca",
                color: "#fff",
                borderRadius: 8,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: isSubmittingRequest ? "not-allowed" : "pointer",
                boxShadow: "0 8px 18px rgba(67, 56, 202, 0.22)",
              }}
            >
              {isSubmittingRequest ? "Sending..." : "Send Request"}
            </button>
          </div>
        </div>
      </div>
    )}
    {studentBookingConfirmOpen && (
      <div
        role="presentation"
        onClick={() => {
          if (!isSubmittingStudentBooking) setStudentBookingConfirmOpen(false);
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
          aria-labelledby="student-booking-confirm-title"
          onClick={(event) => event.stopPropagation()}
          style={{
            width: "min(430px, 100%)",
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
              background: "#e8f5e9",
              color: "#2e7d32",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              marginBottom: 14,
            }}
          >
            OK
          </div>
          <h3 id="student-booking-confirm-title" style={{ margin: "0 0 8px", fontSize: "1.15rem", color: "#111827" }}>
            Confirm class booking
          </h3>
          <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.5, fontSize: "0.92rem" }}>
            Please review your class schedule before booking.
          </p>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#f9fafb",
              padding: "12px 14px",
              marginBottom: 20,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827" }}>
              {studentProfile?.course_name || "General English"}
            </div>
            <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
              Classes: {studentBookingSelections.length}
            </div>
            <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
              {studentBookingSelections.map((slot) => {
                const slotEnd = timeToMinutes(slot.time) == null ? "" : minutesToTime(timeToMinutes(slot.time) + studentClassDuration);
                return (
                  <div key={studentBookingSelectionKey(slot.date, slot.time)} style={{ fontSize: "0.88rem", color: "#4b5563" }}>
                    {new Date(slot.date + "T00:00:00").toLocaleDateString()} at {humanTime(slot.time)}{slotEnd ? ` - ${humanTime(slotEnd)}` : ""}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
              Duration: {studentClassDuration} minutes
            </div>
            {assignedTeacherName && (
              <div style={{ fontSize: "0.88rem", color: "#4b5563" }}>
                Teacher: {assignedTeacherName}
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setStudentBookingConfirmOpen(false)}
              disabled={isSubmittingStudentBooking}
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                borderRadius: 8,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: isSubmittingStudentBooking ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmStudentBooking}
              disabled={isSubmittingStudentBooking}
              style={{
                border: "none",
                background: "#2e7d32",
                color: "#fff",
                borderRadius: 8,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: isSubmittingStudentBooking ? "not-allowed" : "pointer",
                boxShadow: "0 8px 18px rgba(46, 125, 50, 0.22)",
              }}
            >
              {isSubmittingStudentBooking ? "Booking..." : "Confirm Booking"}
            </button>
          </div>
        </div>
      </div>
    )}
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
            This verified class will be marked as done and count one used class from the student's package.
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




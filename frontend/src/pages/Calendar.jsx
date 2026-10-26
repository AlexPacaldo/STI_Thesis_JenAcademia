import { openSseStream } from "../utils/sseClient.js";
import ContractExpiryBadge from "../components/ContractExpiryBadge.jsx";
import { describeExtensionEligibility } from "../utils/contractExpiry.js";
import {
  BOOKING,
  CLASS_INFO,
  CONFIRM,
  HOME,
  LEGEND,
  LOADING,
  MORE_TIME_CARD,
  MORE_TIME_WINDOW,
  NEW_PLAN_WINDOW,
  PLAN,
  PLAN_STATUS,
  VIEW,
} from "../utils/studentCopy.js";
import {
  REQUEST_KIND_EXTENSION,
  REQUEST_KIND_NEW,
  describeAvailableRequests,
  describeBlockedByOtherRequest,
  describeRequestFlow,
} from "../utils/contractRequestFlow.js";
import {
  addDaysToDateKey,
  bookingWindowEndKey,
  buildDayChoices,
  buildMonthDayChoices,
  canStepMonth,
  dateKeyToLocalDate,
  describeClassDay,
  expiryToDateKey,
  monthBoundsForRange,
  monthKey,
} from "../utils/studentSchedule.js";
import {
  humanTime,
  isPartOfDay,
  isTimeInPart,
  minutesToTime,
  normalizeTime,
  timeToMinutes,
} from "../utils/classTime.js";
import StudentBookingWizard from "../components/StudentBookingWizard.jsx";
import CalendarModuleGuide from "../components/CalendarModuleGuide.jsx";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser, writeStoredUser } from "../utils/sessionUser.js";
import { formatProficiencyLevel } from "../utils/proficiencyLevels.js";
import {
  WEEKDAY_CHOICES,
  createEmptyCriteria,
  createEmptyPreferredSchedule,
  criteriaWithCustom,
  filterOptionsForCourses,
  hasPreferredSchedule,
  pruneSelectionToCourses,
  STUDENT_CRITERIA_DISPLAY_OPTIONS,
  toCriteriaSlug,
  toPreferredSchedulePayload,
  toggleValue,
} from "../utils/matchingCriteria.js";
import CriteriaChipField from "../components/CriteriaChipField.jsx";
import MatchPreviewCard from "../components/MatchPreviewCard.jsx";
import ModalPortal from "../utils/ModalPortal.jsx";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/studentSchedule.module.css";
import kid from "../assets/studentKid.module.css";
import cal from "../assets/calendar.module.css";
import { API_BASE_URL } from "../utils/api.js";
import { openClassRecording } from "../utils/classRecording.js";
import { formatRecordingDuration } from "../utils/recordingDuration.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { openAuthenticatedFile } from "../utils/authenticatedFile.js";
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

// Once the teacher has started the class it is not a class that can be
// moved any more, so the reschedule request is closed for both sides.
const RESCHEDULE_CLOSED_AFTER_START_MESSAGE =
  "This class has already started, so it can no longer be rescheduled.";

// Helper to format date as YYYY-MM-DD in local timezone
const fmtDate = (d) => {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// convert 24‑hour time string (HH:MM:SS or ISO datetime) to human format e.g. "2:30 PM"
const parse24HourTime = (timeStr) => normalizeTime(timeStr);
const CLASS_DURATION_OPTIONS = [25, 50];
const DEFAULT_CLASS_DURATION = 50;
const SLOT_STEP_MINUTES = 25;
const CLASS_BREAK_BUFFER_MINUTES = 10;
const SCHEDULE_WINDOW_MONTHS = 3;

/**
 * How many times the weekly search will show.
 *
 * !! A teacher who works every morning, three days a week, for three months,
 * !! has over two hundred free morning times. A list that long is not a list
 * !! - it is the wall of choices the booking wizard was built to stop. So the
 * !! soonest ones are shown, and the student is told how many there are in
 * !! all.
 */
const MAX_WEEKLY_SUGGESTIONS = 30;
const NEW_PLAN_STEPS = [
  { icon: "📚", title: "Select a course", prompt: "Choose a course, class duration, and number of classes." },
  { icon: "⭐", title: "Set learning objectives", prompt: "Select one or more objectives for your learning plan." },
  { icon: "🎯", title: "Select your skill focus", prompt: "Choose the skills you would like to develop." },
  { icon: "🎨", title: "Set learning preferences", prompt: "Select the approaches that support your learning." },
  { icon: "🐢", title: "Set your learning pace", prompt: "Choose the pace that best supports your progress." },
  { icon: "🗓️", title: "Review your plan", prompt: "Review your selections. Adding your availability is optional." },
];

const normalizeClassDuration = (value) => {
  const parsed = parseInt(value, 10);
  return CLASS_DURATION_OPTIONS.includes(parsed) ? parsed : DEFAULT_CLASS_DURATION;
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
//
// `explicitEnd` is the class's own end_time, and it wins when present. Most
// panels here used to derive the end from `duration` alone, so a row with no
// duration rendered as "9:30 AM - " - a dangling dash that looks like the data
// is missing rather than like the display gave up. The app always writes both,
// but a class inserted by any other route may have only one, and the end of a
// class is the one thing on this panel that should never silently vanish.
const getEndTime = (startTime, durationMins, explicitEnd) => {
  const fromExplicitEnd = humanTime(explicitEnd);
  if (fromExplicitEnd) return fromExplicitEnd;
  if (!startTime || !durationMins) return "";
  const start = timeToMinutes(startTime);
  const duration = parseInt(durationMins, 10);
  if (start == null || !Number.isFinite(duration) || duration <= 0) return "";
  return humanTime(minutesToTime(start + duration));
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

/* The teacher's panel: the same card as the rest of the calendar, so the
   paperwork does not look like it was imported from somewhere else. */
const verificationPanelStyle = {
  marginTop: 12,
  padding: 16,
  border: "1px solid var(--border)",
  borderRadius: 18,
  background: "var(--surface-soft)",
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

// The date helpers live in utils/studentSchedule.js, where they are tested.
// They were here before, and a day label that was wrong would have passed
// every test in the repo, because no test could reach them.

const nearbyDateKeys = (dateKey) => {
  const normalized = String(dateKey || "").slice(0, 10);
  return [addDaysToDateKey(normalized, -1), normalized, addDaysToDateKey(normalized, 1)].filter(Boolean);
};

const addMonthsClamped = (date, months) => {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const targetMonth = base.getMonth() + months;
  const lastDay = new Date(base.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(base.getFullYear(), targetMonth, Math.min(base.getDate(), lastDay));
};

/**
 * The window a contract request is sent from.
 *
 * Both kinds of request are sent from a window rather than from the card in
 * the sidebar.
 *
 * !! The extension form was the last one still rendered inline, in a ~300px
 * !! column, which made it the worst kind of form to read: a notes box three
 * !! characters wide, with the buttons underneath it. The new-contract form
 * !! was moved out for exactly this reason and the two did not match, so a
 * !! student who asked for a new contract got a window and a student who asked
 * !! for an extension got a letterbox.
 * !!
 * !! Through ModalPortal rather than rendered in place: anything position:
 * !! fixed inside .content-area is positioned against the content column, not
 * !! the viewport, so an in-place overlay covers the page but not the sidebar -
 * !! which is exactly the window this is supposed to escape.
 */
function RequestDialog({ title, onClose, children, maxWidth = 620 }) {
  return (
    <ModalPortal>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1200,
          background: "rgba(15, 25, 20, 0.45)",
          display: "grid",
          placeItems: "center",
          padding: 20,
          overflowY: "auto",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={styles.dialog}
          style={{ maxWidth }}
        >
          <div className={kid.filterHead}>
            <div>
              <h3 className={kid.filterTitle}>{title}</h3>
            </div>
            <button type="button" className={kid.filterClose} onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * The window the teacher's availability manager opens in.
 *
 * !! It used to open in the panel beside the grid, and the grid and the form
 * !! fought over the same space - the form was tall, the grid was squeezed to
 * !! the side, and a teacher setting their hours had to scroll a narrow
 * !! column to reach the Save button. Now the grid stays where it was and the
 * !! form comes to the teacher.
 *
 * !! The days the teacher picks a date from come with the form, because the
 * !! grid is behind this window and there would otherwise be no way to
 * !! choose a date at all.
 *
 * !! Through ModalPortal, like the other windows in this page: anything
 * !! position: fixed inside .content-area is positioned against the content
 * !! column, not the viewport, so an in-place overlay covers the page but not
 * !! the sidebar.
 */
function AvailabilityDialog({ open, onClose, screen = "form", children }) {
  if (!open) return null;

  const headings = {
    form: {
      title: "Set Your Schedule",
      sub: "Set your available times from today up to 3 months ahead. You cannot set availability on dates with existing bookings or past dates.",
      label: "Set Your Schedule",
    },
    list: {
      title: "Your availabilities",
      sub: "Every day you have set, from today up to 3 months ahead. Edit one to change it.",
      label: "Your availabilities",
    },
    filter: {
      title: "Filter your days",
      sub: "Choose which days you want to see.",
      label: "Filter your days",
    },
  };
  const heading = headings[screen] || headings.form;

  return (
    <ModalPortal>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1200,
          background: "rgba(15, 25, 20, 0.45)",
          display: "grid",
          placeItems: "center",
          padding: 20,
          overflowY: "auto",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={heading.label}
          onClick={(event) => event.stopPropagation()}
          className={kid.filterDialog}
          style={{ maxWidth: 780 }}
        >
          <div className={kid.filterHead}>
            <div>
              <h3 className={kid.filterTitle}>{heading.title}</h3>
              <p className={kid.filterSub}>{heading.sub}</p>
            </div>
            <button type="button" className={kid.filterClose} onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className={kid.filterBody}>
            {children}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
/**
 * The days the teacher has already set, and the screen that filters them.
 *
 * !! A screen of the availability window, not another window. The teacher can
 * !! go back to the form without losing what they were doing, and the list
 * !! gets the whole width of the window to be read in.
 *
 * !! Every day is a card with the date, whether it is available or not, the
 * !! hours, and what can be done with it: edit it, or delete it. A day with a
 * !! booked class on it cannot be deleted - the class is the teacher's, and
 * !! taking the availability away would take the class away with it.
 *
 * !! The filters live on their own screen, behind one button. A teacher who
 * !! works three days a week for three months has ninety days set, and ninety
 * !! cards is a wall again - the thing this screen was built to stop. But
 * !! three rows of filters sitting on the list is clutter ON THE LIST, and
 * !! the list is what the teacher came for. So the list has one button, and
 * !! the filters are one click away.
 */
function AvailabilityAvailabilities({
  screen,
  records,
  onEdit,
  onDelete,
  onBack,
  onShowFilter,
  onShowList,
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");

  // The months that have something in them, in order.
  const months = useMemo(() => {
    const seen = new Map();
    records.forEach((record) => {
      const date = dateKeyToLocalDate(record.available_date);
      if (!date) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (seen.has(key)) return;
      seen.set(key, {
        key,
        label: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      });
    });
    return [...seen.values()];
  }, [records]);

  // The days of the week, and how many of them there are.
  //
  // !! All seven, in the same order as the Weekdays picker in the form
  // !! above, so the two read the same way. A day with nothing on it still
  // !! shows, with a zero - "Thu 0" tells a teacher they have no
  // !! Thursdays, which is worth knowing and is not obvious from a list they
  // !! have to read through.
  const weekdays = useMemo(() => {
    const counts = new Map();
    records.forEach((record) => {
      const date = dateKeyToLocalDate(record.available_date);
      if (!date) return;
      counts.set(date.getDay(), (counts.get(date.getDay()) || 0) + 1);
    });
    return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day],
      count: counts.get(day) || 0,
    }));
  }, [records]);

  const availableCount = records.filter((record) => record.status === "available").length;
  const unavailableCount = records.length - availableCount;

  const shown = records.filter((record) => {
    if (statusFilter === "available" && record.status !== "available") return false;
    if (statusFilter === "unavailable" && record.status === "available") return false;

    const date = dateKeyToLocalDate(record.available_date);
    if (!date) return false;

    if (monthFilter !== "all") {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (key !== monthFilter) return false;
    }

    if (dayFilter !== "all" && date.getDay() !== dayFilter) return false;

    return true;
  });

  // How many of the three filters are switched on. The button on the list says
  // so, so a teacher can tell there IS a filter before they wonder why the
  // list is short.
  const activeFilters =
    (statusFilter !== "all" ? 1 : 0) +
    (monthFilter !== "all" ? 1 : 0) +
    (dayFilter !== "all" ? 1 : 0);

  const filterBtn = (active) =>
    `${cal.filterBtn} ${active ? cal.filterBtnActive : ""}`;

  if (screen === "filter") {
    return (
      <div className={cal.dialogBody}>
        <div className={cal.filterBar}>
          <div className={cal.filterGroup}>
            <span className={cal.filterLabel}>Status</span>
            <div className={cal.filterPills}>
              <button
                type="button"
                className={filterBtn(statusFilter === "all")}
                aria-pressed={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              >
                All{" "}
                <span className={cal.filterNum}>{records.length}</span>
              </button>
              <button
                type="button"
                className={filterBtn(statusFilter === "available")}
                aria-pressed={statusFilter === "available"}
                onClick={() => setStatusFilter("available")}
              >
                Available{" "}
                <span className={cal.filterNum}>{availableCount}</span>
              </button>
              <button
                type="button"
                className={filterBtn(statusFilter === "unavailable")}
                aria-pressed={statusFilter === "unavailable"}
                onClick={() => setStatusFilter("unavailable")}
              >
                Unavailable{" "}
                <span className={cal.filterNum}>{unavailableCount}</span>
              </button>
            </div>
          </div>

          <div className={cal.filterGroup}>
            <span className={cal.filterLabel}>Month</span>
            <div className={cal.filterPills}>
              <button
                type="button"
                className={filterBtn(monthFilter === "all")}
                aria-pressed={monthFilter === "all"}
                onClick={() => setMonthFilter("all")}
              >
                All months
              </button>
              {months.map((month) => (
                <button
                  key={month.key}
                  type="button"
                  className={filterBtn(monthFilter === month.key)}
                  aria-pressed={monthFilter === month.key}
                  onClick={() => setMonthFilter(month.key)}
                >
                  {month.label}
                </button>
              ))}
            </div>
          </div>

          <div className={cal.filterGroup}>
            <span className={cal.filterLabel}>Day</span>
            <div className={cal.filterPills}>
              <button
                type="button"
                className={filterBtn(dayFilter === "all")}
                aria-pressed={dayFilter === "all"}
                onClick={() => setDayFilter("all")}
              >
                All days
              </button>
              {weekdays.map((weekday) => (
                <button
                  key={weekday.day}
                  type="button"
                  className={filterBtn(dayFilter === weekday.day)}
                  aria-pressed={dayFilter === weekday.day}
                  onClick={() => setDayFilter(weekday.day)}
                >
                  {weekday.label}
                  {" "}
                  <span className={cal.filterNum}>{weekday.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <button type="button" className={cal.applyBtn} onClick={onShowList}>
          Show {shown.length} {shown.length === 1 ? "day" : "days"}
        </button>
      </div>
    );
  }

  return (
    <div className={cal.dialogBody}>
      <button type="button" className={cal.backBtn} onClick={onBack}>
        ← Back to set your schedule
      </button>

      {records.length > 0 && (
        <>
          <div className={cal.listBar}>
            <button
              type="button"
              className={`${cal.filterBtn} ${activeFilters ? cal.filterBtnActive : ""}`}
              onClick={onShowFilter}
            >
              Filter{activeFilters ? ` (${activeFilters})` : ""}
            </button>
            <span className={cal.filterSummary}>
              Showing {shown.length} of {records.length}{" "}
              {records.length === 1 ? "day" : "days"}.
            </span>
          </div>

          {shown.length > 0 ? (
            <div className={cal.availScroll}>
              {shown.map((record) => {
                const available = record.status === "available";
                const hasTimes = record.start_time || record.end_time;
                return (
                  <div
                    key={record.id || record.availability_id}
                    className={`${cal.availCard} ${available ? "" : cal.availCardOff}`}
                  >
                    <div className={cal.availTop}>
                      <div style={{ minWidth: 0 }}>
                        <div className={cal.availDate}>
                          {formatScheduleDate(record.available_date)}
                        </div>
                        <span
                          className={`${cal.availBadge} ${available ? cal.availBadgeOn : cal.availBadgeOff}`}
                          style={{ marginTop: 6 }}
                        >
                          {available ? "Available" : "Unavailable"}
                        </span>
                      </div>
                    </div>

                    {available && hasTimes ? (
                      <div className={cal.availHours}>
                        {humanTime(record.start_time)} – {humanTime(record.end_time)}
                      </div>
                    ) : null}

                    {available && !hasTimes ? (
                      <div className={cal.availHours}>Available all day</div>
                    ) : null}

                    {available && record.break_start && record.break_end ? (
                      <div className={cal.availBreak}>
                        Break: {humanTime(record.break_start)} – {humanTime(record.break_end)}
                      </div>
                    ) : null}

                    {record.has_booked_class ? (
                      <div className={cal.availNote}>
                        A student has a class on this day, so it cannot be changed.
                      </div>
                    ) : null}

                    <div className={cal.availActions}>
                      <button
                        type="button"
                        className={cal.availBtnEdit}
                        onClick={() => onEdit(record)}
                        disabled={!!record.has_booked_class}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={cal.availBtnDelete}
                        onClick={() => onDelete(record)}
                        disabled={!!record.has_booked_class}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={kid.empty}>
              <span className={kid.emptyIcon} aria-hidden="true">🔍</span>
              <span>No days match this filter.</span>
            </div>
          )}
        </>
      )}

      {records.length === 0 && (
        <div className={kid.empty}>
          <span className={kid.emptyIcon} aria-hidden="true">📅</span>
          <span>You have not set any days yet.</span>
        </div>
      )}
    </div>
  );
}

/**
 * The panel that shows a request that is with the admin.
 *
 * !! One panel for both cards, because the two kinds of request have the same
 * !! three states and the same three actions. It was written twice, and the
 * !! copy of it on the extension card was the one that never appeared - so a
 * !! student with a new-contract request in flight and an extension to ask
 * !! for was shown no sign that the new-contract request existed, and no way
 * !! to withdraw it. They could open the new-contract form and see that it
 * !! said "Update Request", and otherwise the request was invisible.
 */
function PendingRequestPanel({
  flow,
  onEdit,
  onWithdraw,
  isCancelling,
  editLabel,
  withdrawLabel = "Withdraw this request",
}) {
  return (
    <div style={{ marginTop: 12, padding: 12, border: "1px solid #d9e2d9", borderRadius: 10, background: "#f7faf8" }}>
      <div style={{ fontSize: 12, color: "#2f5a43", lineHeight: 1.45 }}>{flow.banner}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <button
          type="button"
          className={styles.slotBtn}
          onClick={onEdit}
          style={{ width: "100%", border: "1px solid #c3cbd5", borderRadius: 8, background: "#fff", fontWeight: 600, cursor: "pointer" }}
        >
          {editLabel || flow.actionLabel}
        </button>
        <button
          type="button"
          onClick={onWithdraw}
          disabled={isCancelling}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#6b7280", fontSize: 12, cursor: isCancelling ? "not-allowed" : "pointer" }}
        >
          {isCancelling ? "Withdrawing..." : withdrawLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * How many classes the student has left, as a picture.
 *
 * !! A number inside a sentence is a fact a student has to read. A number
 * !! with a bar under it is a fact a student can see. The old page had the
 * !! picture and it was worth keeping - it is the one thing on the page that
 * !! answers "how long have I got" at a glance, and it is the thing a student
 * !! checks before they decide whether to book another one.
 *
 * !! It is bigger than it was. The number is the biggest thing on the page,
 * !! because the number is the point of the card.
 */
function ClassesLeftCard({ left, total, percent, readyToBook, badge, note }) {
  return (
    <div className={kid.counter}>
      <div className={kid.counterTop}>
        <span className={kid.counterLabel}>{HOME.classesLeft}</span>
        <span className={kid.counterReady}>{HOME.readyToBook(readyToBook)}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span className={kid.counterNumber}>{left}</span>
        <span className={kid.counterOf}>{HOME.of(total)}</span>
      </div>

      <div className={kid.counterBar}>
        <div className={kid.counterBarFill} style={{ width: `${percent}%` }} />
      </div>

      {/* The deadline, on its own line.
          !! The badge does not wrap, so it cannot sit in a column beside the
          !! number - "12 days left, your plan ends on 10 Oct 2026" is one
          !! long line, and in a narrow column it ran off the edge. On its own
          !! row it has the whole card to sit in. */}
      {badge}

      {/* What state the plan is in.
          !! The old page said this in a line under the counter, and the
          !! rebuild dropped it. The number says how many, this says what that
          ;; MEANS - all used up, all already booked, the plan has ended. A
          !! student with zero classes left and one with eight classes left
          !! both show "0 of 12" for the ready-to-book part, and only this
          !! sentence tells them apart - one needs a new plan, the other
          !! needs to move a class. */}
      {note && <p className={kid.counterNote}>{note}</p>}
    </div>
  );
}

/**
 * The days a student can pick from.
 *
 * !! This replaces the month grid for students. A month grid asks a child to
 * !! read a calendar, count squares, and work out which one is today - three
 * !! things, none of which is the thing they came to do. This asks them to
 * !! press a day, and the day says what it is.
 */
function DayPicker({ days, selected, onPick, emptyMessage, statusFor }) {
  if (!days.length) {
    return (
      <div className={kid.empty}>
        <span className={kid.emptyIcon} aria-hidden="true">📅</span>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className={kid.dayStrip}>
      {days.map((day) => {
        const active = day.key === selected;
        // A day the teacher does not work is dimmed, so the strip carries the
        // same information the month grid carried in its colours.
        const status = statusFor ? statusFor(day.key) : null;
        const free = status === "available";
        const unknown = status === null;

        return (
          <button
            key={day.key}
            type="button"
            onClick={() => onPick(day.key)}
            aria-pressed={active}
            title={
              status === "available"
                ? "Your teacher is free on this day"
                : status === "unavailable"
                  ? "Your teacher is busy on this day"
                  : "Your teacher has no classes set for this day"
            }
            className={`${kid.dayChip} ${active ? kid.dayChipActive : ""} ${
              free ? kid.dayChipFree : ""
            } ${unknown ? kid.dayChipUnknown : ""}`}
          >
            <span style={{ fontSize: "0.95rem" }}>{day.weekday}</span>
            <span style={{ fontSize: "1.3rem", fontWeight: 800 }}>{day.dayNumber}</span>
            <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>{day.month}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One of the student's classes, as a big card.
 *
 * !! A class is a thing that happens at a time, so it is shown as a time and
 * !! a day, in the biggest letters on the card. Everything else on it is
 * !! smaller, because everything else on it is not what the student is looking
 * !! for.
 */
function ClassCard({ classInfo, onOpen, actionLabel, actionDisabled }) {
  return (
    <div className={kid.classItem}>
      <button
        type="button"
        onClick={onOpen}
        className={kid.classItemMain}
        data-calendar-guide="class"
      >
        <span className={kid.classDay}>{classInfo.dayLabel}</span>
        <span className={kid.classTime}>{classInfo.timeLabel}</span>
        <span className={kid.classCourse}>{classInfo.subtitle}</span>
      </button>

      {actionLabel && (
        <button type="button" onClick={onOpen} disabled={actionDisabled} className={kid.classAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Shown in place of the "Request for Reschedule" button once the teacher has
 * started the class. The button simply disappearing would leave the teacher
 * and the student wondering whether the app had broken.
 */
function RescheduleClosedNotice() {
  return (
    <div
      style={{
        marginTop: "8px",
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid rgba(245, 158, 11, 0.32)",
        background: "rgba(245, 158, 11, 0.12)",
        color: "#8a5a12",
        fontSize: "0.78rem",
        lineHeight: 1.45,
      }}
    >
      {RESCHEDULE_CLOSED_AFTER_START_MESSAGE}
    </div>
  );
}

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
  // The most recent package whatever its status. Display only: every booking
  // decision reads `studentPackage`, which stays null once a contract ends.
  const [latestStudentPackage, setLatestStudentPackage] = useState(null);
  // Whether the package has actually been fetched yet.
  //
  // !! Until it has, the page cannot tell "you have no plan" from "we have
  // !! not asked yet", and it was guessing: it showed a student with six
  // !! unused classes on an ended plan a "Get a new plan" button, and then
  // !! swapped it for "Ask for more time" a moment later when the answer
  // !! arrived. A button that changes under the student's finger is worse
  // !! than a button that is late.
  const [studentPackageLoaded, setStudentPackageLoaded] = useState(false);
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
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkSubmitting, setRemarkSubmitting] = useState(false);
  const [isEditingSelectedRemark, setIsEditingSelectedRemark] = useState(false);
  const [teacherClassesCache, setTeacherClassesCache] = useState({});
  const [studentBookingMode, setStudentBookingMode] = useState(false);  const [studentBookingDate, setStudentBookingDate] = useState(fmtDate(today));
  const [studentBookingTime, setStudentBookingTime] = useState("");
  const [studentBookingSelections, setStudentBookingSelections] = useState([]);
  const [studentBookingSuggestions, setStudentBookingSuggestions] = useState([]);
  const [studentBookingSuggestionsTotal, setStudentBookingSuggestionsTotal] = useState(0);
  const [studentBookingApplyMode, setStudentBookingApplyMode] = useState("manual");
  const [studentBookingWeeklyWeekdays, setStudentBookingWeeklyWeekdays] = useState([1, 3, 5]);
  const [studentBookingWeeklyTime, setStudentBookingWeeklyTime] = useState("");
  const [studentBookingSubject, setStudentBookingSubject] = useState("");
  const [studentBookingError, setStudentBookingError] = useState("");
  const [isSubmittingStudentBooking, setIsSubmittingStudentBooking] = useState(false);
  const [courses, setCourses] = useState([]);
  const [contractRequestOpen, setContractRequestOpen] = useState(false);
  const [newPlanStep, setNewPlanStep] = useState(0);
  const [contractCourseId, setContractCourseId] = useState("");
  const [contractClassCount, setContractClassCount] = useState("10");
  const [contractClassDuration, setContractClassDuration] = useState("50");

  // Every criterion is multi-select. Matches the Create Student form and the
  // vocabulary the matcher compares against.
  const [contractAiCriteria, setContractAiCriteria] = useState(() => createEmptyCriteria());
  const [contractRequestError, setContractRequestError] = useState("");
  const [contractRequests, setContractRequests] = useState([]);
  // The requests that are still waiting for an answer, as their own list.
  //
  // !! Separate from the history above, and not derived from it. The history is
  // !! the last five requests, which is a window; a student with more than
  // !! five in it had their pending extension fall out of the window and the
  // !! card told them they had never asked, while the admin was holding a
  // !! request from them. Whether something is pending is a fact, so it comes
  // !! as a fact.
  const [pendingContractRequests, setPendingContractRequests] = useState([]);
  // True while the open form is editing a request that is already with the
  // admin, rather than sending a first one.
  const [contractRequestEditing, setContractRequestEditing] = useState(false);
  const [isCancellingContractRequest, setIsCancellingContractRequest] = useState(false);
  const [isSubmittingContractRequest, setIsSubmittingContractRequest] = useState(false);
  // The extension's "why do you need longer" box, and the only free text left in
  // either form. A new-contract request no longer has a notes field at all: it
  // carries four structured criteria (each with an Others box), a preferred
  // schedule, a course and a class count, which is what the matcher reads. A
  // free-text box beside those invited the question of what belonged in which,
  // and an answer of "either" is not an answer.
  const [contractExtensionNote, setContractExtensionNote] = useState("");
  // Set when the student explicitly asks for a new contract despite having an
  // extension route available.
  //
  // describeExtensionEligibility deliberately suppresses "new" while "extend"
  // applies, because approving a new contract discards the unused balance. That
  // stays the default - the safe choice is the offered one. But a student whose
  // extension was declined is entitled to change their mind, so this lets them
  // through explicitly, with the consequence stated on the form rather than
  // hidden behind a rule they cannot overrule.
  const [requestingNewContract, setRequestingNewContract] = useState(false);
  // The free text typed into each "Others" box, mirroring the admin's
  // Create Student form.
  //
  // !! The criterion is merged into ai_criteria on submit by criteriaWithCustom,
  // !! which is the same function the admin form uses. Keeping the raw text out
  // !! of the criteria array is what stops the "__custom__" sentinel - a piece of
  // !! UI state - from reaching the scorer, where it could never match anything.
  const [contractCriteriaOther, setContractCriteriaOther] = useState({
    learningGoal: "",
    focusArea: "",
    learningStyle: "",
    pace: "",
  });
  // When this student can actually attend.
  //
  // !! Optional, and the server treats a partial answer as no answer rather than
  // !! half a preference. What it is NOT is decorative: the backend filters
  // !! candidates by teacher availability when it runs matching on approval, so a
  // !! student who can only do Saturdays gets matched against teachers free on
  // !! Saturdays. The same control the admin's Create Student form uses, from
  // !! the same shared WEEKDAY_CHOICES, so the two cannot drift.
  const [contractPreferredSchedule, setContractPreferredSchedule] = useState(
    createEmptyPreferredSchedule()
  );

  /**
   * How the calendar is being looked at.
   *
   * !! Two ways, and the teacher and the admin choose between them with the
   * !! pill at the top of the page.
   * !!
   * !! "month" is the grid - the calendar as a calendar, for finding a day
   * !! and seeing what is on it. "list" is the same classes as a list, one
   * !! after another, which is the shape the student's own page uses. A
   * !! teacher reading a month of classes wants the list; a teacher finding
   * !! the one class on a Tuesday wants the grid.
   * !!
   * !! The choice is remembered, because a teacher who works in the list
   * !! should not have to say so every morning.
   */
  const [calendarView, setCalendarView] = useState(() => {
    try {
      return localStorage.getItem("JenAcademia.calendarView") === "list" ? "list" : "month";
    } catch {
      return "month";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("JenAcademia.calendarView", calendarView);
    } catch {
      // A browser that will not let us remember the choice is not a reason to
      // stop working.
    }
  }, [calendarView]);

  /**
   * The month the availability manager is showing days for.
   *
   * !! The manager is a window now, so the days it offers have to come with
   * !! it - the grid it used to be clicked against is behind the window.
   */
  const [availabilityPickerMonth, setAvailabilityPickerMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Each field's chips merged with whatever was typed in its "Others" box.
  //
  // At component scope rather than inside the submit handler, because the match
  // preview needs the same merged criteria and computing it twice would let the
  // two drift - the preview describing something other than what gets sent.
  // Identical to the admin's Create Student form, deliberately: the scorer treats
  // both the same way, and two implementations of the same merge is how they stop
  // agreeing.
  const mergedContractCriteria = {
    learningGoal: criteriaWithCustom(contractAiCriteria?.learningGoal, contractCriteriaOther.learningGoal),
    focusArea: criteriaWithCustom(contractAiCriteria?.focusArea, contractCriteriaOther.focusArea),
    learningStyle: criteriaWithCustom(contractAiCriteria?.learningStyle, contractCriteriaOther.learningStyle),
    pace: criteriaWithCustom(contractAiCriteria?.pace, contractCriteriaOther.pace),
  };

  const missingContractPreferences = () => {
    const missing = [];
    if (!mergedContractCriteria.learningGoal.length) missing.push("a learning goal");
    if (!mergedContractCriteria.focusArea.length) missing.push("a focus area");
    if (!mergedContractCriteria.learningStyle.length) missing.push("a learning style");
    if (!mergedContractCriteria.pace.length) missing.push("a learning pace");
    const hasAnyPreferredSchedule =
      contractPreferredSchedule.days.length > 0 ||
      contractPreferredSchedule.start ||
      contractPreferredSchedule.end;
    if (hasAnyPreferredSchedule && !hasPreferredSchedule(contractPreferredSchedule)) {
      missing.push("at least one available day and both availability times");
    } else if (
      hasPreferredSchedule(contractPreferredSchedule) &&
      contractPreferredSchedule.start >= contractPreferredSchedule.end
    ) {
      missing.push("an end time later than the start time");
    }
    return missing;
  };

  const contractCriterionSummary = (key, options) =>
    mergedContractCriteria[key]
      .map((value) => {
        if (value === toCriteriaSlug(contractCriteriaOther[key])) {
          return contractCriteriaOther[key].trim();
        }
        return options.find(([optionValue]) => optionValue === value)?.[1] || value;
      })
      .filter(Boolean)
      .join(", ");

  // The preview of who this would match.
  //
  // Cleared whenever anything it depends on changes - course, criteria, schedule -
  // because a preview of the previous criteria sitting above newly chosen ones is
  // worse than no preview at all. It describes a state that no longer exists.
  const [matchPreview, setMatchPreview] = useState(null);
  const [previewingMatch, setPreviewingMatch] = useState(false);
  const [matchPreviewError, setMatchPreviewError] = useState("");
  const matchPreviewRequestId = useRef(0);

  useEffect(() => {
    matchPreviewRequestId.current += 1;
    setMatchPreview(null);
    setMatchPreviewError("");
    setPreviewingMatch(false);
  }, [
    contractCourseId,
    contractAiCriteria,
    contractCriteriaOther,
    contractPreferredSchedule,
  ]);

  const previewContractMatch = async () => {
    if (!contractCourseId) {
      setMatchPreviewError("Choose a course first.");
      return;
    }
    const missing = missingContractPreferences();
    if (missing.length) {
      setMatchPreviewError(`Complete all required preferences first: ${missing.join(", ")}.`);
      return;
    }
    const requestId = ++matchPreviewRequestId.current;
    setPreviewingMatch(true);
    setMatchPreviewError("");
    try {
      const res = await axios.post(`${API}/api/student/contract-match-preview`, {
        student_id: localUserId,
        course_id: contractCourseId,
        criteria: mergedContractCriteria,
        preferred_schedule: toPreferredSchedulePayload(contractPreferredSchedule),
      });
      if (requestId === matchPreviewRequestId.current) {
        setMatchPreview(res.data);
      }
    } catch (err) {
      if (requestId === matchPreviewRequestId.current) {
        setMatchPreview(null);
        setMatchPreviewError(
          err?.response?.data?.message || "Could not work out a match right now."
        );
      }
    } finally {
      if (requestId === matchPreviewRequestId.current) {
        setPreviewingMatch(false);
      }
    }
  };
  const [currentTimeTick, setCurrentTimeTick] = useState(() => Date.now());
  const isAdmin = localRole === "admin"; // helper for rendering

  // The simple student page.
  //
  // !! A student on their own gets a page that is a list of their classes and
  // !! three buttons. Not a month grid with a panel beside it.
  // !!
  // !! An admin looking AT a student's calendar keeps the old view - they are
  // !! looking at a schedule, not using one, and they need the grid to read
  // !! it. So this is only for a student using their own page.
  const isSimpleStudentView =
    localRole === "student" && !teacherId && !studentId && !isAdmin;

  // The student's own upcoming classes, for the list on the home screen.
  const [studentUpcomingClasses, setStudentUpcomingClasses] = useState([]);
  const [studentUpcomingLoading, setStudentUpcomingLoading] = useState(false);

  const viewerTimezone = useMemo(() => getUserTimezone(me), [me]);
  const viewerTodayKey = useMemo(() => formatDateInTimezone(new Date(currentTimeTick), viewerTimezone), [viewerTimezone, currentTimeTick]);
  const viewerToday = useMemo(() => dateKeyToLocalDate(viewerTodayKey) || new Date(), [viewerTodayKey]);
  const scheduleWindowEndKey = useMemo(() => fmtDate(addMonthsClamped(viewerToday, SCHEDULE_WINDOW_MONTHS)), [viewerToday]);

  // The last day this student may book.
  //
  // !! The contract decides, and the booking window is the ceiling. A student
  // !! whose plan runs out on the 19th cannot book a class on the 20th,
  // !! however free the teacher is - and a plan that runs out LONGER than the
  // !! window does not push the window out, because a teacher only sets
  // !! availability three months ahead and there is nothing to book past that.
  const studentBookingEndKey = useMemo(
    () =>
      bookingWindowEndKey({
        contractExpiresAt: studentPackage?.expires_at ?? null,
        fallbackEndKey: scheduleWindowEndKey,
      }),
    [studentPackage?.expires_at, scheduleWindowEndKey]
  );

  // The month the student's day picker is showing.
  //
  // !! It used to be a strip of fourteen days that stopped two weeks from
  // !! today, so a student whose teacher had a free Saturday in six weeks
  // !! could not see it and did not know it was there. The picker moves month
  // !! by month now, and it stops at the end of the student's contract.
  const [studentBookingMonth, setStudentBookingMonth] = useState(() => ({
    year: viewerToday.getFullYear(),
    month: viewerToday.getMonth(),
  }));

  // What to say when the student picks a day they cannot book.
  //
  // !! "Three months ahead" was a rule of the app, not a fact about the
  // !! student, and it was wrong for them. The day their plan ends is a fact
  // !! about them, and it is the day they need to hear.
  const studentBookingWindowMessage = useMemo(() => {
    const expiry = expiryToDateKey(studentPackage?.expires_at ?? null);
    const end = dateKeyToLocalDate(expiry);
    if (end) {
      return BOOKING.pickBeforePlanEnds(
        end.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      );
    }
    return `Please pick a date from today up to ${SCHEDULE_WINDOW_MONTHS} months ahead.`;
  }, [studentPackage?.expires_at]);

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
    ? (selectedClasses.find(cls => cls.id === selectedClassId)
      // Also the list on the student's home screen. Those rows are not in the
      // month cache - the month is a window, and "my next class" is not -
      // so without this the card on the home screen opens nothing.
      || studentUpcomingClasses.find(cls => String(cls.id) === String(selectedClassId))
      || null)
    : null;
  const [classVerification, setClassVerification] = useState(null);
  const [evidenceChoice, setEvidenceChoice] = useState("recording");
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
  const selectedClassStudentConfirmed = Boolean(
    selectedClassVerification?.student_joined_at || selectedClass?.student_joined_at
  );
  const selectedClassEnded = Boolean(selectedClassVerification?.teacher_ended_at);
  const selectedClassVerified = selectedVerificationStatus === "verified";
  const canShowClassEntryAction = !selectedClassEnded;
  // A class the teacher has already started is not one that can be moved, so
  // the reschedule request is closed for the teacher and the student alike.
  const canShowRescheduleAction =
    !selectedClassStarted && !selectedClassEnded && !isAdmin && !requestMode;
  const showRescheduleClosedNotice = selectedClassStarted && !selectedClassEnded && !isAdmin;
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

  // Show the teacher's most recent note for this student, whatever class it
  // was written for. When the student opens their next class they should see
  // the last note their teacher left, not a blank "no remark yet".
  const latestRemark = useMemo(() => {
    const sorted = [...studentRemarks].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime || Number(b.remark_id || 0) - Number(a.remark_id || 0);
    });
    return sorted[0] || null;
  }, [studentRemarks]);
  const selectedTeacherFullName = selectedClass
    ? selectedClass.teacherFullName || selectedClass.teacherName || [selectedClass.teacher_first_name, selectedClass.teacher_last_name]
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";
  const contractLearningGoalOptions = useMemo(
    () => filterOptionsForCourses(STUDENT_CRITERIA_DISPLAY_OPTIONS.learningGoal, selectedContractCourseNames),
    [selectedContractCourseNames]
  );
  const contractFocusAreaOptions = useMemo(
    () => filterOptionsForCourses(STUDENT_CRITERIA_DISPLAY_OPTIONS.focusArea, selectedContractCourseNames),
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
  // Every availability the teacher has set, across the whole booking window.
  const [teacherAvailabilityAll, setTeacherAvailabilityAll] = useState([]);
  // Which screen the availability window is showing: the form, or the list of
  // the days they have already set.
  const [availabilityScreen, setAvailabilityScreen] = useState("form");
  // The availability being edited, if any.
  const [editingAvailability, setEditingAvailability] = useState(null);
  const [teacherAvailabilityRecordForDate, setTeacherAvailabilityRecordForDate] = useState(null); // individual selected date record
  // Have the records for the day the student picked arrived yet?
  const [teacherAvailabilityLoaded, setTeacherAvailabilityLoaded] = useState(true);
  // Which day have the free times been worked out for?
  //
  // !! The free times are worked out from two things that arrive separately:
  // !! the teacher's classes for that day, and the teacher's plan for that
  // !! month. Until both are here there are no times to show, and the wizard
  // !! has to say "looking" rather than "no free times" - otherwise a student
  // !! is told the teacher is busy when the answer simply has not come back
  // !! yet.
  const [bookingTimesReadyDate, setBookingTimesReadyDate] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const closeConfirmAction = () => setConfirmAction(null);
  const triggerCalendarRefresh = useCallback(() => {
    setClassesCache({});
    setTeacherClassesCache({});
    setTeacherAvailabilityRecordForDate(null);
    setCalendarRefreshToken(token => token + 1);
  }, []);
  const refreshStudentPlanData = useCallback(async () => {
    if (localRole !== "student" || !localUserId) return;

    const [packageResult, requestsResult] = await Promise.allSettled([
      axios.get(`${API}/api/calendar/student-package/${localUserId}`),
      axios.get(`${API}/api/student/contract-requests/${localUserId}`),
    ]);

    if (packageResult.status === "fulfilled") {
      setStudentPackage(packageResult.value.data?.package || null);
      setLatestStudentPackage(
        packageResult.value.data?.latest_package ?? packageResult.value.data?.package ?? null
      );
      setStudentPackageLoaded(true);
    } else if (packageResult.reason?.response?.status === 404) {
      setStudentPackage(null);
      setLatestStudentPackage(packageResult.reason.response?.data?.latest_package ?? null);
      setStudentPackageLoaded(true);
    } else {
      console.warn("Could not refresh the student's class plan:", packageResult.reason);
    }

    if (requestsResult.status === "fulfilled") {
      const requests = requestsResult.value.data?.requests || [];
      const pending = Array.isArray(requestsResult.value.data?.pending)
        ? requestsResult.value.data.pending
        : requests.filter((request) => request?.status === "pending");
      setContractRequests(requests);
      setPendingContractRequests(pending);
    } else {
      console.warn("Could not refresh the student's contract requests:", requestsResult.reason);
    }
  }, [localRole, localUserId]);

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

    // Reconnect delay passed in because EventSource reconnected automatically and
// the calendar keeps refreshing in the background; without it a single dropped
// connection would leave the page stale until a reload.
const stream = openSseStream(`${API}/api/calendar/stream/${localUserId}`, { reconnectMs: 5000 });
    const handleCalendarChange = () => {
      triggerCalendarRefresh();
    };
    const handleClassVerificationChange = () => {
      setClassVerificationRefreshToken(token => token + 1);
      triggerCalendarRefresh();
    };
    const handleContractRequestUpdated = () => {
      void refreshStudentPlanData();
      triggerCalendarRefresh();
    };

    ["class-booked", "class-rescheduled", "availability-changed", "class-completed", "class-no-show", "contract-request-updated"].forEach(eventName => {
      stream.addEventListener(
        eventName,
        eventName === "contract-request-updated" ? handleContractRequestUpdated : handleCalendarChange
      );
    });
    stream.addEventListener("class-verification-changed", handleClassVerificationChange);

    stream.onerror = () => {};

    return () => {
      ["class-booked", "class-rescheduled", "availability-changed", "class-completed", "class-no-show", "contract-request-updated"].forEach(eventName => {
        stream.removeEventListener(
          eventName,
          eventName === "contract-request-updated" ? handleContractRequestUpdated : handleCalendarChange
        );
      });
      stream.removeEventListener("class-verification-changed", handleClassVerificationChange);
      stream.close();
    };
  }, [localUserId, localRole, triggerCalendarRefresh, refreshStudentPlanData]);

  useEffect(() => {
    if (localRole !== "student" || !localUserId) return;

    let refreshing = false;
    const refreshWhenVisible = () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      void refreshStudentPlanData().finally(() => {
        refreshing = false;
      });
    };
    const intervalId = window.setInterval(refreshWhenVisible, 10000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [localRole, localUserId, refreshStudentPlanData]);

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
  //
  // A 404 here is not necessarily "nothing". The endpoint answers 404 both for a
  // student who never had a package and for one whose contract has run out, and
  // the second case still carries the deadline in its body. Discarding the error
  // the way this did - setStudentPackage(null) and nothing else - made an ended
  // contract indistinguishable from an absent one on the one screen that tells
  // a student how many classes they have left.
  useEffect(() => {
    if (localRole === "student" && localUserId) {
      axios
        .get(`${API}/api/calendar/student-package/${localUserId}`)
        .then(r => {
          setStudentPackage(r.data.package);
          setLatestStudentPackage(r.data.latest_package ?? r.data.package ?? null);
          setStudentPackageLoaded(true);
        })
        .catch((err) => {
          setStudentPackage(null);
          setLatestStudentPackage(err?.response?.data?.latest_package ?? null);
          setStudentPackageLoaded(true);
        });
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

  // A draft belongs to one class. Switching classes must not carry the old
  // class's words into the new class's note.
  useEffect(() => {
    setRemarkDraft("");
    setIsEditingSelectedRemark(false);
  }, [selectedClass?.id]);

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
      .then(r => {
        const requests = r.data?.requests || [];
        setContractRequests(requests);

        // The pending set, from the server's own field.
        //
        // !! Falling back to the history when the server does not send it.
        // !! The frontend on Vercel and the backend on Railway deploy
        // !! separately, so for a few minutes after a release the new
        // !! frontend can be talking to the old backend - and the old
        // !! backend sends only the last five requests. Without the
        // !! fallback, `pending` would be empty for that window, the card
        // !! would say "you have never asked" to a student who is waiting
        // !! on an answer, and the withdraw button would be missing.
        // !!
        // !! The fallback is the old behaviour - read it off the history -
        // !! so the worst case is exactly what shipped before, rather than
        // !! worse than it.
        const pending = Array.isArray(r.data?.pending)
          ? r.data.pending
          : requests.filter((request) => request?.status === "pending");
        setPendingContractRequests(pending);
      })
      .catch(() => {
        setContractRequests([]);
        setPendingContractRequests([]);
      });
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
        setAssignedTeacherName(r.data?.teacher_name || "");

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
        setAssignedTeacherName("");
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

      // !! The free times for the chosen day are worked out from these
      // !! records. Until they arrive the wizard has nothing to show, and a
      // !! wizard that shows "no free times" while it is still asking is
      // !! telling the student a lie.
      setTeacherAvailabilityLoaded(false);

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
        })
        .finally(() => setTeacherAvailabilityLoaded(true));
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
      // The times for this day have now been worked out - but only once the
      // teacher's plan for the month is here. Worked out without it, the
      // answer is "no free times", and the wizard would say that to a
      // student whose teacher is wide open.
      if (teacherAvailabilityLoaded) setBookingTimesReadyDate(studentBookingDate);
    }
    if (requestMode && requestDate && selectedClass?.teacher_id && classesCache[requestDate] !== undefined) {
      loadAvailableTimeSlots(requestDate, selectedClass.teacher_id, selectedClassDuration, selectedClass.id);
    }
  }, [selectedDate, teacherId, classesCache, availability, studentBookingMode, studentBookingDate, assignedTeacherId, teacherClassesCache, teacherAvailabilityList, teacherAvailabilityLoaded, studentPackage, studentProfile, requestMode, requestDate, selectedClass?.teacher_id, selectedClass?.id, selectedClassDuration, calendarRefreshToken]);

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

  // The student's own upcoming classes, for the list on the simple home screen.
  //
  // !! The month query above cannot do this job: it returns one month, and a
  // !! student asking "when is my next class?" needs the next few weeks
  // !! whatever month that crosses.
  useEffect(() => {
    if (!isSimpleStudentView || !localUserId) return;

    let active = true;
    setStudentUpcomingLoading(true);

    axios
      .get(`${API}/api/calendar/upcoming-classes`, {
        params: { student_id: localUserId, limit: 10 },
      })
      .then((r) => {
        if (!active) return;
        // Stored raw. They are put into the shape the rest of the page
        // expects where they are used, so that this effect does not depend on
        // a function that is rebuilt on every render.
        setStudentUpcomingClasses(r.data?.classes || []);
      })
      .catch(() => {
        if (active) setStudentUpcomingClasses([]);
      })
      .finally(() => {
        if (active) setStudentUpcomingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isSimpleStudentView, localUserId, calendarRefreshToken]);

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

  // Choosing a day, in one place.
  //
  // !! Two ways of choosing a day now - a strip of days for students, and the
  // !! month grid for teachers - so the rule about which days are allowed, and
  // !! what happens when a day is chosen, is written once and used by both.
  const chooseBookingDate = (chosen) => {
    if (isOutsideScheduleWindow(chosen)) {
      setStudentBookingDate(chosen);
      setStudentBookingTime("");
      setStudentBookingError(studentBookingWindowMessage);
      return;
    }
    setStudentBookingDate(chosen);
    setStudentBookingTime("");
    // The free times have to be worked out again for this day.
    setBookingTimesReadyDate("");
    setSelectedDate(null);
    // preload teacher classes for the chosen date if we already know the teacher
    if (assignedTeacherId) loadTeacherClassesForDate(chosen, assignedTeacherId);
  };

  const chooseRequestDate = (chosen) => {
    setRequestDate(chosen);
    setRequestTime("");
    setRequestError("");
    loadClassesForDate(chosen);
    // attempt to preload teacher availability for the selected class/party
    const teacherIdToLoad = selectedClass?.teacher_id || counterpartyId || assignedTeacherId || selectedClass?.teacher_id;
    if (teacherIdToLoad) loadSpecificTeacherAvailability(teacherIdToLoad);
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
      chooseRequestDate(fmtDate(d));
      return;
    }

    // If student is in monthly booking mode, selecting a calendar cell chooses the
    // booking date instead of opening the regular day view.
    if (studentBookingMode) {
      // only allow selecting dates within the currently visible month
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      chooseBookingDate(fmtDate(d));
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
      ? "The student is not free at this time. Please pick another time."
      : "Your teacher is not free at this time. Please pick another time.";
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
    // A student books inside their own contract. A teacher sets availability
    // inside the booking window, which is a different limit and a different
    // person - a student whose plan ends this month does not shorten the
    // months a teacher may plan ahead.
    const end = localRole === "student" ? studentBookingEndKey : scheduleWindowEndKey;
    return Boolean(normalized) && (normalized < viewerTodayKey || normalized > end);
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

  /**
   * Every availability the teacher has set, across the whole booking window.
   *
   * !! The month is not enough. A teacher who sets their hours in January
   * !! wants to see January and February and March at once, and the old list
   * !! showed them one month at a time inside a panel that was already
   * !! crowded. This is every day they have set, in one list, in order.
   */
  const loadTeacherAvailabilityForWindow = async () => {
    if (localRole !== "teacher" || !localUserId) return [];

    const monthKeys = [];
    const cursor = new Date(viewerToday.getFullYear(), viewerToday.getMonth(), 1);
    const end = dateKeyToLocalDate(scheduleWindowEndKey);
    while (end && cursor <= end) {
      monthKeys.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (!monthKeys.length) return [];

    try {
      const responses = await Promise.all(
        monthKeys.map(({ year: targetYear, month: targetMonth }) =>
          axios.get(`${API}/api/calendar/teacher-availability-records`, {
            params: { teacher_id: localUserId, year: targetYear, month: targetMonth }
          })
        )
      );

      const records = responses
        .flatMap((response) => response.data?.records || [])
        .map(formatAvailabilityRecordForViewer)
        .filter(
          (record) =>
            !isPastDateString(record.available_date) &&
            !isOutsideScheduleWindow(record.available_date)
        )
        .sort((a, b) => String(a.available_date).localeCompare(String(b.available_date)));

      setTeacherAvailabilityAll(records);
      return records;
    } catch (err) {
      console.error("Error loading teacher availability:", err);
      setTeacherAvailabilityAll([]);
      return [];
    }
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
    skipCurrentTimeCheck = false,
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
      if (!skipCurrentTimeCheck && selectedDateObj.getTime() === todayMidnight.getTime()) {
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
    const error = availabilityApplyMode === "bulk"
      ? validateBulkAvailabilityInputs()
      : validateAvailabilityInputs();
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
    return validateAvailabilityInputs({ availabilityDate: bulkAvailabilityDates[0], skipCurrentTimeCheck: true });
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
      // The teacher is not editing a day any more.
      setEditingAvailability(null);
      triggerCalendarRefresh();
      loadTeacherAvailabilityForMonth();
      loadTeacherAvailabilityForWindow();
      
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

  const deleteTeacherAvailability = (recordId) => {
    setConfirmAction({
      type: "delete-availability",
      recordId,
      title: "Delete availability?",
      message: "Are you sure you want to delete this availability record?",
      confirmLabel: "Delete",
    });
  };

  const performConfirmAction = async () => {
    const action = confirmAction;
    closeConfirmAction();
    if (!action) return;

    if (action.type === "delete-availability") {
      try {
        await axios.delete(`${API}/api/calendar/availability/${action.recordId}`);
        notify("Availability deleted successfully", "success");
        triggerCalendarRefresh();
        loadTeacherAvailabilityForMonth();
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
        const msg = error?.response?.data?.message || "Failed to delete availability. Please try again.";
        notify(msg, "error");
      }
    }

    if (action.type === "archive-remark") {
      try {
        await axios.patch(`${API}/api/teacher/remarks/${action.remarkId}/archive`, {
          teacher_id: localUserId,
        });
        setStudentRemarks((prev) =>
          prev.filter((remark) => String(remark.remark_id) !== String(action.remarkId))
        );
        setRemarkDraft("");
        setIsEditingSelectedRemark(false);
        notify?.("Remark removed from the student's view.", "success");
      } catch (error) {
        notify?.(error?.response?.data?.message || "Unable to remove the remark. Please try again.", "error");
      }
    }

    if (action.type === "no-show") {
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
      } catch (err) {
        notify?.(err?.response?.data?.message || "Unable to mark class as no-show. Please try again.", "error");
      } finally {
        setIsMarkingClassDone(false);
      }
    }

    if (action.type === "replace-recording") {
      action.startRecording();
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
    if (selectedClassStarted) {
      setRequestError(RESCHEDULE_CLOSED_AFTER_START_MESSAGE);
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
      
      notify("Sent. Your teacher will say yes or no.", "success");
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
    if (selectedClassStarted) {
      setRequestError(RESCHEDULE_CLOSED_AFTER_START_MESSAGE);
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
      setRequestError("Please pick a day when your teacher is free.");
      return;
    }
    if (isRescheduleToSameDateTime(requestDate, requestTime)) {
      setRequestError("That is the same time. Please pick a different one.");
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
      setRequestError(localRole === "teacher" ? "This is your break. Please pick another time." : "Your teacher has a break then. Please pick another time.");
      return;
    }
    if (isTimeOutsideTeacherAvailability(requestDate, requestTime)) {
      setRequestError(localRole === "teacher" ? "This is outside your free times. Please pick another time." : "Your teacher is not free then. Please pick another time.");
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
  const isSelectedClassNoShowable =
    selectedClass?.status === "scheduled" &&
    isClassPast(selectedClass, selectedDate, currentTimeTick) &&
    !selectedClassStudentConfirmed;
  const hasVerificationSummarySentence = hasCompleteSentence(verificationSummary);
  const hasVerificationScreenshot = Boolean(verificationProofFile || verificationProofUrl);
  const hasStartScreenshot = Boolean(selectedClassVerification?.start_proof_url);
  const hasEndScreenshot = hasVerificationScreenshot;
  const hasVerificationRecording = Boolean(verificationRecordingUrl || selectedClassVerification?.recording_url);
  const evidenceMode = selectedClassVerification?.evidence_mode || (selectedClassStarted ? "recording" : evidenceChoice);
  const requiredRecordingMinutes = Math.max(1, Math.min(30, Math.ceil(Number(selectedClass?.duration || 50) * 0.6)));
  const hasVerificationProof = evidenceMode === "recording" ? hasVerificationRecording && Number(selectedClassVerification?.recording_duration_seconds || 0) >= requiredRecordingMinutes * 60
    : Boolean(hasStartScreenshot && hasEndScreenshot);
  // Match the remark to this class because "latestRemark" may belong to an older class.
  const selectedClassRemark = studentRemarks.find(
    (remark) =>
      String(remark.class_id) === String(selectedClass?.id) &&
      String(remark.remarks || "").trim().length > 0
  );
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
    if (isSelectedClassCompleted) return "Class is done";
    if (localRole === "teacher" && !selectedClassStarted) return "Start & Join Class";
    // The student words. A student who is waiting for their teacher does not
    // need to know that the class has not been "started" - they need to know
    // that it is not their turn yet.
    if (localRole === "student" && !selectedClassStarted) return CLASS_INFO.waitingForTeacher;
    if (localRole === "student" && !selectedClassStudentConfirmed) return CLASS_INFO.joinAndHere;
    return CLASS_INFO.joinClass;
  })();
  const selectedClassEntryTitle = (() => {
    if (isSelectedClassCompleted) return "This class is already done";
    if (!isSelectedClassConfirmable) return "You can join 30 minutes before the class starts";
    if (localRole === "student" && !selectedClassStarted) return "Your teacher has to start the class first";
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
        // The student words. A teacher is signing off on evidence; a student
        // is being asked whether they are happy to be recorded, and the
        // sentence that matters to them is what happens to the recording.
        title: localRole === "teacher" ? "Recording consent" : CONFIRM.recordingTitle,
        message:
          localRole === "teacher"
            ? "This class may be recorded for attendance verification and can be viewed by the admin, teacher, and student."
            : CONFIRM.recordingBody,
        details:
          localRole === "teacher"
            ? [
                "The recording is used only for class verification.",
                "The recording will be deleted after 7 days.",
                "By continuing, you consent to join with recording verification.",
              ]
            : [
                "Recordings are automatically deleted after 7 days.",
              ],
        confirmLabel:
          localRole === "teacher" && !selectedClassStarted
            ? "Consent & Start Class"
            : localRole === "teacher"
              ? "Consent & Join Class"
              : CONFIRM.yesJoin,
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
      notify?.("You can say you are here from 30 minutes before the class starts.", "error");
      return;
    }

    setIsUpdatingVerification(true);
    try {
      const response = await axios.post(`${API}/api/calendar/classes/${selectedClass.id}/join`, {
        student_id: localUserId,
        recording_consent: true,
      });
      refreshSelectedVerification(response.data?.verification);
      notify?.("Thank you. We marked you as here.", "success");
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
      const response = await axios.get(`${API}/api/calendar/classes/${selectedClass.id}/classroom`);
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
    if (localRole === "teacher") {
      meetingTab.blur();
      window.focus();
    }
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
      evidenceMode === "recording" &&
      !hasVerificationRecording &&
      !recording.session
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

  // Give a remark about this class. The box stays open from 30 minutes before
  // class starts until after the class ends, so the teacher never has to leave
  // this page to write a note about a student.
  const handleGiveRemark = async () => {
    if (!selectedClass || !selectedClass.id || !selectedClass.student_id) {
      notify?.("Please select a class first.", "error");
      return;
    }

    const text = remarkDraft.trim();
    if (!text) {
      notify?.("Please write a remark before submitting it.", "warning");
      return;
    }

    setRemarkSubmitting(true);
    try {
      const response = await axios.post(`${API}/api/calendar/remarks`, {
        class_id: selectedClass.id,
        teacher_id: localUserId,
        student_id: selectedClass.student_id,
        remarks: text,
        rating: null,
      });

      const data = response.data || {};
      setRemarkDraft("");
      setIsEditingSelectedRemark(false);
      setRemarkSubmitting(false);

      setStudentRemarks((prev) => {
        const existing = prev.find((remark) => String(remark.class_id) === String(selectedClass.id));
        const entry = {
          ...existing,
          remark_id: data.remark_id ?? data.id ?? existing?.remark_id ?? null,
          class_id: selectedClass.id,
          class_name: selectedClass.className || selectedClass.class_name,
          scheduled_date: selectedClass.scheduled_date || selectedDate,
          start_time: selectedClass.start_time || selectedClass.time,
          remarks: text,
          student_name: selectedClass.studentFullName || selectedClass.studentName,
          student_profile_image_url: selectedClass.student_profile_image_url,
          created_at: new Date().toISOString(),
          ...data,
        };
        return [
          entry,
          ...prev.filter((remark) => String(remark.class_id) !== String(selectedClass.id)),
        ];
      });

      notify?.("Remark submitted to the student.", "success");
    } catch (error) {
      setRemarkSubmitting(false);
      notify?.(error?.response?.data?.message || "Unable to submit the remark. Please try again.", "error");
    }
  };

  const confirmRemoveSelectedRemark = () => {
    if (!selectedClassRemark?.remark_id) {
      notify?.("This remark cannot be removed right now. Please refresh and try again.", "error");
      return;
    }

    setConfirmAction({
      type: "archive-remark",
      remarkId: selectedClassRemark.remark_id,
      title: "Remove this remark?",
      message: "The student will no longer see this remark. You can restore it later from Remark History.",
      confirmLabel: "Remove remark",
    });
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

    await markSelectedClassDone({ verifiedOverride });
  };

  const markSelectedClassDone = async ({ verifiedOverride = false } = {}) => {
    if (!selectedClassVerified && !verifiedOverride) {
      notify?.("Verify the class first before marking it done.", "error");
      return;
    }

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
      notify?.(
        response.data?.contract_completed
          ? "Class marked as done. Contract complete — final reviews are now open for both of you."
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

  const markSelectedClassNoShow = async () => {
    if (!selectedClass?.id || !selectedClass?.student_id) {
      notify?.("Please select a class first.", "error");
      return;
    }

    setConfirmAction({
      type: "no-show",
      title: "Mark as no-show?",
      message: "Mark this class as no-show and return the student's booking credit?",
      confirmLabel: "Mark No-Show",
    });
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
  // The contract's deadline, from the active package when there is one and the
  // most recent package when there is not. `studentPackage` stays null once a
  // contract runs out - that is deliberate and every booking check depends on it -
  // so the deadline has to be able to survive its absence.
  const contractExpiresAt =
    studentPackage?.expires_at ?? latestStudentPackage?.expires_at ?? null;
  const hasNoActiveStudentPackage = localRole === "student" && !studentPackage;
  const hasNoBookableClasses = localRole === "student" && Number(effectiveBookableClasses) <= 0;
  const contractExhausted = localRole === "student" && !!studentPackage && Number(effectiveClassesLeft) <= 0;
  const allRemainingClassesReserved =
    localRole === "student" &&
    !!studentPackage &&
    Number(effectiveClassesLeft) > 0 &&
    Number(effectiveBookableClasses) <= 0;
  // !! This is the case the client reported. A contract that ended with classes
  // !! still on it used to satisfy hasNoActiveStudentPackage, so the only thing
  // !! offered was "request a new contract" - and approving a new contract
  // !! expires the old package and starts a fresh one at zero used. The student's
  // !! unspent classes would have been discarded by the very screen meant to help
  // !! them. The rule lives in contractExpiry.js so it is decided and tested once
  // !! rather than re-derived on this screen.
  const contractAsk = describeExtensionEligibility({
    activePackage: studentPackage,
    latestPackage: latestStudentPackage,
  });
  const endedContractWithUnusedClasses = contractAsk === "extend";

  // What state the plan is in, in one sentence.
  //
  // !! The old page had this as a line under the counter, and the rebuild
  // !! dropped it. The number alone does not say it: a student with every
  // !! class used up and a student with every class booked show the same
  // !! "0 ready to book", and only this sentence tells them apart - one needs
  // !! a new plan, the other needs to move a class.
  const studentPlanStatusNote = (() => {
    if (hasNoActiveStudentPackage) {
      return endedContractWithUnusedClasses ? PLAN_STATUS.endedWithClasses : PLAN_STATUS.noPlan;
    }
    if (contractExhausted) return PLAN_STATUS.allUsed;
    if (allRemainingClassesReserved) return PLAN_STATUS.allBooked;
    return PLAN_STATUS.normal;
  })();

  // The student's classes, as a list a person can read.
  //
  // !! The class rows carry dates in the teacher's timezone and times as
  // !! "HH:MM:SS" strings. A student needs "TODAY" and "3:00 PM", and the
  // !! conversion happens here so that everything above this line is in
  // !! words.
  //
  // !! Not memoised: the rows are put into shape by a function that is
  // !! rebuilt on every render, so a memo would be rebuilt on every render
  // !! anyway. Six rows, once a render.
  const simpleStudentClasses = isSimpleStudentView
    ? studentUpcomingClasses.map((raw) => {
        const cls = formatClassForViewer(raw);
        const viewerDate = normalizeDate(cls.scheduled_date);
        const time = humanTime(cls.start_time || cls.time || "");
        const endTime = humanTime(getEndTime(cls.start_time || cls.time, cls.duration, cls.end_time) || "");

        return {
          id: cls.id,
          classInfo: cls,
          dayLabel: describeClassDay({
            viewerDate,
            todayKey: viewerTodayKey,
            tomorrowKey: addDaysToDateKey(viewerTodayKey, 1),
          }),
          timeLabel: time ? (endTime ? `${time} - ${endTime}` : time) : HOME.timeToBeDecided,
          subtitle: cls.className || studentProfile?.course_name || HOME.yourClass,
          viewerDate,
          time,
        };
      })
    : [];

  /**
   * The teacher's and the admin's classes, as a list.
   *
   * !! This is the "list" way of looking at the calendar: the same classes
   * !! the grid shows, in a column, one after another, in the shape the
   * !! student's own page uses.
   * !!
   * !! The month is already loaded - /classes-by-month fills the cache for
   * !! every day of it, and the grid is drawn from that same cache - so the
   * !! list is the grid's data read a different way, not a second request.
   * !!
   * !! The month is kept, past days included, because the grid shows them
   * !! too and a teacher looking at October wants to see October.
   */
  const simpleTeacherClasses = useMemo(() => {
    if (!isTeacherOrAdmin) return [];

    const rows = [];
    Object.entries(classesCache).forEach(([dateKey, classes]) => {
      (classes || []).forEach((cls) => {
        if (cls.verification_status === "incomplete") return;
        const viewerDate = normalizeDate(cls.scheduled_date || dateKey);
        const start = humanTime(cls.start_time || cls.time || "");
        const end = humanTime(getEndTime(cls.start_time || cls.time, cls.duration, cls.end_time) || "");

        rows.push({
          id: cls.id ?? cls.class_id,
          classInfo: cls,
          dayLabel: describeClassDay({
            viewerDate,
            todayKey: viewerTodayKey,
            tomorrowKey: addDaysToDateKey(viewerTodayKey, 1),
          }),
          timeLabel: start ? (end ? `${start} - ${end}` : start) : HOME.timeToBeDecided,
          // A teacher wants to know who is coming. An admin wants to know
          // who is teaching.
          subtitle:
            localRole === "teacher"
              ? cls.studentFullName || cls.studentName || HOME.yourClass
              : cls.teacherFullName || cls.teacherName || cls.teacher || HOME.yourClass,
          viewerDate,
          sortKey: `${viewerDate} ${cls.start_time || cls.time || ""}`,
        });
      });
    });

    return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [classesCache, isTeacherOrAdmin, localRole, viewerTodayKey]);

  // The days a teacher can set availability for, in the month the picker is on.
  const availabilityPickerDays = useMemo(
    () =>
      buildMonthDayChoices({
        year: availabilityPickerMonth.year,
        month: availabilityPickerMonth.month,
        todayKey: viewerTodayKey,
        endKey: scheduleWindowEndKey,
      }),
    [availabilityPickerMonth, viewerTodayKey, scheduleWindowEndKey]
  );

  const availabilityPickerMonthName = useMemo(() => {
    const date = new Date(availabilityPickerMonth.year, availabilityPickerMonth.month, 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [availabilityPickerMonth]);

  // How far the picker can move: from this month to the end of the window.
  const availabilityPickerBounds = useMemo(() => {
    const start = new Date(viewerToday.getFullYear(), viewerToday.getMonth(), 1);
    const end = dateKeyToLocalDate(scheduleWindowEndKey);
    return {
      minKey: monthKey(start.getFullYear(), start.getMonth()),
      maxKey: end ? monthKey(end.getFullYear(), end.getMonth()) : monthKey(start.getFullYear(), start.getMonth()),
    };
  }, [viewerToday, scheduleWindowEndKey]);

  const moveAvailabilityPickerMonth = (delta) => {
    setAvailabilityPickerMonth((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const canMoveAvailabilityPickerMonth = (delta) =>
    canStepMonth({
      year: availabilityPickerMonth.year,
      month: availabilityPickerMonth.month,
      delta,
      minKey: availabilityPickerBounds.minKey,
      maxKey: availabilityPickerBounds.maxKey,
    });

  // What the picker knows about a day: free, busy, or nothing yet.
  //
  // !! Only when we have actually loaded that month. The records are the
  // !! visible month's, so a picker on another month knows nothing and says
  // !! nothing rather than claiming every day is free.
  const availabilityPickerStatusFor = (key) => {
    if (
      availabilityPickerMonth.year !== year ||
      availabilityPickerMonth.month !== month
    ) {
      return null;
    }
    const record = teacherAvailabilityList.find(
      (entry) => normalizeDate(entry.available_date) === key
    );
    return record ? record.status : null;
  };

  const closeAvailabilityManager = () => {
    setSetAvailabilityMode(false);
    setAvailabilityError("");
    setAvailabilityScreen("form");
    setEditingAvailability(null);
  };

  /**
   * Open the list of the days the teacher has already set.
   *
   * !! It is a screen of the same window, not another window, so the teacher
   * !! can go back to the form without losing what they were doing.
   */
  const openAvailabilityList = async () => {
    setAvailabilityScreen("list");
    await loadTeacherAvailabilityForWindow();
  };

  /**
   * Put one of the teacher's existing availabilities back into the form.
   *
   * !! The form saves by date, so editing a day means saving that day again
   * !! with the new times. The day is moved onto the screen too, or the
   * !! teacher would be editing a date they cannot see.
   */
  const editAvailability = (record) => {
    const recordDate = normalizeDate(record.available_date);
    setEditingAvailability(record);
    setAvailabilityApplyMode("single");
    setAvailabilityDate(recordDate);
    setAvailabilityStatus(record.status === "available" ? "available" : "unavailable");
    setAvailabilityStartTime(record.start_time ? normalizeTime(record.start_time) : "");
    setAvailabilityEndTime(record.end_time ? normalizeTime(record.end_time) : "");
    setAvailabilityBreakStart(record.break_start ? normalizeTime(record.break_start) : "");
    setAvailabilityBreakEnd(record.break_end ? normalizeTime(record.break_end) : "");
    setAvailabilityError("");

    const date = dateKeyToLocalDate(recordDate);
    if (date) {
      setAvailabilityPickerMonth({ year: date.getFullYear(), month: date.getMonth() });
    }

    setAvailabilityScreen("form");
  };


  //
  // !! Fourteen days is enough for booking a class, which is usually soon.
  // !! Moving a class is different: a student whose class was cancelled for
  // !! a holiday in three weeks needs to pick a day three weeks out, and a
  // !! strip that stops at two would quietly refuse them. So the two get
  // !! different lengths.
  //
  // !! The days a student books from are now a MONTH, not a fortnight, with
  // !! arrows that move between months. A fortnight of days stops half way
  // !! through the student's own plan: their contract runs three months, and
  // !! the days they are allowed to book stop two weeks in.
  const simpleBookingDays = useMemo(
    () =>
      buildMonthDayChoices({
        year: studentBookingMonth.year,
        month: studentBookingMonth.month,
        todayKey: viewerTodayKey,
        endKey: studentBookingEndKey,
      }),
    [studentBookingMonth, viewerTodayKey, studentBookingEndKey]
  );

  // The months the student's picker can reach.
  //
  // !! From this month to the month their plan ends. Not one month before
  // !! and not one month after: a day outside the contract is a day the
  // !! student cannot book, and offering it greyed out is a dead end.
  const studentBookingMonthBounds = useMemo(
    () => monthBoundsForRange({ startKey: viewerTodayKey, endKey: studentBookingEndKey }),
    [viewerTodayKey, studentBookingEndKey]
  );

  const studentBookingMonthName = useMemo(() => {
    const date = new Date(studentBookingMonth.year, studentBookingMonth.month, 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [studentBookingMonth]);

  const moveStudentBookingMonth = (delta) => {
    setStudentBookingMonth((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const canMoveStudentBookingMonth = (delta) =>
    canStepMonth({
      year: studentBookingMonth.year,
      month: studentBookingMonth.month,
      delta,
      minKey: studentBookingMonthBounds.minKey,
      maxKey: studentBookingMonthBounds.maxKey,
    });

  // !! Moving a class is the same booking as making one - the class still has
  // !! to land on a day the student's plan reaches - so the strip stops at the
  // !! end of the plan. It used to stop at the end of the teacher's window,
  // !! which offered days the request would then refuse.
  const simpleRescheduleDays = useMemo(
    () => buildDayChoices({ todayKey: viewerTodayKey, endKey: studentBookingEndKey, limit: 28 }),
    [viewerTodayKey, studentBookingEndKey]
  );

  // Which of the days in the strip the teacher actually works.
  //
  // !! The month grid carried this in its colours - a green square meant
  // !! "you can press this" and a pale one meant "there is no class here".
  // !! The strip of days has no colours, so without this a student taps a day
  // !! the teacher does not work and is told "no free times on this day",
  // !! which reads as their fault and is not.
  // !!
  // !! The strip can cross a month boundary, so both months are fetched.
  const [simpleAvailability, setSimpleAvailability] = useState({});

  // Are those days still on their way?
  //
  // !! The booking wizard tells a student which days are free, and a day that
  // !! is "no times yet" because the answer had not arrived yet is a day the
  // !! wizard must not grey out. So the wizard has to know the difference
  // !! between "the teacher does not work that day" and "we do not know yet".
  const [simpleAvailabilityLoading, setSimpleAvailabilityLoading] = useState(false);

  useEffect(() => {
    if (!isSimpleStudentView || !assignedTeacherId) return;

    const months = new Set();
    simpleBookingDays.forEach((day) => {
      const date = dateKeyToLocalDate(day.key);
      if (date) months.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
    });
    if (!months.size) return;

    let active = true;
    setSimpleAvailabilityLoading(true);

    Promise.all(
      [...months].map((month) => {
        const [year, monthNumber] = month.split("-").map(Number);
        return axios
          .get(`${API}/api/calendar/teacher-availability`, {
            params: { teacher_id: assignedTeacherId, year, month: monthNumber },
          })
          .then((r) => r.data?.availability || {})
          .catch(() => ({}));
      })
    ).then((maps) => {
      if (!active) return;
      setSimpleAvailability(Object.assign({}, ...maps));
      setSimpleAvailabilityLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isSimpleStudentView, assignedTeacherId, simpleBookingDays]);

  // The student's own requests, and what they may do about them.
  //
  // Matching on request_type is the point: an approved new-contract request from
  // months ago must not make a pending extension look already-answered, and a
  // pending extension must not make a new-contract request look answered
  // either. The two kinds are separate requests and they are read separately.
  //
  // !! These two objects are read by everything below, so they have to stay
  // !! declared above it. They were once declared further down and the
  // !! Calendar crashed on every render with "Cannot access 'ht' before
  // !! initialization" - the temporal dead zone. Nothing catches that: the
  // !! bundler builds clean and the tests pass, because they exercise the
  // !! rules directly and never evaluate the component's declaration order.
  // !! Only the browser can see it.
  const extensionFlow = describeRequestFlow({
    pending: pendingContractRequests,
    history: contractRequests,
    kind: REQUEST_KIND_EXTENSION,
  });
  const newContractFlow = describeRequestFlow({
    pending: pendingContractRequests,
    history: contractRequests,
    kind: REQUEST_KIND_NEW,
  });

  // The two kinds cannot both be in flight.
  //
  // !! A new contract replaces the contract the unused classes are on, so
  // !! approving one throws away what the other is asking to preserve. There
  // !! is no version of the two that can both be granted, so the other route
  // !! is closed while one of them is with the admin - and the student is
  // !! told that withdrawing the one they sent is the way to open it.
  // !!
  // !! The server refuses it too, so this is not a button that pretends:
  // !! the rule is the same on both sides of the wire.
  const extensionBlocked = describeBlockedByOtherRequest({
    kind: REQUEST_KIND_EXTENSION,
    otherKind: REQUEST_KIND_NEW,
    otherIsPending: newContractFlow.isPending,
  });
  const newContractBlocked = describeBlockedByOtherRequest({
    kind: REQUEST_KIND_NEW,
    otherKind: REQUEST_KIND_EXTENSION,
    otherIsPending: extensionFlow.isPending,
  });

  // A decline has to leave a way forward, so the card offers to ask again
  // rather than the component re-deriving it. An approval opens nothing -
  // there is nothing left to ask for once the extension has been granted.
  const canAskAgain = extensionFlow.canAskAgain;
  // The rule, in one place.
  //
  // !! A student with a LIVE contract and classes left has nothing to ask
  // !! for. The old page had this in its layout - the buttons were not
  // !! there - and the rebuild with three permanent buttons lost it. Which
  // !! matters most for the new plan: approving one expires the contract
  // !! they are on and starts a fresh one at zero used, so the classes they
  // !! paid for are thrown away. A button that says "Get a new plan" to a
  // !! student with twelve unused classes is a button that can cost them
  // !! twelve classes.
  const { canRequestMoreTime, canRequestNewPlan } = describeAvailableRequests({
    contractAsk,
    canAskAgain,
  });
  // Kept under their old names too, because half the page reads them.
  const canRequestExtension = canRequestMoreTime;
  // Suppressed rather than shown alongside: two different asks for the same
  // situation, and the one that silently throws their balance away should not be
  // the one sitting next to the button that does not.
  const canRequestNewContract = canRequestNewPlan;

  const hasNoClassesLeft = hasNoBookableClasses;
  const studentBookingLimit = Math.max(0, Number(effectiveBookableClasses || 0));

  // Are the free times for the day the student picked still on their way?
  const bookingTimesLoading = Boolean(
    studentBookingMode &&
    studentBookingDate &&
    (
      teacherClassesCache[studentBookingDate] === undefined ||
      (localRole === "student" && !teacherAvailabilityLoaded) ||
      bookingTimesReadyDate !== studentBookingDate
    )
  );

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
  /**
   * One day, one time.
   *
   * !! The old toggle let a student collect any number of times on any number
   * !! of days, and the "one time" way of booking had no use for more than
   * !! one. A child tapping a second time did not mean "add another class" -
   * !! it meant they were not sure the first tap had worked. So the second tap
   * !! now takes the first one back.
   */
  const pickSingleBookingTime = (date, time) => {
    const normalizedDate = normalizeDate(date);
    const normalizedTime = normalizeTime(time);
    if (!normalizedDate || !normalizedTime) return;
    if (isTeacherDateTimeBooked(normalizedDate, normalizedTime)) return;

    if (studentBookingLimit <= 0) {
      setStudentBookingError(BOOKING.noClassesLeft);
      return;
    }

    const key = studentBookingSelectionKey(normalizedDate, normalizedTime);
    const alreadyPicked = studentBookingSelections.some(
      (slot) => studentBookingSelectionKey(slot.date, slot.time) === key
    );

    if (alreadyPicked) {
      setStudentBookingSelections([]);
      setStudentBookingTime("");
      setStudentBookingError("");
      return;
    }

    const selectedAvailabilityRecord = teacherAvailabilityList.find(
      record => normalizeDate(record.available_date) === normalizedDate
    ) || (
      normalizeDate(teacherAvailabilityRecordForDate?.available_date) === normalizedDate
        ? teacherAvailabilityRecordForDate
        : null
    );

    setStudentBookingError("");
    setStudentBookingTime(normalizedTime);
    setStudentBookingSelections([
      {
        date: normalizedDate,
        time: normalizedTime,
        teacher_timezone: selectedAvailabilityRecord?.teacher_timezone || DEFAULT_TIMEZONE,
      },
    ]);
  };

  const toggleStudentBookingWeekday = (weekday) => {
    setStudentBookingWeeklyWeekdays((current) => {
      const exists = current.includes(weekday);
      const next = exists ? current.filter((value) => value !== weekday) : [...current, weekday];
      return next.sort((a, b) => a - b);
    });
    setStudentBookingError("");
    setStudentBookingSuggestions([]);
    setStudentBookingSuggestionsTotal(0);
  };
  const loadTeacherAvailabilityRecordsForScheduleWindow = async (endKey = scheduleWindowEndKey) => {
    if (!assignedTeacherId) return [];
    const monthKeys = [];
    const cursor = new Date(viewerToday.getFullYear(), viewerToday.getMonth(), 1);
    const end = dateKeyToLocalDate(endKey);
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
        return dateKey >= scheduleWindowStart && dateKey <= endKey;
      });
  };
  /**
   * Look for the times that match the chosen days and the chosen time.
   *
   * !! The student can ask for a part of the day - "morning" - or for an
   * !! exact time. The two are different questions:
   * !!
   * !!   - A part of the day is "every free time in the morning". The old
   * !!     form asked for 8:00 and gave back the closest time on each day,
   * !!     which is one time per day and left the student guessing what else
   * !!     was free. Now every time in that part of the day comes back.
   * !!   - An exact time is still "the closest one to this", because that is
   * !!     what asking for a time means.
   * !!
   * !! It says whether it found anything, because the wizard has to know
   * !! whether to move on to the screen that shows the times or to stay put
   * !! with the reason on it.
   */
  const applyStudentWeeklyPattern = async () => {
    setStudentBookingError("");
    setStudentBookingSuggestions([]);
    setStudentBookingSuggestionsTotal(0);
    const choice = studentBookingWeeklyTime;
    // An exact time, or nothing at all when the student asked for a part of
    // the day.
    const preferredTime = isPartOfDay(choice) ? "" : normalizeTime(choice);
    if (!studentBookingWeeklyWeekdays.length) {
      setStudentBookingError(BOOKING.noDaysPicked);
      return false;
    }
    if (!choice) {
      setStudentBookingError(BOOKING.noTimePicked);
      return false;
    }
    if (!studentBookingLimit) {
      setStudentBookingError(BOOKING.noClassesLeft);
      return false;
    }
    if (studentBookingSelections.length >= studentBookingLimit) {
      setStudentBookingError(`You already picked ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"}.`);
      return false;
    }

    try {
      // Every day the student is allowed to book, not just this month.
      //
      // !! The search used to stop at the end of the booking window, which is
      // !! three months from today - and it offered every one of those days
      // !! to a student whose plan might have ended in the middle of them.
      // !! A class booked on a day the student's plan does not reach is a
      // !! class nobody can pay for, so the contract is the end of the
      // !! search now.
      const records = await loadTeacherAvailabilityRecordsForScheduleWindow(studentBookingEndKey);
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
      const matching = [];

      candidateSlots.forEach((slot) => {
        const classesForDate = classesByDate.get(slot.date) || [];
        if (studentSlotOverlapsClassList(classesForDate, slot.time)) return;

        // A part of the day: every free time in it, on every chosen day.
        if (isPartOfDay(choice)) {
          if (!isTimeInPart(slot.time, choice)) return;
          matching.push(slot);
          return;
        }

        // An exact time: the closest one on each day.
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

      if (!isPartOfDay(choice)) {
        Array.from(slotsByDate.values()).forEach((slot) => matching.push(slot));
      }

      matching.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

      if (!matching.length) {
        setStudentBookingError(BOOKING.noTimesFound);
        return false;
      }

      // The soonest ones, and the student is told there are more.
      //
      // !! A teacher who works every morning, three days a week, for three
      // !! months, has over two hundred free morning times. A list that long
      // !! is not a list - it is the wall of choices this screen was built to
      // !! stop. So the soonest ones are shown and the student is told how
      // !! many there are in all.
      const total = matching.length;
      const shown = matching.slice(0, MAX_WEEKLY_SUGGESTIONS);

      setStudentBookingSuggestions(shown);
      setStudentBookingSuggestionsTotal(total);
      if (!isPartOfDay(choice)) setStudentBookingTime(preferredTime);
      notify?.(`We found ${total} time${total === 1 ? "" : "s"}.`, "success");
      return true;
    } catch (err) {
      console.error(err);
      setStudentBookingError(BOOKING.cannotLookUp);
      return false;
    }
  };

  /**
   * Take a class back out of the picks.
   *
   * !! A student who pressed "Add" on four times and then wants three of
   * !! them should be able to say so. There was no way to do that: the
   * !! button said "Added", was greyed out, and pressed nothing. Now the
   * !! button says "Remove" and this is what it does.
   */
  const removeStudentBookingSelection = (date, time) => {
    const key = studentBookingSelectionKey(date, time);
    setStudentBookingSelections((current) =>
      current.filter((slot) => studentBookingSelectionKey(slot.date, slot.time) !== key)
    );
    setStudentBookingError("");
  };

  /**
   * Add every time we found.
   *
   * !! The list stays on the screen afterwards. The old form emptied it, and
   * !! a student who pressed "Add all" and then wanted to take one back had
   * !! nothing left to take it back from.
   */
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
        setStudentBookingError(`You can only pick ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"}.`);
        return current;
      }
      if (studentSlotOverlapsSelections(current, suggestion.date, suggestion.time)) {
        setStudentBookingError("That time is too close to a class you already picked.");
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
  // A booked class has to be a class the student may book, so the end of the
  // window is the end of their contract rather than the end of the teacher's
  // planning window.
  const scheduleWindowEnd = studentBookingEndKey;

  const openMonthlyBooking = () => {
    if (hasNoClassesLeft) {
      setStudentBookingError(BOOKING.noClassesLeft);
      return;
    }

    setYear(viewerToday.getFullYear());
    setMonth(viewerToday.getMonth());
    // The picker opens on the month the student is living in, not on
    // whichever month they left it on last time.
    setStudentBookingMonth({
      year: viewerToday.getFullYear(),
      month: viewerToday.getMonth(),
    });
    setStudentBookingMode(true);
    // No day chosen to start with. The student is offered a strip of days,
    // and they pick the one they want.
    setStudentBookingDate("");
    setStudentBookingTime("");
    setStudentBookingSelections([]);
    setStudentBookingSuggestions([]);
    setStudentBookingSuggestionsTotal(0);
    setStudentBookingSubject("");
    setStudentBookingError("");
    setSelectedDate(null);
    setSelectedClassId(null);
  };

  const submitContractRequest = async () => {
    setContractRequestError("");

    if (!matchPreview) {
      setContractRequestError(NEW_PLAN_WINDOW.checkTeacherRequired);
      return;
    }

    if (!contractCourseId) {
      setContractRequestError("Please pick a course.");
      return;
    }

    if (!contractClassCount || Number(contractClassCount) <= 0) {
      setContractRequestError("Please pick how many classes you want.");
      return;
    }

    const missing = missingContractPreferences();
    if (missing.length) {
      setContractRequestError(`Complete all required preferences before sending: ${missing.join(", ")}.`);
      return;
    }

    setIsSubmittingContractRequest(true);
    try {
      const response = await axios.post(`${API}/api/student/contract-requests`, {
        student_id: localUserId,
        course_id: contractCourseId,
        requested_classes: contractClassCount,
        class_duration: contractClassDuration,

        // The "Others" free text is merged in here, by the same function the
        // admin's Create Student form uses. Sending contractAiCriteria raw would
        // carry the __custom__ sentinel to the scorer, where it matches nothing
        // and then reports as a criterion the student failed.
        ai_criteria: mergedContractCriteria,
        // null, not a half-filled object, when incomplete. The server treats
        // both the same way - no preference - but sending null means the columns
        // are cleared on an edit rather than retaining a stale answer.
        preferred_schedule: toPreferredSchedulePayload(contractPreferredSchedule),
      });

      // The server says whether this was a first ask or a change to one, and
      // the student is told which. "Sent" and "changed" are different things,
      // and a student who pressed Send twice deserves to know the second
      // press changed their ask rather than adding to it.
      notify?.(
        response.data?.isRevision
          ? "Your request was updated. The administrator will review the latest version."
          : "Your request was submitted. We will notify you when the administrator makes a decision.",
        "success"
      );
      setContractRequestOpen(false);
      setNewPlanStep(0);
      // Cleared so the form does not linger next time. The extension route is
      // hidden while this is set, and a leftover `true` would keep showing a new
      // contract form to a student who should only be offered an extension.
      setRequestingNewContract(false);
      setContractRequestEditing(false);
      setContractClassDuration("50");

      setContractAiCriteria(createEmptyCriteria());
      setContractCriteriaOther({ learningGoal: "", focusArea: "", learningStyle: "", pace: "" });
      setContractPreferredSchedule(createEmptyPreferredSchedule());
      loadContractRequests();
    } catch (err) {
      setContractRequestError(err?.response?.data?.message || "We could not submit your request. Please try again.");
    } finally {
      setIsSubmittingContractRequest(false);
    }
  };

  const submitExtensionRequest = async () => {
    setContractRequestError("");

    if (!contractExtensionNote.trim()) {
      setContractRequestError("Please explain why you need additional time.");
      return;
    }

    setIsSubmittingContractRequest(true);
    try {
      const response = await axios.post(`${API}/api/student/contract-requests`, {
        student_id: localUserId,
        request_type: "extension",
        trial_notes: contractExtensionNote.trim(),
      });

      notify?.(
        response.data?.isRevision
          ? "Your request was updated. Your unused classes remain available while it is being reviewed."
          : "Your request was submitted. Your unused classes remain available while it is being reviewed.",
        "success"
      );
      setContractRequestOpen(false);
      setContractRequestEditing(false);
      setContractExtensionNote("");
      loadContractRequests();
    } catch (err) {
      setContractRequestError(err?.response?.data?.message || "We could not submit your request. Please try again.");
    } finally {
      setIsSubmittingContractRequest(false);
    }
  };

  /**
   * Withdraw a request that is still with the admin.
   *
   * !! A student who sent a request by mistake had no way out of it before.
   * !! The only thing they could do was wait for an admin to decline it, which
   * !! spends a decision on a mistake and leaves the request in the queue the
   * !! whole time. A request the student no longer wants is not a request at
   * !! all, so they are allowed to say so.
   */
  const cancelContractRequest = async (requestId) => {
    if (!requestId) return;

    setIsCancellingContractRequest(true);
    setContractRequestError("");
    try {
      const response = await axios.post(
        `${API}/api/student/contract-requests/${requestId}/cancel`,
        { student_id: localUserId }
      );
      notify?.(response.data?.message || "Your request was withdrawn.", "success");
      setContractRequestOpen(false);
      setContractRequestEditing(false);
      setContractExtensionNote("");
      loadContractRequests();
    } catch (err) {
      setContractRequestError(err?.response?.data?.message || "Unable to withdraw the request.");
    } finally {
      setIsCancellingContractRequest(false);
    }
  };

  /**
   * Open the extension form, either to send a first request or to change one
   * that is already with the admin.
   *
   * Changing the note of a request the admin is reading is a revision, and it
   * is worth saying so - both to the student, who might otherwise think they
   * had sent two requests, and to the admin, who sees the earlier version kept
   * in the history rather than overwritten.
   */
  const openExtensionRequestForm = ({ editing = false } = {}) => {
    setRequestingNewContract(false);
    setContractRequestOpen(true);
    setContractRequestEditing(editing);
    setContractRequestError("");

    if (editing) {
      const pending = extensionFlow.pendingRequest;
      setContractExtensionNote(pending?.trial_notes || "");
    } else {
      setContractExtensionNote("");
    }
  };

  /**
   * Open the new-contract form, either to send a first request or to change one
   * that is already with the admin.
   */
  const openNewContractForm = ({ editing = false } = {}) => {
    setRequestingNewContract(true);
    setNewPlanStep(0);
    setContractRequestOpen(true);
    setContractRequestEditing(editing);
    setContractRequestError("");
    updateContractCourse(studentProfile?.course_id || "");
  };

  const continueNewPlanStep = () => {
    setContractRequestError("");
    if (newPlanStep === 0 && !contractCourseId) {
      setContractRequestError("Select a course to continue.");
      return;
    }

    const requiredCriterionByStep = {
      1: ["learningGoal", "Select at least one learning objective."],
      2: ["focusArea", "Select at least one skill to focus on."],
      3: ["learningStyle", "Select at least one learning preference."],
      4: ["pace", "Select a learning pace."],
    };
    const requirement = requiredCriterionByStep[newPlanStep];
    if (requirement && !mergedContractCriteria[requirement[0]].length) {
      setContractRequestError(requirement[1]);
      return;
    }

    setNewPlanStep((step) => Math.min(step + 1, NEW_PLAN_STEPS.length - 1));
  };

  const updateContractCourse = (courseId) => {
    const selectedCourseNames = courses
      .filter((course) => String(course.course_id) === String(courseId))
      .map((course) => course.course_name);
    setContractCourseId(courseId);
    // Keep only the selections that still apply to the newly chosen course.
    setContractAiCriteria((current) => ({
      ...current,
      learningGoal: pruneSelectionToCourses(
        current?.learningGoal,
        STUDENT_CRITERIA_DISPLAY_OPTIONS.learningGoal,
        selectedCourseNames
      ),
      focusArea: pruneSelectionToCourses(
        current?.focusArea,
        STUDENT_CRITERIA_DISPLAY_OPTIONS.focusArea,
        selectedCourseNames
      ),
    }));
  };

  const toggleContractAiCriterionValue = (key, value) => {
    // Plain toggle. An earlier version stripped the "__custom__" sentinel here if
    // the matching Others box was empty, which was a guard against the inline
    // input's empty box leaving a selection behind. The box is a dialog now and
    // cannot be saved empty, and the strip created a real bug: the component
    // commits the text and then asks to add the tick, so this handler read a text
    // state that had not been applied yet and removed the selection it was just
    // given. criteriaWithCustom still strips the sentinel on submit, which is the
    // right place for that guarantee - once, for every form.
    setContractAiCriteria((current) => ({
      ...current,
      [key]: toggleValue(current?.[key], value),
    }));
  };

  const submitStudentBooking = async () => {
    setStudentBookingError("");
    const slotsToBook = studentBookingSelections.length
      ? studentBookingSelections
      : studentBookingDate && studentBookingTime
        ? [{ date: studentBookingDate, time: studentBookingTime }]
        : [];

    if (!slotsToBook.length) {
      setStudentBookingError(BOOKING.pickTimeFirst);
      return;
    }
    if (!assignedTeacherId) {
      setStudentBookingError("Unable to book because your assigned teacher is not available.");
      return;
    }
    if (hasNoClassesLeft) {
      setStudentBookingError(BOOKING.noClassesLeft);
      return;
    }
    if (slotsToBook.length > studentBookingLimit) {
      setStudentBookingError(`You can only book ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"}.`);
      return;
    }

    const invalidSlot = slotsToBook.find((slot) => slot.date < scheduleWindowStart || slot.date > scheduleWindowEnd);
    if (invalidSlot) {
      setStudentBookingError(studentBookingWindowMessage);
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
      setStudentBookingSuggestionsTotal(0);
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

  /**
   * Book the class the student has chosen.
   *
   * !! There used to be a second window here - "Check your booking" - with
   * !! its own Yes button. It is gone, and that is the point: the wizard's
   * !! last screen IS the check. It shows the day, the time, the teacher and
   * !! how long the class is, in big letters, and the button under it says
   * !! "Book it". A student was being asked to confirm the same thing twice
   * !! by two screens that looked different, and the second one lost them.
   */
  const openStudentBookingConfirmation = async () => {
    setStudentBookingError("");
    const slotsToBook = studentBookingSelections.length
      ? studentBookingSelections
      : studentBookingDate && studentBookingTime
        ? [{ date: studentBookingDate, time: studentBookingTime }]
        : [];
    if (!slotsToBook.length) {
      setStudentBookingError(BOOKING.pickTimeFirst);
      return;
    }
    if (!assignedTeacherId) {
      setStudentBookingError("Your teacher is not here yet. Please contact the admin.");
      return;
    }
    if (hasNoClassesLeft) {
      setStudentBookingError(BOOKING.noClassesLeft);
      return;
    }
    if (slotsToBook.length > studentBookingLimit) {
      setStudentBookingError(`You can only book ${studentBookingLimit} class${studentBookingLimit === 1 ? "" : "es"}.`);
      return;
    }
    if (slotsToBook.some((slot) => slot.date < scheduleWindowStart || slot.date > scheduleWindowEnd)) {
      setStudentBookingError(studentBookingWindowMessage);
      return;
    }
    if (slotsToBook.some((slot) => isTeacherDateTimeBooked(slot.date, slot.time))) {
      setStudentBookingError("Your teacher is already booked at this time. Please pick another time.");
      return;
    }

    await submitStudentBooking();
  };

  /**
   * Leave the booking without booking anything.
   */
  const closeStudentBooking = () => {
    setStudentBookingMode(false);
    setStudentBookingSelections([]);
    setStudentBookingSuggestions([]);
    setStudentBookingSuggestionsTotal(0);
    setStudentBookingTime("");
    setStudentBookingError("");
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

  /**
   * The student's own view of how a class went.
   *
   * !! The old page showed a student the whole evidence checklist - "Teacher
   * !! start", "Start screenshot", "End screenshot", "Class summary", and a
   * !! status pill that said "Needs Review". None of that is a student's
   * !! business, and all of it is jargon. But the old page DID tell the
   * !! student something - whether they were marked as being there, and
   * !! whether the class was finished - and the rebuild dropped that too.
   * !!
   * !! So the information stays and the words change: one sentence saying
   * !! where the class got to, in words a student would use.
   */
  const renderStudentClassStatus = () => {
    if (!selectedClass || isSelectedClassCompleted) return null;

    const sentences = {
      verified: "Your teacher marked this class as done.",
      student_confirmed: "You said you were here.",
      in_progress: "This class is happening now.",
      needs_review: "Your teacher is checking this class.",
      incomplete: "This class needs more checking.",
      pending: "This class has not been finished yet.",
    };

    return (
      <div className={kid.info}>
        <span>
          {sentences[selectedVerificationStatus] || sentences.pending}
          {hasVerificationRecording && verificationRecordingExpiresAt && (
            ` The recording is deleted ${formatVerificationTimestamp(verificationRecordingExpiresAt, true)}.`
          )}
        </span>
      </div>
    );
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
                      <button
                        type="button"
                        className={styles.evidenceViewBtn}
                        onClick={() => openAuthenticatedFile(selectedClassVerification.start_proof_url)}
                      >
                        View
                      </button>
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
                    <AuthenticatedImage
                      src={selectedClassVerification.start_proof_url}
                      alt="Start screenshot preview"
                      className={styles.evidencePreviewImage}
                    />
                  </div>
                )}

                {shouldRemindEndScreenshot && <div role="alert" className={styles.verificationAlert}>Capture the end screenshot before leaving the meeting.</div>}
              </div>
            )}
            {hasVerificationRecording && (
              <div style={{ display: "grid", gap: 8 }}>
                <strong style={{ color: "#166534", fontSize: "0.85rem" }}>Recording uploaded ✓</strong>
                <button
                  type="button"
                  onClick={() => openClassRecording({ classId: selectedClass.id, notify })}
                  style={{ borderRadius: 8, padding: "12px 14px", background: "#1864ab", color: "#fff", textAlign: "center", border: "none", fontWeight: 800 }}
                >
                  View Recording
                </button>
                {!recording.session && selectedClassStarted && !selectedClassEnded && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmAction({
                          type: "replace-recording",
                          title: "Replace recording?",
                          message: "Your current recording will be replaced only after the new recording uploads successfully.",
                          confirmLabel: "Record",
                          startRecording: () => recording.start(selectedClass.id),
                        });
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
            {recording.earlyStop
              && String(recording.earlyStop.classId) === String(selectedClass.id)
              && !selectedClassEnded && (
              <div
                role="alert"
                style={{
                  display: "grid",
                  gap: 8,
                  border: "1px solid #f0dcc0",
                  borderRadius: 10,
                  background: "#fdf3e7",
                  padding: "12px 14px",
                }}
              >
                <strong style={{ color: "#8a5a1f" }}>⚠️ Screen sharing stopped, so the recording ended early</strong>
                <span style={{ fontSize: "0.85rem", color: "#8a5a1f", lineHeight: 1.5 }}>
                  Only {formatRecordingDuration(recording.earlyStop.durationSeconds)} was captured. The class is still
                  running, so record again to cover the rest — otherwise the admin has to reject this as incomplete.
                </span>
                {!recording.session && (
                  <button
                    type="button"
                    onClick={() => recording.start(selectedClass.id)}
                    style={{
                      justifySelf: "start",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 14px",
                      background: "#8a5a1f",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Record again
                  </button>
                )}
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
                    <AuthenticatedImage
                      src={verificationProofPreview || verificationProofUrl}
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
                    <AuthenticatedImage
                      src={verificationProofPreview || verificationProofUrl}
                      alt="Class proof screenshot preview"
                      style={{ display: "block", width: "100%", maxHeight: 180, objectFit: "contain", background: "#f8fafc" }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className={`${cal.actionCard} ${cal.actionInfo}`}
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
            {localRole === "teacher" &&
              selectedClassStarted &&
              selectedClassStudentConfirmed &&
              !isSelectedClassCompleted && (
                <div className={styles.verificationRemark}>
                  <div>
                    <div className={styles.verificationSectionTitle}>Remark to student</div>
                    <div className={styles.verificationHelpText}>Optional: submit a remark to the student before completing this class.</div>
                  </div>
                  {selectedClassRemark && !isEditingSelectedRemark ? (
                    <div className={styles.verificationRemarkCard}>
                      <p>{selectedClassRemark.remarks}</p>
                      <div className={styles.verificationRemarkActions}>
                        <button
                          type="button"
                          className={styles.verificationRemarkEdit}
                          onClick={() => {
                            setRemarkDraft(selectedClassRemark.remarks);
                            setIsEditingSelectedRemark(true);
                          }}
                        >
                          Edit remark
                        </button>
                        <button
                          type="button"
                          className={styles.verificationRemarkRemove}
                          onClick={confirmRemoveSelectedRemark}
                        >
                          Remove remark
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={remarkDraft}
                        onChange={(event) => setRemarkDraft(event.target.value)}
                        disabled={remarkSubmitting}
                        rows={4}
                        placeholder="Write a remark about this class..."
                        className={styles.verificationTextarea}
                      />
                      <div className={styles.verificationRemarkActions}>
                        {isEditingSelectedRemark && (
                          <button
                            type="button"
                            className={styles.verificationRemarkEdit}
                            onClick={() => {
                              setRemarkDraft("");
                              setIsEditingSelectedRemark(false);
                            }}
                            disabled={remarkSubmitting}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={remarkSubmitting || !remarkDraft.trim()}
                          onClick={handleGiveRemark}
                          className={`${cal.actionCard} ${cal.actionInfo}`}
                          style={{
                            opacity: remarkSubmitting || !remarkDraft.trim() ? 0.6 : 1,
                            cursor: remarkSubmitting || !remarkDraft.trim() ? "not-allowed" : "pointer",
                          }}
                        >
                          {remarkSubmitting ? "Saving..." : isEditingSelectedRemark ? "Save changes" : "Submit remark"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            {selectedClassEnded && selectedClassVerified && (
              <button
                type="button"
                className={`${cal.actionCard} ${cal.actionInfo}`}
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
            <h1>{LOADING.title}</h1>
            <p>{LOADING.body}</p>
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
      <CalendarModuleGuide
        role={localRole}
        userId={localUserId}
        isReady={isUserReady && !isInitialCalendarLoading}
      />
      <section
        className={
          isSimpleStudentView || (isTeacherOrAdmin && calendarView === "list")
            ? styles.studentCenter
            : styles.center
        }
      >

        {/* The way of looking at the calendar.
            !!
            !! The grid and the list are the same classes, read two ways. A
            !! teacher finding the one class on a Tuesday wants the grid; a
            !! teacher reading a month of them wants the list, and the list is
            !! the shape the student's own page uses.
            !!
            !! Only the teacher and the admin get this. A student has one
            !! page, and there is nothing to choose between. */}
        {isTeacherOrAdmin && (
          <div className={cal.viewSwitchRow}>
            <div className={cal.viewSwitch} role="tablist" aria-label="Calendar view">
              <button
                type="button"
                role="tab"
                aria-selected={calendarView === "month"}
                className={`${cal.viewSwitchBtn} ${calendarView === "month" ? cal.viewSwitchBtnActive : ""}`}
                onClick={() => setCalendarView("month")}
              >
                <span aria-hidden="true">📅</span>
                {VIEW.month}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={calendarView === "list"}
                className={`${cal.viewSwitchBtn} ${calendarView === "list" ? cal.viewSwitchBtnActive : ""}`}
                onClick={() => setCalendarView("list")}
              >
                <span aria-hidden="true">📋</span>
                {VIEW.list}
              </button>
            </div>
          </div>
        )}

        <div
          className={
            isSimpleStudentView || (isTeacherOrAdmin && calendarView === "list")
              ? styles.simpleWrapper
              : styles.wrapper
          }
        >
          {/* The month grid.
              !!
              !! A student does not get one. A month grid asks a child to read
              !! a calendar, count the squares and work out which one is today
              !! - three things, none of which is the thing they came to do.
              !! The student's page is a list of their classes and three
              !! buttons, and when they need to pick a day they get a strip of
              !! days that say what they are.
              !!
              !! Teachers and admins still get it, and so does an admin
              !! looking at somebody else's calendar - they are reading a
              !! schedule, not using one. */}
          {!isSimpleStudentView && calendarView !== "list" && (
          <div className={cal.calendarCard} data-calendar-guide="calendar">
            <div className={cal.calHeader}>
              <button type="button" onClick={prevMonth} className={cal.navBtn} aria-label="Previous month">
                ‹
              </button>
              <div className={cal.monthLabel}>
                {monthName} {year}
              </div>
              <button type="button" onClick={nextMonth} className={cal.navBtn} aria-label="Next month">
                ›
              </button>
            </div>

            <div className={cal.weekHeader}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className={cal.weekday}>
                  {d}
                </div>
              ))}
            </div>

            <div className={cal.grid}>
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
                let cellClass = cal.cell;
                if (!d) {
                  cellClass = [cal.cell, cal.empty].join(" ");
                } else if (isPast) {
                  cellClass = [cal.cell, cal.pastCell].join(" ");
                } else if (status === "unavailable") {
                  cellClass = [cal.cell, cal.clickableCell, cal.unavailable].join(" ");
                } else if (hasClasses) {
                  cellClass = [cal.cell, cal.clickableCell, cal.hasClasses].join(" ");
                } else if (status === "available") {
                  cellClass = [cal.cell, cal.clickableCell, cal.available].join(" ");
                } else if (!teacherHasSchedule) {
                  cellClass = [cal.cell, cal.clickableCell, cal.unscheduled].join(" ");
                } else {
                  cellClass = [cal.cell, cal.clickableCell].join(" ");
                }
                
                if (isTodayCell) cellClass += " " + cal.today;
                if (isSelected) cellClass += " " + cal.selected;
                
                let tooltipText = "";
                if (d) {
                  if (isPast) {
                    tooltipText = LEGEND.past;
                  } else if (status === "unavailable") {
                    tooltipText = LEGEND.unavailable;
                  } else if (hasClasses) {
                    tooltipText = LEGEND.hasClasses;
                  } else if (status === "available") {
                    tooltipText = LEGEND.available;
                  } else if (!teacherHasSchedule) {
                    tooltipText = LEGEND.notSet;
                  }
                }
                
                return (
                  <button
                    key={idx}
                    type="button"
                    className={cellClass}
                    data-calendar-guide-day={d && !isPast ? "true" : undefined}
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
          )}

          {/* The list: the same classes, one after another.
              !!
              !! This is the shape the student's own page uses - a heading, a
              !! list of big cards, and nothing else. It is here for the
              !! teacher who wants to read a month rather than hunt through a
              !! grid for it.
              !!
              !! It disappears when a class is opened, and the class takes its
              !! place - the same way the student's page works, so "Back to
              !! Classes" comes back here too.
              !!
              !! The month arrows stay, because the list is a month as well
              !! as a list, and a teacher who cannot move between months has
              !! lost something the grid gave them. */}
          {isTeacherOrAdmin && calendarView === "list" && !selectedClass && (
            <div className={cal.calendarCard} data-calendar-guide="calendar">
              <div className={cal.calHeader}>
                <button type="button" onClick={prevMonth} className={cal.navBtn} aria-label="Previous month">
                  ‹
                </button>
                <div className={cal.monthLabel}>
                  {monthName} {year}
                </div>
                <button type="button" onClick={nextMonth} className={cal.navBtn} aria-label="Next month">
                  ›
                </button>
              </div>

              <div className={kid.homeHeader}>
                <h2 className={kid.homeTitle}>
                  {localRole === "teacher" ? HOME.myClasses : HOME.allClasses}
                </h2>
                <p className={kid.homeSubtitle}>
                  {localRole === "teacher"
                    ? HOME.monthClasses(`${monthName} ${year}`)
                    : HOME.allMonthClasses(`${monthName} ${year}`)}
                </p>
              </div>

              {simpleTeacherClasses.length > 0 ? (
                <div className={kid.classList} style={{ marginTop: 16 }}>
                  {simpleTeacherClasses.map((entry) => (
                    <ClassCard
                      key={entry.id ?? `${entry.viewerDate}-${entry.timeLabel}`}
                      classInfo={entry}
                      onOpen={() => {
                        setSelectedDate(entry.viewerDate);
                        setSelectedClassId(entry.classInfo.id ?? entry.classInfo.class_id);
                      }}
                      actionLabel={HOME.details}
                    />
                  ))}
                </div>
              ) : (
                <div className={kid.empty} style={{ marginTop: 16 }}>
                  <span className={kid.emptyIcon} aria-hidden="true">📅</span>
                  <span>{HOME.noClassesThisMonth}</span>
                </div>
              )}
            </div>
          )}

          <aside className={styles.calendarAside}>
            {isTeacherOrAdmin ? (
              selectedClass ? (
                <>
                  <div className={kid.pastCard}>
                    <div className={kid.head}>
                      <div className={kid.headRow}>
                        <h2 className={kid.title}>
                          {localRole === "teacher" ? CLASS_INFO.title : "Class Information"}
                        </h2>
                      </div>
                    </div>
                  <div className={styles.slotList}>
                    {selectedClass.studentName && (
                      <div className={kid.detailRow}>
                        <div className={kid.detailAvatar}>
                          <AuthenticatedImage
                            src={selectedClass.student_profile_image_url || selectedClass.studentProfileImageUrl}
                            alt={selectedClass.studentFullName || selectedClass.studentName}
                            fallback={
                              <img
                                src={userPic}
                                alt={selectedClass.studentFullName || selectedClass.studentName}
                              />
                            }
                          />
                        </div>
                        <div>
                          <div className={kid.detailLabel}>Student</div>
                          <div className={kid.detailValue}>
                            {selectedClass.studentFullName || selectedClass.studentName}
                          </div>
                        </div>
                      </div>
                    )}
                    {(selectedClass.studentProficiencyLevel || selectedClass.student_proficiency_level) && (
                      <div className={kid.detailRow}>
                        <span className={kid.pastFactIcon} aria-hidden="true">📊</span>
                        <div>
                          <div className={kid.detailLabel}>Proficiency level</div>
                          <div className={kid.detailValue}>
                            {formatProficiencyLevel(selectedClass.studentProficiencyLevel || selectedClass.student_proficiency_level)}
                          </div>
                        </div>
                      </div>
                    )}
                    {selectedClass.studentEmail && (
                      <div className={kid.detailRow}>
                        <span className={kid.pastFactIcon} aria-hidden="true">✉️</span>
                        <div>
                          <div className={kid.detailLabel}>Email</div>
                          <div className={kid.detailValue}>{selectedClass.studentEmail}</div>
                        </div>
                      </div>
                    )}
                    {isAdmin && selectedClass.teacherName && (
                      <div className={kid.detailRow}>
                        <span className={kid.pastFactIcon} aria-hidden="true">👩‍🏫</span>
                        <div>
                          <div className={kid.detailLabel}>Teacher</div>
                          <div className={kid.detailValue}>{selectedClass.teacherName}</div>
                        </div>
                      </div>
                    )}
                    {isAdmin && selectedClass.teacherEmail && (
                      <div className={kid.detailRow}>
                        <span className={kid.pastFactIcon} aria-hidden="true">✉️</span>
                        <div>
                          <div className={kid.detailLabel}>Teacher email</div>
                          <div className={kid.detailValue}>{selectedClass.teacherEmail}</div>
                        </div>
                      </div>
                    )}
                    <div className={kid.detailRow}>
                      <span className={kid.pastFactIcon} aria-hidden="true">📚</span>
                      <div>
                        <div className={kid.detailLabel}>Class</div>
                        <div className={kid.detailValue}>{selectedClass.className}</div>
                      </div>
                    </div>
                    <div className={kid.detailRow}>
                      <span className={kid.pastFactIcon} aria-hidden="true">🕐</span>
                      <div>
                        <div className={kid.detailLabel}>Time</div>
                        <div className={kid.detailValue}>
                          {selectedClass.time} - {getEndTime(selectedClass.time, selectedClass.duration, selectedClass.end_time)}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                  {/* Latest teacher remark */}
                  <div className={kid.pastCard}>
                    <div className={kid.head}>
                      <div className={kid.headRow}>
                        <h3 className={kid.title}>Latest teacher remark</h3>
                      </div>
                    </div>
                    {latestRemark ? (
                      <>
                        <div className={kid.pastFact}>
                          <span className={kid.pastFactIcon} aria-hidden="true">📝</span>
                          <div>
                            <div className={kid.detailLabel}>{latestRemark.class_name || "Class"}</div>
                            <div className={kid.detailValue}>
                              {latestRemark.class_name || "Class"}{" "}
                              {formatRemarkDate(latestRemark.scheduled_date) || CLASS_INFO.dateMissing}
                              {latestRemark.start_time ? ` - ${humanTime(latestRemark.start_time)}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className={kid.pastFact}>
                          <span className={kid.pastFactIcon} aria-hidden="true">💬</span>
                          <div>
                            <div className={kid.detailLabel}>Remark</div>
                            <div className={kid.detailValue}>
                              {latestRemark.remarks || CLASS_INFO.noNoteYet}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className={kid.empty}>
                        <span className={kid.emptyIcon} aria-hidden="true">💬</span>
                        <span>{CLASS_INFO.noNoteYet}</span>
                      </div>
                    )}
                  </div>
                  {renderVerificationPanel()}

                  {canShowClassEntryAction && (
                    <button
                      type="button"
                      disabled={isClassEntryDisabled}
                      onClick={enterSelectedClass}
                      className={`${cal.actionCard} ${cal.actionPrimary}`}
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
                      className={`${cal.actionCard} ${cal.actionInfo}`}
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
                      className={`${cal.actionCard} ${cal.actionWarn}`}
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
                  { showRescheduleClosedNotice && !requestMode && (
                    <RescheduleClosedNotice />
                  ) }
                  { requestMode && selectedClassStarted && (
                    <div style={{ marginTop: 12, padding: 14, border: "1px solid rgba(245, 158, 11, 0.32)", borderRadius: 8, background: "rgba(245, 158, 11, 0.1)" }}>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", color: "#8a5a12" }}>Reschedule unavailable</h4>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "#8a5a12", lineHeight: 1.4 }}>
                        {RESCHEDULE_CLOSED_AFTER_START_MESSAGE}
                      </p>
                    </div>
                  ) }
                  { requestMode && !selectedClassStarted && !selectedClassEnded && (
                    <div className={cal.panelCard} style={{ marginTop: 12 }}>
                      <div>
                        <h4 style={{ margin: "0 0 6px 0", fontSize: "1.05rem", fontWeight: 800, color: "var(--primary)" }}>
                          Request Reschedule
                        </h4>
                        <p className={cal.formHint}>
                          Select your preferred date and time, and let your teacher know why you need the reschedule.
                        </p>
                      </div>
                      {requestError && <div className={cal.errorBox}>{requestError}</div>}
                      <div>
                        <label className={cal.formLabel}>New Date *</label>
                        <div className={cal.formInput} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "42px", cursor: "default" }}>
                          <span style={{ color: requestDate ? "var(--text)" : "var(--muted-light)" }}>
                            {requestDate ? new Date(requestDate + "T00:00:00").toLocaleDateString() : "Select a date on the calendar"}
                          </span>
                        </div>
                        <p className={cal.formHint} style={{ marginTop: 6 }}>Click a day on the calendar</p>
                        {requestDate && (
                          <div style={{ marginTop: 6 }}>
                            {getRescheduleAvailabilityStatus(requestDate) === "unavailable" ? (
                              <p className={cal.fieldError}>{localRole === "student" ? "Teacher" : "You are"} unavailable on this date</p>
                            ) : getRescheduleAvailabilityStatus(requestDate) === "available" ? (
                              <p className={cal.formHint}>Available on this date</p>
                            ) : (
                              <p className={cal.formHint}>Availability not set</p>
                            )}
                            {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).length > 0 && (
                              <p className={cal.formHint} style={{ color: "var(--text-warn)" }}>
                                {localRole === "student" ? "Teacher" : "Student"} booked: {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).map(bd => humanTime(bd.start_time)).join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className={cal.formLabel}>New Time *</label>
                        {requestDate && getRescheduleAvailabilityStatus(requestDate) === "unavailable" ? (
                          <div className={cal.warnBox}>You are unavailable on this date.</div>
                        ) : rescheduleTimeSlots.length > 0 ? (
                          <div className={cal.slotGrid}>
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
                                  className={`${cal.slotBtn} ${isSelected ? cal.slotBtnSelected : ""}`}
                                >
                                  {humanTime(time)}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className={cal.infoBox}>No available slots found for this date. Choose another day.</div>
                        )}
                        {requestError && (
                          <div className={cal.fieldError}>
                            ✕ {requestError}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className={cal.formLabel}>Reason *</label>
                        <textarea
                          className={cal.formTextarea}
                          rows={3}
                          placeholder="Please explain why you need to reschedule (minimum 5 characters)"
                          value={requestReason}
                          onChange={e => { setRequestReason(e.target.value); setRequestError(""); }}
                        />
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => { setRequestMode(false); setRequestError(""); }}
                          disabled={isSubmittingRequest}
                          className={cal.actionCard}
                          style={{ justifyContent: "center" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={openRequestConfirmation}
                          disabled={isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError}
                          className={`${cal.actionCard} ${cal.actionPrimary}`}
                          style={{ justifyContent: "center" }}
                        >
                          {isSubmittingRequest ? "Sending..." : "Send Request"}
                        </button>
                      </div>
                    </div>
                  ) }
                  <button
                    type="button"
                    className={cal.actionCard}
                    onClick={() => setSelectedClassId(null)}
                    style={{ marginTop: "8px" }}
                  >
                    Back to Classes
                  </button>
                </>
              ) : selectedDate && calendarView !== "list" ? (
                <>
                  <div className={cal.panelTitle}>
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString()}
                  </div>
                  <div className={styles.slotList}>
                    {selectedClasses && selectedClasses.length > 0 ? (
                      selectedClasses.map((cls, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={cal.dayClass}
                          data-calendar-guide="class"
                          onClick={() => setSelectedClassId(cls.id)}
                        >
                          <span className={cal.dayClassTitle}>{cls.className || cls.name || "Untitled"}</span>
                          <span className={cal.dayClassTime}>
                            {cls.time || cls.startTime || ""} - {getEndTime(cls.time || cls.startTime, cls.duration, cls.end_time) || ""}
                          </span>
                          {cls.studentName && <span className={cal.dayClassWho}>Student: {cls.studentName}</span>}
                          {(cls.teacherFullName || cls.teacherName || cls.teacher) && (
                            <span className={cal.dayClassWho}>
                              Teacher: {cls.teacherFullName || cls.teacherName || cls.teacher}
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className={cal.infoBox}>No classes scheduled for this day</div>
                    )}

                    {/* Admin booking interface */}
                    {onBookClass && selectedDate && (
                      <>
                        <div style={{ margin: "16px 0 8px 0", padding: "8px 0", borderTop: "1px solid #e0e0e0" }}>
                          <div className={cal.panelTitle}>Available Time Slots</div>
                          <div className={cal.formHint}>Click a time to book a class</div>
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
                                    <div className={cal.panelTitle} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <span aria-hidden="true">{icon}</span>
                                      {title} ({slots.length})
                                    </div>
                                    <div className={cal.slotGrid}>
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
                                            className={`${cal.slotBtn} ${isBooked ? cal.slotBtnTaken : ""}`}
                                          >
                                            {humanTime(time)}
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
                          <ModalPortal>
                            <div style={{
                              position: "fixed",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: "rgba(15, 23, 42, 0.48)",
                              backdropFilter: "blur(8px)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              zIndex: 1200,
                              padding: 20,
                              animation: "fadeIn 0.2s ease-out"
                            }}>
                            <div style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 24,
                              padding: 24,
                              maxWidth: "440px",
                              width: "100%",
                              maxHeight: "calc(100vh - 40px)",
                              overflow: "auto",
                              boxShadow: "var(--shadow-xl)",
                              animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
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
                                aria-label="Close"
                                style={{
                                  position: "absolute",
                                  top: "16px",
                                  right: "16px",
                                  background: "transparent",
                                  border: "none",
                                  fontSize: "24px",
                                  cursor: "pointer",
                                  color: "var(--muted)",
                                  padding: "4px",
                                  borderRadius: "50%",
                                  width: "40px",
                                  height: "40px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                ×
                              </button>

                              {/* Header */}
                              <div style={{ marginBottom: "20px", paddingRight: "40px" }}>
                                <div style={{
                                  fontSize: "1.4rem",
                                  fontWeight: 800,
                                  color: "var(--primary)",
                                  marginBottom: "6px",
                                  letterSpacing: "-0.01em"
                                }}>
                                  Book Class
                                </div>
                                <div style={{
                                  fontSize: "0.95rem",
                                  fontWeight: 500,
                                  color: "var(--muted)",
                                  lineHeight: "1.5"
                                }}>
                                  Schedule a new class for {new Date(selectedDate + "T00:00:00").toLocaleDateString()} at {humanTime(selectedTimeSlot)}
                                </div>
                              </div>

                              {/* Form Fields */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                  <label className={cal.formLabel}>
                                    Subject <span style={{ color: "#e74c3c" }}>*</span>
                                  </label>
                                  <select
                                    value={bookingSubject}
                                    onChange={(e) => setBookingSubject(e.target.value)}
                                    className={cal.formSelect}
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
                                  <label className={cal.formLabel}>
                                    End Time <span style={{ color: "#e74c3c" }}>*</span>
                                  </label>
                                  <input
                                    type="time"
                                    value={bookingEndTime}
                                    onChange={(e) => setBookingEndTime(e.target.value)}
                                    className={cal.formInput}
                                  />
                                  <div className={cal.formHint}>
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
                                  className={cal.actionCard}
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
                                  className={`${cal.actionCard} ${cal.actionPrimary}`}
                                >
                                  Book Class
                                </button>
                              </div>
                            </div>
                            </div>
                          </ModalPortal>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className={cal.actionCard}
                    onClick={() => setSelectedDate(null)}
                    style={{ marginTop: "12px" }}
                  >
                    Close
                  </button>
                </>
              ) : (
                <>
                  <div className={cal.actionHeading}>Actions</div>
                  <div className={styles.slotList}>
                    {localRole === "teacher" && (
                      <button
                        type="button"
                        className={`${cal.actionCard} ${setAvailabilityMode ? cal.actionCardActive : ""}`}
                        data-calendar-guide="set-availability"
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
                            setEditingAvailability(null);
                            loadTeacherAvailabilityForMonth();
                            // The count on the "See my availabilities" button
                            // has to be right before they press it.
                            loadTeacherAvailabilityForWindow();
                            // The picker opens on the month the teacher is
                            // looking at.
                            //
                            // !! It used to open on today's month, whatever
                            // !! month the grid was showing. A teacher who
                            // !! paged the grid to November, opened the
                            // !! window, and was shown October - and the
                            // !! date they picked was not the date they
                            // !! thought they were looking at.
                            const viewing = new Date(year, month, 1);
                            const first = new Date(
                              viewerToday.getFullYear(),
                              viewerToday.getMonth(),
                              1
                            );
                            const last = dateKeyToLocalDate(scheduleWindowEndKey);
                            const lastMonth = last
                              ? new Date(last.getFullYear(), last.getMonth(), 1)
                              : first;
                            const wanted =
                              viewing < first ? first : viewing > lastMonth ? lastMonth : viewing;
                            setAvailabilityPickerMonth({
                              year: wanted.getFullYear(),
                              month: wanted.getMonth(),
                            });
                          }
                        }}
                      >
                        <span className={cal.actionIcon} aria-hidden="true">🗓️</span>
                        <span>{setAvailabilityMode ? "Close Availability Manager" : "Set Availability"}</span>
                      </button>
                    )}
                    <button type="button" className={cal.actionCard} onClick={jumpToToday}>
                      <span className={cal.actionIcon} aria-hidden="true">📅</span>
                      <span>Jump to Today</span>
                    </button>
                  </div>
                </>
              )
            ) : (
              <>
                {selectedClass ? (
                  // Selected class detail for student
                  <>
                    {/* The class, in the biggest letters on the page.
                        !!
                        !! The class name is a subject code the student has to
                        !! decode, and the time is a small line under it. But
                        !! the thing they came to see is WHEN - so the day and
                        !! the time are the headline and the subject is the
                        !! small print. */}
                    <div className={kid.detail}>
                      <div className={kid.detailDay}>
                        {describeClassDay({
                          viewerDate: normalizeDate(selectedClass.scheduled_date),
                          todayKey: viewerTodayKey,
                          tomorrowKey: addDaysToDateKey(viewerTodayKey, 1),
                        })}
                      </div>

                      <div className={kid.detailTime}>
                        {selectedClass.time} - {getEndTime(selectedClass.time, selectedClass.duration, selectedClass.end_time)}
                      </div>
                      {selectedClass.className && (
                        <div className={kid.detailCourse}>{selectedClass.className}</div>
                      )}

                      <div className={styles.slotList}>
                        {selectedTeacherFullName && (
                          <div className={kid.detailRow}>
                            <AuthenticatedImage
                              src={selectedClass.teacherProfileImageUrl}
                              alt={selectedTeacherFullName || selectedClass.teacherFullName || selectedClass.teacherName}
                              className={kid.detailAvatar}
                              fallback={
                                <img
                                  src={userPic}
                                  alt={selectedTeacherFullName || selectedClass.teacherFullName || selectedClass.teacherName}
                                  className={kid.detailAvatar}
                                />
                              }
                            />
                            <div>
                              <div className={kid.detailLabel}>{CLASS_INFO.teacher}</div>
                              <div className={kid.detailValue}>
                                {selectedTeacherFullName || selectedClass.teacherFullName || selectedClass.teacherName}
                              </div>
                            </div>
                          </div>
                        )}
                        {selectedClass.teacherEmail && (
                          <div className={kid.detailRow}>
                            <span className={kid.detailIcon} aria-hidden="true">✉️</span>
                            <div>
                              <div className={kid.detailLabel}>{CLASS_INFO.email}</div>
                              <div className={kid.detailValue}>{selectedClass.teacherEmail}</div>
                            </div>
                          </div>
                        )}
                  {latestRemark && (
                      <div style={remarkSectionStyle}>
                        <div style={remarkHeadingStyle}>{CLASS_INFO.teacherNote}</div>
                        <div style={remarkCardStyle}>
                          <div style={remarkTitleStyle}>
                            {latestRemark.class_name || "Class"}
                          </div>
                          <div style={remarkMetaStyle}>
                            {latestRemark.class_name || "Class"}{" "}
                            {formatRemarkDate(latestRemark.scheduled_date) || CLASS_INFO.dateMissing}
                            {latestRemark.start_time ? ` - ${humanTime(latestRemark.start_time)}` : ""}
                          </div>
                          <div style={remarkBodyStyle}>
                            {latestRemark.remarks || CLASS_INFO.noNoteYet}
                          </div>
                        </div>
                      </div>
                      )}
                      </div>
                    </div>
                    {/* How the class went.
                        !! A student gets one plain sentence. They used to get
                        !! the whole evidence checklist - "Teacher start",
                        !! "Start screenshot", "Class summary" - which is the
                        !! teacher's paperwork, not theirs, and which the
                        !! rebuild replaced with nothing at all. The
                        !! information comes back here, in words a student
                        !! would use.
                        !!
                        !! A teacher and an admin still get the full panel:
                        !! they are the ones who act on it. */}
                    {isSimpleStudentView ? renderStudentClassStatus() : renderVerificationPanel()}
                    {canShowClassEntryAction && (
                      <button
                        disabled={isClassEntryDisabled}
                        onClick={enterSelectedClass}
                        className={`${cal.actionCard} ${cal.actionPrimary}`}
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
                        className={`${cal.actionCard} ${cal.actionInfo}`}
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
                        className={`${cal.actionCard} ${cal.actionWarn}`}
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
                        {CLASS_INFO.changeTime}
                      </button>
                    )}
                    { showRescheduleClosedNotice && !requestMode && (
                      <RescheduleClosedNotice />
                    )}
                    { requestMode && selectedClassStarted && (
                      <div style={{ marginTop: 12, padding: 14, border: "1px solid rgba(245, 158, 11, 0.32)", borderRadius: 8, background: "rgba(245, 158, 11, 0.1)" }}>
                        <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", color: "#8a5a12" }}>Reschedule unavailable</h4>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "#8a5a12", lineHeight: 1.4 }}>
                          {RESCHEDULE_CLOSED_AFTER_START_MESSAGE}
                        </p>
                      </div>
                    )}
                    { requestMode && !selectedClassStarted && !selectedClassEnded && (
                      <div style={{ marginTop: 12, padding: 14, border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa" }}>
                      <div style={{ marginBottom: 12 }}>
                        <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", color: "#333" }}>{CLASS_INFO.changeTimeTitle}</h4>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "#666", lineHeight: 1.4 }}>
                          {CLASS_INFO.changeTimeHelp}
                        </p>
                      </div>
                      {requestError && (
                        <div style={{ marginBottom: 10, padding: 8, background: "#ffebee", border: "1px solid #ffcdd2", borderRadius: 6, color: "#c62828", fontSize: "0.8rem" }}>
                          {requestError}
                        </div>
                      )}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: 6, color: "#333" }}>{CLASS_INFO.newDay}</label>
                        {/* A strip of days, not a calendar.
                            !!
                            !! A student has no month grid on their page, so
                            !! the old "click a day on the calendar" had
                            !! nothing to click. The strip says what each day
                            !! is, and the only thing to do is press one. */}
                        <DayPicker
                          days={simpleRescheduleDays}
                          selected={requestDate}
                          onPick={chooseRequestDate}
                          emptyMessage="No days to choose from."
                        />
                        {requestDate && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#666", lineHeight: 1.4 }}>
                            {getRescheduleAvailabilityStatus(requestDate) === "unavailable" ? (
                              <p style={{ margin: 0, color: "#f44336" }}>Your teacher is busy on this day</p>
                            ) : getRescheduleAvailabilityStatus(requestDate) === "available" ? (
                              <p style={{ margin: 0, color: "#4caf50" }}>Your teacher is free on this day</p>
                            ) : (
                              <p style={{ margin: 0, color: "#999" }}>No times set yet</p>
                            )}
                            {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).length > 0 && (
                              <p style={{ margin: "4px 0 0 0", color: "#ff9800" }}>
                                Already booked: {counterpartyBookedDates.filter(bd => normalizeDate(bd.scheduled_date) === normalizeDate(requestDate)).map(bd => humanTime(bd.start_time)).join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: 4, color: "#333" }}>{CLASS_INFO.newTime}</label>
                        {requestDate && getRescheduleAvailabilityStatus(requestDate) === "unavailable" ? (
                          <div style={{ padding: 12, background: "#fff3e0", borderRadius: 8, color: "#b65f00" }}>
                            Your teacher is busy on this day.
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
                                      setRequestError("That is the same time. Please pick a different one.");
                                    } else if (requestDate && isCounterpartyDateTimeBooked(requestDate, time)) {
                                      setRequestError(getCounterpartyUnavailableMessage());
                                    } else if (requestDate && isTimeConflictingWithTeacherBreak(requestDate, time)) {
                                      setRequestError("Your teacher has a break then. Please pick another time.");
                                    } else if (requestDate && isTimeOutsideTeacherAvailability(requestDate, time)) {
                                      setRequestError("Your teacher is not free then. Please pick another time.");
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
                            No free times on this day. Please pick another day.
                          </div>
                        )}
                        {requestError && (
                          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#f44336" }}>
                            ✕ {requestError}
                          </div>
                        )}
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: 4, color: "#333" }}>{CLASS_INFO.why}</label>
                        <textarea rows={3} placeholder={CLASS_INFO.whyPlaceholder} value={requestReason} onChange={e => { setRequestReason(e.target.value); setRequestError(""); }} style={{ width: "100%", padding: "9px 10px", fontSize: "0.9rem", border: "1px solid #d0d0d0", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
                      </div>
                      <div className={styles.actionRow} style={{ marginBottom: 12, justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => { setRequestMode(false); setRequestError(""); }} disabled={isSubmittingRequest} style={{ flex: 1, padding: "12px 16px", fontSize: "0.9rem", fontWeight: 700, border: "1px solid #d0d0d0", background: "#fff", borderRadius: 8, cursor: isSubmittingRequest ? "not-allowed" : "pointer", opacity: isSubmittingRequest ? 0.6 : 1 }}>
                          {CONFIRM.cancel}
                        </button>
                        <button type="button" onClick={openRequestConfirmation} disabled={isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError} style={{ flex: 2, padding: "12px 16px", fontSize: "0.9rem", fontWeight: 700, border: "none", background: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "#999" : "#0f0f0f", color: "#fff", borderRadius: 8, cursor: (isSubmittingRequest || !requestDate || !requestTime || !requestReason || requestReason.trim().length < 5 || getRescheduleAvailabilityStatus(requestDate) !== "available" || !!requestError) ? "not-allowed" : "pointer" }}>
                          {isSubmittingRequest ? CONFIRM.sending : CONFIRM.send}
                        </button>
                      </div>
                    </div>
                    ) }
                    <button
                      type="button"
                      className={kid.btnGhost}
                      onClick={() => {
                        setSelectedClassId(null);
                        // A student on the simple page has no day view to go
                        // back to - the list IS the page. Clearing the date
                        // stops the old "classes on this day" panel taking
                        // over when they close the class.
                        if (isSimpleStudentView) setSelectedDate(null);
                      }}
                      style={{ marginTop: "8px", width: "100%" }}
                    >
                      ← {isSimpleStudentView ? HOME.backToMyClasses : CLASS_INFO.backToClasses}
                    </button>
                  </>
                ) : selectedDate && !isSimpleStudentView ? (
                  // Date selected view - clickable classes for student
                  <>
                    <div className={cal.panelTitle}>
                      {CLASS_INFO.classesOn(new Date(selectedDate + "T00:00:00").toLocaleDateString())}
                    </div>
                    <div className={styles.slotList}>
                      {selectedClasses && selectedClasses.length > 0 ? (
                        selectedClasses.map((cls, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={cal.dayClass}
                            data-calendar-guide="class"
                            onClick={() => setSelectedClassId(cls.id)}
                          >
                            <span className={cal.dayClassTitle}>{cls.className || cls.name || "Untitled"}</span>
                            <span className={cal.dayClassTime}>
                              {cls.time || cls.startTime || ""} - {getEndTime(cls.time || cls.startTime, cls.duration, cls.end_time) || ""}
                            </span>
                            {(cls.teacherFullName || cls.teacherName || cls.teacher) && (
                              <span className={cal.dayClassWho}>
                                {CLASS_INFO.teacher}: {cls.teacherFullName || cls.teacherName || cls.teacher}
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className={cal.infoBox}>{CLASS_INFO.noClassesThatDay}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={cal.actionCard}
                      onClick={() => setSelectedDate(null)}
                      style={{ marginTop: "12px" }}
                    >
                      {CLASS_INFO.close}
                    </button>
                  </>
                ) : studentBookingMode ? (
                  /* The booking wizard.
                     !!
                     !! This used to be a form with a row of days, a grid of
                     !! times, a list of picks and two mode buttons, all on one
                     !! screen. A lot of the students on this app are children,
                     !! and a child looking at that screen picks nothing.
                     !!
                     !! The wizard asks one question at a time, with big
                     !! buttons, and the class is shown in full before
                     !! anything is booked. It draws the screens and says what
                     !! was pressed - the Calendar still owns the classes, the
                     !! limits and the booking itself. */
                  <StudentBookingWizard
                    teacherName={assignedTeacherName}
                    courseName={studentProfile?.course_name || ""}
                    classDuration={studentClassDuration}
                    hasNoClassesLeft={hasNoClassesLeft}
                    isSubmitting={isSubmittingStudentBooking}
                    error={studentBookingError}
                    onClearError={() => setStudentBookingError("")}
                    days={simpleBookingDays}
                    availability={simpleAvailability}
                    availabilityLoading={simpleAvailabilityLoading}
                    monthName={studentBookingMonthName}
                    canGoPreviousMonth={canMoveStudentBookingMonth(-1)}
                    canGoNextMonth={canMoveStudentBookingMonth(1)}
                    onPreviousMonth={() => moveStudentBookingMonth(-1)}
                    onNextMonth={() => moveStudentBookingMonth(1)}
                    selectedDate={studentBookingDate}
                    onPickDate={chooseBookingDate}
                    timeSlots={availableTimeSlots}
                    timesLoading={bookingTimesLoading}
                    isTimeBooked={(time) => isTeacherDateTimeBooked(studentBookingDate, time)}
                    selections={studentBookingSelections}
                    isSelected={isStudentBookingSelected}
                    onPickTime={pickSingleBookingTime}
                    applyMode={studentBookingApplyMode}
                    onApplyModeChange={(mode) => {
                      setStudentBookingApplyMode(mode);
                      setStudentBookingSelections([]);
                      setStudentBookingSuggestions([]);
                      setStudentBookingSuggestionsTotal(0);
                      // The day and the time belong to the way of booking
                      // that was chosen. Carrying them over would leave the
                      // student looking at a day they did not pick, and
                      // would leave a stale time behind to be booked by
                      // accident.
                      setStudentBookingDate("");
                      setStudentBookingTime("");
                      setBookingTimesReadyDate("");
                      setStudentBookingError("");
                    }}
                    weeklyWeekdays={studentBookingWeeklyWeekdays}
                    onToggleWeekday={toggleStudentBookingWeekday}
                    weeklyTime={studentBookingWeeklyTime}
                    onWeeklyTimeChange={(time) => {
                      setStudentBookingWeeklyTime(time);
                      setStudentBookingError("");
                    }}
                    suggestions={studentBookingSuggestions}
                    suggestionsTotal={studentBookingSuggestionsTotal}
                    onAddSuggestion={addStudentBookingSuggestion}
                    onRemoveSelection={removeStudentBookingSelection}
                    onAddAllSuggestions={addStudentBookingSuggestions}
                    onFindTimes={applyStudentWeeklyPattern}
                    onBook={openStudentBookingConfirmation}
                    onCancel={closeStudentBooking}
                  />
                ) : (
                  // Student summary
                  <>
                    {/* The student's own home screen: the classes they have,
                        and how many are left. Nothing else.
                        !!
                        !! A month grid went here, and the number of classes
                        !! left went under it in a small card. A student
                        !! opening the app does not want a calendar - they
                        !! want to know when their next class is, and how many
                        !! they have left. So the list is the page.
                        */}
                    {isSimpleStudentView ? (
                      /* The student's own home screen.
                         !!
                         !! A month grid went here, and the number of classes
                         !! left went under it in a small card. A student
                         !! opening the app does not want a calendar - they
                         !! want to know when their next class is, and how many
                         !! they have left. So the list is the page.
                         !!
                         !! And the page is read top to bottom in the order a
                         !! student asks the questions in: how many have I got,
                         !! can I book one, and when are my classes. The big
                         !! green button sits in the middle because it is the
                         !! thing they came to press, and it must not be
                         !! pushed off the bottom of the screen by a long list
                         !! of classes. */
                      <div className={kid.home}>
                        <div className={kid.homeHeader}>
                          <h1 className={kid.homeTitle} data-calendar-guide="calendar">{HOME.title}</h1>
                          <p className={kid.homeSubtitle}>
                            {HOME.subtitle(assignedTeacherName)}
                          </p>
                        </div>

                        {/* The counter, first. It is the one thing on the page
                            that answers "how long have I got" without being
                            read, and it is what a student checks before they
                            decide whether to book another class. */}
                        <ClassesLeftCard
                          left={Number(effectiveClassesLeft) || 0}
                          total={Number(effectiveClassesLimit) || 0}
                          percent={effectivePercent}
                          readyToBook={Number(effectiveBookableClasses) || 0}
                          badge={<ContractExpiryBadge expiresAt={contractExpiresAt} showDate forStudent />}
                          note={studentPlanStatusNote}
                        />

                        {/* The one big green button.
                            !!
                            !! It is the biggest thing on the page that can be
                            !! pressed, and it is above the list, so a student
                            !! with eight classes booked does not have to
                            !! scroll past all eight to find it. */}
                        <button
                          type="button"
                          className={kid.bookBig}
                          data-calendar-guide="book-class"
                          onClick={openMonthlyBooking}
                          disabled={!assignedTeacherId || hasNoClassesLeft}
                        >
                          <span aria-hidden="true">📅</span>
                          {PLAN.bookAClass}
                        </button>

                        {/* A greyed-out button with no reason is a broken
                            button. Say why it cannot be pressed. */}
                        {!assignedTeacherId && <p className={kid.counterNote}>{BOOKING.noTeacher}</p>}

                        {studentUpcomingLoading && studentUpcomingClasses.length === 0 ? (
                          <div className={kid.empty}>
                            <span className={kid.emptyIcon} aria-hidden="true">📅</span>
                            <span>{HOME.loadingClasses}</span>
                          </div>
                        ) : simpleStudentClasses.length > 0 ? (
                          <>
                            <h2 className={kid.sectionTitle}>{HOME.yourClasses}</h2>
                            <div className={kid.classList}>
                              {simpleStudentClasses.map((entry) => (
                                <ClassCard
                                  key={entry.id}
                                  classInfo={entry}
                                  onOpen={() => {
                                    setSelectedDate(entry.viewerDate);
                                    setSelectedClassId(entry.id);
                                  }}
                                  actionLabel={HOME.details}
                                />
                              ))}
                            </div>
                          </>
                        ) : (
                          /* Two different situations, and they need two
                             different sentences. "You have no classes
                             booked yet" and "you have no classes left" are
                             the same words with opposite meanings, and
                             only one of them is fixed by booking a class. */
                          <div className={kid.empty}>
                            <span className={kid.emptyIcon} aria-hidden="true">📅</span>
                            <span>
                              {hasNoClassesLeft ? HOME.noClassesLeft : HOME.noClassesYet}
                            </span>
                            {!hasNoClassesLeft && <span>{HOME.noClassesYetHelp}</span>}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* The same counter card the student sees. An admin
                            looking at a student's calendar is looking at the
                            same thing the student is, so it should look the
                            same. */}
                        <div className={cal.panelTitle}>{PLAN.title}</div>
                        <ClassesLeftCard
                          left={Number(effectiveClassesLeft) || 0}
                          total={Number(effectiveClassesLimit) || 0}
                          percent={effectivePercent}
                          readyToBook={Number(effectiveBookableClasses) || 0}
                          badge={<ContractExpiryBadge expiresAt={contractExpiresAt} showDate forStudent />}
                          note={studentPlanStatusNote}
                        />
                      </>
                    )}
                    {/* Nothing about what they may ask for is decided until
                        the package has actually arrived. Offering a button
                        and then changing it a moment later is how a student
                        ends up pressing the wrong one. */}
                    {!studentPackageLoaded ? (
                      <div className={kid.empty}>
                        <span className={kid.emptyIcon} aria-hidden="true">📅</span>
                        <span>{HOME.loadingPlan}</span>
                      </div>
                    ) : (
                      <>
                    {canRequestExtension && (
                      /* The card that says "ask the admin for something".
                         !!
                         !! It is a card, not a paragraph. The student has to
                         !! read what the situation is and then press a button
                         !! about it, and both of those need room. The old
                         !! version was a 12px line of amber text with a
                         !! 30px button under it. */
                      <div className={kid.askCard}>
                        <h3 className={kid.askHeading}>{MORE_TIME_CARD.heading}</h3>
                        <p className={kid.askBody}>
                          {MORE_TIME_CARD.body(Number(latestStudentPackage.classes_left))}
                        </p>
                        {extensionFlow.isPending ? (
                          /* The request is with the admin. Say so, and offer the
                             two things a student can still do about it: change it,
                             or take it back. A request they can only wait on is a
                             request they cannot take back. */
                          <>
                            <p className={kid.askBody}>{extensionFlow.banner}</p>
                            {!contractRequestOpen && (
                              <div style={{ display: "grid", gap: 10 }}>
                                <button
                                  type="button"
                                  className={kid.askBtn}
                                  onClick={() => openExtensionRequestForm({ editing: true })}
                                >
                                  {MORE_TIME_CARD.changeMyAsk}
                                </button>
                                <button
                                  type="button"
                                  className={kid.askBtn}
                                  onClick={() => cancelContractRequest(extensionFlow.pendingRequest?.request_id)}
                                  disabled={isCancellingContractRequest}
                                >
                                  {isCancellingContractRequest ? "..." : MORE_TIME_CARD.cancelMyAsk}
                                </button>
                              </div>
                            )}
                          </>
                        ) : extensionFlow.resolvedRequest ? (
                          /* Said explicitly, because silence after a decision is
                             the same as never having asked. */
                          <p className={kid.askBody}>{extensionFlow.outcome}</p>
                        ) : null}

                        {/* A decline is a decision, not a dead end. Previously any
                            resolved request removed the form entirely, so a student
                            whose extension was turned down had nowhere to go from
                            here - the answer was final and unexplained.
                            An approval genuinely has nothing to ask for, so this
                            is shown only on a decline. */}
                        {canAskAgain && !contractRequestOpen && !requestingNewContract && (
                          <div>
                            <button
                              type="button"
                              className={kid.askBtn}
                              onClick={() => openExtensionRequestForm()}
                            >
                              {MORE_TIME_CARD.askAgain}
                            </button>
                          </div>
                        )}

                        {/* The button to ask, when there is nothing to ask about
                            and nothing to wait for.
                            !!
                            !! It used to be gated on the student never having
                            !! had a request of this kind, which made a WITHDRAWN
                            !! request block the way forward. The student
                            !! withdrew it in order to ask for something else,
                            !! and was then left with no way to ask for it - the
                            !! only way out was to withdraw something else
                            !! first. Nothing was decided by the withdrawal, so
                            !! nothing blocks the next question.
                            !!
                            !! An approval is the opposite: it is the thing they
                            !! asked for, and there is nothing left to ask for. */}
                        {extensionFlow.canRequest &&
                          !canAskAgain &&
                          !contractRequestOpen &&
                          !requestingNewContract && (
                            <>
                              <button
                                type="button"
                                className={kid.askBtn}
                                onClick={() => openExtensionRequestForm()}
                                disabled={extensionBlocked.isBlocked}
                              >
                                {MORE_TIME_CARD.askForMoreTime}
                              </button>
                              {extensionBlocked.isBlocked && (
                                <p className={kid.askBody}>{extensionBlocked.hint}</p>
                              )}
                            </>
                          )}

                        {/* The form itself is in a window, not here. The card
                            says what is waiting and offers the three things a
                            student can do about it; the form belongs in a
                            dialog the size of a form. */}

                        {/* The other route, and what is happening on it.
                          !!
                          !! A pending new-contract request used to be invisible
                          !! here. The button below said "Request a new contract
                          !! instead" and opened a form whose button said
                          !! "Update Request" - which told the student a request
                          !! existed only if they went looking for it, and
                          !! offered no way to withdraw it. The request was
                          !! with the admin and the student could neither see
                          !! it nor take it back.
                          !!
                          !! So when there is one, it is shown as what it is:
                          !! a request in flight, with the two things that can
                          !! be done about it. */}
                        {!requestingNewContract &&
                          (newContractFlow.isPending ? (
                            <PendingRequestPanel
                              flow={newContractFlow}
                              onEdit={() => openNewContractForm({ editing: true })}
                              onWithdraw={() => cancelContractRequest(newContractFlow.pendingRequest?.request_id)}
                              isCancelling={isCancellingContractRequest}
                              editLabel={MORE_TIME_CARD.changeMyAsk}
                              withdrawLabel={MORE_TIME_CARD.cancelMyAsk}
                            />
                          ) : (
                            <>
                              <button
                                type="button"
                                className={kid.askBtn}
                                onClick={() => openNewContractForm()}
                                disabled={newContractBlocked.isBlocked}
                              >
                                {MORE_TIME_CARD.getNewPlanInstead}
                              </button>
                              {newContractBlocked.isBlocked && (
                                <p className={kid.askBody}>{newContractBlocked.hint}</p>
                              )}
                            </>
                          ))}
                      </div>
                    )}
                    {canRequestNewContract && !contractRequestOpen && !requestingNewContract && (
                      /* A pending request of this kind means the student has
                         already asked. The card says so and offers to change it,
                         rather than offering a second "Request" that would
                         quietly replace the first. */
                      newContractFlow.isPending ? (
                        <PendingRequestPanel
                          flow={newContractFlow}
                          onEdit={() => openNewContractForm({ editing: true })}
                          onWithdraw={() => cancelContractRequest(newContractFlow.pendingRequest?.request_id)}
                          isCancelling={isCancellingContractRequest}
                        />
                      ) : newContractFlow.canRequest ? (
                        <>
                          <button
                            type="button"
                            className={kid.askBtn}
                            onClick={() => openNewContractForm()}
                            disabled={newContractBlocked.isBlocked}
                          >
                            {MORE_TIME_CARD.getNewPlan}
                          </button>
                          {newContractBlocked.isBlocked && (
                            <p className={kid.askBody}>{newContractBlocked.hint}</p>
                          )}
                        </>
                      ) : null
                    )}
                      </>
                    )}
                    {/* The extension request, in a window like the new-contract
                        one. Two forms that do the same kind of thing - ask the
                        admin for something - should look the same and behave
                        the same way. */}
                    {contractRequestOpen && !requestingNewContract && (
                      <RequestDialog
                        title={
                          contractRequestEditing
                            ? MORE_TIME_WINDOW.titleEditing
                            : MORE_TIME_WINDOW.title
                        }
                        onClose={() => {
                          setContractRequestOpen(false);
                          setContractRequestEditing(false);
                          setContractExtensionNote("");
                          setContractRequestError("");
                        }}
                      >
                        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                          {contractRequestEditing && (
                            /* The student is changing a request the admin is
                               holding. Say that this replaces it, because
                               "Send" on a request that already exists reads
                               as sending a second one. */
                            <div style={{ padding: 10, border: "1px solid #c3cbd5", borderRadius: 8, background: "#f6f8f7", fontSize: 12, color: "#374151", lineHeight: 1.45 }}>
                              {MORE_TIME_WINDOW.replacing}
                            </div>
                          )}

                          {latestStudentPackage && (
                            <div style={{ fontSize: 12, color: "#6b5a3c", lineHeight: 1.45 }}>
                              {MORE_TIME_WINDOW.keeping}
                            </div>
                          )}

                          {newContractFlow.isPending && (
                            /* The two asks contradict each other.
                               !!
                               !! A new plan REPLACES the plan these classes
                               !! are on, so if the admin says yes to the new
                               !! plan, the classes this is asking to keep are
                               !! gone. Warned, never blocked - the student may
                               !! want the new plan, and the admin may decide
                               !! this one first. */
                            <div style={{ padding: 10, border: "1px solid #e5a3a3", borderRadius: 8, background: "#fdecec", fontSize: 12, color: "#8c2020", lineHeight: 1.45 }}>
                              You already have a new plan request under review. Only one request can
                              be active at a time. A new plan replaces your current plan, so your{" "}
                              {latestStudentPackage?.classes_left ?? 0} class
                              {Number(latestStudentPackage?.classes_left ?? 0) === 1 ? "" : "es"} will not
                              carry over. Withdraw that request first if you would rather request additional time.
                            </div>
                          )}

                          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600 }}>
                            {MORE_TIME_WINDOW.question}
                          </label>
                          <textarea
                            value={contractExtensionNote}
                            onChange={(e) => setContractExtensionNote(e.target.value)}
                            rows={5}
                            placeholder={MORE_TIME_WINDOW.placeholder}
                            style={{ width: "100%", padding: 9, border: "1px solid #d1d5db", borderRadius: 8, fontFamily: "inherit", resize: "vertical" }}
                          />

                          {contractRequestError && (
                            <div style={{ padding: 8, border: "1px solid #fecaca", borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 12 }}>
                              {contractRequestError}
                            </div>
                          )}

                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setContractRequestOpen(false);
                                setContractRequestEditing(false);
                                setContractExtensionNote("");
                              }}
                              disabled={isSubmittingContractRequest}
                              style={{ flex: 1, padding: "11px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 700, cursor: isSubmittingContractRequest ? "not-allowed" : "pointer" }}
                            >
                              {MORE_TIME_WINDOW.cancel}
                            </button>
                            <button
                              type="button"
                              onClick={submitExtensionRequest}
                              disabled={isSubmittingContractRequest}
                              style={{ flex: 1, padding: "11px 10px", border: "none", borderRadius: 8, background: "#7a5210", color: "#fff", fontWeight: 700, cursor: isSubmittingContractRequest ? "not-allowed" : "pointer" }}
                            >
                              {isSubmittingContractRequest
                                ? MORE_TIME_WINDOW.sending
                                : contractRequestEditing
                                  ? MORE_TIME_WINDOW.update
                                  : MORE_TIME_WINDOW.send}
                            </button>
                          </div>

                          <div style={{ fontSize: 11, color: "#6b5a3c", lineHeight: 1.5 }}>
                            {MORE_TIME_WINDOW.note}
                          </div>
                        </div>
                      </RequestDialog>
                    )}
                    {contractRequestOpen && requestingNewContract && (
                      /* Lifted out of the sidebar and into a window.

                             !! It was rendering inline in a ~300px column, which made
                             !! every field in it cramped: the criteria chips wrapped onto
                             !! three lines, the notes box was a few characters wide, and the
                             !! course dropdown and the two numeric pickers fought for the
                             !! same strip. An earlier attempt put only the "Others" text box
                             !! in a dialog, which fixed one field and left its four siblings
                             !! looking like they belonged to a different screen. The form is
                             !! the unit that needed moving.

                             !! Through ModalPortal rather than rendered in place: anything
                             !! position: fixed inside .content-area is positioned against the
                             !! content column, not the viewport, so an in-place overlay covers
                             !! the page but not the sidebar - which is exactly the window this is
                             !! supposed to escape. */
                      <RequestDialog
                        title={
                          contractRequestEditing
                            ? NEW_PLAN_WINDOW.titleEditing
                            : NEW_PLAN_WINDOW.title
                        }
                        onClose={() => {
                          // Both flags, not just the override. The dialog is
                          // gated on contractRequestOpen, so clearing only
                          // requestingNewContract would have left it open for
                          // anyone who arrived without that override - the
                          // normal case - and clicking the backdrop would have
                          // done nothing at all.
                          setContractRequestOpen(false);
                          setRequestingNewContract(false);
                          setContractRequestEditing(false);
                          setNewPlanStep(0);
                          setContractRequestError("");
                        }}
                      >
                            {/* The consequence, stated here rather than assumed. This
                                form only appears alongside the more-time route when the
                                student has deliberately chosen it, which is the one
                                moment losing the balance is a decision rather than a
                                surprise. */}
                            {requestingNewContract && !canRequestNewContract && latestStudentPackage && (
                              <div style={{ marginBottom: 10, padding: 10, border: "1px solid #e5a3a3", borderRadius: 8, background: "#fdecec", fontSize: 12, color: "#8c2020", lineHeight: 1.45 }}>
                                {NEW_PLAN_WINDOW.losesClasses(Number(latestStudentPackage.classes_left))}
                              </div>
                            )}
                            {extensionFlow.isPending && (
                              /* The same contradiction, from the other side.
                                 !! The more-time ask is asking to keep the
                                 !! unused classes, and this form is asking for
                                 !! the plan that would replace them. */
                              <div style={{ marginBottom: 10, padding: 10, border: "1px solid #e5a3a3", borderRadius: 8, background: "#fdecec", fontSize: 12, color: "#8c2020", lineHeight: 1.45 }}>
                                You already have a request for additional time under review. Only one
                                request can be active at a time. A new plan replaces your current plan.
                                Withdraw the existing request first if you would rather request a new plan.
                              </div>
                            )}
                            {contractRequestEditing && (
                              /* The ask already exists. Saying so is the
                                 difference between a student who thinks they
                                 sent two asks and one who knows they changed
                                 one. */
                              <div style={{ marginBottom: 10, padding: 10, border: "1px solid #c3cbd5", borderRadius: 8, background: "#f6f8f7", fontSize: 12, color: "#374151", lineHeight: 1.45 }}>
                                {NEW_PLAN_WINDOW.replacing}
                              </div>
                            )}
                            {newContractFlow.isPending && !contractRequestEditing && (
                              <div style={{ marginBottom: 10, fontSize: 12, color: "#7a5210", lineHeight: 1.45 }}>
                                {newContractFlow.banner}
                              </div>
                            )}
                            {contractRequests[0] && (
                              <div style={{ marginBottom: 10, fontSize: 12, color: "#4b5563" }}>
                                {NEW_PLAN_WINDOW.lastAsk}:{" "}
                                <strong style={{ textTransform: "capitalize" }}>{contractRequests[0].status}</strong>
                                {contractRequests[0].course_name ? ` - ${contractRequests[0].course_name}` : ""}
                                {contractRequests[0].requested_classes ? ` (${contractRequests[0].requested_classes} classes)` : ""}
                                {contractRequests[0].class_duration ? ` - ${contractRequests[0].class_duration} min` : ""}
                              </div>
                            )}
                              <div className={kid.newPlanWizard}>
                                <div className={kid.newPlanProgress}>
                                  <p className={kid.newPlanProgressLabel}>
                                    Step {newPlanStep + 1} of {NEW_PLAN_STEPS.length}
                                  </p>
                                  <div
                                    className={kid.newPlanProgressTrack}
                                    role="progressbar"
                                    aria-label="New plan request progress"
                                    aria-valuemin={1}
                                    aria-valuemax={NEW_PLAN_STEPS.length}
                                    aria-valuenow={newPlanStep + 1}
                                  >
                                    <div
                                      className={kid.newPlanProgressFill}
                                      style={{ width: `${((newPlanStep + 1) / NEW_PLAN_STEPS.length) * 100}%` }}
                                    />
                                  </div>
                                </div>
                                <div className={kid.newPlanPrompt} aria-live="polite">
                                  <span className={kid.newPlanStepIcon} aria-hidden="true">
                                    {NEW_PLAN_STEPS[newPlanStep].icon}
                                  </span>
                                  <div>
                                    <h4 className={kid.newPlanStepTitle}>
                                      {NEW_PLAN_STEPS[newPlanStep].title}
                                    </h4>
                                    <p className={kid.newPlanStepHint}>
                                      {NEW_PLAN_STEPS[newPlanStep].prompt}
                                    </p>
                                  </div>
                                </div>
                                <div style={{ display: "grid", gap: 12 }}>
                                {newPlanStep === 0 && (
                                <div style={{ display: "grid", gap: 12 }}>
                                <div>
                                  <label style={{ display: "block", fontSize: "1rem", fontWeight: 800, marginBottom: 8 }}>
                                    {NEW_PLAN_WINDOW.course}
                                  </label>
                                  <select
                                    value={contractCourseId}
                                    onChange={(e) => updateContractCourse(e.target.value)}
                                    style={{ width: "100%", minHeight: 56, padding: "12px 14px", border: "2px solid #d1d5db", borderRadius: 16, fontFamily: "inherit", fontSize: "1rem" }}
                                  >
                                    <option value="">{NEW_PLAN_WINDOW.coursePlaceholder}</option>
                                    {courses.map((course) => (
                                      <option key={course.course_id} value={course.course_id}>
                                        {course.course_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "1rem", fontWeight: 800, marginBottom: 8 }}>
                                    {NEW_PLAN_WINDOW.classCount}
                                  </label>
                                  <select
                                    value={contractClassCount}
                                    onChange={(e) => setContractClassCount(e.target.value)}
                                    style={{ width: "100%", minHeight: 56, padding: "12px 14px", border: "2px solid #d1d5db", borderRadius: 16, fontFamily: "inherit", fontSize: "1rem" }}
                                  >
                                    <option value="10">10 classes</option>
                                    <option value="15">15 classes</option>
                                    <option value="20">20 classes</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "1rem", fontWeight: 800, marginBottom: 8 }}>
                                    {NEW_PLAN_WINDOW.classLength}
                                  </label>
                                  <select
                                    value={contractClassDuration}
                                    onChange={(e) => setContractClassDuration(e.target.value)}
                                    style={{ width: "100%", minHeight: 56, padding: "12px 14px", border: "2px solid #d1d5db", borderRadius: 16, fontFamily: "inherit", fontSize: "1rem" }}
                                  >
                                    <option value="25">25 minutes</option>
                                    <option value="50">50 minutes</option>
                                  </select>
                                </div>
                                </div>
                                )}

                                {newPlanStep === 1 && (
                                      <CriteriaChipField
                                        legend={`${NEW_PLAN_WINDOW.learningGoal} *`}
                                        hint="Select at least one option."
                                        options={contractLearningGoalOptions}
                                        selected={contractAiCriteria.learningGoal}
                                        onToggle={(value) => toggleContractAiCriterionValue("learningGoal", value)}
                                        emptyMessage="Select a course to view the available options."
                                        name="contract-learning-goal"
                                        required
                                        kidFriendly
                                        allowCustom
                                        othersLabel="Something else"
                                        customPlaceholder="Tell us in your own words"
                                        customValue={contractCriteriaOther.learningGoal}
                                        onCustomChange={(text) => setContractCriteriaOther((prev) => ({ ...prev, learningGoal: text }))}
                                      />
                                )}
                                {newPlanStep === 2 && (
                                      <CriteriaChipField
                                        legend={`${NEW_PLAN_WINDOW.focusArea} *`}
                                        hint="Select at least one option."
                                        options={contractFocusAreaOptions}
                                        selected={contractAiCriteria.focusArea}
                                        onToggle={(value) => toggleContractAiCriterionValue("focusArea", value)}
                                        emptyMessage="Select a course to view the available options."
                                        name="contract-focus-area"
                                        required
                                        kidFriendly
                                        allowCustom
                                        othersLabel="Something else"
                                        customPlaceholder="Tell us in your own words"
                                        customValue={contractCriteriaOther.focusArea}
                                        onCustomChange={(text) => setContractCriteriaOther((prev) => ({ ...prev, focusArea: text }))}
                                      />
                                )}
                                {newPlanStep === 3 && (
                                      <CriteriaChipField
                                        legend={`${NEW_PLAN_WINDOW.learningStyle} *`}
                                        hint="Select at least one option."
                                        options={STUDENT_CRITERIA_DISPLAY_OPTIONS.learningStyle}
                                        selected={contractAiCriteria.learningStyle}
                                        onToggle={(value) => toggleContractAiCriterionValue("learningStyle", value)}
                                        name="contract-learning-style"
                                        required
                                        kidFriendly
                                        allowCustom
                                        othersLabel="Something else"
                                        customPlaceholder="Tell us in your own words"
                                        customValue={contractCriteriaOther.learningStyle}
                                        onCustomChange={(text) => setContractCriteriaOther((prev) => ({ ...prev, learningStyle: text }))}
                                      />
                                )}
                                {newPlanStep === 4 && (
                                      <CriteriaChipField
                                        legend={`${NEW_PLAN_WINDOW.learningPace} *`}
                                        hint="Select at least one option."
                                        options={STUDENT_CRITERIA_DISPLAY_OPTIONS.pace}
                                        selected={contractAiCriteria.pace}
                                        onToggle={(value) => toggleContractAiCriterionValue("pace", value)}
                                        name="contract-pace"
                                        required
                                        kidFriendly
                                        allowCustom
                                        othersLabel="Something else"
                                        customPlaceholder="Tell us in your own words"
                                        customValue={contractCriteriaOther.pace}
                                        onCustomChange={(text) => setContractCriteriaOther((prev) => ({ ...prev, pace: text }))}
                                      />
                                )}
                                {newPlanStep === 5 && (
                                  <>
                                      <div className={kid.newPlanSummary} aria-label="Plan summary">
                                        <div className={kid.newPlanSummaryRow}>
                                          <span className={kid.newPlanSummaryLabel}>Course</span>
                                          <span className={kid.newPlanSummaryValue}>
                                            {courses.find((course) => String(course.course_id) === String(contractCourseId))?.course_name || "No course selected"}
                                          </span>
                                        </div>
                                        <div className={kid.newPlanSummaryRow}>
                                          <span className={kid.newPlanSummaryLabel}>Class plan</span>
                                          <span className={kid.newPlanSummaryValue}>{contractClassCount} classes, {contractClassDuration} minutes each</span>
                                        </div>
                                        <div className={kid.newPlanSummaryRow}>
                                          <span className={kid.newPlanSummaryLabel}>Learning objectives</span>
                                          <span className={kid.newPlanSummaryValue}>{contractCriterionSummary("learningGoal", contractLearningGoalOptions)}</span>
                                        </div>
                                        <div className={kid.newPlanSummaryRow}>
                                          <span className={kid.newPlanSummaryLabel}>Skill focus</span>
                                          <span className={kid.newPlanSummaryValue}>{contractCriterionSummary("focusArea", contractFocusAreaOptions)}</span>
                                        </div>
                                        <div className={kid.newPlanSummaryRow}>
                                          <span className={kid.newPlanSummaryLabel}>Learning preferences</span>
                                          <span className={kid.newPlanSummaryValue}>{contractCriterionSummary("learningStyle", STUDENT_CRITERIA_DISPLAY_OPTIONS.learningStyle)}</span>
                                        </div>
                                        <div className={kid.newPlanSummaryRow}>
                                          <span className={kid.newPlanSummaryLabel}>Learning pace</span>
                                          <span className={kid.newPlanSummaryValue}>{contractCriterionSummary("pace", STUDENT_CRITERIA_DISPLAY_OPTIONS.pace)}</span>
                                        </div>
                                      </div>
                                      <div style={{ display: "grid", gap: 12 }}>
                                        <label style={{ display: "block", fontSize: "1rem", fontWeight: 800, marginBottom: 4, color: "#1d3a2c" }}>
                                          {NEW_PLAN_WINDOW.freeTime}{" "}
                                          <span style={{ fontWeight: 400, color: "#6b7d73" }}>({NEW_PLAN_WINDOW.freeTimeOptional})</span>
                                        </label>
                                        <p style={{ margin: 0, fontSize: "1rem", color: "#4b5f55", lineHeight: 1.5 }}>
                                          {NEW_PLAN_WINDOW.freeTimeHelp}
                                        </p>

                                        <div role="group" aria-label={`${NEW_PLAN_WINDOW.freeTime} (${NEW_PLAN_WINDOW.freeTimeOptional})`} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                          {WEEKDAY_CHOICES.map(([value, label]) => {
                                            const active = contractPreferredSchedule.days.includes(value);
                                            return (
                                              <button
                                                key={value}
                                                type="button"
                                                aria-pressed={active}
                                                onClick={() => {
                                                  const days = active
                                                    ? contractPreferredSchedule.days.filter((day) => day !== value)
                                                    : [...contractPreferredSchedule.days, value];
                                                  setContractPreferredSchedule((prev) => ({ ...prev, days }));
                                                }}
                                                style={{
                                                  minWidth: 56,
                                                  minHeight: 48,
                                                  padding: "10px 16px",
                                                  borderRadius: "999px",
                                                  border: `2px solid ${active ? "#2f7a3d" : "#cbd5cd"}`,
                                                  background: active ? "#e8f5e9" : "#fff",
                                                  color: "#1e3828",
                                                  cursor: "pointer",
                                                  fontSize: "1rem",
                                                  fontWeight: 800,
                                                }}
                                              >
                                                {label}
                                              </button>
                                            );
                                          })}
                                        </div>

                                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                          <label style={{ fontSize: "1rem", fontWeight: 700, color: "#1e3828" }}>{NEW_PLAN_WINDOW.from}</label>
                                          <input
                                            type="time"
                                            aria-label={NEW_PLAN_WINDOW.from}
                                            value={contractPreferredSchedule.start}
                                            onChange={(e) =>
                                              setContractPreferredSchedule((prev) => ({ ...prev, start: e.target.value }))
                                            }
                                            style={{ minHeight: 48, padding: "10px 12px", border: "2px solid #cbd5cd", borderRadius: 14, fontFamily: "inherit", fontSize: "1rem" }}
                                          />
                                          <label style={{ fontSize: "1rem", fontWeight: 700, color: "#1e3828" }}>{NEW_PLAN_WINDOW.to}</label>
                                          <input
                                            type="time"
                                            aria-label={NEW_PLAN_WINDOW.to}
                                            value={contractPreferredSchedule.end}
                                            onChange={(e) =>
                                              setContractPreferredSchedule((prev) => ({ ...prev, end: e.target.value }))
                                            }
                                            style={{ minHeight: 48, padding: "10px 12px", border: "2px solid #cbd5cd", borderRadius: 14, fontFamily: "inherit", fontSize: "1rem" }}
                                          />
                                        </div>

                                        {contractPreferredSchedule.days.length > 0 &&
                                        !hasPreferredSchedule(contractPreferredSchedule) && (
                                          <p style={{ margin: "8px 0 0", fontSize: "1rem", color: "#7a5210" }}>
                                            {NEW_PLAN_WINDOW.fromToHelp}
                                          </p>
                                        )}
                                      </div>
                                  </>
                                )}
                                {/* Who this would match, before sending it.
                                    !! The same recommendTeacher the approval
                                    !! path runs, so this is a preview rather than
                                    !! an approximation - a preview that could
                                    !! disagree with what actually happens would be
                                    !! worse than none. Nothing is assigned: the
                                    !! admin still decides, and a student cannot
                                    !! name a teacher here. */}
                                {newPlanStep === 5 && (
                                <div style={{ marginTop: 6 }}>
                                  <button
                                    type="button"
                                    onClick={previewContractMatch}
                                    disabled={previewingMatch || !contractCourseId}
                                    style={{
                                      width: "100%",
                                      padding: "11px 12px",
                                      border: "1px solid #26423b",
                                      borderRadius: 8,
                                      background: "#fff",
                                      color: "#26423b",
                                      fontWeight: 700,
                                      cursor: previewingMatch || !contractCourseId ? "not-allowed" : "pointer",
                                      opacity: !contractCourseId ? 0.55 : 1,
                                    }}
                                  >
                                    {previewingMatch
                                      ? NEW_PLAN_WINDOW.findingTeacher
                                      : matchPreview
                                        ? NEW_PLAN_WINDOW.checkAgain
                                        : NEW_PLAN_WINDOW.seeMyTeacher}
                                  </button>

                                  {matchPreviewError && (
                                    <p style={{ marginTop: 8, fontSize: "0.85em", color: "#8c2020" }}>
                                      {matchPreviewError}
                                    </p>
                                  )}

                                  {matchPreview && <MatchPreviewCard preview={matchPreview} />}
                                </div>
                                )}

                                {contractRequestError && (
                                  <div role="alert" style={{ padding: 12, border: "2px solid #fecaca", borderRadius: 16, background: "#fef2f2", color: "#b91c1c", fontSize: "1rem", fontWeight: 700 }}>
                                    {contractRequestError}
                                  </div>
                                )}
                                <div className={kid.newPlanControls}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setContractRequestOpen(false);
                                      setRequestingNewContract(false);
                                      setContractRequestEditing(false);
                                      setNewPlanStep(0);
                                    }}
                                    disabled={isSubmittingContractRequest}
                                    className={`${kid.btn} ${kid.btnGhost}`}
                                  >
                                    {NEW_PLAN_WINDOW.cancel}
                                  </button>
                                  {newPlanStep > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setContractRequestError("");
                                        setNewPlanStep((step) => Math.max(step - 1, 0));
                                      }}
                                      disabled={isSubmittingContractRequest}
                                      className={`${kid.btn} ${kid.btnGhost}`}
                                    >
                                      Back
                                    </button>
                                  )}
                                  {newPlanStep < NEW_PLAN_STEPS.length - 1 ? (
                                    <button
                                      type="button"
                                      onClick={continueNewPlanStep}
                                      disabled={isSubmittingContractRequest}
                                      className={`${kid.btn} ${kid.btnPrimary}`}
                                    >
                                      Next
                                    </button>
                                  ) : (
                                  <button
                                    type="button"
                                    onClick={submitContractRequest}
                                    disabled={isSubmittingContractRequest || previewingMatch || !matchPreview}
                                    className={`${kid.btn} ${kid.btnPrimary}`}
                                  >
                                    {isSubmittingContractRequest
                                      ? NEW_PLAN_WINDOW.sending
                                      : contractRequestEditing
                                        ? NEW_PLAN_WINDOW.update
                                        : NEW_PLAN_WINDOW.send}
                                  </button>
                                  )}
                                </div>
                                {newPlanStep === NEW_PLAN_STEPS.length - 1 && !matchPreview && (
                                  <p style={{ margin: "8px 0 0", fontSize: "1rem", fontWeight: 700, color: "#4b5f55" }}>
                                    {NEW_PLAN_WINDOW.checkTeacherRequired}
                                  </p>
                                )}
                              </div>
                              </div>

                      </RequestDialog>
                    )}
                    {/* What a student can do from here.
                        !!
                        !! Only ONE button, and only "Book a class". The other
                        !! two asks are not always available, and they are not
                        !! shown here.
                        !!
                        !! "Ask for more time" belongs to a contract that has
                        !! ENDED with classes still on it.
                        !!
                        !! "Get a new plan" belongs to a student with no live
                        !! contract, or one they have used up. Offering it to a
                        !! student with twelve unused classes is offering to
                        !! throw the twelve classes away: approving a new plan
                        !! expires the contract they are on and starts a fresh
                        !! one at zero used.
                        !!
                        !! Both of those live in their own cards above, which
                        !! were already rule-gated. The old page had the rule
                        !! in its layout - the buttons were simply not there -
                        !! and the rebuild with three permanent buttons lost
                        !! it. So the buttons are gone again, and the rule is
                        !! in describeAvailableRequests where a test can reach
                        !! it.
                        */}
                    {!isSimpleStudentView && (
                      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                        <button
                          type="button"
                          className={kid.bookBig}
                          data-calendar-guide="book-class"
                          onClick={openMonthlyBooking}
                          disabled={!assignedTeacherId || hasNoClassesLeft}
                        >
                          <span aria-hidden="true">📅</span>
                          {PLAN.bookAClass}
                        </button>
                      </div>
                    )}
                    {!isSimpleStudentView && !assignedTeacherId && (
                      <div style={{ marginTop: 10, fontSize: "0.85em", color: "#b65f00" }}>
                        {BOOKING.noTeacher}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* The colour key.
                !!
                !! It was five colours with five pieces of jargon, and it was
                !! on screen for every student on every visit to the page. A
                !! student does not need to know what "unavailable" means
                !! formally - they need to know which days they can press.
                !! So it is folded away by default and the words are the ones
                !! a student would use.
                !!
                !! And a student on the simple page has no calendar at all,
                !! so there is nothing for the key to explain. It is for the
                !! people who still have a grid in front of them - and there
                !! is no grid in the list view either, so it goes there too. */}
            {!isSimpleStudentView && calendarView !== "list" && (
            <details className={cal.legendBlock}>
              <summary className={styles.guideTitle} style={{ cursor: "pointer" }}>
                {LEGEND.title}
              </summary>

              <div className={cal.legendRow}>
                <span className={`${cal.legendDot} ${cal.legendAvail}`} />
                <span>{LEGEND.available}</span>
              </div>

              <div className={cal.legendRow}>
                <span className={`${cal.legendDot} ${cal.legendClasses}`} />
                <span>{LEGEND.hasClasses}</span>
              </div>

              <div className={cal.legendRow}>
                <span className={`${cal.legendDot} ${cal.legendUnavail}`} />
                <span>{LEGEND.unavailable}</span>
              </div>

              <div className={cal.legendRow}>
                <span className={`${cal.legendDot} ${cal.legendUnscheduled}`} />
                <span>{LEGEND.notSet}</span>
              </div>

              <div className={cal.legendRow}>
                <span className={`${cal.legendDot} ${cal.legendPast}`} />
                <span>{LEGEND.past}</span>
              </div>

              <div className={styles.guideHint}>{LEGEND.hint}</div>
            </details>
            )}
          </aside>

                  {/* The teacher availability manager, in a window.
                  !!
                  !! It used to open in the panel beside the grid, and the grid and
                  !! the form fought over the same space: the form was tall, the grid was
                  !! squeezed to the side, and a teacher setting their hours had to
                  !! scroll a narrow column to reach the Save button.
                  !!
                  !! It is a window now. The grid stays where it was and the form comes
                  !! to the teacher. */}
                  {/* The teacher availability manager, in a window.
                  !!
                  !! It used to open in the panel beside the grid, and the grid and
                  !! the form fought over the same space: the form was tall, the grid was
                  !! squeezed to the side, and a teacher setting their hours had to
                  !! scroll a narrow column to reach the Save button.
                  !!
                  !! It is a window now. The grid stays where it was and the form comes
                  !! to the teacher. */}
                  {/* The teacher availability manager, in a window.
                  !!
                  !! It used to open in the panel beside the grid, and the grid and
                  !! the form fought over the same space: the form was tall, the grid was
                  !! squeezed to the side, and a teacher setting their hours had to
                  !! scroll a narrow column to reach the Save button.
                  !!
                  !! It is a window now. The grid stays where it was and the form comes
                  !! to the teacher. */}
                  <AvailabilityDialog
                    open={setAvailabilityMode && localRole === "teacher"}
                    onClose={closeAvailabilityManager}
                    screen={availabilityScreen}
                  >
                    {availabilityScreen === "list" || availabilityScreen === "filter" ? (
                      <AvailabilityAvailabilities
                        screen={availabilityScreen}
                        records={teacherAvailabilityAll}
                        onEdit={editAvailability}
                        onDelete={(record) =>
                          deleteTeacherAvailability(record.id || record.availability_id)
                        }
                        onBack={() => setAvailabilityScreen("form")}
                        onShowFilter={() => setAvailabilityScreen("filter")}
                        onShowList={() => setAvailabilityScreen("list")}
                      />
                    ) : (
                    <div className={cal.dialogBody}>

                      {editingAvailability && (
                        /* The teacher has to know they are changing a day and
                           not adding one, or the save reads as "add this day"
                           and they end up with two. */
                        <div className={cal.info}>
                          Editing {formatScheduleDate(editingAvailability.available_date)}. Save to change it.
                        </div>
                      )}

                      {availabilityError && <div className={cal.errorBox}>{availabilityError}</div>}

                      <div style={{ display: "grid", gap: 12 }}>
                        <div>
                          <label className={cal.formLabel}>Apply To *</label>
                          <div className={cal.segmented}>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityApplyMode("single");
                                setAvailabilityError("");
                              }}
                              className={`${cal.segmentedBtn} ${availabilityApplyMode === "single" ? cal.segmentedBtnActive : ""}`}
                            >
                              Single Day
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityApplyMode("bulk");
                                setAvailabilityError("");
                              }}
                              className={`${cal.segmentedBtn} ${availabilityApplyMode === "bulk" ? cal.segmentedBtnActive : ""}`}
                            >
                              Weekly Pattern
                            </button>
                          </div>
                        </div>

                        {availabilityApplyMode === "bulk" && (
                          <div>
                            <label className={cal.formLabel}>Weekdays *</label>
                            <div className={cal.weekdayPick}>
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
                                    className={`${cal.weekdayPickBtn} ${active ? cal.weekdayPickBtnActive : ""}`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className={cal.formHint}>
                              Applies to {bulkAvailabilityDates.length} date{bulkAvailabilityDates.length === 1 ? "" : "s"} in {monthName} {year}
                            </div>
                          </div>
                        )}

                      {availabilityApplyMode === "single" && (
                      <div>
                        <label className={cal.formLabel}>Date *</label>
                        {/* The days come with the form.
                            !!
                            !! The teacher used to pick the date by clicking a day
                            !! on the month grid behind this panel. The form is a
                            !! window now and the grid is behind that, so the days
                            !! have to come with the form - otherwise there would
                            !! be no way to choose a date at all.
                            !!
                            !! The strip is the one the student picks a day from: a
                            !! name, a number, and no calendar to read. */}
                        <div className={cal.pickerHead}>
                          <button
                            type="button"
                            className={cal.navBtn}
                            onClick={() => moveAvailabilityPickerMonth(-1)}
                            disabled={!canMoveAvailabilityPickerMonth(-1)}
                            aria-label="Previous month"
                          >
                            ‹
                          </button>
                          <span className={cal.pickerMonth}>{availabilityPickerMonthName}</span>
                          <button
                            type="button"
                            className={cal.navBtn}
                            onClick={() => moveAvailabilityPickerMonth(1)}
                            disabled={!canMoveAvailabilityPickerMonth(1)}
                            aria-label="Next month"
                          >
                            ›
                          </button>
                        </div>
                        <DayPicker
                          days={availabilityPickerDays}
                          selected={availabilityDate}
                          onPick={(key) => {
                            setAvailabilityDate(key);
                            setAvailabilityError("");
                          }}
                          emptyMessage="There are no days left to set in this month."
                          statusFor={availabilityPickerStatusFor}
                        />
                        <div className={cal.formHint}>
                          Dates allowed from today to {new Date(scheduleWindowEndKey + "T00:00:00").toLocaleDateString()}
                        </div>
                        {availabilityError && getAvailabilityFieldError("availabilityDate") && (
                          <div className={cal.fieldError}>
                            {getAvailabilityFieldError("availabilityDate")}
                          </div>
                        )}
                      </div>
                      )}

                        <div>
                          <label className={cal.formLabel}>Availability Status *</label>
                          <div className={styles.availabilityStatus} style={{ display: "flex", gap: 12 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityStatus("available");
                                setAvailabilityError(validateAvailabilityInputs({ availabilityStatus: "available" }));
                              }}
                              className={`${cal.segmentedBtn} ${availabilityStatus === "available" ? cal.segmentedBtnActive : ""}`}
                            >
                              Available
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAvailabilityStatus("unavailable");
                                setAvailabilityError(validateAvailabilityInputs({ availabilityStatus: "unavailable" }));
                              }}
                              className={`${cal.segmentedBtn} ${availabilityStatus === "unavailable" ? cal.segmentedBtnDanger : ""}`}
                            >
                              Unavailable
                            </button>
                          </div>
                        </div>

                        {availabilityStatus === "available" && (
                          <>
                            <div>
                              <label className={cal.formLabel}>Start Time *</label>
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
                                className={cal.formInput}
                              />
                              {availabilityError && getAvailabilityFieldError("availabilityStartTime") && (
                                <div className={cal.fieldError}>
                                  {getAvailabilityFieldError("availabilityStartTime")}
                                </div>
                              )}
                            </div>

                            <div>
                              <label className={cal.formLabel}>End Time *</label>
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
                                className={cal.formInput}
                              />
                              {availabilityError && getAvailabilityFieldError("availabilityEndTime") && (
                                <div className={cal.fieldError}>
                                  {getAvailabilityFieldError("availabilityEndTime")}
                                </div>
                              )}
                              {availabilityStartTime && availabilityEndTime && (
                                <div className={cal.formHint}>
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
                              <label className={cal.formLabel}>Break Time (Optional)</label>
                              
                              <div className={styles.breakTimeFields} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                                <div>
                                  <label className={cal.formLabel}>Break Start</label>
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
                                    className={cal.formInput}
                                  />
                                  {availabilityError && getAvailabilityFieldError("availabilityBreakStart") && (
                                    <div className={cal.fieldError}>
                                      {getAvailabilityFieldError("availabilityBreakStart")}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <label className={cal.formLabel}>Break End</label>
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
                                    className={cal.formInput}
                                  />
                                  {availabilityError && getAvailabilityFieldError("availabilityBreakEnd") && (
                                    <div className={cal.fieldError}>
                                      {getAvailabilityFieldError("availabilityBreakEnd")}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {availabilityBreakStart && availabilityBreakEnd && (
                                <div className={cal.formHint}>
                                  Break: {humanTime(availabilityBreakStart)} - {humanTime(availabilityBreakEnd)}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSetAvailabilityMode(false);
                            setAvailabilityError("");
                            setAvailabilityStartTime("");
                            setAvailabilityEndTime("");
                            setAvailabilityBreakStart("");
                            setAvailabilityBreakEnd("");
                            setEditingAvailability(null);
                          }}
                          disabled={isSubmittingAvailability}
                          className={cal.actionCard}
                          style={{ justifyContent: "center" }}
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={openAvailabilityConfirmation}
                          disabled={isSubmittingAvailability}
                          className={`${cal.actionCard} ${cal.actionPrimary}`}
                          style={{ justifyContent: "center" }}
                        >
                          {isSubmittingAvailability
                            ? "Saving..."
                            : editingAvailability
                              ? "Save changes"
                              : "Save Availability"}
                        </button>
                      </div>

                      {/* The days the teacher has already set.
                          !!
                          !! This was a list of one month's records at the bottom of the
                          !! form, in a panel that was already crowded, and it was the
                          !! part of the window that looked like an afterthought. Now it
                          !! is a screen of its own - every day the teacher has set, in
                          !! order, with a way to edit or delete each one. */}
                      <button type="button" className={cal.seeBtn} onClick={openAvailabilityList}>
                        <span aria-hidden="true">📅</span>
                        See my availabilities ({teacherAvailabilityAll.length})
                      </button>
                    </div>
                    )}
                  </AvailabilityDialog>
        </div>
    </section>
    </main>
    {classEntryConfirmOpen && selectedClass && (
      <ModalPortal>
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
              <strong>{humanTime(selectedClass.start_time || selectedClass.time)} - {getEndTime(selectedClass.start_time || selectedClass.time, selectedClass.duration, selectedClass.end_time)}</strong>
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
      </ModalPortal>
    )}
    {availabilityConfirmOpen && (
      <ModalPortal>
        <div
          role="presentation"
          onClick={() => {
            if (!isSubmittingAvailability) setAvailabilityConfirmOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.48)",
            backdropFilter: "blur(8px)",
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
              border: "1px solid rgba(38, 66, 59, 0.12)",
              borderRadius: 24,
              boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
              padding: 24,
              animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
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
                  border: "1px solid rgba(38, 66, 59, 0.14)",
                  background: "#fff",
                  color: "#26423b",
                  borderRadius: 14,
                  padding: "10px 18px",
                  minHeight: 42,
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
                  background: "#26423b",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "10px 18px",
                  minHeight: 42,
                  fontWeight: 700,
                  cursor: isSubmittingAvailability ? "not-allowed" : "pointer",
                  boxShadow: "0 8px 20px rgba(38, 66, 59, 0.22)",
                }}
              >
                {isSubmittingAvailability ? "Saving..." : "Save Availability"}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
    )}
    {requestConfirmOpen && selectedClass && (
      <ModalPortal>
        <div
          role="presentation"
          onClick={() => {
            if (!isSubmittingRequest) setRequestConfirmOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 25, 20, 0.45)",
            display: "grid", placeItems: "center",
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
          className={kid.filterDialog}
          style={{ maxWidth: 620 }}
        >
          <div className={kid.filterHead}>
            <div>
              <h3 className={kid.filterTitle} id="reschedule-confirm-title">
                {localRole === "teacher" ? "Send reschedule request?" : CONFIRM.rescheduleTitle}
              </h3>
              <p className={kid.filterSub}>
                {localRole === "teacher"
                  ? "This will send the request to the student for review."
                  : CONFIRM.rescheduleHelp}
              </p>
            </div>
            <button type="button" className={kid.filterClose} onClick={() => setRequestConfirmOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className={kid.filterBody}>
            <div className={kid.pastCard}>
              <div className={kid.pastFact}>
                <span className={kid.pastFactIcon} aria-hidden="true">📚</span>
                <div>
                  <div className={kid.detailLabel}>{selectedClass.className || "Selected class"}</div>
                  <div className={kid.detailValue}>
                    {localRole === "teacher"
                      ? `${localRole === "teacher" ? "Current" : CONFIRM.now}: ${new Date(selectedClass.scheduled_date + "T00:00:00").toLocaleDateString()} at ${humanTime(selectedClass.start_time || selectedClass.time)}`
                      : `${localRole === "teacher" ? "Current" : CONFIRM.now}: ${new Date(selectedClass.scheduled_date + "T00:00:00").toLocaleDateString()} at ${humanTime(selectedClass.start_time || selectedClass.time)}`}
                  </div>
                </div>
              </div>
              <div className={kid.pastFact}>
                <span className={kid.pastFactIcon} aria-hidden="true">🕐</span>
                <div>
                  <div className={kid.detailLabel}>
                    {localRole === "teacher" ? "Requested" : CONFIRM.new}
                  </div>
                  <div className={kid.detailValue}>
                    {requestDate ? new Date(requestDate + "T00:00:00").toLocaleDateString() : "Not selected"} at {humanTime(requestTime)}{requestEndTime ? ` - ${humanTime(requestEndTime)}` : ""}
                  </div>
                </div>
              </div>
              <div className={kid.pastFact}>
                <span className={kid.pastFactIcon} aria-hidden="true">⏱️</span>
                <div>
                  <div className={kid.detailLabel}>Duration</div>
                  <div className={kid.detailValue}>{CONFIRM.minutesEach(selectedClassDuration)}</div>
                </div>
              </div>
              <div className={kid.pastFact}>
                <span className={kid.pastFactIcon} aria-hidden="true">👩‍🏫</span>
                <div>
                  <div className={kid.detailLabel}>
                    {localRole === "teacher" ? "Student" : CLASS_INFO.teacher}
                  </div>
                  <div className={kid.detailValue}>
                    {localRole === "teacher"
                      ? selectedClass.studentName || selectedClass.studentFullName || "Student"
                      : selectedTeacherFullName || "Teacher"}
                  </div>
                </div>
              </div>
              <div className={kid.pastFact}>
                <span className={kid.pastFactIcon} aria-hidden="true">💬</span>
                <div>
                  <div className={kid.detailLabel}>
                    {localRole === "teacher" ? "Reason" : CONFIRM.why}
                  </div>
                  <div className={kid.detailValue}>{requestReason.trim()}</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setRequestConfirmOpen(false)}
                disabled={isSubmittingRequest}
                className={`${kid.btn} ${kid.btnGhost}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRequestReschedule}
                disabled={isSubmittingRequest}
                className={`${kid.btn} ${kid.btnPrimary} ${kid.btnWide}`}
              >
                {isSubmittingRequest ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
        </div>
      </ModalPortal>
    )}
    {classDoneConfirmOpen && selectedClass && (
      <ModalPortal>
        <div
          role="presentation"
          onClick={() => {
            if (!isMarkingClassDone) setClassDoneConfirmOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.48)",
            backdropFilter: "blur(8px)",
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
            border: "1px solid rgba(38, 66, 59, 0.12)",
            borderRadius: 24,
            boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
            padding: 24,
            animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
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
              {selectedClass.time} - {getEndTime(selectedClass.time, selectedClass.duration, selectedClass.end_time)}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={() => setClassDoneConfirmOpen(false)}
              disabled={isMarkingClassDone}
              style={{
                border: "1px solid rgba(38, 66, 59, 0.14)",
                background: "#fff",
                color: "#26423b",
                borderRadius: 14,
                padding: "10px 18px",
                minHeight: 42,
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
      </ModalPortal>
    )}
    {confirmAction && (
      <ModalPortal>
        <div
          onClick={closeConfirmAction}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(15, 25, 20, 0.45)",
            display: "grid", placeItems: "center",
            padding: 20,
          }}
        >
        <div
          onClick={(e) => e.stopPropagation()}
          className={kid.filterDialog}
          style={{ maxWidth: 440 }}
        >
          <div className={kid.filterHead}>
            <div>
              <h3 className={kid.filterTitle}>{confirmAction.title}</h3>
              <p className={kid.filterSub}>{confirmAction.message}</p>
            </div>
            <button type="button" className={kid.filterClose} onClick={closeConfirmAction} aria-label="Close">
              ×
            </button>
          </div>
          <div className={kid.filterBody}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={closeConfirmAction}
                className={`${kid.btn} ${kid.btnGhost}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performConfirmAction}
                className={`${kid.btn} ${kid.btnPrimary}`}
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
        </div>
      </ModalPortal>
    )}
    </>
  );
}
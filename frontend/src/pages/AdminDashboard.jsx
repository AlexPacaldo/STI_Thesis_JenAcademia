import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import styles from "../assets/AdminDashboard.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import {
  computeProficiencyLevel,
  createEmptyLevelScores,
  formatComputedLevel,
  LEVEL_EVALUATION_CRITERIA,
  LEVEL_SCORE_LABEL_MAX,
  LEVEL_SCORE_MAX,
  LEVEL_SCORE_MIN,
  LEVEL_SCORE_SCALE,
} from "../utils/proficiencyEvaluation.js";
import {
  createEmptyCriteria,
  CRITERIA_EMPTY_MESSAGES,
  filterOptionsForCourses,
  pruneSelectionToCourses,
  STUDENT_CRITERIA_HINTS,
  STUDENT_CRITERIA_OPTIONS,
  TEACHER_CRITERIA_HINTS,
  TEACHER_CRITERIA_OPTIONS,
  toCriteriaSlug,
  toggleValue,
} from "../utils/matchingCriteria.js";
import CriteriaChipField, { CUSTOM_OPTION_VALUE } from "../components/CriteriaChipField.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import Calendar from "./Calendar.jsx"; // admin calendar view
import { API_BASE_URL } from "../utils/api.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { openAuthenticatedFile } from "../utils/authenticatedFile.js";

const API = API_BASE_URL;
const VERIFICATIONS_PER_PAGE = 10;

const ADMIN_TABS = [
  "calendar",
  "books",
  "verifications",
  "requests",
  "contracts",
  "teacherCourses",
  "createTeacher",
  "createStudent",
  "archive",
];

const getAdminTabFromSearch = (search) => {
  const requestedTab = new URLSearchParams(search).get("tab");
  return ADMIN_TABS.includes(requestedTab) ? requestedTab : "calendar";
};

// Resume auto-fill on the Create Teacher form. The client-side checks mirror the
// backend's upload limits so an unsupported or oversized file fails immediately
// instead of after a slow upload; backend/teacherResumeParser.js still does the
// real validation, this is only there to save the admin a round trip.
const RESUME_MAX_BYTES = 8 * 1024 * 1024;
const RESUME_ACCEPTED = /\.(pdf|docx|txt)$/i;

/**
 * Fold a parsed resume into the create-teacher form without destroying anything
 * the admin already entered: chip selections union with what is already ticked,
 * and the free-text fields are only written while they are still blank. That
 * keeps re-uploading a corrected CV safe on a form that is already part filled
 * in, and leaves every value editable before the teacher is created.
 */
function mergeResumeIntoTeacherForm(form, parsed) {
  const union = (current, incoming) => [...new Set([...(current || []), ...(incoming || [])])];
  const isBlank = (value) => !String(value ?? "").trim();
  const years = parsed.experienceYears;

  return {
    ...form,
    specialization: union(form.specialization, parsed.specialization),
    teachingStyle: union(form.teachingStyle, parsed.teachingStyle),
    idealStudentPace: union(form.idealStudentPace, parsed.idealStudentPace),
    experienceYears: isBlank(form.experienceYears)
      ? years === null || years === undefined
        ? ""
        : String(years)
      : form.experienceYears,
    bio: isBlank(form.bio) ? parsed.bio || "" : form.bio,
  };
}

const pluralize = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Spells out what the parser actually produced, for the confirmation toast. */
function describeResumeFill(parsed) {
  const parts = [];
  if (parsed.bio) parts.push("bio");
  if (parsed.specialization?.length) parts.push(pluralize(parsed.specialization.length, "specialization"));
  if (parsed.teachingStyle?.length) parts.push(pluralize(parsed.teachingStyle.length, "teaching style"));
  if (parsed.idealStudentPace?.length) parts.push(pluralize(parsed.idealStudentPace.length, "pace choice"));
  if (parsed.experienceYears !== null && parsed.experienceYears !== undefined) {
    parts.push(`${parsed.experienceYears} year${parsed.experienceYears === 1 ? "" : "s"} experience`);
  }

  return parts.length
    ? `Filled from resume: ${parts.join(", ")}. Review it before saving.`
    : "Nothing usable was found in that resume. Fill the matching profile manually.";
}

const COUNTRY_OPTIONS = [
  "Australia",
  "Canada",
  "China",
  "India",
  "Indonesia",
  "Japan",
  "Malaysia",
  "Philippines",
  "Singapore",
  "South Korea",
  "Thailand",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Vietnam",
];

// Helper to safely parse date strings
const parseDate = (dateString) => {
  if (!dateString) return null;
  try {
    // Try direct Date constructor first
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // Try manual parsing for YYYY-MM-DD format
    const parts = String(dateString).split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }
  } catch {
    // fallback to null
  }
  return null;
};

// Helper to format date nicely
const formatDate = (dateString) => {
  const date = parseDate(dateString);
  if (!date || isNaN(date.getTime())) {
    return dateString || "No date";
  }
  try {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateString || "Invalid date";
  }
};

const formatTime = (value) => {
  if (!value) return "-";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = hour >= 12 ? "PM" : "AM";
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const SETUP_INVITE_LABELS = {
  completed: "Setup Complete",
  sent: "Invite Sent",
  expired: "Invite Expired",
  not_sent: "Invite Not Sent",
};

const setupInviteStatusStyle = (status) => {
  const palette = {
    completed: { background: "#dcfce7", color: "#166534" },
    sent: { background: "#dbeafe", color: "#1e40af" },
    expired: { background: "#fee2e2", color: "#991b1b" },
    not_sent: { background: "#f3f4f6", color: "#374151" },
  };
  return palette[status] || palette.not_sent;
};

const VERIFICATION_STATUS_LABELS = {
  all: "All",
  verified: "Verified",
  needs_review: "Needs Review",
  student_confirmed: "Student Confirmed",
  in_progress: "In Progress",
  pending: "Pending",
  incomplete: "Incomplete",
  missing: "No Log",
};

const verificationStatusStyle = (status) => {
  const palette = {
    verified: { background: "#dcfce7", color: "#166534" },
    needs_review: { background: "#fef3c7", color: "#92400e" },
    student_confirmed: { background: "#dbeafe", color: "#1e40af" },
    in_progress: { background: "#e0f2fe", color: "#075985" },
    pending: { background: "#f3f4f6", color: "#374151" },
    incomplete: { background: "#fee2e2", color: "#991b1b" },
    missing: { background: "#fee2e2", color: "#991b1b" },
  };
  return palette[status] || palette.pending;
};

// Upload paths come back both with and without a leading slash, and Windows
// paths may use "\". A bare concat on a slash-less path produces
// "localhost:3001uploads/..." with no separator, which 404s - so normalise
// first. Mirrors profileSrc() in remarks.jsx and booksLessons.jsx.
/**
 * Pull a readable message out of a failed request. Backend 5xx responses carry
 * the underlying cause in `error`, which the generic `message` hides - a stack
 * overflow or a bad column name otherwise shows up as a bare "Error updating
 * book distribution".
 */
const apiErrorMessage = (error, fallback) => {
  const data = error?.response?.data;
  const detail = data?.error || error?.message;
  const base = data?.message || fallback;
  return detail && detail !== base ? `${base} (${detail})` : base;
};

const resolveUploadUrl = (url) => {
  if (!url) return "";
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/")) return `${API}${cleaned}`;
  return `${API}/${cleaned}`;
};

const initialsOf = (person) =>
  `${(person?.first_name || "").charAt(0)}${(person?.last_name || "").charAt(0)}`.toUpperCase() ||
  "?";

// The admin users endpoint returns profile_image_url, so teacher chips use the
// real photo. Falls back to initials when a teacher has none, or when the image
// 404s (an old uploads path, or a file removed outside the app).
const TeacherAvatar = ({ teacher, broken, onError }) => {
  const label = `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || "Teacher";

  if (teacher.profile_image_url && !broken) {
    return (
      <AuthenticatedImage
        className={styles.bookTeacherAvatar}
        src={teacher.profile_image_url}
        alt={label}
        title={label}
        onError={onError}
      />
    );
  }

  return (
    <span className={styles.bookTeacherAvatar} title={label} aria-hidden="true">
      {initialsOf(teacher)}
    </span>
  );
};

const getVerificationMissingItems = (row) => {
  const missing = [];
  if (!row.teacher_started_at) missing.push("teacher start");
  if (!row.student_joined_at) missing.push("student attendance");
  if (!row.teacher_ended_at) missing.push("teacher end");
  if (Number(row.duration_minutes || 0) <= 0) missing.push("duration");
  if (!row.summary) missing.push("summary");
  if (row.evidence_mode === "screenshots") {
    if (!row.start_proof_url) missing.push("start screenshot");
    if (!row.proof_url) missing.push("end screenshot");
  } else if (!row.recording_url) missing.push("recording");
  return missing;
};

const getRequiredClassMinutes = (duration) => {
  const parsedDuration = parseInt(duration, 10);
  const safeDuration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 50;
  return Math.max(1, Math.min(30, Math.ceil(safeDuration * 0.6)));
};

const getVerificationReviewReasons = (row) => {
  const reasons = [];
  const durationMinutes = Number(row.duration_minutes || 0);
  const requiredMinutes = getRequiredClassMinutes(row.duration);

  if (!row.teacher_started_at) reasons.push("Missing teacher start");
  if (!row.student_joined_at) reasons.push("Missing student attendance");
  if (!row.teacher_ended_at) reasons.push("Missing teacher end");
  if (durationMinutes < requiredMinutes) reasons.push(`Duration too short: ${durationMinutes} / ${requiredMinutes} min`);
  if (!row.summary) reasons.push("Missing class summary");
  if (row.evidence_mode === "screenshots") {
    if (!row.start_proof_url || !row.proof_url) reasons.push("Both start and end screenshots are required");
    const delay = new Date(row.start_proof_uploaded_at).getTime() - new Date(row.student_joined_at).getTime();
    if (row.start_proof_url && (!Number.isFinite(delay) || delay < 0 || delay > 300000)) reasons.push("Start screenshot was outside the five-minute submission window");
  } else if (!row.recording_url || Number(row.recording_duration_seconds || 0) < requiredMinutes * 60) reasons.push(`Recording must cover at least ${requiredMinutes} minutes`);

  return reasons;
};

export default function AdminDashboard() {
  const { notify } = useNotification() || {};
  const location = useLocation();
  const [active, setActive] = useState("calendar"); // 'calendar' | 'createTeacher' | 'createStudent' | 'archive' | 'requests'
  const [me, setMe] = useState(null);
  const currentAdminId = me?.id || me?.user_id || me?.userId;

  useEffect(() => {
    const nextActive = getAdminTabFromSearch(location.search);
    setActive((currentActive) => (currentActive === nextActive ? currentActive : nextActive));
  }, [location.search]);

  // data
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [requests, setRequests] = useState([]); // reschedule requests

  // create-teacher form. Every AI matching attribute is multi-select so it lines
  // up with the student criteria the matcher compares it against.
  const [tForm, setTForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    country: "",
    birthDate: "",
    specialization: [],
    experienceYears: "",
    teachingStyle: [],
    teachingStyleOther: "",
    idealStudentPace: [],
    idealStudentPaceOther: "",
    bio: "",
    courseIds: [],
  });
  // Resume auto-fill. The parsed profile is a draft for the fields above; nothing
  // is submitted until the admin saves the teacher.
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeFileName, setResumeFileName] = useState("");
  const resumeInputRef = useRef(null);
  // create-student form
  const [sForm, setSForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    country: "",
    birthDate: "",
    trialNotes: "",
    teacherId: "",
    courseId: "",
    classesAvailed: "",
    classDuration: "50",
    // The admin scores the 5 level-evaluation criteria; the proficiency level is
    // derived from them (see computeProficiencyLevel). There is no hand-picked
    // `level` in state, so the scores stay the single source of truth.
    levelScores: createEmptyLevelScores(),
    // Every criterion is multi-select so it mirrors the teacher's matching
    // profile. See utils/matchingCriteria.js.
    aiCriteria: createEmptyCriteria(),
  });
  const [showLevelHelp, setShowLevelHelp] = useState(false);
  const [courses, setCourses] = useState([]);
  const [teacherCourses, setTeacherCourses] = useState([]);
  const [teacherCourseDrafts, setTeacherCourseDrafts] = useState({});
  const [teacherCourseSearch, setTeacherCourseSearch] = useState("");
  const [expandedTeacherCourses, setExpandedTeacherCourses] = useState({});
  const [savingTeacherCoursesId, setSavingTeacherCoursesId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [archiveRefresh, setArchiveRefresh] = useState(0); // bump to reload archived list
  const [archiveSearch, setArchiveSearch] = useState("");
  const [requestFilter, setRequestFilter] = useState("all"); // 'all', 'pending', 'approved', 'declined'
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { id, status, action }
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, action }
  const [contracts, setContracts] = useState([]);
  const [contractSearch, setContractSearch] = useState("");
  const [contractsLoading, setContractsLoading] = useState(false);
  const [savingContractId, setSavingContractId] = useState(null);
  const [contractRequests, setContractRequests] = useState([]);
  const [contractRequestSearch, setContractRequestSearch] = useState("");
  const [contractRequestsLoading, setContractRequestsLoading] = useState(false);
  const [updatingContractRequestId, setUpdatingContractRequestId] = useState(null);
  const [contractSubTab, setContractSubTab] = useState("packages");
  const [verifications, setVerifications] = useState([]);
  const [verificationsLoading, setVerificationsLoading] = useState(false);
  const [verificationSearch, setVerificationSearch] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("all");
  const [verificationPage, setVerificationPage] = useState(1);
  const [selectedProof, setSelectedProof] = useState(null);
  const [adminConfirm, setAdminConfirm] = useState(null);
  const [studentAccountModal, setStudentAccountModal] = useState(null);
  const [studentAccountLoading, setStudentAccountLoading] = useState(false);
  const [studentEmailDraft, setStudentEmailDraft] = useState("");
  const [studentAccountActionLoading, setStudentAccountActionLoading] = useState("");
  // ---- book library (admin is the only role that can author or distribute) ----
  const [books, setBooks] = useState([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [bookSearch, setBookSearch] = useState("");
  const [bookStatusFilter, setBookStatusFilter] = useState("active"); // 'active' | 'archived' | 'all'
  const [bookModal, setBookModal] = useState(null); // null | 'create' | 'edit' | 'distribute'
  const [bookDraft, setBookDraft] = useState({ bookId: null, title: "", description: "", courseId: "", teacherIds: [], coverFile: null });
  const [bookSaving, setBookSaving] = useState(false);
  const [bookBusyId, setBookBusyId] = useState(null);
  // Covers whose URL 404s. Swapped for the placeholder rather than hiding the
  // image, which would otherwise leave an empty frame with the badge floating.
  const [coverErrors, setCoverErrors] = useState({});
  // Teacher photos that 404, so the chip falls back to initials instead of a
  // broken-image icon.
  const [avatarErrors, setAvatarErrors] = useState({});
  const selectedTeacherCourseNames = courses
    .filter((course) => tForm.courseIds.includes(String(course.course_id)))
    .map((course) => course.course_name);
  const teacherSpecializationOptions = filterOptionsForCourses(
    TEACHER_CRITERIA_OPTIONS.specialization,
    selectedTeacherCourseNames
  );
  const selectedStudentCourseNames = courses
    .filter((course) => String(course.course_id) === String(sForm.courseId))
    .map((course) => course.course_name);
  const studentLearningGoalOptions = filterOptionsForCourses(
    STUDENT_CRITERIA_OPTIONS.learningGoal,
    selectedStudentCourseNames
  );
  const studentFocusAreaOptions = filterOptionsForCourses(
    STUDENT_CRITERIA_OPTIONS.focusArea,
    selectedStudentCourseNames
  );
  // The level-evaluation scores are the single source of truth for the student's
  // proficiency level; the level is derived, never stored or picked by hand.
  const computedLevel = useMemo(
    () => computeProficiencyLevel(sForm.levelScores),
    [sForm.levelScores]
  );
  const missingLevelCriteria = LEVEL_EVALUATION_CRITERIA.filter(
    ({ key }) => sForm.levelScores?.[key] == null
  );

  // ---- role gate (admin only) ----
   useEffect(() => {
     const u = readStoredUser();
     if (!u) {
       window.location.href = "/";
       return;
     }
     setMe(u);
     if (u.role !== "admin") {
       // only admin can access
       window.location.href = "/";
     }
     // Check if profile is incomplete and redirect
     if (!u.profileCompleted) {
       window.location.href = "/account";
     }
   }, []);

  // ---- fetchers ----
  async function loadUsers() {
    try {
      const [s, t, tc] = await Promise.all([
        axios.get(`${API}/api/admin/users?role=student&status=active`),
        axios.get(`${API}/api/admin/users?role=teacher&status=active`),
        axios.get(`${API}/api/teacher-courses`),
      ]);
      setStudents(s.data || []);
      setTeachers(t.data || []);
      setTeacherCourses(tc.data?.teacherCourses || []);
    } catch (e) {
      console.error(e);
      setStudents([]);
      setTeachers([]);
      setTeacherCourses([]);
    }
  }

  useEffect(() => {
    if (!me) return;
    // preload default data
    loadUsers();
    loadCourses();
    loadBooks();
    if (active === "requests") loadRequests();
    if (active === "verifications") loadClassVerifications();
  }, [me]);

  // Fetch available courses
  async function loadCourses() {
    try {
      const r = await axios.get(`${API}/api/courses`);
      setCourses(r.data?.courses || []);
    } catch (e) {
      console.error(e);
      setCourses([]);
    }
  }

  // reload requests when tab becomes active
  useEffect(() => {
    if (active === "requests") {
      loadRequests();
    }
    if (active === "contracts") {
      loadContracts();
      loadContractRequests();
    }
    if (active === "verifications") {
      loadClassVerifications();
    }
    if (active === "books") {
      loadBooks();
    }
  }, [active]);

  // ===== BOOK LIBRARY =====
  // Books are authored here and handed out to teachers. Teachers get read-only
  // access to whatever they are given, so everything about a book's lifecycle
  // (create, edit, distribute, archive) happens on this tab.

  async function loadBooks() {
    if (!currentAdminId) return;
    try {
      setBooksLoading(true);
      const r = await axios.get(`${API}/api/admin/books`, {
        params: { admin_id: currentAdminId, status: bookStatusFilter },
      });
      setBooks(r.data?.books || []);
    } catch (e) {
      console.error(e);
      notify?.(apiErrorMessage(e, "Failed to load books"), "error");
      setBooks([]);
    } finally {
      setBooksLoading(false);
    }
  }

  // The status filter is sent to the server, so changing it has to re-query.
  // Without this the dropdown filtered client-side against whatever the last
  // fetch returned, and switching Active -> Archived showed an empty list.
  // On mount currentAdminId is still null, so this bails and the initial load
  // comes from the [me] effect instead of firing twice.
  useEffect(() => {
    loadBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookStatusFilter, currentAdminId]);

  // Only teachers assigned to the chosen course can hold a book for it, so the
  // picker narrows as the course changes. With no course chosen it returns
  // nothing: eligibility is per-course, so showing every teacher would offer
  // choices that are all wrong and most of them invalid.
  const eligibleTeachersForCourse = useMemo(() => {
    if (!bookDraft.courseId) return [];
    const courseId = String(bookDraft.courseId);
    return teachers.filter((teacher) =>
      teacherCourses.some(
        (item) =>
          String(item.teacher_id) === String(teacher.user_id) &&
          String(item.course_id) === courseId
      )
    );
  }, [bookDraft.courseId, teacherCourses, teachers]);

  const bookSearchTerm = bookSearch.trim().toLowerCase();
  const filteredBooks = books.filter((book) => {
    if (!bookSearchTerm) return true;
    return [
      book.title,
      book.description,
      book.course_name,
      book.teacher_names,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(bookSearchTerm);
  });

  // book_teachers.teacher_ids comes back as a CSV, so resolve it against the
  // loaded teacher list to get names back. Falls back to the rolled-up
  // teacher_names string if a teacher is no longer in the active list.
  function teachersForBook(book) {
    const ids = String(book.teacher_ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const resolved = ids
      .map((id) => teachers.find((teacher) => String(teacher.user_id) === id))
      .filter(Boolean);

    return resolved;
  }

  function openBookModal(kind, book = null) {
    if (kind === "create") {
      setBookDraft({
        bookId: null,
        title: "",
        description: "",
        courseId: "",
        teacherIds: [],
        coverFile: null,
      });
    } else if (kind === "edit" && book) {
      setBookDraft({
        bookId: book.book_id,
        title: book.title || "",
        description: book.description || "",
        courseId: String(book.course_id),
        teacherIds: [],
        coverFile: null,
      });
    } else if (kind === "distribute" && book) {
      setBookDraft({
        bookId: book.book_id,
        title: book.title || "",
        description: book.description || "",
        courseId: String(book.course_id),
        teacherIds: String(book.teacher_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
        coverFile: null,
      });
    }
    setBookModal(kind);
  }

  // Teachers already on the book who no longer appear in the eligible list -
  // they left the course, or were archived. Their checkbox is not rendered, so
  // without this the selection would be invisible and the save would fail with
  // no way to fix it.
  const orphanedTeacherIds = useMemo(
    () =>
      bookDraft.teacherIds.filter(
        (id) => !eligibleTeachersForCourse.some((teacher) => String(teacher.user_id) === id)
      ),
    [bookDraft.teacherIds, eligibleTeachersForCourse]
  );

  function toggleBookDraftTeacher(teacherId) {
    const key = String(teacherId);
    setBookDraft((prev) => ({
      ...prev,
      teacherIds: prev.teacherIds.includes(key)
        ? prev.teacherIds.filter((id) => id !== key)
        : [...prev.teacherIds, key],
    }));
  }

  async function submitBookModal() {
    if (!bookDraft.title.trim()) {
      notify("Book title is required", "error");
      return;
    }

    if (bookModal !== "distribute" && !bookDraft.courseId) {
      notify("Select the course this book belongs to", "error");
      return;
    }

    try {
      setBookSaving(true);
      const adminId = currentAdminId;

      if (bookModal === "distribute") {
        const response = await axios.put(`${API}/api/books/${bookDraft.bookId}/teachers`, {
          admin_id: adminId,
          teacher_ids: bookDraft.teacherIds,
        });
        const assigned = response.data?.teacher_ids?.length ?? bookDraft.teacherIds.length;
        notify(
          assigned === 0
            ? `${bookDraft.title} is no longer distributed to anyone.`
            : `Distributed to ${assigned} ${assigned === 1 ? "teacher" : "teachers"}.`,
          assigned === 0 ? "warning" : "success"
        );
      } else {
        const formData = new FormData();
        formData.append("title", bookDraft.title);
        formData.append("description", bookDraft.description || "");
        formData.append("admin_id", String(adminId));

        if (bookModal === "create") {
          formData.append("course_id", String(bookDraft.courseId));
          formData.append("teacher_ids", JSON.stringify(bookDraft.teacherIds));
        } else if (bookDraft.coverFile) {
          // Course and teacher list are deliberately left out of the edit form:
          // those have their own endpoints, so a stray field can't blank them.
          formData.append("cover", bookDraft.coverFile, bookDraft.coverFile.name);
        }

        const url =
          bookModal === "create"
            ? `${API}/api/books`
            : `${API}/api/books/${bookDraft.bookId}`;
        const response = await axios({
          method: bookModal === "create" ? "post" : "put",
          url,
          data: formData,
        });

        // Echo what the server actually stored. A bare "Book created" gave no
        // way to tell a silent distribution drop from success.
        if (bookModal === "create") {
          const assigned = response.data?.teacher_ids?.length ?? bookDraft.teacherIds.length;
          notify(
            assigned === 0
              ? "Book created with no teachers. Distribute it when ready."
              : `Book created and distributed to ${assigned} ${
                  assigned === 1 ? "teacher" : "teachers"
                }`,
            assigned === 0 ? "warning" : "success"
          );
        } else {
          notify("Book updated", "success");
        }
      }

      setBookModal(null);
      loadBooks();
    } catch (e) {
      console.error(e);
      notify(apiErrorMessage(e, "Failed to save book"), "error");
    } finally {
      setBookSaving(false);
    }
  }

  /**
   * Archive and restore both need a confirmation step, so they go through the
   * dashboard's shared confirm modal instead of a native window.confirm.
   */
  function requestBookStatusChange(book, action) {
    const copy = {
      archive: {
        title: "Archive book",
        message: `Archive "${book.title}"? Teachers and students stop seeing it, but its lessons and student progress are kept, and you can restore it later.`,
        confirmLabel: "Archive",
      },
      restore: {
        title: "Restore book",
        message: `Restore "${book.title}"? It becomes visible to its teachers and their students again.`,
        confirmLabel: "Restore",
      },
    }[action];

    setAdminConfirm({
      ...copy,
      tone: "default",
      action: "book_status",
      payload: { book, statusAction: action },
    });
  }

  async function applyBookStatusChange({ book, statusAction }) {
    // Keep the card locked until the list has actually been refreshed,
    // otherwise a second click lands while the first write is still settling
    // and reports a confusing failure.
    setBookBusyId(book.book_id);

    try {
      await axios.put(`${API}/api/books/${book.book_id}/${statusAction}`, null, {
        params: { admin_id: currentAdminId },
      });

      await loadBooks();

      // Archived books drop out of the "Active" filter, so say so rather than
      // letting the card silently vanish.
      notify(
        statusAction === "archive"
          ? `"${book.title}" archived. Find it under the Archived filter.`
          : `"${book.title}" restored`,
        "success"
      );
    } catch (e) {
      console.error(e);
      notify(apiErrorMessage(e, `Failed to ${statusAction} book`), "error");
    } finally {
      setBookBusyId(null);
    }
  }

  useEffect(() => {
    setVerificationPage(1);
  }, [verificationSearch]);

  useEffect(() => {
    const nextDrafts = {};
    teachers.forEach((teacher) => {
      const teacherId = String(teacher.user_id);
      nextDrafts[teacherId] = teacherCourses
        .filter((item) => String(item.teacher_id) === teacherId)
        .map((item) => String(item.course_id));
    });
    setTeacherCourseDrafts(nextDrafts);
  }, [teachers, teacherCourses]);

  // ---- actions: create teacher ----
  async function createTeacher(payloadSource = tForm) {
    setLoading(true);
    try {
      const payload = { ...payloadSource, role: "teacher", password: "teacher" };
      const response = await axios.post(`${API}/api/admin/users`, payload); // creates teacher
      if (response.data?.inviteEmailSent) {
        notify("Teacher created and setup invite sent to their email.", "success");
      } else {
        notify("Teacher created. Setup invite was prepared, but email was not sent. Check SMTP settings.", "warning");
      }
      setTForm({
        firstName: "",
        lastName: "",
        email: "",
        country: "",
        birthDate: "",
        specialization: [],
        experienceYears: "",
        teachingStyle: [],
        teachingStyleOther: "",
        idealStudentPace: [],
        idealStudentPaceOther: "",
        bio: "",
        courseIds: [],
      });
      setResumeFileName("");
      loadUsers();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to create teacher", "error");
    } finally {
      setLoading(false);
    }
  }

  // ---- actions: create student ----
  async function createStudent(payloadSource = sForm) {
    setLoading(true);
    try {
      // `levelScores` travels in the snapshot payload; the backend recomputes the
      // level from it and ignores anything the client claims the level is.
      const payload = { ...payloadSource, role: "student", password: "student" };
      const response = await axios.post(`${API}/api/admin/users`, payload); // creates student
      if (response.data?.inviteEmailSent) {
        notify("Student created and setup invite sent to their email.", "success");
      } else {
        notify("Student created. Setup invite was prepared, but email was not sent. Check SMTP settings.", "warning");
      }
      setSForm({
        firstName: "",
        lastName: "",
        email: "",
        country: "",
        birthDate: "",
        trialNotes: "",
        levelScores: createEmptyLevelScores(),
        teacherId: "",
        courseId: "",
        classesAvailed: "",
        classDuration: "50",
        aiCriteria: createEmptyCriteria(),
      });
      setAiRecommendation(null);
      setShowLevelHelp(false);
      loadUsers();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to create student", "error");
    } finally {
      setLoading(false);
    }
  }

  function openAdminConfirm(config) {
    setAdminConfirm(config);
  }

  function closeAdminConfirm() {
    setAdminConfirm(null);
  }

  async function executeAdminConfirm() {
    if (!adminConfirm) return;

    try {
      if (adminConfirm.action === "create_teacher") {
        await createTeacher(adminConfirm.payload);
      } else if (adminConfirm.action === "create_student") {
        await createStudent(adminConfirm.payload);
      } else if (adminConfirm.action === "save_teacher_courses") {
        await saveManagedTeacherCourses(adminConfirm.payload.teacherId, adminConfirm.payload.courseIds);
      } else if (adminConfirm.action === "archive_user") {
        await archiveUser(adminConfirm.payload.userId);
      } else if (adminConfirm.action === "restore_user") {
        await unarchiveUser(adminConfirm.payload.userId);
      } else if (adminConfirm.action === "save_contract") {
        await saveContract(adminConfirm.payload.row);
      } else if (adminConfirm.action === "contract_request") {
        await updateContractRequest(adminConfirm.payload.requestId, adminConfirm.payload.status);
      } else if (adminConfirm.action === "approve_verification") {
        await approveVerificationRecord(adminConfirm.payload.classId);
      } else if (adminConfirm.action === "mark_verification_incomplete") {
        await markVerificationIncomplete(adminConfirm.payload.classId);
      } else if (adminConfirm.action === "remove_verification") {
        await removeVerificationRecord(adminConfirm.payload.classId);
      } else if (adminConfirm.action === "clear_verifications") {
        await clearVerificationRecords();
      } else if (adminConfirm.action === "book_status") {
        await applyBookStatusChange(adminConfirm.payload);
      }
    } finally {
      setAdminConfirm(null);
    }
  }

  // Every student criterion is multi-select now, so one toggle handler covers
  // all five. The AI recommendation is invalidated because every criterion feeds
  // the matcher.
  function toggleAiCriterionValue(key, value) {
    setSForm((prev) => ({
      ...prev,
      aiCriteria: {
        ...prev.aiCriteria,
        [key]: toggleValue(prev.aiCriteria?.[key], value),
      },
    }));
    setAiRecommendation(null);
  }

  // Scoring a level-evaluation criterion. The level itself is derived from these
  // scores via computedLevel, so nothing else has to be updated here. The AI
  // recommendation is invalidated because the computed level feeds the matcher.
  function updateLevelScore(key, value) {
    setSForm((prev) => {
      const current = prev.levelScores || {};
      if (current[key] === value) return prev;
      return { ...prev, levelScores: { ...current, [key]: value } };
    });
    setAiRecommendation(null);
  }

  function toggleTeacherSpecialization(value) {
    setTForm((prev) => ({
      ...prev,
      specialization: toggleValue(prev.specialization, value),
    }));
  }

  // Multi-select handler for the teacher's other AI matching attributes
  // (teaching style, best student pace). These are not course-scoped, so
  // unlike specialization they are never pruned.
  // Unchecking "Others" discards the typed text so it cannot linger invisibly.
  function toggleTeacherCriteria(field, otherField, value) {
    setTForm((prev) => {
      const next = toggleValue(prev[field], value);
      const base = { ...prev, [field]: next };
      if (value === CUSTOM_OPTION_VALUE && !next.includes(CUSTOM_OPTION_VALUE)) {
        base[otherField] = "";
      }
      return base;
    });
  }

  function updateTeacherCustomCriteria(field, value) {
    setTForm((prev) => ({ ...prev, [field]: value }));
  }

  // Merge the free-text "Others" values into the arrays the backend stores, so
  // the custom entry lands in the same "Teaching style: a, b" bio line.
  function teacherCriteriaWithCustom(values, otherText) {
    const custom = toCriteriaSlug(otherText);
    return custom ? [...values, custom] : values;
  }

  function toggleTeacherCourse(courseId) {
    const normalized = String(courseId);
    setTForm((prev) => {
      const exists = prev.courseIds.includes(normalized);
      const nextCourseIds = exists
        ? prev.courseIds.filter((id) => id !== normalized)
        : [...prev.courseIds, normalized];
      const selectedCourseNames = courses
        .filter((course) => nextCourseIds.includes(String(course.course_id)))
        .map((course) => course.course_name);
      return {
        ...prev,
        courseIds: nextCourseIds,
        // Keep only the specialisations that still apply to the new course set.
        specialization: pruneSelectionToCourses(
          prev.specialization,
          TEACHER_CRITERIA_OPTIONS.specialization,
          selectedCourseNames
        ),
      };
    });
  }

  // Auto-fill the AI Matching Profile from an uploaded CV. Non-destructive, so
  // it can be re-run on a form that is already partly filled in. The parsed
  // values are suggestions only: the admin edits and confirms them, and the
  // teacher is still created by the same POST /api/admin/users as before.
  async function handleResumeSelected(file) {
    if (!file) return;

    const resetInput = () => {
      if (resumeInputRef.current) resumeInputRef.current.value = "";
    };

    // Check the extension rather than the MIME type: browsers often report an
    // empty or generic type for .docx.
    if (!RESUME_ACCEPTED.test(file.name)) {
      notify("Resume must be a PDF, DOCX, or TXT file.", "error");
      resetInput();
      return;
    }
    if (file.size > RESUME_MAX_BYTES) {
      notify("Resume must be 8 MB or smaller.", "error");
      resetInput();
      return;
    }

    setResumeParsing(true);
    setResumeFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("resume", file, file.name);
      // The specialization chips are filtered by the ticked courses, so the
      // parser needs to know which ones are selected. Without this it could
      // suggest a specialization whose chip is not on screen, which would then
      // be dropped silently on save.
      formData.append("courseNames", JSON.stringify(selectedTeacherCourseNames));

      const response = await axios.post(`${API}/api/admin/parse-resume`, formData);
      const parsed = response.data || {};
      setTForm((prev) => mergeResumeIntoTeacherForm(prev, parsed));
      notify(describeResumeFill(parsed), "success");
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Could not read that resume", "error");
    } finally {
      setResumeParsing(false);
      resetInput();
    }
  }

  function toggleManagedTeacherCourse(teacherId, courseId) {
    const teacherKey = String(teacherId);
    const courseKey = String(courseId);
    setTeacherCourseDrafts((current) => {
      const selected = current[teacherKey] || [];
      const exists = selected.includes(courseKey);
      return {
        ...current,
        [teacherKey]: exists
          ? selected.filter((id) => id !== courseKey)
          : [...selected, courseKey],
      };
    });
  }

  function toggleTeacherCourseVisibility(teacherId) {
    const teacherKey = String(teacherId);
    setExpandedTeacherCourses((current) => ({
      ...current,
      [teacherKey]: !current[teacherKey],
    }));
  }

  async function saveManagedTeacherCourses(teacherId, courseIdsOverride = null) {
    const teacherKey = String(teacherId);
    const courseIds = courseIdsOverride || teacherCourseDrafts[teacherKey] || [];
    if (!courseIds.length) {
      notify("Please select at least one course for this teacher.", "error");
      return;
    }

    setSavingTeacherCoursesId(teacherId);
    try {
      await axios.put(`${API}/api/admin/teachers/${teacherId}/courses`, { courseIds });
      notify("Teacher courses updated successfully.", "success");
      loadUsers();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to update teacher courses", "error");
    } finally {
      setSavingTeacherCoursesId(null);
    }
  }

  async function analyzeStudentMatch() {
    if (!sForm.courseId) {
      notify("Please select the student's course before analyzing.", "error");
      return;
    }

    const hasCriteria = Object.values(sForm.aiCriteria).some((value) => (
      Array.isArray(value) ? value.length > 0 : Boolean(value)
    ));
    // The level is computed from the 5 scores, so it only counts as an input
    // once every criterion has been scored.
    if (!sForm.trialNotes.trim() && !hasCriteria && !computedLevel) {
      notify("Please add trial notes, score the level evaluation, or choose matching criteria before analyzing.", "error");
      return;
    }

    setAiLoading(true);
    try {
      const r = await axios.post(`${API}/api/admin/recommend-teacher`, {
        trialNotes: sForm.trialNotes,
        criteria: sForm.aiCriteria,
        courseId: sForm.courseId,
        proficiencyLevel: computedLevel?.level || "",
        teacherId: sForm.teacherId,
      });
      const teacher = r.data?.teacher;
      if (!teacher) {
        notify("No teacher found for this student.", "error");
        return;
      }

      setSForm((prev) => ({
        ...prev,
        teacherId: teacher.user_id,
      }));
      setAiRecommendation(r.data);
      notify(`AI matched ${teacher.first_name} ${teacher.last_name}.`, "success");
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "AI teacher matching failed", "error");
    } finally {
      setAiLoading(false);
    }
  }

  // ---- actions: archive ----
  async function archiveUser(id) {
    try {
      await axios.put(`${API}/api/users/${id}/status`, { status: "archived" });
      // remove from visible lists
      setStudents(prev => prev.filter(x => x.user_id !== id));
      setTeachers(prev => prev.filter(x => x.user_id !== id));
      notify("User archived successfully", "success");
      loadUsers(); // refresh the active lists
      setArchiveRefresh(r => r + 1); // tell archived component to reload
    } catch {
      notify("Failed to archive user", "error");
    }
  }
  async function unarchiveUser(id) {
    try {
      await axios.put(`${API}/api/users/${id}/status`, { status: "active" });
      // optional: refetch archived lists; or ignore if not needed here
      loadUsers();
      setArchiveRefresh(r => r + 1);
      notify("User unarchived successfully", "success");
    } catch {
      notify("Failed to unarchive user", "error");
    }
  }

  async function openStudentAccount(studentId) {
    setStudentAccountLoading(true);
    try {
      const response = await axios.get(`${API}/api/admin/users/${studentId}/account`);
      const user = response.data?.user;
      setStudentAccountModal(user);
      setStudentEmailDraft(user?.email || "");
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to load student account", "error");
    } finally {
      setStudentAccountLoading(false);
    }
  }

  async function refreshStudentAccount(studentId) {
    try {
      const response = await axios.get(`${API}/api/admin/users/${studentId}/account`);
      const user = response.data?.user;
      setStudentAccountModal(user);
      setStudentEmailDraft(user?.email || "");
    } catch (e) {
      console.error(e);
    }
  }

  async function saveStudentEmail() {
    if (!studentAccountModal?.user_id) return;
    const nextEmail = studentEmailDraft.trim();
    if (!nextEmail) {
      notify("Please enter the student's email.", "error");
      return;
    }

    setStudentAccountActionLoading("email");
    try {
      const response = await axios.put(`${API}/api/admin/users/${studentAccountModal.user_id}/email`, {
        email: nextEmail,
      });
      notify(
        response.data?.inviteEmailSent
          ? "Email updated and new setup invite sent."
          : "Email updated. Invite was prepared, but email was not sent. Check SMTP settings.",
        response.data?.inviteEmailSent ? "success" : "warning"
      );
      await loadUsers();
      await refreshStudentAccount(studentAccountModal.user_id);
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to update student email", "error");
    } finally {
      setStudentAccountActionLoading("");
    }
  }

  async function resendStudentInvite({ copyOnly = false } = {}) {
    if (!studentAccountModal?.user_id) return;
    setStudentAccountActionLoading(copyOnly ? "copy" : "resend");
    try {
      const response = await axios.post(`${API}/api/admin/users/${studentAccountModal.user_id}/setup-invite`, {
        sendEmail: !copyOnly,
      });
      const inviteUrl = response.data?.setupInviteUrl;

      if (copyOnly && inviteUrl) {
        if (!navigator.clipboard?.writeText) {
          window.prompt("Copy this setup invite link:", inviteUrl);
        } else {
          await navigator.clipboard.writeText(inviteUrl);
        }
        notify("Fresh setup invite link copied.", "success");
      } else {
        notify(
          response.data?.inviteEmailSent
            ? "Setup invite resent to the student's email."
            : "Invite was prepared, but email was not sent. Check SMTP settings.",
          response.data?.inviteEmailSent ? "success" : "warning"
        );
      }

      await loadUsers();
      await refreshStudentAccount(studentAccountModal.user_id);
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to prepare setup invite", "error");
    } finally {
      setStudentAccountActionLoading("");
    }
  }

  // ---- actions: requests ----
  async function loadRequests() {
    setRequestsLoading(true);
    try {
      const r = await axios.get(`${API}/api/admin/reschedule-requests`);
      setRequests(r.data.requests.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at)) || []);
    } catch (e) {
      console.error(e);
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }

  async function updateRequest(id, status) {
    try {
      await axios.put(`${API}/api/admin/reschedule-requests/${id}`, { status });
      const verb = status === 'approved' ? 'approved' : 'declined';
      notify(`Request ${verb} successfully`, "success");
      setConfirmDialog(null);
      loadRequests();
    } catch (e) {
      console.error(e);
      notify("Failed to update request", "error");
    }
  }

  async function deleteRequest(id) {
    try {
      await axios.delete(`${API}/api/admin/reschedule-requests/${id}`);
      notify("Request deleted successfully", "success");
      loadRequests();
    } catch (e) {
      console.error(e);
      notify("Failed to delete request", "error");
    }
  }

  async function deleteAllRequests() {
    try {
      await axios.delete(`${API}/api/admin/reschedule-requests`);
      notify("All requests deleted successfully", "success");
      loadRequests();
    } catch (e) {
      console.error(e);
      notify("Failed to delete requests", "error");
    }
  }

  function requestDeleteRequest(id) {
    setDeleteConfirm({
      action: "single",
      id,
      title: "Delete request?",
      message: "Are you sure you want to delete this reschedule request? This cannot be undone.",
      confirmLabel: "Delete"
    });
  }

  function requestDeleteAllRequests() {
    setDeleteConfirm({
      action: "all",
      id: null,
      title: "Delete all requests?",
      message: "Are you sure you want to delete all reschedule requests? This cannot be undone.",
      confirmLabel: "Delete All"
    });
  }

  async function confirmDeleteRequests() {
    if (!deleteConfirm) return;

    try {
      if (deleteConfirm.action === "single") {
        await deleteRequest(deleteConfirm.id);
      } else {
        await deleteAllRequests();
      }
    } finally {
      setDeleteConfirm(null);
    }
  }

  async function loadContracts() {
    setContractsLoading(true);
    try {
      const r = await axios.get(`${API}/api/admin/student-contracts`);
      setContracts((r.data.contracts || []).map((item) => ({
        ...item,
        course_id: item.course_id || "",
        assigned_teacher_id: item.assigned_teacher_id || "",
        total_classes: item.total_classes ?? "",
        classes_used: item.classes_used ?? 0,
        class_duration: item.class_duration ?? 50,
        package_status: item.package_status || "active",
      })));
    } catch (e) {
      console.error(e);
      setContracts([]);
      notify("Failed to load student contracts", "error");
    } finally {
      setContractsLoading(false);
    }
  }

  function updateContractRow(studentId, field, value) {
    setContracts((prev) => prev.map((row) => {
      if (row.user_id !== studentId) return row;
      const next = { ...row, [field]: value };
      if (field === "total_classes") {
        const total = Math.max(0, parseInt(value, 10) || 0);
        const used = Math.max(0, parseInt(next.classes_used, 10) || 0);
        next.classes_used = Math.min(used, total);
      }
      if (field === "course_id") {
        const currentTeacherCanTeach = !next.assigned_teacher_id || !value || teacherCourseMap[String(next.assigned_teacher_id)]?.has(String(value));
        if (!currentTeacherCanTeach) next.assigned_teacher_id = "";
      }
      return next;
    }));
  }

  async function saveContract(row) {
    setSavingContractId(row.user_id);
    try {
      await axios.put(`${API}/api/admin/student-contracts/${row.user_id}`, {
        course_id: row.course_id || null,
        assigned_teacher_id: row.assigned_teacher_id || null,
        package_id: row.package_id || null,
        total_classes: row.total_classes,
        classes_used: row.classes_used,
        class_duration: row.class_duration || 50,
        status: row.package_status || "active",
      });
      notify("Student contract updated", "success");
      loadContracts();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to update contract", "error");
    } finally {
      setSavingContractId(null);
    }
  }

  async function loadContractRequests() {
    setContractRequestsLoading(true);
    try {
      const r = await axios.get(`${API}/api/admin/contract-requests`);
      setContractRequests(r.data.requests || []);
    } catch (e) {
      console.error(e);
      setContractRequests([]);
      notify("Failed to load contract requests", "error");
    } finally {
      setContractRequestsLoading(false);
    }
  }

  async function updateContractRequest(requestId, status) {
    setUpdatingContractRequestId(requestId);
    try {
      await axios.put(`${API}/api/admin/contract-requests/${requestId}`, { status });
      notify(`Contract request ${status}`, "success");
      loadContractRequests();
      loadContracts();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to update contract request", "error");
    } finally {
      setUpdatingContractRequestId(null);
    }
  }

  async function loadClassVerifications() {
    setVerificationsLoading(true);
    try {
      const response = await axios.get(`${API}/api/admin/class-verifications`, {
        params: { status: "all", limit: 300 },
      });
      setVerifications(response.data?.verifications || []);
    } catch (e) {
      console.error(e);
      setVerifications([]);
      notify("Failed to load class verifications", "error");
    } finally {
      setVerificationsLoading(false);
    }
  }

  async function removeVerificationRecord(classId) {
    try {
      await axios.delete(`${API}/api/admin/class-verifications/${classId}`);
      notify("Verification record removed", "success");
      await loadClassVerifications();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to remove verification record", "error");
    }
  }

  async function clearVerificationRecords() {
    try {
      const response = await axios.delete(`${API}/api/admin/class-verifications`);
      const removed = Number(response.data?.removed || 0);
      notify(`${removed} final verification record${removed === 1 ? "" : "s"} cleared`, "success");
      setVerificationPage(1);
      await loadClassVerifications();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to clear verification records", "error");
    }
  }

  async function approveVerificationRecord(classId) {
    try {
      await axios.put(`${API}/api/admin/class-verifications/${classId}/approve`);
      notify("Class verification approved", "success");
      await loadClassVerifications();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to approve verification", "error");
    }
  }

  async function markVerificationIncomplete(classId) {
    try {
      await axios.put(`${API}/api/admin/class-verifications/${classId}/incomplete`);
      notify("Class verification marked incomplete", "success");
      await loadClassVerifications();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to mark verification incomplete", "error");
    }
  }

  const updateVerificationFilter = (status) => {
    setVerificationFilter(status);
    setVerificationPage(1);
  };

  // ---- UI helpers ----
  const teacherCourseMap = teacherCourses.reduce((acc, item) => {
    const teacherId = String(item.teacher_id);
    if (!acc[teacherId]) acc[teacherId] = new Set();
    acc[teacherId].add(String(item.course_id));
    return acc;
  }, {});

  const teachersForSelectedStudentCourse = sForm.courseId
    ? teachers.filter((teacher) => teacherCourseMap[String(teacher.user_id)]?.has(String(sForm.courseId)))
    : teachers;

  const teacherCourseSearchTerm = teacherCourseSearch.trim().toLowerCase();
  const filteredTeacherCourseTeachers = teachers.filter((teacher) => {
    if (!teacherCourseSearchTerm) return true;
    const teacherCourseNames = teacherCourses
      .filter((item) => String(item.teacher_id) === String(teacher.user_id))
      .map((item) => item.course_name)
      .join(" ");
    return [
      teacher.first_name,
      teacher.last_name,
      teacher.email,
      teacherCourseNames,
    ].filter(Boolean).join(" ").toLowerCase().includes(teacherCourseSearchTerm);
  });

  const contractSearchTerm = contractSearch.trim().toLowerCase();
  const filteredContracts = contracts.filter((row) => {
    if (!contractSearchTerm) return true;
    const teacher = teachers.find((item) => String(item.user_id) === String(row.assigned_teacher_id));
    return [
      row.first_name,
      row.last_name,
      row.email,
      row.course_name,
      row.package_status,
      teacher ? `${teacher.first_name} ${teacher.last_name}` : row.teacher_name,
    ].filter(Boolean).join(" ").toLowerCase().includes(contractSearchTerm);
  });

  const contractRequestSearchTerm = contractRequestSearch.trim().toLowerCase();
  const filteredContractRequests = contractRequests.filter((request) => {
    if (!contractRequestSearchTerm) return true;
    return [
      request.first_name,
      request.last_name,
      request.email,
      request.course_name,
      request.status,
      request.requested_classes,
      request.class_duration,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLowerCase()
      .includes(contractRequestSearchTerm);
  });

  const archiveSearchTerm = archiveSearch.trim().toLowerCase();
  const matchesArchiveSearch = (user) => {
    if (!archiveSearchTerm) return true;
    return [user.first_name, user.last_name, user.email, user.role]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(archiveSearchTerm);
  };
  const filteredArchiveStudents = students.filter(matchesArchiveSearch);
  const filteredArchiveTeachers = teachers.filter(matchesArchiveSearch);
  const accountModalRoleLabel = studentAccountModal?.role === "teacher" ? "Teacher" : "Student";
  const verificationSearchTerm = verificationSearch.trim().toLowerCase();
  const filteredVerifications = verifications.filter((row) => {
    const displayStatus = row.teacher_started_at || row.student_joined_at || row.teacher_ended_at
      ? row.verification_status
      : "missing";
    if (verificationFilter !== "all" && displayStatus !== verificationFilter) return false;
    if (!verificationSearchTerm) return true;
    return [
      row.class_name,
      row.class_status,
      row.verification_status,
      row.teacher_first_name,
      row.teacher_last_name,
      row.teacher_email,
      row.student_first_name,
      row.student_last_name,
      row.student_email,
      row.scheduled_date,
      row.summary,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLowerCase()
      .includes(verificationSearchTerm);
  });
  const verificationTotalPages = Math.max(1, Math.ceil(filteredVerifications.length / VERIFICATIONS_PER_PAGE));
  const safeVerificationPage = Math.min(verificationPage, verificationTotalPages);
  const pagedVerifications = filteredVerifications.slice(
    (safeVerificationPage - 1) * VERIFICATIONS_PER_PAGE,
    safeVerificationPage * VERIFICATIONS_PER_PAGE
  );
  const verificationCounts = {
    all: verifications.length,
    verified: verifications.filter((row) => row.verification_status === "verified").length,
    needs_review: verifications.filter((row) => row.verification_status === "needs_review").length,
    student_confirmed: verifications.filter((row) => row.verification_status === "student_confirmed").length,
    in_progress: verifications.filter((row) => row.verification_status === "in_progress").length,
    pending: verifications.filter((row) => row.verification_status === "pending").length,
    incomplete: verifications.filter((row) => row.verification_status === "incomplete").length,
    missing: verifications.filter((row) => !row.teacher_started_at && row.verification_status === "pending").length,
  };
  const clearableVerificationCount = verificationCounts.verified + verificationCounts.incomplete;

  const updateStudentCourse = (courseId) => {
    const currentTeacherCanTeach = !sForm.teacherId || !courseId || teacherCourseMap[String(sForm.teacherId)]?.has(String(courseId));
    const selectedCourseNames = courses
      .filter((course) => String(course.course_id) === String(courseId))
      .map((course) => course.course_name);

    setSForm({
      ...sForm,
      courseId,
      teacherId: currentTeacherCanTeach ? sForm.teacherId : "",
      // Drop any learning goal / focus area that no longer applies to the new
      // course, rather than leaving a stale value that cannot be matched.
      aiCriteria: {
        ...sForm.aiCriteria,
        learningGoal: pruneSelectionToCourses(
          sForm.aiCriteria?.learningGoal,
          STUDENT_CRITERIA_OPTIONS.learningGoal,
          selectedCourseNames
        ),
        focusArea: pruneSelectionToCourses(
          sForm.aiCriteria?.focusArea,
          STUDENT_CRITERIA_OPTIONS.focusArea,
          selectedCourseNames
        ),
      },
    });
    setAiRecommendation(null);
  };

  function handleCreateTeacherSubmit(e) {
    e.preventDefault();
    if (e.currentTarget && !e.currentTarget.reportValidity()) return;

    // Replace the sentinel and the raw text with one clean array, which is what
    // buildTeacherAiBio comma-joins into the bio.
    const withoutSentinel = (values) =>
      (Array.isArray(values) ? values : []).filter((v) => v !== CUSTOM_OPTION_VALUE);
    const teachingStyle = tForm.teachingStyle.includes(CUSTOM_OPTION_VALUE)
      ? teacherCriteriaWithCustom(withoutSentinel(tForm.teachingStyle), tForm.teachingStyleOther)
      : withoutSentinel(tForm.teachingStyle);
    const idealStudentPace = tForm.idealStudentPace.includes(CUSTOM_OPTION_VALUE)
      ? teacherCriteriaWithCustom(withoutSentinel(tForm.idealStudentPace), tForm.idealStudentPaceOther)
      : withoutSentinel(tForm.idealStudentPace);

    openAdminConfirm({
      action: "create_teacher",
      title: "Create teacher account?",
      message: "This will create the teacher account with the details you entered.",
      confirmLabel: "Create Teacher",
      tone: "primary",
      payload: { ...tForm, teachingStyle, idealStudentPace },
    });
  }

  function handleCreateStudentSubmit(e) {
    e.preventDefault();
    if (e.currentTarget && !e.currentTarget.reportValidity()) return;
    if (!sForm.courseId) {
      notify("Please select the student's course.", "error");
      return;
    }
    // All 5 level-evaluation criteria are required; the level is computed from
    // them, so a partial rubric cannot produce a level to store.
    if (!computedLevel) {
      notify("Please score all 5 level evaluation criteria.", "error");
      return;
    }
    openAdminConfirm({
      action: "create_student",
      title: "Create student account?",
      message: "This will create the student account with the details you entered.",
      confirmLabel: "Create Student",
      tone: "primary",
      payload: { ...sForm },
    });
  }

  function requestSaveTeacherCourses(teacherId) {
    const teacherKey = String(teacherId);
    const courseIds = teacherCourseDrafts[teacherKey] || [];
    if (!courseIds.length) {
      notify("Please select at least one course for this teacher.", "error");
      return;
    }
    const teacher = teachers.find((item) => String(item.user_id) === teacherKey);
    openAdminConfirm({
      action: "save_teacher_courses",
      title: "Save teacher courses?",
      message: "This will update the courses assigned to this teacher.",
      confirmLabel: "Save",
      tone: "primary",
      payload: {
        teacherId,
        courseIds,
        teacherName: teacher ? `${teacher.first_name} ${teacher.last_name}` : "Selected teacher",
      },
    });
  }

  function requestArchiveUser(userId) {
    const user = [...students, ...teachers].find((item) => String(item.user_id) === String(userId));
    openAdminConfirm({
      action: "archive_user",
      title: "Archive user?",
      message: "This will archive the selected active account.",
      confirmLabel: "Archive",
      tone: "danger",
      payload: {
        userId,
        label: user ? `${user.first_name} ${user.last_name}` : "Selected user",
      },
    });
  }

  function requestRestoreUser(userId) {
    openAdminConfirm({
      action: "restore_user",
      title: "Restore user?",
      message: "This will restore the archived account.",
      confirmLabel: "Restore",
      tone: "primary",
      payload: {
        userId,
      },
    });
  }

  function requestSaveContract(row) {
    openAdminConfirm({
      action: "save_contract",
      title: row.package_id ? "Save contract?" : "Create contract?",
      message: "This will save the class package updates for this student.",
      confirmLabel: row.package_id ? "Save" : "Create",
      tone: "primary",
      payload: {
        row: { ...row },
      },
    });
  }

  function requestUpdateContractRequest(requestId, status, requestRow) {
    openAdminConfirm({
      action: "contract_request",
      title: status === "approved" ? "Approve contract request?" : "Decline contract request?",
      message: status === "approved"
        ? "This will approve the student's contract request."
        : "This will decline the student's contract request.",
      confirmLabel: status === "approved" ? "Approve" : "Decline",
      tone: status === "approved" ? "primary" : "danger",
      payload: {
        requestId,
        status,
        requestRow: { ...requestRow },
      },
    });
  }

  function requestRemoveVerification(row) {
    const teacherName = `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`.trim() || "Teacher";
    const studentName = `${row.student_first_name || ""} ${row.student_last_name || ""}`.trim() || "Student";
    openAdminConfirm({
      action: "remove_verification",
      title: "Remove verification record?",
      message: "Are you sure? This removes the verification log and its uploaded proof file. The scheduled class will stay in the calendar.",
      confirmLabel: "Remove",
      tone: "danger",
      payload: {
        classId: row.class_id,
        className: row.class_name || "Untitled Class",
        teacherName,
        studentName,
        schedule: `${formatDate(row.scheduled_date)} ${formatTime(row.start_time)}`,
      },
    });
  }

  function requestApproveVerification(row) {
    const teacherName = `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`.trim() || "Teacher";
    const studentName = `${row.student_first_name || ""} ${row.student_last_name || ""}`.trim() || "Student";
    openAdminConfirm({
      action: "approve_verification",
      title: "Approve this class as verified?",
      message: "This overrides the review status and marks the class evidence as verified.",
      confirmLabel: "Approve Verified",
      tone: "success",
      payload: {
        classId: row.class_id,
        className: row.class_name || "Untitled Class",
        teacherName,
        studentName,
        schedule: `${formatDate(row.scheduled_date)} ${formatTime(row.start_time)}`,
        reasons: getVerificationReviewReasons(row),
      },
    });
  }

  function requestMarkVerificationIncomplete(row) {
    const teacherName = `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`.trim() || "Teacher";
    const studentName = `${row.student_first_name || ""} ${row.student_last_name || ""}`.trim() || "Student";
    openAdminConfirm({
      action: "mark_verification_incomplete",
      title: "Mark verification incomplete?",
      message: "This keeps the record for audit history and marks the class evidence as incomplete.",
      confirmLabel: "Mark Incomplete",
      tone: "danger",
      payload: {
        classId: row.class_id,
        className: row.class_name || "Untitled Class",
        teacherName,
        studentName,
        schedule: `${formatDate(row.scheduled_date)} ${formatTime(row.start_time)}`,
        reasons: getVerificationReviewReasons(row),
      },
    });
  }

  function requestClearVerifications() {
    if (!clearableVerificationCount) {
      notify("There are no verified or incomplete records to clear.", "info");
      return;
    }
    openAdminConfirm({
      action: "clear_verifications",
      title: "Clear final verification records?",
      message: "This removes only verified and incomplete verification logs with their uploaded proof files. Records still pending or waiting for admin review will stay.",
      confirmLabel: "Clear Final Records",
      tone: "danger",
      payload: {
        count: clearableVerificationCount,
      },
    });
  }

  const adminConfirmLines = adminConfirm ? (() => {
    const payload = adminConfirm.payload || {};
    if (adminConfirm.action === "create_teacher") {
      return [
        `Name: ${payload.firstName || ""} ${payload.lastName || ""}`.trim(),
        `Email: ${payload.email || "-"}`,
        `Courses: ${(payload.courseIds || []).length || 0}`,
      ];
    }
    if (adminConfirm.action === "create_student") {
      const course = courses.find((item) => String(item.course_id) === String(payload.courseId));
      const teacher = teachers.find((item) => String(item.user_id) === String(payload.teacherId));
      // Recomputed from the snapshot's scores rather than read off the live form,
      // so the summary matches what will actually be stored.
      const levelSummary = computeProficiencyLevel(payload.levelScores);
      return [
        `Name: ${payload.firstName || ""} ${payload.lastName || ""}`.trim(),
        `Course: ${course?.course_name || "Not set"}`,
        `Level: ${levelSummary ? formatComputedLevel(levelSummary.level) : "Not scored"}`,
        `Teacher: ${teacher ? `${teacher.first_name} ${teacher.last_name}` : "Not assigned"}`,
      ];
    }
    if (adminConfirm.action === "save_teacher_courses") {
      return [
        `Teacher: ${payload.teacherName || "Selected teacher"}`,
        `Courses selected: ${payload.courseIds?.length || 0}`,
      ];
    }
    if (adminConfirm.action === "archive_user" || adminConfirm.action === "restore_user") {
      return [
        `User: ${payload.label || "Selected user"}`,
      ];
    }
    if (adminConfirm.action === "save_contract") {
      const row = payload.row || {};
      const teacher = teachers.find((item) => String(item.user_id) === String(row.assigned_teacher_id));
      const course = courses.find((item) => String(item.course_id) === String(row.course_id));
      return [
        `Student: ${row.first_name || ""} ${row.last_name || ""}`.trim(),
        `Course: ${course?.course_name || row.course_name || "Not set"}`,
        `Teacher: ${teacher ? `${teacher.first_name} ${teacher.last_name}` : "Unassigned"}`,
        `Classes: ${row.total_classes || 0} total, ${row.classes_used || 0} used`,
      ];
    }
    if (adminConfirm.action === "contract_request") {
      const requestRow = payload.requestRow || {};
      const course = courses.find((item) => String(item.course_id) === String(requestRow.course_id));
      return [
        `Student: ${requestRow.first_name || ""} ${requestRow.last_name || ""}`.trim(),
        `Course: ${course?.course_name || requestRow.course_name || "Not set"}`,
        `Action: ${payload.status === "approved" ? "Approve" : "Decline"}`,
      ];
    }
    if (adminConfirm.action === "approve_verification" || adminConfirm.action === "mark_verification_incomplete" || adminConfirm.action === "remove_verification") {
      return [
        `Class: ${payload.className || "-"}`,
        `Teacher: ${payload.teacherName || "-"}`,
        `Student: ${payload.studentName || "-"}`,
        `Schedule: ${payload.schedule || "-"}`,
        ...(payload.reasons?.length ? [`Review: ${payload.reasons.join("; ")}`] : []),
      ];
    }
    if (adminConfirm.action === "clear_verifications") {
      return [`Records: ${payload.count || 0}`];
    }
    if (adminConfirm.action === "book_status") {
      const book = payload.book || {};
      return [
        `Book: ${book.title || "-"}`,
        `Course: ${book.course_name || "Not set"}`,
        `Teachers: ${book.teacher_names || "Not distributed"}`,
        `Lessons: ${book.lesson_count ?? 0}`,
      ];
    }
    return [];
  })() : [];

  return (
    <div className={styles.Center}>
    <div className={styles.page}>

      <main className={styles.main}>
        {active === "verifications" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>Class Verifications</h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.9em", color: "#666" }}>
                  Track whether scheduled classes have teacher start, student attendance, end time, duration, and proof.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className={styles.linkBtn} type="button" onClick={() => loadClassVerifications()}>
                  Refresh
                </button>
                <button
                  className={styles.dangerBtn}
                  type="button"
                  onClick={requestClearVerifications}
                  disabled={!clearableVerificationCount || verificationsLoading}
                  title="Clears only verified and incomplete records"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className={styles.filterTabs} style={{ marginBottom: 14 }}>
              {["all", "verified", "needs_review", "incomplete", "student_confirmed", "in_progress", "pending", "missing"].map((status) => {
                const activeFilter = verificationFilter === status;
                const colors = verificationStatusStyle(status === "all" ? "pending" : status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateVerificationFilter(status)}
                    style={{
                      padding: "8px 12px",
                      border: activeFilter ? "1px solid #2f4d3e" : "1px solid #e5e7eb",
                      background: activeFilter ? "#2f4d3e" : colors.background,
                      color: activeFilter ? "#fff" : colors.color,
                      borderRadius: "999px",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: "0.82em",
                    }}
                  >
                    {VERIFICATION_STATUS_LABELS[status]} ({verificationCounts[status] || 0})
                  </button>
                );
              })}
            </div>

            <div className={styles.searchBar}>
              <input
                type="search"
                value={verificationSearch}
                onChange={(e) => setVerificationSearch(e.target.value)}
                placeholder="Search by class, teacher, student, status, date, or summary"
                aria-label="Search class verifications"
              />
            </div>

            <div className={styles.verificationList}>
              {verificationsLoading ? (
                <div className={styles.empty}>Loading class verifications...</div>
              ) : verifications.length === 0 ? (
                <div className={styles.empty}>No class verification records found</div>
              ) : filteredVerifications.length === 0 ? (
                <div className={styles.empty}>No class verifications match your search</div>
              ) : (
                pagedVerifications.map((row) => {
                  const displayStatus = row.teacher_started_at || row.student_joined_at || row.teacher_ended_at
                    ? row.verification_status
                    : "missing";
                  const statusColor = verificationStatusStyle(displayStatus);
                  const teacherName = `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`.trim() || "Teacher";
                  const studentName = `${row.student_first_name || ""} ${row.student_last_name || ""}`.trim() || "Student";
                  const missingItems = getVerificationMissingItems(row);
                  const reviewReasons = getVerificationReviewReasons(row);
                  const hasRequiredEvidence = missingItems.length === 0;
                  const needsAdminReview = displayStatus === "needs_review";
                  const canRemoveVerification = ["verified", "incomplete"].includes(displayStatus);
                  const evidenceLabel = row.evidence_mode === "screenshots"
                    ? "Start and end screenshots"
                    : row.evidence_mode === "recording"
                      ? `Recording (${Math.floor(Number(row.recording_duration_seconds || 0) / 60)} min)`
                      : "No evidence mode selected";
                  const hasAnyProof = Boolean(row.start_proof_url || row.proof_url || row.recording_url);

                  return (
                    <article key={row.class_id} className={styles.verificationItem}>
                      <div className={styles.verificationMain}>
                        <div className={styles.verificationTitleRow}>
                          <div>
                            <h3>{row.class_name || "Untitled Class"}</h3>
                            <p>{formatDate(row.scheduled_date)} · {formatTime(row.start_time)} - {formatTime(row.end_time)} · {row.duration || 0} min</p>
                          </div>
                          <span
                            className={styles.statusPill}
                            style={{ background: statusColor.background, color: statusColor.color }}
                          >
                            {VERIFICATION_STATUS_LABELS[displayStatus] || displayStatus}
                          </span>
                        </div>

                        <div className={styles.verificationMetaGrid}>
                          <div>
                            <span>Teacher</span>
                            <strong>{teacherName}</strong>
                            <small>{row.teacher_email || "-"}</small>
                          </div>
                          <div>
                            <span>Student</span>
                            <strong>{studentName}</strong>
                            <small>{row.student_email || "-"}</small>
                          </div>
                          <div>
                            <span>Class Status</span>
                            <strong>{row.class_status || "scheduled"}</strong>
                            <small>Calendar lifecycle</small>
                          </div>
                        </div>

                        <div className={styles.evidenceGrid}>
                          <div><span>Start</span><strong>{formatDateTime(row.teacher_started_at)}</strong></div>
                          <div><span>Student</span><strong>{formatDateTime(row.student_joined_at)}</strong></div>
                          <div><span>End</span><strong>{formatDateTime(row.teacher_ended_at)}</strong></div>
                          <div><span>Duration</span><strong>{Number(row.duration_minutes || 0)} min</strong></div>
                        </div>

                        <div className={styles.verificationNotes}>
                          {row.review_reason && (
                            <div className={styles.teacherReviewBox}>
                              <span>Teacher Review Request</span>
                              <p>{row.review_reason}</p>
                            </div>
                          )}
                          <div className={styles.evidenceModeBox}>
                            <span>Evidence</span>
                            <strong>{evidenceLabel}</strong>
                          </div>
                          <div className={needsAdminReview ? styles.reviewReasonBox : hasRequiredEvidence ? styles.goodEvidenceNote : styles.missingEvidenceNote}>
                            <strong>{needsAdminReview ? "Admin Check" : hasRequiredEvidence ? "Ready" : "Missing"}</strong>
                            {needsAdminReview
                              ? (
                                  reviewReasons.length
                                    ? reviewReasons.map((reason) => <span key={reason}>{reason}</span>)
                                    : <span>Manual admin review required</span>
                                )
                              : <span>{hasRequiredEvidence ? "Evidence complete" : missingItems.join(", ")}</span>}
                          </div>
                        </div>

                        {row.summary && (
                          <div className={styles.verificationSummaryBlock}>
                            <span>Class Summary</span>
                            <p className={styles.verificationSummary}>{row.summary}</p>
                          </div>
                        )}
                      </div>

                      <div className={styles.verificationActions}>
                        <div className={styles.verificationActionsTitle}>Proof & Actions</div>
                        {!hasAnyProof && <span className={styles.noProofText}>No proof uploaded</span>}
                        {row.start_proof_url && (
                          <button
                            type="button"
                            className={`${styles.linkBtn} ${styles.tableActionBtn}`}
                            onClick={() => openAuthenticatedFile(row.start_proof_url)}
                          >
                            View Start
                          </button>
                        )}
                        {row.recording_url ? (
                          <a
                            className={`${styles.linkBtn} ${styles.tableActionBtn}`}
                            href={`${API}/api/calendar/classes/${row.class_id}/recording?user_id=${encodeURIComponent(currentAdminId || "")}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Recording
                          </a>
                        ) : row.proof_url ? (
                          <button
                            type="button"
                            className={`${styles.linkBtn} ${styles.tableActionBtn}`}
                            onClick={() => setSelectedProof({
                              url: resolveUploadUrl(row.proof_url),
                              className: row.class_name || "Class",
                              teacherName,
                              studentName,
                              schedule: `${formatDate(row.scheduled_date)} ${formatTime(row.start_time)}`,
                            })}
                          >
                            View End
                          </button>
                        ) : null}

                        {needsAdminReview && (
                          <>
                            <button
                              type="button"
                              className={`${styles.approve} ${styles.tableActionBtn}`}
                              onClick={() => requestApproveVerification(row)}
                            >
                              Approve Verified
                            </button>
                            <button
                              type="button"
                              className={`${styles.warn} ${styles.tableActionBtn}`}
                              onClick={() => requestMarkVerificationIncomplete(row)}
                            >
                              Mark Incomplete
                            </button>
                          </>
                        )}

                        {canRemoveVerification && (
                          <button
                            type="button"
                            className={`${styles.dangerBtn} ${styles.tableActionBtn}`}
                            onClick={() => requestRemoveVerification(row)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            {filteredVerifications.length > VERIFICATIONS_PER_PAGE && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setVerificationPage((page) => Math.max(1, page - 1))}
                  disabled={safeVerificationPage === 1}
                >
                  Previous
                </button>
                <span>
                  Page {safeVerificationPage} of {verificationTotalPages}
                </span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setVerificationPage((page) => Math.min(verificationTotalPages, page + 1))}
                  disabled={safeVerificationPage === verificationTotalPages}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        )}

        {active === "teacherCourses" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>Teacher Courses</h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.9em", color: "#666" }}>
                  Edit which courses each active teacher can teach.
                </p>
              </div>
              <button className={styles.linkBtn} type="button" onClick={loadUsers}>
                Refresh
              </button>
            </div>

            <div className={styles.compactSearch}>
              <input
                type="search"
                value={teacherCourseSearch}
                onChange={(e) => setTeacherCourseSearch(e.target.value)}
                placeholder="Search teachers or courses"
                aria-label="Search teacher courses"
              />
            </div>

            {filteredTeacherCourseTeachers.length === 0 ? (
              <div className={styles.empty}>No active teachers found</div>
            ) : (
              <div className={styles.courseManager}>
                {filteredTeacherCourseTeachers.map((teacher) => {
                  const selectedCourses = teacherCourseDrafts[String(teacher.user_id)] || [];
                  const expanded = Boolean(expandedTeacherCourses[String(teacher.user_id)]);
                  const selectedCourseNames = courses
                    .filter((course) => selectedCourses.includes(String(course.course_id)))
                    .map((course) => course.course_name);

                  return (
                    <section key={teacher.user_id} className={styles.courseTeacherRow}>
                      <div className={styles.courseTeacherHead}>
                        <div>
                          <h3>{teacher.first_name} {teacher.last_name}</h3>
                          <p>{teacher.email}</p>
                          <div className={styles.courseSummary}>
                            {selectedCourseNames.length
                              ? selectedCourseNames.join(", ")
                              : "No courses selected"}
                          </div>
                        </div>
                        <div className={styles.courseTeacherActions}>
                          <button
                            className={styles.secondaryBtn}
                            type="button"
                            onClick={() => toggleTeacherCourseVisibility(teacher.user_id)}
                          >
                            {expanded ? "Hide Courses" : "View Courses"}
                          </button>
                          {expanded && (
                            <button
                              className={styles.primary}
                              type="button"
                              onClick={() => requestSaveTeacherCourses(teacher.user_id)}
                              disabled={savingTeacherCoursesId === teacher.user_id}
                            >
                              {savingTeacherCoursesId === teacher.user_id ? "Saving..." : "Save"}
                            </button>
                          )}
                        </div>
                      </div>

                      {expanded && (
                        <div className={styles.courseCheckboxGrid}>
                          {courses.map((course) => {
                            const courseId = String(course.course_id);
                            return (
                              <label
                                key={course.course_id}
                                className={`${styles.courseCheck} ${selectedCourses.includes(courseId) ? styles.courseCheckActive : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedCourses.includes(courseId)}
                                  onChange={() => toggleManagedTeacherCourse(teacher.user_id, course.course_id)}
                                />
                                <span>{course.course_name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {active === "createTeacher" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Create Teacher Account</h2>
            </div>
            <form className={styles.form} onSubmit={handleCreateTeacherSubmit}>
              <div className={styles.grid2}>
                <div>
                  <label>First Name</label>
                  <input value={tForm.firstName} onChange={(e)=>setTForm({...tForm, firstName:e.target.value})} />
                </div>
                <div>
                  <label>Last Name</label>
                  <input value={tForm.lastName} onChange={(e)=>setTForm({...tForm, lastName:e.target.value})} />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={tForm.email} onChange={(e)=>setTForm({...tForm, email:e.target.value})} />
                </div>
                <div>
                  <label>Country</label>
                  <select value={tForm.country} onChange={(e)=>setTForm({...tForm, country:e.target.value})} required>
                    <option value="">Select Country</option>
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Birthday</label>
                  <input type="date" value={tForm.birthDate} onChange={(e)=>setTForm({...tForm, birthDate:e.target.value})} required />
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <CriteriaChipField
                  legend="Courses This Teacher Can Teach"
                  hint="Students can only be assigned to this teacher for the selected courses."
                  prominent
                  options={courses.map((course) => [String(course.course_id), course.course_name])}
                  selected={tForm.courseIds}
                  onToggle={(courseId) => toggleTeacherCourse(courseId)}
                  emptyMessage={CRITERIA_EMPTY_MESSAGES.none}
                  name="teacher-course"
                />
              </div>
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <div className={styles.criteriaCard}>
                  <div className={styles.criteriaCardHead}>
                    <h3 className={styles.criteriaCardTitle}>Auto-fill From Resume</h3>
                  </div>
                  <p className={styles.criteriaCardIntro}>
                    Upload the teacher&apos;s CV and it reads the file and fills in the matching
                    profile below - bio, specialization, teaching style, best student pace and
                    experience years. Tick the courses first so the specializations fit. Everything
                    it fills in stays editable, and the file itself is not stored.
                  </p>
                  <div className={styles.resumeRow}>
                    <input
                      ref={resumeInputRef}
                      id="teacher-resume"
                      type="file"
                      className={styles.resumeInput}
                      accept=".pdf,.docx,.txt"
                      onChange={(e) => handleResumeSelected(e.target.files?.[0])}
                      disabled={resumeParsing || loading}
                    />
                    {resumeParsing && (
                      <span className={styles.resumeStatus}>Reading {resumeFileName}...</span>
                    )}
                  </div>
                </div>
                <div className={styles.criteriaCard}>
                  <div className={styles.criteriaCardHead}>
                    <h3 className={styles.criteriaCardTitle}>AI Matching Profile</h3>
                  </div>
                  <p className={styles.criteriaCardIntro}>
                    These are the details the matcher compares against each student's criteria. Pick everything that applies - the more complete this profile is, the better the match.
                  </p>
                  <div className={styles.criteriaGrid}>
                    <CriteriaChipField
                      legend="Specialization"
                      hint={TEACHER_CRITERIA_HINTS.specialization}
                      options={teacherSpecializationOptions}
                      selected={tForm.specialization}
                      onToggle={toggleTeacherSpecialization}
                      emptyMessage={CRITERIA_EMPTY_MESSAGES.noCourse}
                      name="teacher-specialization"
                    />
                    <CriteriaChipField
                      legend="Teaching Style"
                      hint={TEACHER_CRITERIA_HINTS.teachingStyle}
                      options={TEACHER_CRITERIA_OPTIONS.teachingStyle}
                      selected={tForm.teachingStyle}
                      onToggle={(value) => toggleTeacherCriteria("teachingStyle", "teachingStyleOther", value)}
                      allowCustom
                      customValue={tForm.teachingStyleOther}
                      onCustomChange={(text) => updateTeacherCustomCriteria("teachingStyleOther", text)}
                      name="teacher-teaching-style"
                    />
                    <CriteriaChipField
                      legend="Best Student Pace"
                      hint={TEACHER_CRITERIA_HINTS.idealStudentPace}
                      options={TEACHER_CRITERIA_OPTIONS.idealStudentPace}
                      selected={tForm.idealStudentPace}
                      onToggle={(value) => toggleTeacherCriteria("idealStudentPace", "idealStudentPaceOther", value)}
                      allowCustom
                      customValue={tForm.idealStudentPaceOther}
                      onCustomChange={(text) => updateTeacherCustomCriteria("idealStudentPaceOther", text)}
                      name="student-pace"
                    />
                    <div>
                      <label htmlFor="teacher-experience-years">Experience Years</label>
                      <input
                        id="teacher-experience-years"
                        type="number"
                        min="0"
                        value={tForm.experienceYears}
                        onChange={(e)=>setTForm({...tForm, experienceYears:e.target.value})}
                      />
                      <p className={styles.criteriaFieldHint}>
                        Weighted against the student's level - higher levels are matched with more experienced teachers.
                      </p>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: "12px" }}>
                  <label htmlFor="teacher-bio">Teacher Bio / Notes</label>
                  <textarea
                    id="teacher-bio"
                    value={tForm.bio}
                    onChange={(e)=>setTForm({...tForm, bio:e.target.value})}
                    rows={4}
                    placeholder="Add teaching strengths, student types handled well, and any notes useful for matching..."
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #d0d0d0",
                      borderRadius: "6px",
                      fontFamily: "inherit",
                      fontSize: "0.9em",
                      resize: "vertical",
                      lineHeight: "1.5",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>
              <br />
              <br />
              <button className={styles.primary} disabled={loading || resumeParsing}>
                {loading ? "Creating..." : "Create Teacher"}
              </button>
            </form>
          </section>
        )}

        {active === "createStudent" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Create Student Account</h2>
            </div>
            <form className={styles.form} onSubmit={handleCreateStudentSubmit}>
              <div className={styles.grid2}>
                <div>
                  <label>First Name</label>
                  <input value={sForm.firstName} onChange={(e)=>setSForm({...sForm, firstName:e.target.value})} />
                </div>
                <div>
                  <label>Last Name</label>
                  <input value={sForm.lastName} onChange={(e)=>setSForm({...sForm, lastName:e.target.value})} />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={sForm.email} onChange={(e)=>setSForm({...sForm, email:e.target.value})} />
                </div>
                <div>
                  <label>Country</label>
                  <select value={sForm.country} onChange={(e)=>setSForm({...sForm, country:e.target.value})} required>
                    <option value="">Select Country</option>
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Birthday</label>
                  <input type="date" value={sForm.birthDate} onChange={(e)=>setSForm({...sForm, birthDate:e.target.value})} required />
                </div>
                <div>
                  <label>Enroll in Course</label>
                  <select
                    value={sForm.courseId}
                    onChange={(e)=>updateStudentCourse(e.target.value)}
                  >
                    <option value="">Select Course</option>
                    {courses.map(c => (
                      <option key={c.course_id} value={c.course_id}>
                        {c.course_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <br />
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "1.3em", marginRight: "8px" }}>📝</span>
                  <h3 style={{ margin: "0", fontSize: "1.1em", color: "#333", fontWeight: "600" }}>Trial Class Assessment</h3>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.9em", color: "#666", lineHeight: "1.5" }}>
                  Score the student on the 5 level evaluation criteria below - the proficiency level is computed from those scores, so you no longer pick a level by hand. Then add trial notes and choose the learning criteria. The AI matcher will prioritize teachers below 2 active students, then choose the least-loaded teacher if everyone already has 2 or more.
                </p>
                <div className={styles.levelEvaluation}>
                  <div className={styles.levelEvaluationHead}>
                    <h4 className={styles.levelEvaluationTitle}>Level Evaluation</h4>
                    <button
                      type="button"
                      className={styles.levelHelpToggle}
                      onClick={() => setShowLevelHelp((open) => !open)}
                      aria-expanded={showLevelHelp}
                      aria-controls="level-evaluation-help"
                    >
                      {showLevelHelp ? "Hide" : "How are levels determined?"}
                    </button>
                  </div>
                  <p className={styles.levelEvaluationIntro}>
                    Rate each criterion from {LEVEL_SCORE_MIN} (lowest) to {LEVEL_SCORE_LABEL_MAX}.
                  </p>
                  <div id="level-evaluation-help" hidden={!showLevelHelp} className={styles.levelHelpPanel}>
                    <p>Levels are worked out automatically from the five scores, in this order:</p>
                    <ul>
                      <li>
                        <strong>Novice</strong> - any of Reading &amp; Comprehension, Structure,
                        Sentence / Grammar or Vocabulary is scored 1. Good pronunciation alone
                        does not lift a student out of Novice.
                      </li>
                      <li>
                        <strong>Advanced</strong> - all five criteria score 4 or higher
                        <em>and</em> the average is 4.5 or above.
                      </li>
                      <li>
                        <strong>Intermediate High</strong> - all five criteria score 3 or higher
                        <em>and</em> the average is 3.5 or above. No 2s allowed.
                      </li>
                      <li>
                        <strong>Intermediate Mid</strong> - all five criteria score 3 or higher,
                        but the average has not reached 3.5 yet.
                      </li>
                      <li>
                        <strong>Intermediate Mid or Low</strong> - when at least one criterion is a
                        2, the average decides: 2.8 or above is Intermediate Mid, anything lower
                        is Intermediate Low.
                      </li>
                    </ul>
                  </div>
                  <div className={styles.levelScoreRows}>
                    {LEVEL_EVALUATION_CRITERIA.map((criterion) => {
                      const selected = sForm.levelScores?.[criterion.key] ?? null;
                      return (
                        <fieldset key={criterion.key} className={styles.levelScoreField}>
                          <legend className={styles.levelScoreLabel}>{criterion.label}</legend>
                          <p className={styles.levelScoreHint}>{criterion.hint}</p>
                          <div className={styles.levelScoreScale}>
                            {LEVEL_SCORE_SCALE.map((score) => {
                              const isActive = selected === score;
                              return (
                                <label
                                  key={score}
                                  className={`${styles.levelScoreOption} ${isActive ? styles.levelScoreOptionActive : ""}`}
                                >
                                  <input
                                    type="radio"
                                    name={`level-score-${criterion.key}`}
                                    value={score}
                                    checked={isActive}
                                    onChange={() => updateLevelScore(criterion.key, score)}
                                    className={styles.levelScoreInput}
                                  />
                                  <span aria-hidden="true">{score}</span>
                                  <span className={styles.srOnly}>{`${criterion.label}: ${score} out of ${LEVEL_SCORE_MAX}`}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                  <div
                    className={`${styles.levelResult} ${computedLevel ? styles.levelResultReady : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className={styles.levelResultLabel}>Computed Proficiency Level</span>
                    {computedLevel ? (
                      <>
                        <span className={styles.levelResultBadge}>{formatComputedLevel(computedLevel.level)}</span>
                        <span className={styles.levelResultReason}>{computedLevel.reason}</span>
                      </>
                    ) : (
                      <span className={styles.levelResultEmpty}>
                        Score all 5 criteria to see the level
                        {missingLevelCriteria.length
                          ? ` - ${missingLevelCriteria.length} still to score`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.criteriaCard}>
                  <div className={styles.criteriaCardHead}>
                    <h4 className={styles.criteriaCardTitle}>Matching Criteria</h4>
                  </div>
                  <p className={styles.criteriaCardIntro}>
                    Select everything that applies to this student. Each criterion is compared against the teacher's matching profile, so the more you select the more precise the recommendation.
                  </p>
                  <div className={styles.criteriaGrid}>
                    <CriteriaChipField
                      legend="Learning Goal"
                      hint={STUDENT_CRITERIA_HINTS.learningGoal}
                      options={studentLearningGoalOptions}
                      selected={sForm.aiCriteria.learningGoal}
                      onToggle={(value) => toggleAiCriterionValue("learningGoal", value)}
                      emptyMessage={CRITERIA_EMPTY_MESSAGES.noCourse}
                      name="student-learning-goal"
                    />
                    <CriteriaChipField
                      legend="Focus Area"
                      hint={STUDENT_CRITERIA_HINTS.focusArea}
                      options={studentFocusAreaOptions}
                      selected={sForm.aiCriteria.focusArea}
                      onToggle={(value) => toggleAiCriterionValue("focusArea", value)}
                      emptyMessage={CRITERIA_EMPTY_MESSAGES.noCourse}
                      name="student-focus-area"
                    />
                    <CriteriaChipField
                      legend="Learning Style"
                      hint={STUDENT_CRITERIA_HINTS.learningStyle}
                      options={STUDENT_CRITERIA_OPTIONS.learningStyle}
                      selected={sForm.aiCriteria.learningStyle}
                      onToggle={(value) => toggleAiCriterionValue("learningStyle", value)}
                      name="student-learning-style"
                    />
                    <CriteriaChipField
                      legend="Learning Pace"
                      hint={STUDENT_CRITERIA_HINTS.pace}
                      options={STUDENT_CRITERIA_OPTIONS.pace}
                      selected={sForm.aiCriteria.pace}
                      onToggle={(value) => toggleAiCriterionValue("pace", value)}
                      name="student-pace"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Trial Class Notes</label>
                  <textarea
                    value={sForm.trialNotes}
                    onChange={(e)=>{
                      setSForm({...sForm, trialNotes:e.target.value});
                      setAiRecommendation(null);
                    }}
                    rows={5}
                    placeholder="Describe the student's performance, strengths, weaknesses, communication style, learning pace, and any specific areas of focus identified during the trial class..."
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #d0d0d0",
                      borderRadius: "6px",
                      fontFamily: "inherit",
                      fontSize: "0.9em",
                      resize: "vertical",
                      lineHeight: "1.5",
                      boxSizing: "border-box"
                    }}
                  />
                  <div style={{ marginTop: "12px", textAlign: "center" }}>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={analyzeStudentMatch}
                      disabled={aiLoading}
                    >
                      {aiLoading ? "Analyzing..." : "Analyze with AI"}
                    </button>
                  </div>
                  {aiRecommendation?.teacher && (
                    <div className={styles.recommendationCard}>
                      <div>
                        Recommended teacher:{" "}
                        <strong>{aiRecommendation.teacher.first_name} {aiRecommendation.teacher.last_name}</strong>
                        <span> ({aiRecommendation.teacher.assigned_student_count} active students)</span>
                      </div>
                      {aiRecommendation.usedLeastLoadedFallback && (
                        <div>
                          All teachers are at 2 or more students, so the least-loaded suitable teacher was selected.
                        </div>
                      )}
                      {aiRecommendation.teacher.reasons?.length > 0 && (
                        <div>Reason: {aiRecommendation.teacher.reasons.join(", ")}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <br />
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "1.3em", marginRight: "8px" }}>🎯</span>
                  <h3 style={{ margin: "0", fontSize: "1.1em", color: "#333", fontWeight: "600" }}>AI Recommendations</h3>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.9em", color: "#666", lineHeight: "1.5" }}>
                  Review the recommended teacher and course before creating the student account.
                </p>
                <div className={styles.responsiveFormGrid}>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Assigned Teacher</label>
                    <select
                      value={sForm.teacherId}
                      onChange={(e)=>{
                        setSForm({...sForm, teacherId:e.target.value});
                        setAiRecommendation(null);
                      }}
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "1px solid #d0d0d0",
                        borderRadius: "6px",
                        fontFamily: "inherit",
                        fontSize: "0.9em",
                        background: "#fff"
                      }}
                    >
                      <option value="">Select Teacher</option>
                      {teachersForSelectedStudentCourse.map(t => (
                        <option key={t.user_id} value={t.user_id}>
                          {t.first_name} {t.last_name}
                        </option>
                      ))}
                    </select>
                    {sForm.courseId && teachersForSelectedStudentCourse.length === 0 && (
                      <div style={{ marginTop: 6, fontSize: "0.82em", color: "#b65f00" }}>
                        No active teacher is assigned to teach this course yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <br />
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "1.3em", marginRight: "8px" }}>📊</span>
                  <h3 style={{ margin: "0", fontSize: "1.1em", color: "#333", fontWeight: "600" }}>Class Package Information</h3>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.9em", color: "#666", lineHeight: "1.5" }}>
                  Specify the number of classes this student has purchased or availed in their package. This helps track their remaining classes and package utilization.
                </p>
                <div className={styles.responsiveFormGrid}>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Number of Classes Availed</label>
                    <select
                      value={sForm.classesAvailed}
                      onChange={(e)=>setSForm({...sForm, classesAvailed:e.target.value})}
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "1px solid #d0d0d0",
                        borderRadius: "6px",
                        fontFamily: "inherit",
                        fontSize: "0.9em",
                        background: "#fff",
                        boxSizing: "border-box"
                      }}
                    >
                      <option value="">Select Number of Classes</option>
                      <option value="10">10</option>
                      <option value="15">15</option>
                      <option value="20">20</option>
                    </select>
                    <div style={{ marginTop: "8px", fontSize: "0.85em", color: "#666" }}>
                      This information will be stored with the student's profile for tracking purposes.
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Class Duration</label>
                    <select
                      value={sForm.classDuration}
                      onChange={(e)=>setSForm({...sForm, classDuration:e.target.value})}
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "1px solid #d0d0d0",
                        borderRadius: "6px",
                        fontFamily: "inherit",
                        fontSize: "0.9em",
                        background: "#fff",
                        boxSizing: "border-box"
                      }}
                    >
                      <option value="25">25 minutes</option>
                      <option value="50">50 minutes</option>
                    </select>
                    <div style={{ marginTop: "8px", fontSize: "0.85em", color: "#666" }}>
                      Future bookings for this package will use this duration.
                    </div>
                  </div>
                </div>
              </div>
              <br />
              <button className={styles.primary} disabled={loading}>
                {loading ? "Creating..." : "Create Student"}
              </button>
            </form>
          </section>
        )}

        {active === "contracts" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>Manage Class Contracts</h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.9em", color: "#666" }}>
                  Manage enrolled courses and active class packages for each student.
                </p>
              </div>
              <button
                className={styles.primary}
                type="button"
                onClick={contractSubTab === "packages" ? loadContracts : loadContractRequests}
                disabled={contractsLoading || contractRequestsLoading}
              >
                {contractsLoading || contractRequestsLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className={styles.subTabs}>
              <button
                type="button"
                className={`${styles.subTab} ${contractSubTab === "packages" ? styles.subTabActive : ""}`}
                onClick={() => setContractSubTab("packages")}
              >
                Class Packages
              </button>
              <button
                type="button"
                className={`${styles.subTab} ${contractSubTab === "requests" ? styles.subTabActive : ""}`}
                onClick={() => setContractSubTab("requests")}
              >
                Contract Requests
              </button>
            </div>

            {contractSubTab === "requests" && (
            <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 14, background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Student Contract Requests</h3>
                <button className={styles.linkBtn} type="button" onClick={loadContractRequests}>
                  Refresh Requests
                </button>
              </div>
              <div className={styles.searchBar}>
                <input
                  type="search"
                  value={contractRequestSearch}
                  onChange={(e) => setContractRequestSearch(e.target.value)}
                  placeholder="Search requests by student, email, course, status, or classes"
                  aria-label="Search contract requests"
                />
              </div>
              {contractRequestsLoading ? (
                <div className={styles.empty}>Loading contract requests...</div>
              ) : contractRequests.length === 0 ? (
                <div className={styles.empty}>No contract requests yet</div>
              ) : filteredContractRequests.length === 0 ? (
                <div className={styles.empty}>No contract requests match your search</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Requested Course</th>
                        <th>Classes</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Requested</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContractRequests.map((request) => (
                        <tr key={request.request_id}>
                          <td data-label="Student">
                            <strong>{request.first_name} {request.last_name}</strong>
                            <div style={{ fontSize: "0.8em", color: "#666" }}>{request.email}</div>
                          </td>
                          <td data-label="Requested Course">{request.course_name || "Course not set"}</td>
                          <td data-label="Classes">{request.requested_classes}</td>
                          <td data-label="Duration">{request.class_duration || 50} min</td>
                          <td data-label="Status">
                            <span style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: request.status === "pending" ? "#fef3c7" : request.status === "approved" ? "#dcfce7" : "#fee2e2",
                              color: request.status === "pending" ? "#92400e" : request.status === "approved" ? "#166534" : "#991b1b",
                              fontWeight: 700,
                              textTransform: "capitalize",
                            }}>
                              {request.status}
                            </span>
                          </td>
                          <td data-label="Requested">{formatDate(request.requested_at)}</td>
                          <td data-label="Actions">
                            {request.status === "pending" ? (
                              <div className={styles.rowActions}>
                                <button
                                  className={styles.approve}
                                  type="button"
                                onClick={() => requestUpdateContractRequest(request.request_id, "approved", request)}
                                  disabled={updatingContractRequestId === request.request_id}
                                >
                                  Approve
                                </button>
                                <button
                                  className={styles.decline}
                                  type="button"
                                onClick={() => requestUpdateContractRequest(request.request_id, "declined", request)}
                                  disabled={updatingContractRequestId === request.request_id}
                                >
                                  Decline
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: "#666", fontSize: "0.9em" }}>
                                {request.resolved_at ? `Resolved ${formatDate(request.resolved_at)}` : "Resolved"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {contractSubTab === "packages" && (
            <>
            <div className={styles.searchBar}>
              <input
                type="search"
                value={contractSearch}
                onChange={(e) => setContractSearch(e.target.value)}
                placeholder="Search packages by student, email, course, teacher, or status"
                aria-label="Search class packages"
              />
            </div>
            <div className={styles.tableWrap}>
              {contractsLoading ? (
                <div className={styles.empty}>Loading contracts...</div>
              ) : contracts.length === 0 ? (
                <div className={styles.empty}>No active students found</div>
              ) : filteredContracts.length === 0 ? (
                <div className={styles.empty}>No class packages match your search</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Teacher</th>
                      <th>Duration</th>
                      <th>Total</th>
                      <th>Used</th>
                      <th>Left</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContracts.map((row) => {
                      const total = Math.max(0, parseInt(row.total_classes, 10) || 0);
                      const used = Math.max(0, parseInt(row.classes_used, 10) || 0);
                      const classesLeft = Math.max(0, total - used);
                      return (
                        <tr key={row.user_id}>
                          <td data-label="Student">
                            <strong>{row.first_name} {row.last_name}</strong>
                            <div style={{ fontSize: "0.8em", color: "#666" }}>{row.email}</div>
                          </td>
                          <td data-label="Course">
                            <select
                              value={row.course_id}
                              onChange={(e) => updateContractRow(row.user_id, "course_id", e.target.value)}
                            >
                              <option value="">Keep current</option>
                              {courses.map((course) => (
                                <option key={course.course_id} value={course.course_id}>
                                  {course.course_name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td data-label="Teacher">
                            <select
                              value={row.assigned_teacher_id}
                              onChange={(e) => updateContractRow(row.user_id, "assigned_teacher_id", e.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {teachers
                                .filter((teacher) => !row.course_id || teacherCourseMap[String(teacher.user_id)]?.has(String(row.course_id)))
                                .map((teacher) => (
                                <option key={teacher.user_id} value={teacher.user_id}>
                                  {teacher.first_name} {teacher.last_name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td data-label="Duration">
                            <select
                              value={row.class_duration || 50}
                              onChange={(e) => updateContractRow(row.user_id, "class_duration", e.target.value)}
                            >
                              <option value="25">25 min</option>
                              <option value="50">50 min</option>
                            </select>
                          </td>
                          <td data-label="Total">
                            <input
                              type="number"
                              min="0"
                              value={row.total_classes}
                              onChange={(e) => updateContractRow(row.user_id, "total_classes", e.target.value)}
                              style={{ width: 78 }}
                            />
                          </td>
                          <td data-label="Used">
                            <input
                              type="number"
                              min="0"
                              max={total}
                              value={row.classes_used}
                              onChange={(e) => updateContractRow(row.user_id, "classes_used", e.target.value)}
                              style={{ width: 78 }}
                            />
                          </td>
                          <td data-label="Left">
                            <span style={{
                              display: "inline-block",
                              minWidth: 34,
                              textAlign: "center",
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: classesLeft <= 0 ? "#fee2e2" : "#dcfce7",
                              color: classesLeft <= 0 ? "#991b1b" : "#166534",
                              fontWeight: 700,
                            }}>
                              {classesLeft}
                            </span>
                          </td>
                          <td data-label="Status">
                            <select
                              value={row.package_status}
                              onChange={(e) => updateContractRow(row.user_id, "package_status", e.target.value)}
                            >
                              <option value="active">Active</option>
                              <option value="expired">Expired</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </td>
                          <td data-label="Actions">
                            <button
                              className={styles.approve}
                              type="button"
                              onClick={() => requestSaveContract(row)}
                              disabled={savingContractId === row.user_id}
                            >
                              {savingContractId === row.user_id ? "Saving..." : row.package_id ? "Save" : "Create"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            </>
            )}
          </section>
        )}

        {active === "archive" && (
          <section className={styles.card}>
            <div className={styles.cardHead}><h2>Account Management</h2></div>
            <div className={styles.searchBar}>
              <input
                type="search"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder="Search by name, email, or role"
                aria-label="Search accounts"
              />
            </div>
            <div className={styles.split}>
              <div>
                <h3>Active Students</h3>
                <ul className={styles.list}>
                  {filteredArchiveStudents.length === 0 && <li className={styles.empty}>No active students found</li>}
                  {filteredArchiveStudents.map(s => (
                    <li key={s.user_id} className={styles.listRow}>
                      <span>
                        {s.first_name} {s.last_name} - {s.email}
                        <small style={{ display: "block", marginTop: 4 }}>
                          <span style={{
                            ...setupInviteStatusStyle(s.setup_invite_status),
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: "0.78rem",
                            fontWeight: 700,
                          }}>
                            {SETUP_INVITE_LABELS[s.setup_invite_status] || "Invite Not Sent"}
                          </span>
                          {s.setup_invite_expires_at && s.setup_invite_status !== "completed"
                            ? ` Expires ${formatDateTime(s.setup_invite_expires_at)}`
                            : ""}
                        </small>
                      </span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          className={styles.approve}
                          type="button"
                          onClick={() => openStudentAccount(s.user_id)}
                          disabled={studentAccountLoading}
                        >
                          View
                        </button>
                        <button className={styles.warn} onClick={() => requestArchiveUser(s.user_id)}>Archive</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Active Teachers</h3>
                <ul className={styles.list}>
                  {filteredArchiveTeachers.length === 0 && <li className={styles.empty}>No active teachers found</li>}
                  {filteredArchiveTeachers.map(t => (
                    <li key={t.user_id} className={styles.listRow}>
                      <span>
                        {t.first_name} {t.last_name} - {t.email}
                        <small style={{ display: "block", marginTop: 4 }}>
                          <span style={{
                            ...setupInviteStatusStyle(t.setup_invite_status),
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: "0.78rem",
                            fontWeight: 700,
                          }}>
                            {SETUP_INVITE_LABELS[t.setup_invite_status] || "Invite Not Sent"}
                          </span>
                          {t.setup_invite_expires_at && t.setup_invite_status !== "completed"
                            ? ` Expires ${formatDateTime(t.setup_invite_expires_at)}`
                            : ""}
                        </small>
                      </span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          className={styles.approve}
                          type="button"
                          onClick={() => openStudentAccount(t.user_id)}
                          disabled={studentAccountLoading}
                        >
                          View
                        </button>
                        <button className={styles.warn} onClick={() => requestArchiveUser(t.user_id)}>Archive</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <details className={styles.archivedBox}>
              <summary>Show Archived Users</summary>
              <ArchivedUsers onUnarchive={requestRestoreUser} refresh={archiveRefresh} search={archiveSearch} />
            </details>
          </section>
        )}
        {active === "requests" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Schedule Requests</h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.9em", color: "#666" }}>Manage student reschedule requests</p>
            </div>

            {/* Filter Tabs */}
            <div className={styles.filterTabs}>
              {["all", "pending", "approved", "declined"].map((status) => {
                const counts = {
                  all: requests.length,
                  pending: requests.filter(r => r.status === "pending").length,
                  approved: requests.filter(r => r.status === "approved").length,
                  declined: requests.filter(r => r.status === "declined").length,
                };
                return (
                  <button
                    key={status}
                    onClick={() => setRequestFilter(status)}
                    style={{
                      padding: "8px 16px",
                      border: "none",
                      background: requestFilter === status ? "#0f0f0f" : "#f5f5f5",
                      color: requestFilter === status ? "#fff" : "#333",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: requestFilter === status ? "600" : "500",
                      fontSize: "0.9em",
                      transition: "all 0.2s",
                    }}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)} ({counts[status]})
                  </button>
                );
              })}
            </div>

            {/* Clear All Button */}
            {requests.length > 0 && (
              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <button
                  onClick={requestDeleteAllRequests}
                  className={styles.warn}
                  style={{ fontSize: "0.9em" }}
                >
                  Clear All Requests
                </button>
              </div>
            )}

            {/* Requests List */}
            <div className={styles.tableWrap}>
              {requestsLoading ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#999" }}>
                  Loading requests...
                </div>
              ) : requests.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#999" }}>
                  No reschedule requests at this time
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #e0e0e0" }}>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Class</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Requester</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Current Schedule</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Requested Schedule</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Status</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests
                      .filter(r => requestFilter === "all" || r.status === requestFilter)
                      .map((r) => {
                        const statusColors = {
                          pending: { bg: "#fff3cd", text: "#856404" },
                          approved: { bg: "#d4edda", text: "#155724" },
                          declined: { bg: "#f8d7da", text: "#721c24" },
                        };
                        const statusColor = statusColors[r.status] || statusColors.pending;

                        return (
                          <tr key={r.request_id} style={{ borderBottom: "1px solid #e0e0e0", background: "#fff" }}>
                            <td data-label="Class" style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ fontWeight: "500", color: "#333" }}>{r.class_name || "Untitled Class"}</div>
                              <div style={{ fontSize: "0.8em", color: "#666", marginTop: "2px" }}>
                                Teacher: {r.teacher_first} {r.teacher_last}
                              </div>
                              {r.student_first && (
                                <div style={{ fontSize: "0.8em", color: "#666", marginTop: "2px" }}>
                                  Student: {r.student_first} {r.student_last}
                                </div>
                              )}
                              {r.reason && (
                                <div style={{ fontSize: "0.8em", color: "#666", marginTop: "4px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.reason}>
                                  Reason: {r.reason}
                                </div>
                              )}
                            </td>
                            <td data-label="Requester" style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ fontWeight: "500" }}>{r.requester_first} {r.requester_last}</div>
                              <div style={{ fontSize: "0.8em", color: "#666" }}>{r.requester_email || ""}</div>
                            </td>
                            <td data-label="Current Schedule" style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ fontWeight: "500" }}>{formatDate(r.scheduled_date)}</div>
                              <div style={{ fontSize: "0.8em", color: "#666" }}>{r.start_time || "-"}</div>
                            </td>
                            <td data-label="Requested Schedule" style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ fontWeight: "500" }}>{formatDate(r.requested_date)}</div>
                              <div style={{ fontSize: "0.8em", color: "#666" }}>{r.requested_time || "-"}</div>
                            </td>
                            <td data-label="Status" style={{ padding: "12px", verticalAlign: "top" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "12px",
                                background: statusColor.bg,
                                color: statusColor.text,
                                fontSize: "0.8em",
                                fontWeight: "600",
                                textTransform: "capitalize",
                              }}>
                                {r.status}
                              </span>
                              {r.resolved_at && (
                                <div style={{ fontSize: "0.7em", color: "#999", marginTop: "4px" }}>
                                  Resolved: {formatDate(r.resolved_at)}
                                </div>
                              )}
                            </td>
                            <td data-label="Actions" style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => requestDeleteRequest(r.request_id)}
                                  className={styles.warn}
                                  style={{ fontSize: "0.8em", padding: "6px 10px" }}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* Confirmation Dialog */}
        {confirmDialog && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.48)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
            onClick={() => setConfirmDialog(null)}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid rgba(38, 66, 59, 0.12)",
                borderRadius: "24px",
                padding: "24px",
                maxWidth: "440px",
                width: "100%",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
                animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.2rem", fontWeight: 800, color: "#13251f" }}>
                {confirmDialog.status === "approved" ? "Approve Request?" : "Decline Request?"}
              </h3>
              <p style={{ margin: "0 0 20px 0", color: "#5e7268", lineHeight: 1.6, fontSize: "0.95rem" }}>
                {confirmDialog.status === "approved"
                  ? "Are you sure you want to approve this reschedule request? The student will be notified."
                  : "Are you sure you want to decline this reschedule request? The student will be notified and may submit a new request."}
              </p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setConfirmDialog(null)}
                  style={{
                    minHeight: "42px",
                    padding: "10px 18px",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    border: "1px solid rgba(38, 66, 59, 0.14)",
                    background: "#fff",
                    color: "#26423b",
                    borderRadius: "14px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateRequest(confirmDialog.id, confirmDialog.status)}
                  style={{
                    minHeight: "42px",
                    padding: "10px 18px",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    border: "none",
                    background: confirmDialog.status === "approved" ? "#26423b" : "#8a3e2e",
                    color: "#fff",
                    borderRadius: "14px",
                    cursor: "pointer",
                  }}
                >
                  {confirmDialog.status === "approved" ? "Approve" : "Decline"}
                </button>
              </div>
            </div>
          </div>
        )}
        {selectedProof && (
          <div
            role="presentation"
            onClick={() => setSelectedProof(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.48)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              zIndex: 1200,
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Class screenshot"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(960px, 100%)",
                maxHeight: "90vh",
                overflow: "auto",
                background: "#fff",
                border: "1px solid rgba(38, 66, 59, 0.12)",
                borderRadius: 24,
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
                animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "16px 18px", borderBottom: "1px solid #e5e7eb" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1rem", color: "#10231d" }}>{selectedProof.className}</h3>
                  <p style={{ margin: "4px 0 0", color: "#667085", fontSize: "0.86rem" }}>
                    {selectedProof.teacherName} / {selectedProof.studentName} / {selectedProof.schedule}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProof(null)}
                  aria-label="Close screenshot preview"
                  style={{
                    border: "1px solid #d0d5dd",
                    background: "#fff",
                    borderRadius: "50%",
                    width: 34,
                    height: 34,
                    cursor: "pointer",
                    fontSize: 20,
                    fontWeight: 800,
                    lineHeight: "30px",
                  }}
                >
                  x
                </button>
              </div>
              <div style={{ padding: 18, background: "#f8fafc" }}>
                <AuthenticatedImage
                  src={selectedProof.url}
                  alt="Class proof screenshot"
                  style={{ display: "block", width: "100%", maxHeight: "72vh", objectFit: "contain", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}
                />
              </div>
            </section>
          </div>
        )}
        {deleteConfirm && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.48)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid rgba(38, 66, 59, 0.12)",
                borderRadius: "24px",
                padding: "24px",
                maxWidth: "440px",
                width: "100%",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
                animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.2rem", fontWeight: 800, color: "#13251f" }}>
                {deleteConfirm.title}
              </h3>
              <p style={{ margin: "0 0 20px 0", color: "#5e7268", lineHeight: 1.6, fontSize: "0.95rem" }}>
                {deleteConfirm.message}
              </p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    minHeight: "42px",
                    padding: "10px 18px",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    border: "1px solid rgba(38, 66, 59, 0.14)",
                    background: "#fff",
                    color: "#26423b",
                    borderRadius: "14px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteRequests}
                  style={{
                    minHeight: "42px",
                    padding: "10px 18px",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    border: "none",
                    background: "#8a3e2e",
                    color: "#fff",
                    borderRadius: "14px",
                    cursor: "pointer",
                  }}
                >
                  {deleteConfirm.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
        {studentAccountModal && (
          <div
            role="presentation"
            onClick={() => setStudentAccountModal(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              zIndex: 1080,
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`${accountModalRoleLabel} account details`}
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(720px, 100%)",
                maxHeight: "90vh",
                overflow: "auto",
                background: "#fff",
                border: "1px solid rgba(38, 66, 59, 0.12)",
                borderRadius: 24,
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
                animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "18px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#10231d" }}>
                    {studentAccountModal.first_name} {studentAccountModal.last_name}
                  </h3>
                  <p style={{ margin: "4px 0 0", color: "#667085", fontSize: "0.9rem" }}>
                    {accountModalRoleLabel} account management
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close student account details"
                  onClick={() => setStudentAccountModal(null)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    border: "1px solid #d0d5dd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  x
                </button>
              </div>

              <div style={{ padding: 20, display: "grid", gap: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  {[
                    ["Account Status", studentAccountModal.status || "-"],
                    ["Profile", studentAccountModal.profile_completed ? "Complete" : "Incomplete"],
                    ["Password", studentAccountModal.password_changed ? "Set" : "Pending setup"],
                    ["Invite", SETUP_INVITE_LABELS[studentAccountModal.setup_invite_status] || "Invite Not Sent"],
                    ...(studentAccountModal.role === "student" ? [
                      ["Course", studentAccountModal.course_name || "-"],
                      ["Teacher", studentAccountModal.teacher_name || "-"],
                      ["Package", studentAccountModal.package_id ? `${studentAccountModal.total_classes || 0} classes` : "No package"],
                      ["Classes Left", studentAccountModal.classes_left ?? "-"],
                    ] : []),
                  ].map(([label, value]) => (
                    <div key={label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f9fafb" }}>
                      <div style={{ color: "#667085", fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>{label}</div>
                      <div style={{ color: "#10231d", fontWeight: 700, wordBreak: "break-word" }}>{value}</div>
                    </div>
                  ))}
                </div>

                {studentAccountModal.setup_invite_expires_at && studentAccountModal.setup_invite_status !== "completed" && (
                  <p style={{ margin: 0, color: "#667085", fontSize: "0.9rem" }}>
                    Current invite expires {formatDateTime(studentAccountModal.setup_invite_expires_at)}.
                  </p>
                )}

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
                  <label htmlFor="studentEmailDraft">{accountModalRoleLabel} Email</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <input
                      id="studentEmailDraft"
                      type="email"
                      value={studentEmailDraft}
                      onChange={(e) => setStudentEmailDraft(e.target.value)}
                      style={{
                        flex: "1 1 260px",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #d0d5dd",
                        fontSize: "0.95rem",
                      }}
                    />
                    <button
                      type="button"
                      className={styles.approve}
                      onClick={saveStudentEmail}
                      disabled={studentAccountActionLoading === "email"}
                    >
                      {studentAccountActionLoading === "email" ? "Saving..." : "Save & Resend"}
                    </button>
                  </div>
                  <p style={{ margin: "8px 0 0", color: "#667085", fontSize: "0.82rem", lineHeight: 1.5 }}>
                    Saving a new email invalidates old unused invites and sends a fresh setup link.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className={styles.approve}
                    onClick={() => resendStudentInvite()}
                    disabled={Boolean(studentAccountActionLoading)}
                  >
                    {studentAccountActionLoading === "resend" ? "Sending..." : "Resend Invite"}
                  </button>
                  <button
                    type="button"
                    className={styles.approve}
                    onClick={() => resendStudentInvite({ copyOnly: true })}
                    disabled={Boolean(studentAccountActionLoading)}
                  >
                    {studentAccountActionLoading === "copy" ? "Copying..." : "Copy Fresh Link"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
        {/* Portalled so the overlay covers the whole viewport. See ModalPortal. */}
        <ModalPortal>
          {adminConfirm && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
            }}
            onClick={() => closeAdminConfirm()}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid rgba(38, 66, 59, 0.12)",
                borderRadius: 24,
                padding: 24,
                maxWidth: "440px",
                width: "100%",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
                animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.2rem", fontWeight: 800, color: "#13251f" }}>
                {adminConfirm.title}
              </h3>
              <p style={{ margin: "0 0 16px 0", color: "#5e7268", lineHeight: 1.6, fontSize: "0.95rem" }}>
                {adminConfirm.message}
              </p>
              {adminConfirmLines.length > 0 && (
                <div style={{ border: "1px solid rgba(38, 66, 59, 0.1)", borderRadius: 16, background: "#f8fbf9", padding: 12, marginBottom: 20 }}>
                  {adminConfirmLines.map((line) => (
                    <div key={line} style={{ fontSize: "0.9rem", color: "#26423b", marginBottom: 6, wordBreak: "break-word" }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={closeAdminConfirm}
                  style={{
                    minHeight: "42px",
                    padding: "10px 18px",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    border: "1px solid rgba(38, 66, 59, 0.14)",
                    background: "#fff",
                    color: "#26423b",
                    borderRadius: 14,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={executeAdminConfirm}
                  style={{
                    minHeight: "42px",
                    padding: "10px 18px",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    border: "none",
                    background: adminConfirm.tone === "danger" ? "#8a3e2e" : "#26423b",
                    color: "#fff",
                    borderRadius: 14,
                    cursor: "pointer",
                  }}
                >
                  {adminConfirm.confirmLabel || "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
        </ModalPortal>
        {active === "calendar" && (
          <section className={styles.card}>
            <div className={styles.cardHead}><h2>Scheduled Classes</h2></div>
            <Calendar />
          </section>
        )}

        {active === "books" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>Book Library</h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.9em", color: "#666" }}>
                  Add books and distribute them to teachers. Teachers can view and
                  track student progress, but only you can change a book.
                </p>
              </div>
              <div className={styles.cardHeadActions}>
                <button className={styles.primary} type="button" onClick={() => openBookModal("create")}>
                  + Add Book
                </button>
              </div>
            </div>

            <div className={styles.searchRow}>
              <input
                type="search"
                value={bookSearch}
                onChange={(e) => setBookSearch(e.target.value)}
                placeholder="Search by title, course or teacher"
                aria-label="Search books"
              />
              <select
                value={bookStatusFilter}
                onChange={(e) => setBookStatusFilter(e.target.value)}
                aria-label="Filter books by status"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </div>

            {booksLoading ? (
              <div className={styles.empty}>Loading books...</div>
            ) : filteredBooks.length === 0 ? (
              <div className={styles.empty}>
                {books.length === 0
                  ? "No books yet. Add one to get started."
                  : "No books match your search."}
              </div>
            ) : (
              <div className={styles.bookGrid}>
                {filteredBooks.map((book) => {
                  const isArchived = book.status === "archived";
                  const bookTeachers = teachersForBook(book);
                  const isBusy = bookBusyId === book.book_id;

                  return (
                    <article
                      key={book.book_id}
                      className={`${styles.bookCard} ${isArchived ? styles.bookCardArchived : ""}`}
                    >
                      <div className={styles.bookCoverWrap}>
                        {book.cover_url && !coverErrors[book.book_id] ? (
                          <AuthenticatedImage
                            className={styles.bookCover}
                            src={book.cover_url}
                            alt=""
                            onError={() =>
                              setCoverErrors((prev) => ({ ...prev, [book.book_id]: true }))
                            }
                          />
                        ) : (
                          <div className={styles.bookCoverFallback}>
                            <span>Book</span>
                          </div>
                        )}
                        <span className={styles.bookLessonBadge}>
                          {book.lesson_count || 0}{" "}
                          {book.lesson_count === 1 ? "lesson" : "lessons"}
                        </span>
                        {isArchived && <span className={styles.bookArchivedBadge}>Archived</span>}
                      </div>

                      <div className={styles.bookCardBody}>
                        <h3 className={styles.bookCardTitle}>{book.title}</h3>
                        {book.description && (
                          <p className={styles.bookCardDesc}>{book.description}</p>
                        )}

                        <div className={styles.bookMetaRow}>
                          {book.course_name && (
                            <span className={styles.bookChip}>
                              <i className="bi bi-mortarboard" aria-hidden="true" />
                              <span className={styles.bookChipText}>{book.course_name}</span>
                            </span>
                          )}

                          {bookTeachers.length > 0 ? (
                            <span className={`${styles.bookChip} ${styles.bookChipPeople}`}>
                              <span className={styles.bookTeacherAvatars}>
                                {bookTeachers.slice(0, 3).map((teacher) => (
                                  <TeacherAvatar
                                    key={teacher.user_id}
                                    teacher={teacher}
                                    broken={avatarErrors[teacher.user_id]}
                                    onError={() =>
                                      setAvatarErrors((prev) => ({
                                        ...prev,
                                        [teacher.user_id]: true,
                                      }))
                                    }
                                  />
                                ))}
                              </span>
                              <span className={styles.bookChipText}>
                                {bookTeachers.length === 1
                                  ? `${bookTeachers[0].first_name} ${bookTeachers[0].last_name}`.trim()
                                  : `${bookTeachers.length} teachers`}
                              </span>
                            </span>
                          ) : (
                            <span className={`${styles.bookChip} ${styles.bookChipWarn}`}>
                              <i className="bi bi-exclamation-circle" aria-hidden="true" />
                              <span className={styles.bookChipText}>Not distributed</span>
                            </span>
                          )}
                        </div>

                        <div className={styles.bookCardActions}>
                          <a
                            className={`${styles.primary} ${styles.cardBtn}`}
                            href={`/adminBooksContent/${book.book_id}`}
                          >
                            <i className="bi bi-journal-text" aria-hidden="true" />
                            Lessons
                          </a>

                          <div className={styles.bookCardActionRow}>
                            <button
                              className={`${styles.secondaryBtn} ${styles.cardBtn}`}
                              type="button"
                              disabled={isBusy}
                              onClick={() => openBookModal("distribute", book)}
                            >
                              <i className="bi bi-people" aria-hidden="true" />
                              Distribute
                            </button>
                            <button
                              className={`${styles.linkBtn} ${styles.cardBtn}`}
                              type="button"
                              disabled={isBusy}
                              onClick={() => openBookModal("edit", book)}
                            >
                              <i className="bi bi-pencil" aria-hidden="true" />
                              Edit
                            </button>
                          </div>

                          {/* Archive is the only way a book leaves the library, and
                              it is reversible. There is no hard delete. */}
                          {isArchived ? (
                            <button
                              className={`${styles.approve} ${styles.cardBtn}`}
                              type="button"
                              disabled={isBusy}
                              onClick={() => requestBookStatusChange(book, "restore")}
                            >
                              <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                              Restore
                            </button>
                          ) : (
                            <button
                              className={`${styles.warn} ${styles.cardBtn}`}
                              type="button"
                              disabled={isBusy}
                              onClick={() => requestBookStatusChange(book, "archive")}
                            >
                              <i className="bi bi-archive" aria-hidden="true" />
                              Archive
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {bookModal && (
          <ModalPortal>
          <div className={styles.modalBackdrop} onClick={() => setBookModal(null)}>
            <div
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "560px" }}
            >
              <h3 style={{ margin: "0 0 16px 0", fontSize: "1.2rem", fontWeight: 800, color: "#13251f" }}>
                {bookModal === "create"
                  ? "Add Book"
                  : bookModal === "edit"
                    ? "Edit Book"
                    : `Distribute "${bookDraft.title}"`}
              </h3>

              {bookModal !== "distribute" && (
                <div style={{ display: "grid", gap: "14px", marginBottom: "20px" }}>
                  <label style={{ display: "grid", gap: "6px", fontSize: "0.9rem", fontWeight: 600 }}>
                    Title
                    <input
                      value={bookDraft.title}
                      onChange={(e) => setBookDraft((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Book title"
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px", fontSize: "0.9rem", fontWeight: 600 }}>
                    Description (optional)
                    <textarea
                      rows={3}
                      value={bookDraft.description}
                      onChange={(e) =>
                        setBookDraft((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Short summary shown on the book card"
                    />
                  </label>

                  {bookModal === "create" && (
                    <label style={{ display: "grid", gap: "6px", fontSize: "0.9rem", fontWeight: 600 }}>
                      Course
                      <select
                        value={bookDraft.courseId}
                        onChange={(e) => {
                          const nextCourseId = e.target.value;
                          // Eligibility is per-course, so the picked teachers may no
                          // longer be valid. Clear them - but never silently, which
                          // reads as "my selection was lost" when the book saves with
                          // nobody assigned. Re-picking the same course is a no-op.
                          const dropped = bookDraft.teacherIds.length;
                          if (bookDraft.courseId && nextCourseId !== bookDraft.courseId && dropped > 0) {
                            notify(
                              `Course changed, so ${dropped} selected ${
                                dropped === 1 ? "teacher was" : "teachers were"
                              } cleared. Pick the teachers for the new course.`,
                              "warning"
                            );
                          }
                          setBookDraft((prev) => ({
                            ...prev,
                            courseId: nextCourseId,
                            teacherIds:
                              prev.courseId && nextCourseId !== prev.courseId ? [] : prev.teacherIds,
                          }));
                        }}
                      >
                        <option value="">Select course</option>
                        {courses.map((course) => (
                          <option key={course.course_id} value={course.course_id}>
                            {course.course_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label style={{ display: "grid", gap: "6px", fontSize: "0.9rem", fontWeight: 600 }}>
                    Cover image (optional)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) =>
                        setBookDraft((prev) => ({
                          ...prev,
                          coverFile: e.target.files?.[0] || null,
                        }))
                      }
                    />
                  </label>
                </div>
              )}

              {bookModal !== "edit" && (
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ margin: "0 0 4px 0", fontSize: "0.95rem", fontWeight: 700, color: "#13251f" }}>
                    Distribute to teachers
                  </h4>
                  <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#666" }}>
                    {bookDraft.courseId
                      ? "Teachers assigned to this course. You can leave this empty and distribute later."
                      : "Pick a course first to see its teachers. You can leave this empty and distribute later."}
                  </p>
                  {/* Live count, so what is about to be saved is never a surprise. */}
                  {bookDraft.courseId && eligibleTeachersForCourse.length > 0 && (
                    <p
                      style={{
                        margin: "0 0 12px 0",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: bookDraft.teacherIds.length > 0 ? "#1f7a4d" : "#8a6d1f",
                      }}
                    >
                      {bookDraft.teacherIds.length === 0
                        ? "None selected - this book will be saved with no teachers."
                        : `${bookDraft.teacherIds.length} of ${
                            eligibleTeachersForCourse.length
                          } selected`}
                    </p>
                  )}
                  {!bookDraft.courseId ? (
                    <div className={styles.empty}>
                      Select a course to see the teachers who can receive this book.
                    </div>
                  ) : orphanedTeacherIds.length > 0 ? (
                    /* Still list the eligible teachers below - this only warns
                       about the hidden ones. */
                    <div className={styles.modalWarning}>
                      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                      <span>
                        {orphanedTeacherIds.length === 1
                          ? "1 assigned teacher can"
                          : `${orphanedTeacherIds.length} assigned teachers can`}{" "}
                        no longer receive this book - they left the course or were
                        archived.{" "}
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() =>
                            setBookDraft((prev) => ({
                              ...prev,
                              teacherIds: prev.teacherIds.filter(
                                (id) => !orphanedTeacherIds.includes(id)
                              ),
                            }))
                          }
                        >
                          Remove them
                        </button>
                      </span>
                    </div>
                  ) : eligibleTeachersForCourse.length === 0 ? (
                    <div className={styles.empty}>
                      No teachers are assigned to this course yet. Assign them under
                      Teacher Courses, or distribute the book later.
                    </div>
                  ) : (
                    <div className={styles.courseCheckboxGrid}>
                      {eligibleTeachersForCourse.map((teacher) => {
                        const teacherId = String(teacher.user_id);
                        const isSelected = bookDraft.teacherIds.includes(teacherId);
                        return (
                          <label
                            key={teacher.user_id}
                            className={`${styles.courseCheck} ${isSelected ? styles.courseCheckActive : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleBookDraftTeacher(teacher.user_id)}
                            />
                            <span>
                              {teacher.first_name} {teacher.last_name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button className={styles.secondaryBtn} type="button" onClick={() => setBookModal(null)}>
                  Cancel
                </button>
                <button className={styles.primary} type="button" onClick={submitBookModal} disabled={bookSaving}>
                  {bookSaving
                    ? "Saving..."
                    : bookModal === "create"
                      ? "Add Book"
                      : bookModal === "edit"
                        ? "Save Changes"
                        : "Save Distribution"}
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        )}
      </main>
    </div>
    </div>
  );
}

// Lazy subcomponent to list archived users
function ArchivedUsers({ onUnarchive, refresh, search = "" }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/admin/users?status=archived`)
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]));
  }, [refresh]);

  const searchTerm = search.trim().toLowerCase();
  const filteredItems = items.filter((user) => {
    if (!searchTerm) return true;
    return [user.first_name, user.last_name, user.email, user.role]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(searchTerm);
  });

  return (
    <ul className={styles.list}>
      {filteredItems.length === 0 && <li className={styles.empty}>No archived users found</li>}
      {filteredItems.map(u => (
        <li key={u.user_id} className={styles.listRow}>
          <span>{u.first_name} {u.last_name} - {u.email} ({u.role})</span>
          <div>
            <button className={styles.approve} onClick={() => onUnarchive(u.user_id)}>Restore</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

import axios from "axios";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import styles from "../assets/AdminDashboard.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { PROFICIENCY_LEVEL_OPTIONS } from "../utils/proficiencyLevels.js";
import { readStoredUser } from "../utils/sessionUser.js";
import Calendar from "./Calendar.jsx"; // admin calendar view
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;
const VERIFICATIONS_PER_PAGE = 10;

const ADMIN_TABS = [
  "calendar",
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

const TEACHER_AI_OPTIONS = {
  specialization: [
    ["speaking and conversation", "Speaking and Conversation", ["Conversational English", "Travel English", "Online English", "OPIc"]],
    ["grammar and writing", "Grammar and Writing", ["Online English", "IELTS", "TOEIC", "Business English"]],
    ["reading and vocabulary", "Reading and Vocabulary", ["IELTS", "TOEIC", "News", "Online English"]],
    ["listening and pronunciation", "Listening and Pronunciation", ["IELTS", "TOEIC", "Conversational English", "OPIc", "Travel English"]],
    ["exam preparation", "Exam Preparation", ["IELTS", "TOEIC", "OPIc"]],
    ["business english", "Business English", ["Business English", "Job Interview", "TOEIC"]],
    ["job interview coaching", "Job Interview Coaching", ["Job Interview", "Business English"]],
    ["news discussion", "News Discussion", ["News", "Conversational English"]],
    ["kids and novice english", "Kids and Novice English", ["Online English"]],
  ],
  teachingStyle: [
    ["", "Select Teaching Style"],
    ["structured", "Structured"],
    ["conversational", "Conversational"],
    ["visual", "Visual"],
    ["interactive", "Interactive"],
    ["independent", "Independent Practice"],
  ],
  personalityStrength: [
    ["", "Select Teacher Strength"],
    ["patient and supportive", "Patient and Supportive"],
    ["energetic and engaging", "Energetic and Engaging"],
    ["calm and encouraging", "Calm and Encouraging"],
    ["strict and focused", "Strict and Focused"],
    ["friendly and confidence-building", "Friendly and Confidence-building"],
  ],
  idealStudentPace: [
    ["", "Select Best Pace"],
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

const VERIFICATION_STATUS_LABELS = {
  all: "All",
  verified: "Verified",
  needs_review: "Needs Review",
  student_confirmed: "Student Confirmed",
  in_progress: "In Progress",
  pending: "Pending",
  missing: "No Log",
};

const verificationStatusStyle = (status) => {
  const palette = {
    verified: { background: "#dcfce7", color: "#166534" },
    needs_review: { background: "#fef3c7", color: "#92400e" },
    student_confirmed: { background: "#dbeafe", color: "#1e40af" },
    in_progress: { background: "#e0f2fe", color: "#075985" },
    pending: { background: "#f3f4f6", color: "#374151" },
    missing: { background: "#fee2e2", color: "#991b1b" },
  };
  return palette[status] || palette.pending;
};

const resolveUploadUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url}`;
};

const getVerificationMissingItems = (row) => {
  const missing = [];
  if (!row.teacher_started_at) missing.push("teacher start");
  if (!row.student_joined_at) missing.push("student attendance");
  if (!row.teacher_ended_at) missing.push("teacher end");
  if (Number(row.duration_minutes || 0) <= 0) missing.push("duration");
  if (!row.summary) missing.push("summary");
  if (!row.proof_url) missing.push("screenshot");
  return missing;
};

export default function AdminDashboard() {
  const { notify } = useNotification() || {};
  const location = useLocation();
  const [active, setActive] = useState("calendar"); // 'calendar' | 'createTeacher' | 'createStudent' | 'archive' | 'requests'
  const [me, setMe] = useState(null);

  useEffect(() => {
    const nextActive = getAdminTabFromSearch(location.search);
    setActive((currentActive) => (currentActive === nextActive ? currentActive : nextActive));
  }, [location.search]);

  // data
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [requests, setRequests] = useState([]); // reschedule requests

  // create-teacher form
  const [tForm, setTForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    country: "",
    birthDate: "",
    specialization: [],
    experienceYears: "",
    teachingStyle: "",
    personalityStrength: "",
    idealStudentPace: "",
    bio: "",
    courseIds: [],
  });
  // create-student form
  const [sForm, setSForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    country: "",
    birthDate: "",
    trialNotes: "",
    level: "",
    teacherId: "",
    courseId: "",
    classesAvailed: "",
    classDuration: "50",
    aiCriteria: {
      learningGoal: [],
      learningStyle: "",
      personality: "",
      focusArea: [],
      pace: "",
    },
  });
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
  const selectedTeacherCourseNames = courses
    .filter((course) => tForm.courseIds.includes(String(course.course_id)))
    .map((course) => course.course_name);
  const teacherSpecializationOptions = TEACHER_AI_OPTIONS.specialization
    .filter((option) => optionAppliesToCourses(option, selectedTeacherCourseNames));
  const selectedStudentCourseNames = courses
    .filter((course) => String(course.course_id) === String(sForm.courseId))
    .map((course) => course.course_name);
  const studentLearningGoalOptions = AI_CRITERIA_OPTIONS.learningGoal
    .filter((option) => optionAppliesToCourses(option, selectedStudentCourseNames));
  const studentFocusAreaOptions = AI_CRITERIA_OPTIONS.focusArea
    .filter((option) => optionAppliesToCourses(option, selectedStudentCourseNames));

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
  }, [active]);

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
      await axios.post(`${API}/api/admin/users`, payload); // creates teacher
      notify("Teacher created successfully!", "success");
      setTForm({
        firstName: "",
        lastName: "",
        email: "",
        country: "",
        birthDate: "",
        specialization: [],
        experienceYears: "",
        teachingStyle: "",
        personalityStrength: "",
        idealStudentPace: "",
        bio: "",
        courseIds: [],
      });
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
      const payload = { ...payloadSource, role: "student", password: "student" };
      await axios.post(`${API}/api/admin/users`, payload); // creates student
      notify("Student created successfully!", "success");
      setSForm({
        firstName: "",
        lastName: "",
        email: "",
        country: "",
        birthDate: "",
        trialNotes: "",
        level: "",
        teacherId: "",
        courseId: "",
        classesAvailed: "",
        classDuration: "50",
        aiCriteria: {
          learningGoal: [],
          learningStyle: "",
          personality: "",
          focusArea: [],
          pace: "",
        },
      });
      setAiRecommendation(null);
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
      } else if (adminConfirm.action === "remove_verification") {
        await removeVerificationRecord(adminConfirm.payload.classId);
      } else if (adminConfirm.action === "clear_verifications") {
        await clearVerificationRecords();
      }
    } finally {
      setAdminConfirm(null);
    }
  }

  function updateAiCriterion(key, value) {
    setSForm((prev) => ({
      ...prev,
      aiCriteria: {
        ...prev.aiCriteria,
        [key]: value,
      },
    }));
    setAiRecommendation(null);
  }

  function toggleAiCriterionValue(key, value) {
    setSForm((prev) => {
      const selected = Array.isArray(prev.aiCriteria[key]) ? prev.aiCriteria[key] : [];
      const exists = selected.includes(value);
      return {
        ...prev,
        aiCriteria: {
          ...prev.aiCriteria,
          [key]: exists ? selected.filter((item) => item !== value) : [...selected, value],
        },
      };
    });
    setAiRecommendation(null);
  }

  function toggleTeacherSpecialization(value) {
    setTForm((prev) => {
      const selected = Array.isArray(prev.specialization) ? prev.specialization : [];
      const exists = selected.includes(value);
      return {
        ...prev,
        specialization: exists ? selected.filter((item) => item !== value) : [...selected, value],
      };
    });
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
        specialization: prev.specialization.filter((value) => {
          const option = TEACHER_AI_OPTIONS.specialization.find(([optionValue]) => optionValue === value);
          return option ? optionAppliesToCourses(option, selectedCourseNames) : false;
        }),
      };
    });
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
    if (!sForm.trialNotes.trim() && !hasCriteria && !sForm.level) {
      notify("Please add trial notes, choose a proficiency level, or choose matching criteria before analyzing.", "error");
      return;
    }

    setAiLoading(true);
    try {
      const r = await axios.post(`${API}/api/admin/recommend-teacher`, {
        trialNotes: sForm.trialNotes,
        criteria: sForm.aiCriteria,
        courseId: sForm.courseId,
        proficiencyLevel: sForm.level,
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
      await axios.delete(`${API}/api/admin/class-verifications`);
      notify("All verification records cleared", "success");
      setVerificationPage(1);
      await loadClassVerifications();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to clear verification records", "error");
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
    missing: verifications.filter((row) => !row.teacher_started_at && row.verification_status === "pending").length,
  };

  const updateStudentCourse = (courseId) => {
    const currentTeacherCanTeach = !sForm.teacherId || !courseId || teacherCourseMap[String(sForm.teacherId)]?.has(String(courseId));
    const selectedCourseNames = courses
      .filter((course) => String(course.course_id) === String(courseId))
      .map((course) => course.course_name);
    const filterValues = (key, options) => {
      const selected = Array.isArray(sForm.aiCriteria[key]) ? sForm.aiCriteria[key] : [];
      return selected.filter((value) => {
        const option = options.find(([optionValue]) => optionValue === value);
        return option ? optionAppliesToCourses(option, selectedCourseNames) : false;
      });
    };

    setSForm({
      ...sForm,
      courseId,
      teacherId: currentTeacherCanTeach ? sForm.teacherId : "",
      aiCriteria: {
        ...sForm.aiCriteria,
        learningGoal: filterValues("learningGoal", AI_CRITERIA_OPTIONS.learningGoal),
        focusArea: filterValues("focusArea", AI_CRITERIA_OPTIONS.focusArea),
      },
    });
    setAiRecommendation(null);
  };

  function handleCreateTeacherSubmit(e) {
    e.preventDefault();
    if (e.currentTarget && !e.currentTarget.reportValidity()) return;
    openAdminConfirm({
      action: "create_teacher",
      title: "Create teacher account?",
      message: "This will create the teacher account with the details you entered.",
      confirmLabel: "Create Teacher",
      tone: "primary",
      payload: { ...tForm },
    });
  }

  function handleCreateStudentSubmit(e) {
    e.preventDefault();
    if (e.currentTarget && !e.currentTarget.reportValidity()) return;
    if (!sForm.courseId) {
      notify("Please select the student's course.", "error");
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
      message: "Are you sure? This removes the verification log and its uploaded screenshot. The scheduled class will stay in the calendar.",
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

  function requestClearVerifications() {
    if (!verifications.length) {
      notify("There are no verification records to clear.", "info");
      return;
    }
    openAdminConfirm({
      action: "clear_verifications",
      title: "Clear all verification records?",
      message: "Are you sure? This removes every verification log and uploaded class screenshot. Scheduled classes will stay in the calendar.",
      confirmLabel: "Clear All",
      tone: "danger",
      payload: {
        count: verifications.length,
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
      return [
        `Name: ${payload.firstName || ""} ${payload.lastName || ""}`.trim(),
        `Course: ${course?.course_name || "Not set"}`,
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
    if (adminConfirm.action === "remove_verification") {
      return [
        `Class: ${payload.className || "-"}`,
        `Teacher: ${payload.teacherName || "-"}`,
        `Student: ${payload.studentName || "-"}`,
        `Schedule: ${payload.schedule || "-"}`,
      ];
    }
    if (adminConfirm.action === "clear_verifications") {
      return [`Records: ${payload.count || 0}`];
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
                  disabled={!verifications.length || verificationsLoading}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className={styles.filterTabs} style={{ marginBottom: 14 }}>
              {["all", "verified", "needs_review", "student_confirmed", "in_progress", "pending", "missing"].map((status) => {
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

            <div className={styles.tableWrap}>
              {verificationsLoading ? (
                <div className={styles.empty}>Loading class verifications...</div>
              ) : verifications.length === 0 ? (
                <div className={styles.empty}>No class verification records found</div>
              ) : filteredVerifications.length === 0 ? (
                <div className={styles.empty}>No class verifications match your search</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Teacher</th>
                      <th>Student</th>
                      <th>Schedule</th>
                      <th>Evidence</th>
                      <th>Status</th>
                      <th>Proof</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedVerifications.map((row) => {
                      const displayStatus = row.teacher_started_at || row.student_joined_at || row.teacher_ended_at
                        ? row.verification_status
                        : "missing";
                      const statusColor = verificationStatusStyle(displayStatus);
                      const teacherName = `${row.teacher_first_name || ""} ${row.teacher_last_name || ""}`.trim() || "Teacher";
                      const studentName = `${row.student_first_name || ""} ${row.student_last_name || ""}`.trim() || "Student";
                      const missingItems = getVerificationMissingItems(row);
                      const hasRequiredEvidence = missingItems.length === 0;

                      return (
                        <tr key={row.class_id}>
                          <td data-label="Class">
                            <div style={{ fontWeight: 800 }}>{row.class_name || "Untitled Class"}</div>
                            <div style={{ fontSize: "0.8em", color: "#667085", marginTop: 3 }}>
                              Class status: {row.class_status || "scheduled"}
                            </div>
                          </td>
                          <td data-label="Teacher">
                            <div style={{ fontWeight: 700 }}>{teacherName}</div>
                            <div style={{ fontSize: "0.8em", color: "#667085", wordBreak: "break-all" }}>{row.teacher_email || ""}</div>
                          </td>
                          <td data-label="Student">
                            <div style={{ fontWeight: 700 }}>{studentName}</div>
                            <div style={{ fontSize: "0.8em", color: "#667085", wordBreak: "break-all" }}>{row.student_email || ""}</div>
                          </td>
                          <td data-label="Schedule">
                            <div style={{ fontWeight: 700 }}>{formatDate(row.scheduled_date)}</div>
                            <div style={{ fontSize: "0.82em", color: "#667085" }}>
                              {formatTime(row.start_time)} - {formatTime(row.end_time)}
                            </div>
                            <div style={{ fontSize: "0.78em", color: "#667085" }}>{row.duration || 0} min class</div>
                          </td>
                          <td data-label="Evidence">
                            <div style={{ display: "grid", gap: 3, fontSize: "0.82em" }}>
                              <span>Start: {formatDateTime(row.teacher_started_at)}</span>
                              <span>Student: {formatDateTime(row.student_joined_at)}</span>
                              <span>End: {formatDateTime(row.teacher_ended_at)}</span>
                              <span>Duration: {Number(row.duration_minutes || 0)} min</span>
                            </div>
                            {row.summary && (
                              <div style={{ marginTop: 8, maxWidth: 260, color: "#475467", fontSize: "0.82em", lineHeight: 1.35 }}>
                                {row.summary}
                              </div>
                            )}
                          </td>
                          <td data-label="Status">
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "5px 9px",
                                borderRadius: 999,
                                background: statusColor.background,
                                color: statusColor.color,
                                fontWeight: 800,
                                fontSize: "0.78em",
                              }}
                            >
                              {VERIFICATION_STATUS_LABELS[displayStatus] || displayStatus}
                            </span>
                            <div style={{ marginTop: 6, fontSize: "0.78em", color: hasRequiredEvidence ? "#166534" : "#92400e" }}>
                              {hasRequiredEvidence ? "Evidence complete" : `Missing: ${missingItems.join(", ")}`}
                            </div>
                          </td>
                          <td data-label="Proof">
                            {row.proof_url ? (
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
                                Open Screenshot
                              </button>
                            ) : (
                              <span style={{ color: "#98a2b3", fontSize: "0.85em" }}>No screenshot</span>
                            )}
                          </td>
                          <td data-label="Action">
                            <button
                              type="button"
                              className={`${styles.dangerBtn} ${styles.tableActionBtn}`}
                              onClick={() => requestRemoveVerification(row)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1em", color: "#333", fontWeight: "600" }}>Courses This Teacher Can Teach</h3>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.9em", color: "#666", lineHeight: "1.5" }}>
                  Students can only be assigned to this teacher for the selected courses.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                  {courses.map((course) => (
                    <label
                      key={course.course_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 12px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        background: tForm.courseIds.includes(String(course.course_id)) ? "#f0fdf4" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={tForm.courseIds.includes(String(course.course_id))}
                        onChange={() => toggleTeacherCourse(course.course_id)}
                        style={{ width: "auto" }}
                      />
                      <span>{course.course_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                  <h3 style={{ margin: "0", fontSize: "1.1em", color: "#333", fontWeight: "600" }}>AI Matching Profile</h3>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.9em", color: "#666", lineHeight: "1.5" }}>
                  These details help the AI match this teacher with students based on the student's trial notes and selected criteria.
                </p>
                <div className={styles.grid2}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Specialization</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px", marginTop: "6px" }}>
                      {teacherSpecializationOptions.length ? teacherSpecializationOptions.map(([value, label]) => (
                        <label
                          key={value}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "9px 10px",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            background: tForm.specialization.includes(value) ? "#f0fdf4" : "#fff",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={tForm.specialization.includes(value)}
                            onChange={() => toggleTeacherSpecialization(value)}
                            style={{ width: "auto" }}
                          />
                          <span>{label}</span>
                        </label>
                      )) : (
                        <p style={{ margin: 0, color: "#777", fontSize: "0.9em" }}>Select at least one course to show matching specializations.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label>Experience Years</label>
                    <input type="number" min="0" value={tForm.experienceYears} onChange={(e)=>setTForm({...tForm, experienceYears:e.target.value})} />
                  </div>
                  <div>
                    <label>Teaching Style</label>
                    <select value={tForm.teachingStyle} onChange={(e)=>setTForm({...tForm, teachingStyle:e.target.value})}>
                      {TEACHER_AI_OPTIONS.teachingStyle.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Teacher Strength</label>
                    <select value={tForm.personalityStrength} onChange={(e)=>setTForm({...tForm, personalityStrength:e.target.value})}>
                      {TEACHER_AI_OPTIONS.personalityStrength.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Best Student Pace</label>
                    <select value={tForm.idealStudentPace} onChange={(e)=>setTForm({...tForm, idealStudentPace:e.target.value})}>
                      {TEACHER_AI_OPTIONS.idealStudentPace.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: "12px" }}>
                  <label>Teacher Bio / Notes</label>
                  <textarea
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
              <button className={styles.primary} disabled={loading}>
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
                  Add trial notes, choose the student's proficiency level, and choose the learning criteria. The AI matcher will prioritize teachers below 2 active students, then choose the least-loaded teacher if everyone already has 2 or more.
                </p>
                <div className={styles.responsiveFormGrid} style={{ marginBottom: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Proficiency Level</label>
                    <select
                      value={sForm.level}
                      onChange={(e)=>setSForm({...sForm, level:e.target.value})}
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
                      <option value="">Select Level</option>
                      {PROFICIENCY_LEVEL_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Learning Goal</label>
                    <div className={styles.choiceGrid}>
                      {studentLearningGoalOptions.length ? studentLearningGoalOptions.map(([value, label]) => (
                        <label
                          key={value}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "9px 10px",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            background: sForm.aiCriteria.learningGoal.includes(value) ? "#f0fdf4" : "#fff",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sForm.aiCriteria.learningGoal.includes(value)}
                            onChange={() => toggleAiCriterionValue("learningGoal", value)}
                            style={{ width: "auto" }}
                          />
                          <span>{label}</span>
                        </label>
                      )) : (
                        <p style={{ margin: 0, color: "#777", fontSize: "0.9em" }}>Select a course to show matching goals.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Learning Style</label>
                    <select value={sForm.aiCriteria.learningStyle} onChange={(e)=>updateAiCriterion("learningStyle", e.target.value)} style={{ width: "100%", padding: "10px", border: "1px solid #d0d0d0", borderRadius: "6px", fontFamily: "inherit", fontSize: "0.9em", background: "#fff" }}>
                      {AI_CRITERIA_OPTIONS.learningStyle.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Student Personality</label>
                    <select value={sForm.aiCriteria.personality} onChange={(e)=>updateAiCriterion("personality", e.target.value)} style={{ width: "100%", padding: "10px", border: "1px solid #d0d0d0", borderRadius: "6px", fontFamily: "inherit", fontSize: "0.9em", background: "#fff" }}>
                      {AI_CRITERIA_OPTIONS.personality.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Focus Area</label>
                    <div className={styles.choiceGrid}>
                      {studentFocusAreaOptions.length ? studentFocusAreaOptions.map(([value, label]) => (
                        <label
                          key={value}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "9px 10px",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            background: sForm.aiCriteria.focusArea.includes(value) ? "#f0fdf4" : "#fff",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sForm.aiCriteria.focusArea.includes(value)}
                            onChange={() => toggleAiCriterionValue("focusArea", value)}
                            style={{ width: "auto" }}
                          />
                          <span>{label}</span>
                        </label>
                      )) : (
                        <p style={{ margin: 0, color: "#777", fontSize: "0.9em" }}>Select a course to show matching focus areas.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Learning Pace</label>
                    <select value={sForm.aiCriteria.pace} onChange={(e)=>updateAiCriterion("pace", e.target.value)} style={{ width: "100%", padding: "10px", border: "1px solid #d0d0d0", borderRadius: "6px", fontFamily: "inherit", fontSize: "0.9em", background: "#fff" }}>
                      {AI_CRITERIA_OPTIONS.pace.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
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
                      onClick={analyzeStudentMatch}
                      disabled={aiLoading}
                      style={{
                        padding: "10px 20px",
                        background: aiLoading ? "#555" : "black",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.95em",
                        fontWeight: "600",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                      onMouseOver={(e) => {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
                      }}
                      onMouseOut={(e) => {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
                      }}
                    >
                      <span style={{ fontSize: "1.1em" }}>🤖</span>
                      {aiLoading ? "Analyzing..." : "Analyze with AI"}
                    </button>
                  </div>
                  {aiRecommendation?.teacher && (
                    <div style={{ marginTop: "12px", padding: "12px", border: "1px solid #e0e0e0", borderRadius: "8px", background: "#fafafa", color: "#333", fontSize: "0.9em" }}>
                      Recommended teacher: <strong>{aiRecommendation.teacher.first_name} {aiRecommendation.teacher.last_name}</strong>
                      <span style={{ color: "#666" }}> ({aiRecommendation.teacher.assigned_student_count} active students)</span>
                      {aiRecommendation.usedLeastLoadedFallback && (
                        <div style={{ marginTop: "6px", color: "#666" }}>
                          All teachers are at 2 or more students, so the least-loaded suitable teacher was selected.
                        </div>
                      )}
                      {aiRecommendation.teacher.reasons?.length > 0 && (
                        <div style={{ marginTop: "6px", color: "#666" }}>
                          Reason: {aiRecommendation.teacher.reasons.join(", ")}
                        </div>
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
            <div className={styles.cardHead}><h2>Archive Accounts</h2></div>
            <div className={styles.searchBar}>
              <input
                type="search"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder="Search by name, email, or role"
                aria-label="Search archive accounts"
              />
            </div>
            <div className={styles.split}>
              <div>
                <h3>Students</h3>
                <ul className={styles.list}>
                  {filteredArchiveStudents.length === 0 && <li className={styles.empty}>No active students found</li>}
                  {filteredArchiveStudents.map(s => (
                    <li key={s.user_id} className={styles.listRow}>
                      <span>{s.first_name} {s.last_name} - {s.email}</span>
                      <div>
                        <button className={styles.warn} onClick={() => requestArchiveUser(s.user_id)}>Archive</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Teachers</h3>
                <ul className={styles.list}>
                  {filteredArchiveTeachers.length === 0 && <li className={styles.empty}>No active teachers found</li>}
                  {filteredArchiveTeachers.map(t => (
                    <li key={t.user_id} className={styles.listRow}>
                      <span>{t.first_name} {t.last_name} - {t.email}</span>
                      <div>
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
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setConfirmDialog(null)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "8px",
                padding: "24px",
                maxWidth: "400px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1em" }}>
                {confirmDialog.status === "approved" ? "Approve Request?" : "Decline Request?"}
              </h3>
              <p style={{ margin: "0 0 24px 0", color: "#666", lineHeight: "1.6" }}>
                {confirmDialog.status === "approved"
                  ? "Are you sure you want to approve this reschedule request? The student will be notified."
                  : "Are you sure you want to decline this reschedule request? The student will be notified and may submit a new request."}
              </p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setConfirmDialog(null)}
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.9em",
                    fontWeight: "600",
                    border: "1px solid #d0d0d0",
                    background: "#fff",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateRequest(confirmDialog.id, confirmDialog.status)}
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.9em",
                    fontWeight: "600",
                    border: "none",
                    background: confirmDialog.status === "approved" ? "#28a745" : "#dc3545",
                    color: "#fff",
                    borderRadius: "6px",
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
              background: "rgba(15, 23, 42, 0.68)",
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
                borderRadius: 12,
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
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
                <img
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
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "8px",
                padding: "24px",
                maxWidth: "400px",
                width: "100%",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1em" }}>
                {deleteConfirm.title}
              </h3>
              <p style={{ margin: "0 0 24px 0", color: "#666", lineHeight: "1.6" }}>
                {deleteConfirm.message}
              </p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.9em",
                    fontWeight: "600",
                    border: "1px solid #d0d0d0",
                    background: "#fff",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteRequests}
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.9em",
                    fontWeight: "600",
                    border: "none",
                    background: "#dc3545",
                    color: "#fff",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  {deleteConfirm.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
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
                borderRadius: "8px",
                padding: "24px",
                maxWidth: "460px",
                width: "100%",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1em" }}>
                {adminConfirm.title}
              </h3>
              <p style={{ margin: "0 0 16px 0", color: "#666", lineHeight: "1.6" }}>
                {adminConfirm.message}
              </p>
              {adminConfirmLines.length > 0 && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", padding: 12, marginBottom: 20 }}>
                  {adminConfirmLines.map((line) => (
                    <div key={line} style={{ fontSize: "0.9em", color: "#374151", marginBottom: 6, wordBreak: "break-word" }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={closeAdminConfirm}
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.9em",
                    fontWeight: "600",
                    border: "1px solid #d0d0d0",
                    background: "#fff",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={executeAdminConfirm}
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.9em",
                    fontWeight: "600",
                    border: "none",
                    background: adminConfirm.tone === "danger" ? "#dc3545" : "#0f0f0f",
                    color: "#fff",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  {adminConfirm.confirmLabel || "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
        {active === "calendar" && (
          <section className={styles.card}>
            <div className={styles.cardHead}><h2>Scheduled Classes</h2></div>
            <Calendar />
          </section>
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

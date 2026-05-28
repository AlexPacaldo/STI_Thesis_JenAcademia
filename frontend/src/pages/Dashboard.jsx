import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import styles from "../assets/Dashboard.module.css";
import {
  DEFAULT_TIMEZONE,
  convertDateTime,
  formatDateInTimezone,
  getUserTimezone,
  humanTime as formatHumanTime,
} from "../utils/timezone.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { formatProficiencyLevel } from "../utils/proficiencyLevels.js";

const API = "http://localhost:3001";

function getCurrentUser() {
  return readStoredUser() || {};
}

function getTodayDate() {
  const user = getCurrentUser();
  return formatDateInTimezone(new Date(), getUserTimezone(user));
}

function formatClassTime(cls, viewerTimezone) {
  const sourceTimezone = cls.teacher_timezone || DEFAULT_TIMEZONE;
  const start = convertDateTime(cls.scheduled_date, cls.start_time, sourceTimezone, viewerTimezone);
  const end = convertDateTime(cls.scheduled_date, cls.end_time, sourceTimezone, viewerTimezone);
  return `${formatHumanTime(start.time)} - ${formatHumanTime(end.time)}`;
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getAssignmentText(assignment) {
  return assignment.instructions || assignment.description || assignment.name || "Assignment";
}

function isOpenAssignment(assignment) {
  return !assignment.submissionId && assignment.status !== "submitted";
}

function getDisplayName(user) {
  return (
    `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim() ||
    user.name ||
    user.fullName ||
    "You"
  );
}

function getTeacherName(teacher) {
  if (!teacher) return "Teacher";
  return (
    `${teacher.first_name || teacher.firstName || ""} ${teacher.last_name || teacher.lastName || ""}`.trim() ||
    teacher.name ||
    teacher.fullName ||
    "Teacher"
  );
}

function getCourseName(courseMap, courseId) {
  if (!courseId) return "";
  return courseMap.get(String(courseId)) || "";
}

function DashboardIcon({ name }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <path d="M3 9h18" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...common}>
        <path d="M16 11a4 4 0 1 0-8 0" />
        <path d="M4 20c0-3 3-5 8-5s8 2 8 5" />
        <circle cx="12" cy="8" r="3" />
      </svg>
    );
  }

  if (name === "file") {
    return (
      <svg {...common}>
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
        <path d="M14 2v5h5" />
        <path d="M8 13h8" />
        <path d="M8 17h8" />
      </svg>
    );
  }

  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 0 4 22z" />
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
      </svg>
    );
  }

  if (name === "note") {
    return (
      <svg {...common}>
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </svg>
    );
  }

  return null;
}

export default function Dashboard({ mode }) {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const isTeacher = mode === "teacher";
  const viewerTimezone = getUserTimezone(user);
  const currentUserId = user.id ?? user.user_id ?? null;
  const displayName = getDisplayName(user);
  const todayLabel = useMemo(() => new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courseMap, setCourseMap] = useState(new Map());
  const [teacherData, setTeacherData] = useState({
    classesToday: [],
    students: [],
    assignments: [],
    submissions: [],
    books: [],
  });
  const [studentData, setStudentData] = useState({
    classesToday: [],
    remarks: [],
    assignments: [],
    books: [],
    package: null,
    lessonProgress: [],
    assignedTeacher: null,
    teachers: [],
  });

  useEffect(() => {
    const currentUser = readStoredUser();
    if (!currentUser) {
      navigate("/");
      return;
    }
    if (!currentUser.profileCompleted) {
      navigate("/account");
    }
  }, [navigate]);

  useEffect(() => {
    if (!currentUserId) return;

    let ignore = false;

    const loadDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        const coursesPromise = axios.get(`${API}/api/courses`).catch(() => null);

        if (isTeacher) {
          const [classesRes, studentsRes, assignmentsRes, submissionsRes, booksRes, coursesRes] = await Promise.all([
            axios.get(`${API}/api/calendar/classes-by-date`, {
              params: {
                teacher_id: currentUserId,
                scheduled_date: getTodayDate(),
              },
            }),
            axios.get(`${API}/api/teacher/${currentUserId}/students`),
            axios.get(`${API}/api/teacher/${currentUserId}/assignments`),
            axios.get(`${API}/api/teacher/${currentUserId}/submissions`),
            axios.get(`${API}/api/books`, { params: { teacher_id: currentUserId } }),
            coursesPromise,
          ]);

          if (ignore) return;

          const courses = coursesRes?.data?.courses || [];
          const nextCourseMap = new Map(courses.map((course) => [String(course.course_id), course.course_name]));
          setCourseMap(nextCourseMap);

          setTeacherData({
            classesToday: (classesRes.data.classes || []).map((cls) => ({
              id: cls.class_id || cls.id,
              student: cls.student_name
                ? `${cls.student_name} ${cls.student_last_name || ""}`.trim()
                : cls.studentName || "Student",
              subject: cls.class_name || cls.className || "Class",
              time: formatClassTime(cls, viewerTimezone),
              scheduledDate: cls.scheduled_date || null,
              raw: cls,
            })),
            students: studentsRes.data.students || [],
            assignments: assignmentsRes.data.assignments || [],
            submissions: submissionsRes.data.submissions || [],
            books: booksRes.data.books || [],
          });
        } else {
          const [classesRes, remarksRes, assignmentsRes, booksRes, progressRes, packageRes, assignedTeacherRes, teachersRes, coursesRes] =
            await Promise.all([
              axios.get(`${API}/api/calendar/classes-by-date`, {
                params: {
                  student_id: currentUserId,
                  scheduled_date: getTodayDate(),
                },
              }),
              axios.get(`${API}/api/student/${currentUserId}/remarks`),
              axios.get(`${API}/api/student/${currentUserId}/assignments`),
              axios.get(`${API}/api/books`, { params: { student_id: currentUserId } }),
              axios.get(`${API}/api/lesson-progress`, { params: { student_id: currentUserId } }),
              axios.get(`${API}/api/calendar/student-package/${currentUserId}`).catch(() => null),
              axios.get(`${API}/api/student/assigned-teacher/${currentUserId}`).catch(() => null),
              axios.get(`${API}/api/admin/users?role=teacher&status=active`).catch(() => null),
              coursesPromise,
            ]);

          if (ignore) return;

          const teachers = teachersRes?.data || [];
          const courses = coursesRes?.data?.courses || [];
          const nextCourseMap = new Map(courses.map((course) => [String(course.course_id), course.course_name]));
          setCourseMap(nextCourseMap);

          const packageData = packageRes?.data?.package || null;
          const assignedTeacherId = assignedTeacherRes?.data?.assigned_teacher_id || null;
          const assignedTeacher =
            teachers.find((teacher) => String(teacher.user_id ?? teacher.id) === String(assignedTeacherId)) || null;

          setStudentData({
            classesToday: (classesRes.data.classes || []).map((cls) => ({
              id: cls.class_id || cls.id,
              title: cls.class_name || cls.className || cls.subject || "Class",
              teacher: cls.teacher_name ? `${cls.teacher_name} ${cls.teacher_last_name || ""}`.trim() : cls.teacherName || "Teacher",
              time: formatClassTime(cls, viewerTimezone),
              scheduledDate: cls.scheduled_date || cls.date || null,
              raw: cls,
            })),
            remarks: remarksRes.data.remarks || [],
            assignments: assignmentsRes.data.assignments || [],
            books: booksRes.data.books || [],
            package: packageData,
            lessonProgress: progressRes.data.progress || [],
            assignedTeacher,
            teachers,
          });
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
        if (!ignore) {
          setError("Could not load dashboard data.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      ignore = true;
    };
  }, [currentUserId, isTeacher, viewerTimezone]);

  const stats = useMemo(() => {
    if (isTeacher) {
      return [
        { label: "Classes Today", value: String(teacherData.classesToday.length), hint: "Scheduled sessions", icon: "calendar" },
        { label: "Students", value: String(teacherData.students.length), hint: "Active learners", icon: "users" },
        { label: "Submissions", value: String(teacherData.submissions.length), hint: "Submitted work", icon: "file" },
      ];
    }

    const openAssignments = studentData.assignments.filter(isOpenAssignment);
    return [
      { label: "Classes Left", value: String(studentData.package?.classes_left ?? 0), hint: "Current package", icon: "book" },
      { label: "Open Assignments", value: String(openAssignments.length), hint: "Waiting on you", icon: "file" },
      { label: "Books", value: String(studentData.books.length), hint: "Available lessons", icon: "book" },
    ];
  }, [isTeacher, studentData, teacherData]);

  const teacherSections = useMemo(() => {
    const recentStudents = [...teacherData.students]
      .slice(0, 3)
      .map((student) => ({
        id: student.user_id || student.id,
        primary: `${student.first_name || student.firstName || ""} ${student.last_name || student.lastName || ""}`.trim() || "Student",
        secondary: `${formatProficiencyLevel(student.proficiency_level)}${student.course_id ? ` • ${getCourseName(courseMap, student.course_id) || `Course ${student.course_id}`}` : ""}`,
        meta: student.email || "",
      }));

    const recentSubmissions = [...teacherData.submissions]
      .slice(0, 3)
      .map((submission) => ({
        id: submission.submissionId || submission.id,
        primary: submission.assignmentName || "Assignment",
        secondary: submission.student || "Student",
        meta: `${submission.status || "Submitted"} • ${formatDate(submission.submittedAt)}`,
      }));

    return [
      {
        title: "Today's Classes",
        meta: `${teacherData.classesToday.length} scheduled`,
        empty: "No classes scheduled for today.",
        rows: teacherData.classesToday.slice(0, 3).map((cls) => ({
          id: cls.id,
          to: "/Calendar",
          primary: cls.student,
          secondary: cls.subject,
          meta: cls.time,
        })),
        actionLabel: "Open calendar",
        actionTo: "/Calendar",
      },
      {
        title: "Assigned Students",
        meta: `${teacherData.students.length} learners`,
        empty: "No assigned students yet.",
        rows: recentStudents,
        actionLabel: "View assignments",
        actionTo: "/teacherAssignment",
      },
      {
        title: "Recent Submissions",
        meta: `${teacherData.submissions.length} total`,
        empty: "No submissions yet.",
        rows: recentSubmissions,
        actionLabel: "Review submissions",
        actionTo: "/teacherAssignment",
      },
    ];
  }, [courseMap, teacherData]);

  const studentSections = useMemo(() => {
    const openAssignments = studentData.assignments.filter(isOpenAssignment);
    const remarks = [...studentData.remarks].slice(0, 3);
    const bookRows = [...studentData.books].slice(0, 3).map((book) => ({
      id: book.book_id,
      to: `/booksContent/${book.book_id}`,
      primary: book.title || "Book",
      secondary: book.author || book.teacher_name || "Your teacher",
      meta: `${book.lesson_count || 0} lessons`,
    }));

    return [
      {
        title: "Today's Classes",
        meta: `${studentData.classesToday.length} scheduled`,
        empty: "No classes scheduled for today.",
        rows: studentData.classesToday.slice(0, 3).map((cls) => ({
          id: cls.id,
          to: "/Calendar",
          primary: cls.title,
          secondary: cls.teacher,
          meta: cls.time,
        })),
        actionLabel: "Open calendar",
        actionTo: "/Calendar",
      },
      {
        title: "Open Assignments",
        meta: `${openAssignments.length} waiting`,
        empty: "No open assignments right now.",
        rows: openAssignments.slice(0, 3).map((assignment) => ({
          id: assignment.id,
          to: `/assignmentsDropbox?assignmentId=${assignment.id}`,
          primary: getAssignmentText(assignment),
          secondary: assignment.subject || "Assignment",
          meta: assignment.dueDate ? `Due ${formatDate(assignment.dueDate)}` : "No due date",
        })),
        actionLabel: "Open assignments",
        actionTo: "/assignments",
      },
      {
        title: "Latest Remarks",
        meta: `${studentData.remarks.length} remarks`,
        empty: "No remarks yet.",
        rows: remarks.map((remark) => ({
          id: remark.remark_id,
          to: "/remarks",
          primary: remark.remarks || "Teacher remark",
          secondary: remark.class_name || remark.teacher_name || "Remark",
          meta: formatDate(remark.created_at || remark.scheduled_date),
        })),
        actionLabel: "View remarks",
        actionTo: "/remarks",
      },
    ];
  }, [studentData]);

  const sections = isTeacher ? teacherSections : studentSections;

  const heroActions = isTeacher ? (
    <Link to="/Calendar" className={styles.heroButton}>View Calendar</Link>
  ) : (
    null
  );

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>{isTeacher ? "Teacher Dashboard" : "Student Dashboard"}</p>
            <h1><b>{isTeacher ? `Welcome back, ${displayName}` : `Your day at a glance, ${displayName}`}</b></h1>
            <p>
              {isTeacher
                ? "Keep your classes, students, submissions, and lesson materials moving in one place."
                : "Track classes, assignments, remarks, and lesson progress without digging around the app."}
            </p>
            {heroActions ? <div className={styles.heroActions}>{heroActions}</div> : null}
          </div>

          <div className={styles.heroAside}>
            <div className={styles.heroDate}>
              <DashboardIcon name="calendar" />
              <span>{todayLabel}</span>
            </div>
          </div>
        </header>

        <section className={styles.statsGrid}>
          {stats.map((stat) => (
            <article key={stat.label} className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles[`statIcon${stat.icon}`]}`}>
                <DashboardIcon name={stat.icon} />
              </div>
              <div className={styles.statCopy}>
              <span className={styles.statLabel}><b>{stat.label}</b></span>
              <strong className={styles.statValue}>{stat.value}</strong>
              <span className={styles.statHint}>{stat.hint}</span>
              </div>
            </article>
          ))}
        </section>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        <section className={styles.panelGrid}>
          {sections.map((section) => (
            <article
              key={section.title}
              className={styles.panel}
            >
              <div className={styles.panelHeader}>
                <div className={styles.panelHeading}>
                  <span className={styles.panelIcon}>
                    <strong><DashboardIcon name={section.title === "Today's Classes" ? "calendar" : section.title === "Assigned Students" ? "users" : section.title === "Recent Submissions" || section.title === "Open Assignments" ? "file" : section.title === "Latest Remarks" ? "note" : "book"} /></strong>
                  </span>
                  <div>
                    <h2>{section.title}</h2>
                    <p>{section.meta}</p>
                  </div>
                </div>
                {section.actionTo ? (
                  <Link to={section.actionTo} className={styles.panelAction}>
                    {section.actionLabel}
                  </Link>
                ) : null}
              </div>

              <div className={styles.list}>
                {loading ? (
                  <div className={styles.emptyState}>Loading dashboard data...</div>
                ) : section.rows.length ? (
                  section.rows.map((row) => {
                    const content = (
                      <>
                        <div className={styles.itemMain}>
                          <div className={styles.itemTitle}>{row.primary}</div>
                          <div className={styles.itemSub}>{row.secondary}</div>
                        </div>
                        <div className={styles.itemMeta}>{row.meta}</div>
                      </>
                    );

                    return row.to ? (
                      <Link key={row.id} to={row.to} className={styles.itemRow}>
                        {content}
                      </Link>
                    ) : (
                      <div key={row.id} className={styles.itemRow}>
                        {content}
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyState}>{section.empty}</div>
                )}
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

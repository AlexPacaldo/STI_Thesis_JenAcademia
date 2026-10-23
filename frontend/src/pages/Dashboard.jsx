import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import styles from "../assets/Dashboard.module.css";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";
import FirstStepsGuide from "../components/FirstStepsGuide.jsx";

const API = API_BASE_URL;

function getCurrentUser() {
  return readStoredUser() || {};
}

function getDisplayName(user) {
  return (
    `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim() ||
    user.name ||
    user.fullName ||
    "Friend"
  );
}

export default function Dashboard({ mode }) {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const isTeacher = mode === "teacher";
  const currentUserId = user.id ?? user.user_id ?? null;
  const displayName = getDisplayName(user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [teacherData, setTeacherData] = useState({
    classesToday: [],
    students: [],
    assignments: [],
    submissions: [],
    books: [],
  });
  const [studentData, setStudentData] = useState({
    classesToday: [],
    assignments: [],
    remarks: [],
    package: null,
    latest_package: null,
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
        let dashboard = {};
        try {
          const dashboardRes = await axios.get(`${API}/api/dashboard/${isTeacher ? "teacher" : "student"}/${currentUserId}`);
          dashboard = dashboardRes.data || {};
        } catch (dashboardErr) {
          console.warn("Fast dashboard endpoint unavailable; using legacy dashboard requests.", dashboardErr);

          const safeGet = (url, config) =>
            axios.get(url, config).catch((err) => {
              console.warn(`Dashboard fallback request failed: ${url}`, err);
              return { data: {} };
            });
          const coursesPromise = safeGet(`${API}/api/courses`);

          if (isTeacher) {
            const [classesRes, studentsRes, assignmentsRes, submissionsRes, booksRes, coursesRes] = await Promise.all([
              safeGet(`${API}/api/calendar/classes-by-date`, {
                params: { teacher_id: currentUserId },
              }),
              safeGet(`${API}/api/teacher/${currentUserId}/students`),
              safeGet(`${API}/api/teacher/${currentUserId}/assignments`),
              safeGet(`${API}/api/teacher/${currentUserId}/submissions`),
              safeGet(`${API}/api/books`, { params: { teacher_id: currentUserId } }),
              coursesPromise,
            ]);

            dashboard = {
              classes: classesRes.data?.classes || [],
              students: studentsRes.data?.students || [],
              assignments: assignmentsRes.data?.assignments || [],
              submissions: submissionsRes.data?.submissions || [],
              books: booksRes.data?.books || [],
              courses: coursesRes?.data?.courses || [],
            };
          } else {
            const [classesRes, booksRes, progressRes, packageRes, assignedTeacherRes, teachersRes, coursesRes,
              assignmentsRes, remarksRes] =
              await Promise.all([
                safeGet(`${API}/api/calendar/classes-by-date`, {
                  params: { student_id: currentUserId },
                }),
                safeGet(`${API}/api/books`, { params: { student_id: currentUserId } }),
                safeGet(`${API}/api/lesson-progress`, { params: { student_id: currentUserId } }),
                safeGet(`${API}/api/calendar/student-package/${currentUserId}`),
                safeGet(`${API}/api/student/assigned-teacher/${currentUserId}`),
                safeGet(`${API}/api/admin/users?role=teacher&status=active`),
                coursesPromise,
                safeGet(`${API}/api/student/${currentUserId}/assignments`),
                safeGet(`${API}/api/student/${currentUserId}/remarks`),
              ]);

            const teachers = Array.isArray(teachersRes?.data) ? teachersRes.data : [];
            const assignedTeacherId = assignedTeacherRes?.data?.assigned_teacher_id || null;
            const assignedTeacher =
              teachers.find((teacher) => String(teacher.user_id ?? teacher.id) === String(assignedTeacherId)) || null;

            dashboard = {
              classes: classesRes.data?.classes || [],
              books: booksRes.data?.books || [],
              progress: progressRes.data?.progress || [],
              package: packageRes?.data?.package || null,
              assignedTeacher,
              courses: coursesRes?.data?.courses || [],
              assignments: assignmentsRes.data?.assignments || [],
              remarks: remarksRes.data?.remarks || [],
            };
          }
        }

        if (isTeacher) {
          if (ignore) return;
          setTeacherData({
            classesToday: (dashboard.classes || []).map((cls) => ({
              id: cls.class_id || cls.id,
              student: cls.student_name
                ? `${cls.student_name} ${cls.student_last_name || ""}`.trim()
                : cls.studentName || "Student",
              subject: cls.class_name || cls.className || "Class",
            })),
            students: dashboard.students || [],
            assignments: dashboard.assignments || [],
            submissions: dashboard.submissions || [],
            books: dashboard.books || [],
          });
        } else {
          if (ignore) return;
          setStudentData({
            classesToday: (dashboard.classes || []).map((cls) => ({
              id: cls.class_id || cls.id,
              title: cls.class_name || cls.className || cls.subject || "Class",
              teacher: cls.teacher_name ? `${cls.teacher_name} ${cls.teacher_last_name || ""}`.trim() : cls.teacherName || "Teacher",
            })),
            books: dashboard.books || [],
            assignments: dashboard.assignments || [],
            remarks: dashboard.remarks || [],
            package: dashboard.package || null,
            latest_package: dashboard.latest_package || null,
            assignedTeacher: dashboard.assignedTeacher || null,
            teachers: dashboard.assignedTeacher ? [dashboard.assignedTeacher] : [],
          });
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
        if (!ignore) {
          setError("Could not load your classes.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      ignore = true;
    };
  }, [currentUserId, isTeacher]);

  const classesLeft = studentData.package?.classes_left ?? 0;
  const readyToBook =
    studentData.package?.bookable_classes != null
      ? Number(studentData.package.bookable_classes || 0)
      : (studentData.package?.classes_left ?? 0) - (studentData.package?.classes_used ?? 0);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        {/* Big, simple greeting */}
        <header className={styles.hero}>
          <p className={styles.kicker}>Hi, {displayName}</p>
          <h1>
            {isTeacher ? "Time to teach" : "Time for class"}
          </h1>
        </header>
        {user.profileCompleted ? <FirstStepsGuide /> : null}

        {/* Error banner */}
        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        {/* Loading state */}
        {loading ? (
          <div className={styles.loadingCard}>
            <span className={styles.loadingText}>Loading...</span>
          </div>
        ) : (
          <>
            {/* The one big number: classes left */}
            {!isTeacher && (
              <article className={styles.counterCard}>
                <span className={styles.counterLabel}>Classes left</span>
                <span className={styles.counterNumber}>{classesLeft}</span>
                {readyToBook > 0 ? (
                  <span className={styles.counterReady}>Ready to book: {readyToBook}</span>
                ) : (
                  <span className={styles.counterZero}>No classes left. Ask your teacher for more.</span>
                )}
              </article>
            )}

            {/* The one big action: book a class */}
            {!isTeacher && (
              <Link to="/Calendar" className={styles.bookButton}>
                <span className={styles.bookIcon} aria-hidden="true">&#128197;</span>
                Book a class
              </Link>
            )}

            {/* Today's classes - simple big cards */}
            <section className={styles.classesSection}>
              <h2 className={styles.sectionTitle}>
                {isTeacher ? "Classes today" : "My classes today"}
              </h2>
              {loading ? null : (() => {
                const classes = isTeacher ? teacherData.classesToday : studentData.classesToday;
                if (classes.length === 0) {
                  return (
                    <div className={styles.emptyCard}>
                      <span className={styles.emptyIcon} aria-hidden="true">&#128198;</span>
                      <p className={styles.emptyText}>
                        {isTeacher ? "No classes today." : "No classes today. Press the green button above to book one."}
                      </p>
                    </div>
                  );
                }
                return classes.map((cls) => (
                  <Link
                    key={cls.id}
                    to="/Calendar"
                    className={styles.classCard}
                  >
                    <div className={styles.classInfo}>
                      <span className={styles.classTitle}>{cls.student || cls.title}</span>
                      <span className={styles.classSubtitle}>
                        {isTeacher ? cls.subject : cls.teacher}
                      </span>
                    </div>
                    <span className={styles.classArrow} aria-hidden="true">&#9654;</span>
                  </Link>
                ));
              })()}
            </section>

            {/* My assignments - simple big cards */}
            {!isTeacher && (
              <section className={styles.classesSection}>
                <h2 className={styles.sectionTitle}>My assignments</h2>
                {studentData.assignments.filter((a) => !a.submissionId && a.status !== "submitted").length === 0 ? (
                  <div className={styles.emptyCard}>
                    <span className={styles.emptyIcon} aria-hidden="true">&#128196;</span>
                    <p className={styles.emptyText}>No assignments waiting for you.</p>
                  </div>
                ) : (
                  studentData.assignments.filter((a) => !a.submissionId && a.status !== "submitted").map((assignment) => (
                    <Link
                      key={assignment.id}
                      to={`/assignmentsDropbox?assignmentId=${assignment.id}`}
                      className={styles.classCard}
                    >
                      <div className={styles.classInfo}>
                        <span className={styles.classTitle}>
                          {assignment.instructions || assignment.description || assignment.name || "Assignment"}
                        </span>
                        <span className={styles.classSubtitle}>
                          {assignment.subject || "Assignment"}
                        </span>
                      </div>
                      <span className={styles.classArrow} aria-hidden="true">&#9654;</span>
                    </Link>
                  ))
                )}
              </section>
            )}

            {/* My remarks - simple big cards */}
            {!isTeacher && (
              <section className={styles.classesSection}>
                <h2 className={styles.sectionTitle}>My remarks</h2>
                {studentData.remarks.length === 0 ? (
                  <div className={styles.emptyCard}>
                    <span className={styles.emptyIcon} aria-hidden="true">&#128172;</span>
                    <p className={styles.emptyText}>No remarks yet.</p>
                  </div>
                ) : (
                  studentData.remarks.map((remark) => (
                    <Link
                      key={remark.remark_id}
                      to="/remarks"
                      className={styles.classCard}
                    >
                      <div className={styles.classInfo}>
                        <span className={styles.classTitle}>
                          {remark.remarks || "Teacher remark"}
                        </span>
                        <span className={styles.classSubtitle}>
                          {remark.class_name || remark.teacher_name || "Remark"}
                        </span>
                      </div>
                      <span className={styles.classArrow} aria-hidden="true">&#9654;</span>
                    </Link>
                  ))
                )}
              </section>
            )}

            {/* Teacher quick actions */}
            {isTeacher && (
              <section className={styles.actionsSection}>
                <Link to="/Calendar" className={styles.actionButton}>
                  <span className={styles.actionIcon} aria-hidden="true">&#128197;</span>
                  Open calendar
                </Link>
                <Link to="/teacherStudents" className={styles.actionButton}>
                  <span className={styles.actionIcon} aria-hidden="true">&#128100;</span>
                  My students
                </Link>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

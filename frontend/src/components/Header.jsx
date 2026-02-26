import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "../assets/header.module.css";
import pfp from "../assets/img/Navbar/user.jpg";

function Header() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // ✅ Track if user is student or teacher

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsedUser = JSON.parse(stored);
        setUser(parsedUser);
        setRole(parsedUser.role); // fallback role
      }
    } catch (e) {
      console.warn("Failed to read user from localStorage:", e);
    }
  }, []);


  // ✅ Current page routes (you already have these)
  const path = location.pathname;

  const isAccountPage = path === "/account";
  const isReschedulePage = path.startsWith("/reschedule");
  const isAllClassesPage = path === "/allClasses";
  const isCallPage = path.startsWith("/call");

  const isAdminDashboardPage = path === "/AdminDashboard";

  const isStudentDashboardPage = path === "/StudentDashboard";
  const isAssignmentsDropbox = path === "/assignmentsDropbox";
  const isAssignmentsPage = path === "/assignments";
  const isRemarksPage = path === "/remarks";
  const isBooksLessonsPage = path === "/booksLessons";
  const isBooksContentPage = path === "/booksContent";

  const isTeacherDashboardPage = path === "/TeacherDashboard";
  const isPassRemarksPage = path === "/PassRemarks";
  const isTeacherAssignmentPage = path === "/teacherAssignment";
  const isTeacherBooksLessonsPage = path === "/teacherBooksLessons";
  const isTeacherBooksDropboxPage = path === "/teacherBooksDropbox";
  const isCalendarPage = path === "/Calendar";


    if (isCallPage) {
    return (
      <header className={styles.header}>
        <div className={styles.headerContainer}>
          <div className={styles.brandName}>
            <i>JEN ACADEMIA</i>
          </div>
        </div>
      </header>
    );
  }

  // ✅ Keep your current `isStudentArea`
  const isStudentArea =
    isReschedulePage ||
    isStudentDashboardPage ||
    isAllClassesPage ||
    isAccountPage ||
    isAssignmentsDropbox ||
    isAssignmentsPage ||
    isRemarksPage ||
    isBooksLessonsPage ||
    isCalendarPage||
    isBooksContentPage;

  const isTeacherArea =
    isReschedulePage ||
    isTeacherDashboardPage ||
    isAllClassesPage ||
    isAccountPage ||
    isCalendarPage ||
    isPassRemarksPage ||
    isTeacherAssignmentPage ||
    isTeacherBooksLessonsPage ||
    isBooksContentPage||
    isTeacherBooksDropboxPage;

  const isAdminArea =
    isAccountPage ||
    isAdminDashboardPage;



  return (
    <header className={styles.header}>
      <div className={styles.headerContainer}>
        

        {role === "student" && isStudentArea && (
          <>
            <Link to="/StudentDashboard" className={styles.brandName}><i>JEN ACADEMIA</i></Link>
          </>
        )}
        {role === "teacher" && isTeacherArea && (
          <>
            <Link to="/TeacherDashboard" className={styles.brandName}><i>JEN ACADEMIA</i></Link>
          </>
        )}
        {role === "admin" && isAdminArea && (
          <>
            <Link to="/AdminDashboard" className={styles.brandName}><i>JEN ACADEMIA</i></Link>
          </>
        )}
        {!user && (
          <Link to="/" className={styles.brandName}>
            <i>JEN ACADEMIA</i>
          </Link>
        )}

        
        <nav className={styles.navbar}>
          {/* 🧩 STUDENT NAVIGATION */}
          {role === "student" && isStudentArea && (
            <>
              <Link to="/Calendar" className={styles.schedulenav}>Calendar</Link>
              <Link to="/assignments">Assignments</Link>
              <Link to="/remarks">Remarks</Link>
              <Link to="/booksLessons">Books / Lessons</Link>

              <Link to="/account" className={styles.StudentAccount}>
                <img
                  src={pfp}
                  alt="Profile"
                  className={styles.profilePic}
                />
                <div className={styles.account}>
                  <i>{`${user?.firstName || ""} ${user?.lastName || ""}`}</i>
                </div>
              </Link>

             
            </>
          )}

          {/* 🧩 TEACHER NAVIGATION */}
          {role === "teacher" && isTeacherArea && (
            <>
              <Link to="/Calendar">Calendar</Link>
              <Link to="/PassRemarks">Remarks</Link>
              <Link to="/teacherAssignment">Assignments</Link>
              <Link to="/teacherBooksLessons">Books / Lessons</Link>

              <Link to="/account" className={styles.TeacherAccount}>
                <img
                  src={pfp}
                  alt="Profile"
                  className={styles.profilePic}
                />
                <div className={styles.account}>
                  <i>{`${user?.firstName || ""} ${user?.lastName || ""}`}</i>
                </div>
              </Link>

              
            </>
          )}

          {role === "admin" && isAdminArea && (
            <>

              <Link to="/account" className={styles.TeacherAccount}>
                <img
                  src={pfp}
                  alt="Profile"
                  className={styles.profilePic}
                />
                <div className={styles.account}>
                  <i>{`${user?.firstName || ""} ${user?.lastName || ""}`}</i>
                </div>
              </Link>

              
            </>
          )}

          {/* 🧩 GUEST (not logged in) */}
          {!user && (
            <>
              <Link to="/login" className={styles.btn}>Log in</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Header;

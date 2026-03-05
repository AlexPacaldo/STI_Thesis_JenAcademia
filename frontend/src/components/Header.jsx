import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import styles from "../assets/header.module.css";
import pfp from "../assets/img/Navbar/user.jpg";
import NotificationPanel from "./NotificationPanel";

const API = "http://localhost:3001";

function Header() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsedUser = JSON.parse(stored);
        setUser(parsedUser);
        setRole(parsedUser.role);
      }
    } catch (e) {
      console.warn("Failed to read user from localStorage:", e);
    }
  }, []);

  // Fetch unread notification count
  useEffect(() => {
    if (user?.id && (role === "student" || role === "teacher")) {
      fetchUnreadCount();
      // Poll for new notifications every 30 seconds
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.id, role]);

  const fetchUnreadCount = async () => {
    try {
      const response = await axios.get(`${API}/api/notifications/unread/${user.id}`);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (err) {
      console.error("Error fetching unread count:", err);
    }
  };

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
    isCalendarPage ||
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
    isBooksContentPage ||
    isTeacherBooksDropboxPage;

  const isAdminArea =
    isAccountPage ||
    isAdminDashboardPage;

  return (
    <>
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

              {/* Notification Bell */}
              <button
                className={styles.notificationBell}
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                title="Reschedule Requests"
              >
                🔔
                {unreadCount > 0 && (
                  <span className={styles.badge}>{unreadCount}</span>
                )}
              </button>

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

              {/* Notification Bell */}
              <button
                className={styles.notificationBell}
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                title="Reschedule Requests"
              >
                🔔
                {unreadCount > 0 && (
                  <span className={styles.badge}>{unreadCount}</span>
                )}
              </button>

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

    {/* Notification Panel */}
    <NotificationPanel 
      userId={user?.id} 
      isOpen={isNotificationOpen} 
      onClose={() => setIsNotificationOpen(false)}
    />
    </>
  );
}

export default Header;

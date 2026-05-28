import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "../assets/sidebar.module.css";
import pfp from "../assets/img/Navbar/user.jpg";
import { getLocalUnreadCount } from "../utils/localNotificationStore.js";
import { readStoredUser } from "../utils/sessionUser.js";
import NotificationPanel from "./NotificationPanel.jsx";
import Logo from "../assets/img/Navbar/LOGO.png";

const API = "http://localhost:3001";

function isProfileComplete(user) {
  return Boolean(user?.profileCompleted);
}

function profileSrc(user) {
  const url = user?.profileImageUrl || user?.profile_image_url;
  if (!url) return pfp;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url}`;
}

function Sidebar({ isMobileOpen = false, onClose }) {
  const location = useLocation();
  const storedUser = readStoredUser();

  const [user, setUser] = useState(storedUser);
  const [role, setRole] = useState(storedUser?.role || null);
  const [profileCompleted, setProfileCompleted] = useState(isProfileComplete(storedUser));
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [studentPackage, setStudentPackage] = useState(null);
  const currentUserId = user?.id || user?.user_id || user?.userId;

  useEffect(() => {
    try {
      const parsedUser = readStoredUser();
      if (parsedUser) {
        setUser(parsedUser);
        setRole(parsedUser.role || null);
        setProfileCompleted(isProfileComplete(parsedUser));
      }
    } catch (e) {
      console.warn("Failed to read user from storage:", e);
    }
  }, [location]);

  // Listen for profile updates
  useEffect(() => {
    const handleProfileUpdate = (event) => {
      const updatedUser = event.detail;
      setUser(updatedUser);
      setRole(updatedUser.role || null);
      setProfileCompleted(isProfileComplete(updatedUser));
    };

    const handleStorageChange = () => {
      const parsedUser = readStoredUser();
      if (parsedUser) {
        setUser(parsedUser);
        setRole(parsedUser.role || null);
        setProfileCompleted(isProfileComplete(parsedUser));
      } else {
        setUser(null);
        setRole(null);
        setProfileCompleted(false);
      }
    };

    const handleLogoutEvent = () => {
      setUser(null);
      setRole(null);
      setProfileCompleted(false);
    };

    window.addEventListener("userProfileUpdated", handleProfileUpdate);
    window.addEventListener("userLoggedOut", handleLogoutEvent);
    document.addEventListener("visibilitychange", handleStorageChange);

    return () => {
      window.removeEventListener("userProfileUpdated", handleProfileUpdate);
      window.removeEventListener("userLoggedOut", handleLogoutEvent);
      document.removeEventListener("visibilitychange", handleStorageChange);
    };
  }, []);

  // Fetch unread notification count
  useEffect(() => {
    if (currentUserId && (role === "student" || role === "teacher" || role === "admin")) {
      fetchUnreadCount();
      // Poll for new notifications every 30 seconds
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUserId, role]);

  useEffect(() => {
    if (role !== "student" || !currentUserId) {
      setStudentPackage(null);
      return;
    }

    axios
      .get(`${API}/api/calendar/student-package/${currentUserId}`)
      .then((response) => setStudentPackage(response.data.package || null))
      .catch(() => setStudentPackage(null));
  }, [currentUserId, role, location]);

  const fetchUnreadCount = async () => {
    const currentUser = readStoredUser() || {};
    const userName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim();
    const localCount = getLocalUnreadCount({ userId: currentUserId, userName });
    try {
      const response = await axios.get(`${API}/api/notifications/unread/${currentUserId}`);
      setUnreadCount((response.data.unreadCount || 0) + localCount);
    } catch (err) {
      console.error("Error fetching unread count:", err);
      setUnreadCount(localCount);
    }
  };

  // ✅ Current page routes (you already have these)
  const path = location.pathname;

  const isAccountPage = path === "/account";
  const isReschedulePage = path.startsWith("/reschedule");
  const isAllClassesPage = path === "/allClasses";
  const isCallPage = path.startsWith("/call");

  const isAdminDashboardPage = path === "/AdminDashboard";
  const studentHasNoClassesLeft = role === "student" && studentPackage && Number(studentPackage.classes_left) <= 0;

  const isStudentDashboardPage = path === "/StudentDashboard";
  const isAssignmentsDropbox = path === "/assignmentsDropbox";
  const isAssignmentsPage = path === "/assignments";
  const isRemarksPage = path === "/remarks";
  const isBooksLessonsPage = path === "/booksLessons";
  const isBooksContentPage = path === "/booksContent" || path.startsWith("/booksContent/");

  const isTeacherDashboardPage = path === "/TeacherDashboard";
  const isPassRemarksPage = path === "/PassRemarks";
  const isTeacherAssignmentPage = path === "/teacherAssignment";
  const isTeacherBooksLessonsPage = path === "/teacherBooksLessons";
  const isTeacherBooksContentPage = path.startsWith("/teacherBooksLessons/");
  const isTeacherBooksDropboxPage = path === "/teacherBooksDropbox";
  const isCalendarPage = path === "/Calendar";

  if (isCallPage || (isAccountPage && !profileCompleted)) {
    return null;
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
    isTeacherBooksContentPage ||
    isBooksContentPage ||
    isTeacherBooksDropboxPage;

  const isAdminArea =
    isAccountPage ||
    isAdminDashboardPage;

  const navConfig = {
    student: [
      { to: "/StudentDashboard", label: "Dashboard", icon: "bi-house-door-fill" },
      { to: "/Calendar", label: "Calendar", icon: "bi-calendar3" },
      { to: "/assignments", label: "Assignments", icon: "bi-journal-text" },
      { to: "/remarks", label: "Remarks", icon: "bi-chat-left-text" },
      { to: "/booksLessons", label: "Books / Lessons", icon: "bi-book" },
    ],
    teacher: [
      { to: "/TeacherDashboard", label: "Dashboard", icon: "bi-house-door-fill" },
      { to: "/Calendar", label: "Calendar", icon: "bi-calendar3" },
      { to: "/PassRemarks", label: "Remarks", icon: "bi-chat-left-text" },
      { to: "/teacherAssignment", label: "Assignments", icon: "bi-journal-text" },
      { to: "/teacherBooksLessons", label: "Books / Lessons", icon: "bi-book" },
    ],
    admin: [
      { to: "/AdminDashboard?tab=calendar", label: "Calendar", icon: "bi-calendar3" },
      { to: "/AdminDashboard?tab=requests", label: "Requests", icon: "bi-list-check" },
      { to: "/AdminDashboard?tab=contracts", label: "Contracts", icon: "bi-folder-check" },
      { to: "/AdminDashboard?tab=teacherCourses", label: "Teacher Courses", icon: "bi-people" },
      { to: "/AdminDashboard?tab=createTeacher", label: "Create Teacher", icon: "bi-person-plus" },
      { to: "/AdminDashboard?tab=createStudent", label: "Create Student", icon: "bi-person-plus" },
      { to: "/AdminDashboard?tab=archive", label: "Archive", icon: "bi-archive" },
    ],
  };

  const navItems = navConfig[role] || [];
  const normalizedPath = path.toLowerCase();
  const currentSearch = location.search.toLowerCase();

  const isActiveLink = (item) => {
    const target = item.to || "";
    try {
      const targetUrl = new URL(target, window.location.origin);
      const targetPath = targetUrl.pathname.toLowerCase();
      const targetSearch = targetUrl.search.toLowerCase();
      if (!(normalizedPath === targetPath || normalizedPath.startsWith(`${targetPath}/`))) {
        return false;
      }
      return !targetSearch || currentSearch === targetSearch;
    } catch {
      const targetPath = target.toLowerCase();
      return (
        normalizedPath === targetPath ||
        normalizedPath.startsWith(`${targetPath}/`)
      );
    }
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.backdrop} ${isMobileOpen ? styles.backdropOpen : ""}`}
        onClick={onClose}
        aria-label="Close sidebar"
      />

      <nav
        className={`${styles.sidebar} ${isMobileOpen ? styles.sidebarOpen : ""}`}
        aria-label="Main navigation"
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <span />
          <span />
        </button>

        <Link
          to={
            role === "teacher"
              ? "/TeacherDashboard"
              : role === "student"
              ? "/StudentDashboard"
              : role === "admin"
              ? "/AdminDashboard"
              : "/"
          }
          className={styles.brandName}
        >
          <img src={Logo} alt="JEN Academia" />
        </Link>

        <ul className={styles.navList}>
          {navItems.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onClose}
                className={`${styles.navItem} ${isActiveLink(item) ? styles.active : ""}`}
              >
                <span className={styles.navItemIcon}>
                  <i className={`bi ${item.icon}`} aria-hidden="true" />
                </span>
                <span className={styles.navText}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

      </nav>
    </>
  );
}

export default Sidebar;

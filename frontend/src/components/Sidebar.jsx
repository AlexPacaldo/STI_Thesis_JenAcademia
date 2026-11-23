import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "../assets/sidebar.module.css";
import { readStoredUser } from "../utils/sessionUser.js";
import Logo from "../assets/img/Navbar/LOGO.png";

function isProfileComplete(user) {
  return Boolean(user?.profileCompleted);
}


function Sidebar({ isMobileOpen = false, onClose }) {
  const location = useLocation();
  const storedUser = readStoredUser();

  const [user, setUser] = useState(storedUser);
  const [role, setRole] = useState(storedUser?.role || null);
  const [profileCompleted, setProfileCompleted] = useState(isProfileComplete(storedUser));

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


  // ✅ Current page routes (you already have these)
  const path = location.pathname;

  const isAccountPage = path === "/account";
  const isCallPage = path.startsWith("/call");




  if (isCallPage || (isAccountPage && !profileCompleted)) {
    return null;
  }

  // ✅ Keep your current `isStudentArea`
  const navConfig = {
    student: [
      { to: "/StudentDashboard", label: "Home", icon: "bi-house-door-fill" },
      { to: "/Calendar", label: "Calendar", icon: "bi-calendar3" },
      // The same page the teacher has, with the teacher side of it switched
      // off: the student's own attendance, duration and class summary. It
      // has been a route and a screen for a while - it just was not
      // reachable from the menu.
      { to: "/classHistory", label: "Class history", icon: "bi-clock-history" },
      { to: "/ContractReview", label: "Contract reviews", icon: "bi-star-fill" },
      { to: "/assignments", label: "Assignments", icon: "bi-journal-text" },
      { to: "/remarks", label: "Remarks", icon: "bi-chat-left-text" },
      { to: "/booksLessons", label: "Books/Lessons", icon: "bi-book" },
    ],
    teacher: [
      { to: "/TeacherDashboard", label: "Home", icon: "bi-house-door-fill" },
      { to: "/Calendar", label: "Calendar", icon: "bi-calendar3" },
      { to: "/teacherStudents", label: "My students", icon: "bi-people" },
      { to: "/teacherClassHistory", label: "Class history", icon: "bi-clock-history" },
      { to: "/ContractReview", label: "Contract reviews", icon: "bi-star-fill" },
      { to: "/PassRemarks", label: "Remarks", icon: "bi-chat-left-text" },
      { to: "/teacherAssignment", label: "Assignments", icon: "bi-journal-text" },
      { to: "/teacherBooksLessons", label: "My books", icon: "bi-book" },
    ],
    admin: [
      // First because it is where an admin should land, and because every entry
      // below is reachable from it - the tiles and the attention list link straight
      // into these tabs.
      { to: "/AdminDashboard?tab=overview", label: "Overview", icon: "bi-speedometer2" },
      { to: "/AdminDashboard?tab=calendar", label: "Calendar", icon: "bi-calendar3" },
      { to: "/AdminDashboard?tab=books", label: "Books / Lessons", icon: "bi-book" },
      { to: "/AdminDashboard?tab=verifications", label: "Verifications", icon: "bi-shield-check" },
      { to: "/AdminDashboard?tab=requests", label: "Requests", icon: "bi-list-check" },
      { to: "/AdminDashboard?tab=contracts", label: "Contracts", icon: "bi-folder-check" },
      { to: "/AdminDashboard?tab=reviews", label: "Contract reviews", icon: "bi-star-fill" },
      { to: "/AdminDashboard?tab=teacherCourses", label: "Teacher Courses", icon: "bi-people" },
      { to: "/AdminDashboard?tab=createTeacher", label: "Create Teacher", icon: "bi-person-plus" },
      { to: "/AdminDashboard?tab=createStudent", label: "Create Student", icon: "bi-person-plus" },
      ...(user?.isSuperAdmin ? [{ to: "/AdminDashboard?tab=createAdmin", label: "Create Admin", icon: "bi-person-plus" }] : []),
      { to: "/AdminDashboard?tab=archive", label: "Account Management", icon: "bi-person-gear" },
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

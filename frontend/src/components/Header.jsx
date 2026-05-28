import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "../assets/header.module.css";
import pfp from "../assets/img/Navbar/user.jpg";
import { getLocalUnreadCount } from "../utils/localNotificationStore.js";
import ChatPanel from "./ChatPanel";
import NotificationPanel from "./NotificationPanel";
import { clearStoredUser, readStoredUser, writeStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;
const BADGE_REFRESH_MS = 60 * 1000;

function profileSrc(user) {
  const url = user?.profileImageUrl || user?.profile_image_url;
  if (!url) return pfp;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url}`;
}

function Header({ isSidebarOpen = false, onMenuClick }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [studentPackage, setStudentPackage] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const currentUserId = user?.id || user?.user_id || user?.userId;

  useEffect(() => {
    try {
      const parsedUser = readStoredUser();
      if (parsedUser) {
        console.log('Header: Parsed user:', parsedUser);
        setUser(parsedUser);
        setRole(parsedUser.role);
        console.log('Header: Setting role to:', parsedUser.role);
        console.log('Header: Setting profileCompleted to:', !!parsedUser.profileCompleted);
        setProfileCompleted(!!parsedUser.profileCompleted);
      }
    } catch (e) {
      console.warn("Failed to read user from storage:", e);
    }
  }, [location]);

  useEffect(() => {
    const contentArea = document.querySelector(".content-area");
    const root = document.getElementById("root");
    const scrollTargets = [
      window,
      document,
      document.scrollingElement,
      document.documentElement,
      document.body,
      root,
      contentArea,
      document.querySelector(".app-container"),
      document.querySelector(".app-layout"),
    ].filter(Boolean);

    const uniqueTargets = scrollTargets.reduce((acc, target) => {
      if (!acc.includes(target)) acc.push(target);
      return acc;
    }, []);

    const getScrollTop = () => {
      const values = uniqueTargets.map((target) => {
        if (target === window) return window.scrollY || window.pageYOffset || 0;
        return target.scrollTop || 0;
      });
      return Math.max(0, ...values);
    };

    const handleScroll = () => {
      setIsScrolled(getScrollTop() > 0);
    };

    handleScroll();

    uniqueTargets.forEach((target) => {
      target.addEventListener("scroll", handleScroll, { passive: true });
    });
    window.addEventListener("wheel", handleScroll, { passive: true });
    window.addEventListener("touchmove", handleScroll, { passive: true });
    window.addEventListener("keydown", handleScroll, { passive: true });

    return () => {
      uniqueTargets.forEach((target) => {
        target.removeEventListener("scroll", handleScroll);
      });
      window.removeEventListener("wheel", handleScroll);
      window.removeEventListener("touchmove", handleScroll);
      window.removeEventListener("keydown", handleScroll);
    };
  }, [location.pathname]);

  // Listen for profile updates
  useEffect(() => {
    const handleProfileUpdate = (event) => {
      const updatedUser = event.detail;
      console.log('Header received profile update:', updatedUser);
      setUser(updatedUser);
      setRole(updatedUser.role);
      setProfileCompleted(!!updatedUser.profileCompleted);
    };
    
    const handleStorageChange = () => {
      const parsedUser = readStoredUser();
      if (parsedUser) {
        console.log('Header detected storage change:', parsedUser);
        setUser(parsedUser);
        setRole(parsedUser.role);
        setProfileCompleted(!!parsedUser.profileCompleted);
      } else {
        console.log('Header detected logout or cleared storage');
        setUser(null);
        setRole(null);
        setProfileCompleted(false);
      }
    };
    
    const handleLogoutEvent = () => {
      console.log('Header received userLoggedOut event');
      setUser(null);
      setRole(null);
      setProfileCompleted(false);
    };

    window.addEventListener('userProfileUpdated', handleProfileUpdate);
    window.addEventListener('userLoggedOut', handleLogoutEvent);
    // Also check on visibility change (when user returns to tab)
    document.addEventListener('visibilitychange', handleStorageChange);
    
    return () => {
      window.removeEventListener('userProfileUpdated', handleProfileUpdate);
      window.removeEventListener('userLoggedOut', handleLogoutEvent);
      document.removeEventListener('visibilitychange', handleStorageChange);
    };
  }, []);

  // Fetch unread notification count
  useEffect(() => {
    if (currentUserId && (role === "student" || role === "teacher" || role === "admin")) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, BADGE_REFRESH_MS);
      return () => clearInterval(interval);
    }
  }, [currentUserId, role]);

  useEffect(() => {
    if (!currentUserId || !role) {
      setChatUnreadCount(0);
      return undefined;
    }

    const fetchChatUnreadCount = async () => {
      try {
        const response = await axios.get(`${API}/api/chats/unread-count/${currentUserId}`);
        setChatUnreadCount(Number(response.data.unreadCount || 0));
      } catch (err) {
        console.error("Error fetching unread chat count:", err);
        setChatUnreadCount(0);
      }
    };

    fetchChatUnreadCount();
    const interval = setInterval(fetchChatUnreadCount, BADGE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [currentUserId, role]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const refreshChatBadge = () => {
      axios
        .get(`${API}/api/chats/unread-count/${currentUserId}`)
        .then((response) => {
          setChatUnreadCount(Number(response.data.unreadCount || 0));
        })
        .catch(() => {});
    };

    window.addEventListener("chatUpdated", refreshChatBadge);
    return () => window.removeEventListener("chatUpdated", refreshChatBadge);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const presenceStream = new EventSource(`${API}/api/chats/stream/${currentUserId}`);
    const keepAlive = () => {};

    presenceStream.addEventListener("open", keepAlive);
    presenceStream.addEventListener("error", () => {
      presenceStream?.close?.();
    });

    return () => {
      presenceStream?.close?.();
    };
  }, [currentUserId]);

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

  if (isCallPage) {
    return (
      <header className={styles.header}>
        <div className={styles.headerContainer}>
          <div className={styles.brandName}>
            JEN Academia
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
    isTeacherBooksContentPage ||
    isBooksContentPage ||
    isTeacherBooksDropboxPage;

  const isAdminArea =
    isAccountPage ||
    isAdminDashboardPage;

  const headerStyle = {
    background: isScrolled ? 'rgba(255, 255, 255, 0.98)' : 'transparent',
    // boxShadow: isScrolled ? '0 14px 40px rgba(0,0,0,0.14)' : 'none',
    // borderBottom: isScrolled ? '1px solid rgba(0,0,0,0.08)' : '1px solid transparent',
    transition: 'background 240ms ease, box-shadow 240ms ease, border-color 240ms ease',
  };

  const shouldShowMenuButton = !(isAccountPage && !profileCompleted);

  const toggleNotifications = () => {
    setIsNotificationOpen((current) => !current);
    setIsChatOpen(false);
  };

  const toggleChatDrawer = () => {
    setIsChatOpen((current) => !current);
    setIsNotificationOpen(false);
  };

  return (
    <>
      <header className={styles.header} style={headerStyle}>
        <div className={styles.headerContainer}>
        {shouldShowMenuButton && (
          <button
            type="button"
            className={styles.menuButton}
            onClick={onMenuClick}
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-expanded={isSidebarOpen}
          >
            <span />
            <span />
            <span />
          </button>
        )}
        

        {role === "student" && isStudentArea && (
          <>
            <Link className={styles.brandName}>JEN Academia</Link>
          </>
        )}
        {role === "teacher" && isTeacherArea && (
          <>
            <Link className={styles.brandName}>JEN Academia</Link>
          </>
        )}
        {role === "admin" && isAdminArea && (
          <>
            <Link to="/AdminDashboard" className={styles.brandName}>JEN Academia</Link>
          </>
        )}

        
        <nav className={styles.navbar}>
          {/* 🧩 STUDENT NAVIGATION */}
          {role === "student" && isStudentArea && profileCompleted && (
            <>

              <button className={styles.notificationBell} onClick={toggleChatDrawer} title="Chats">
                <i className="bi bi-chat-dots-fill" aria-hidden="true" />
                {chatUnreadCount > 0 && (
                  <span className={styles.badge}>{chatUnreadCount}</span>
                )}
              </button>

              {/* Notification Bell */}
              <button className={styles.notificationBell} onClick={toggleNotifications} title="Reschedule Requests">
                <i className="bi bi-bell-fill" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className={styles.badge}>{unreadCount}</span>
                )}
              </button>

              <span className={styles.headerSeparator} aria-hidden="true">|</span>

              <Link to="/account" className={styles.StudentAccount}>
                <div className={styles.account}>
                  {`${user?.firstName || ""} ${user?.lastName || ""}`}
                </div>
                <img src={profileSrc(user)} alt="Profile" className={styles.profilePic}/>
              </Link>

             
            </>
          )}

          {/* 🧩 TEACHER NAVIGATION */}
          {role === "teacher" && isTeacherArea && profileCompleted && (
            <>
            
              <button className={styles.notificationBell} onClick={toggleChatDrawer} title="Chats">
                <i className="bi bi-chat-dots-fill" aria-hidden="true" />
                {chatUnreadCount > 0 && (
                  <span className={styles.badge}>{chatUnreadCount}</span>
                )}
              </button>

              {/* Notification Bell */}
              <button className={styles.notificationBell} onClick={toggleNotifications} title="Reschedule Requests">
                <i className="bi bi-bell-fill" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className={styles.badge}>{unreadCount}</span>
                )}
              </button>

              <span className={styles.headerSeparator} aria-hidden="true">|</span>

              <Link to="/account" className={styles.TeacherAccount}>
                <div className={styles.account}>
                  {`${user?.firstName || ""} ${user?.lastName || ""}`}
                </div>
                <img src={profileSrc(user)} alt="Profile" className={styles.profilePic}/>
              </Link>

              
            </>
          )}

          {role === "admin" && isAdminArea && (
            <>
              

              <button className={styles.notificationBell} onClick={toggleChatDrawer} title="Chats">
                <i className="bi bi-chat-dots-fill" aria-hidden="true" />
                {chatUnreadCount > 0 && (
                  <span className={styles.badge}>{chatUnreadCount}</span>
                )}
              </button>

              <button
                className={styles.notificationBell}
                onClick={toggleNotifications}
                title="Notifications"
              >
                <i className="bi bi-bell-fill" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className={styles.badge}>{unreadCount}</span>
                )}
              </button>

              <span className={styles.headerSeparator} aria-hidden="true">|</span>

              <Link to="/account" className={styles.TeacherAccount}>
                <div className={styles.account}>
                  {`${user?.firstName || ""} ${user?.lastName || ""}`}
                </div>
                <img
                  src={profileSrc(user)}
                  alt="Profile"
                  className={styles.profilePic}
                />
              </Link>

              
            </>
          )}
        </nav>
      </div>
    </header>

    {/* Notification Panel */}
    <NotificationPanel 
      userId={currentUserId}
      isOpen={isNotificationOpen} 
      onClose={() => setIsNotificationOpen(false)}
    />
    <ChatPanel
      user={user}
      role={role}
      userId={currentUserId}
      isOpen={isChatOpen}
      onClose={() => setIsChatOpen(false)}
    />
    </>
  );
}

export default Header;

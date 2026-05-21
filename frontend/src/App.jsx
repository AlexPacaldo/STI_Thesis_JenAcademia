import { useEffect, useRef } from 'react'
import './App.css'
import Homepage from './pages/homepage'
import Header from './components/Header'
import Footer from './components/Footer'
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useNotification } from "./components/NotificationContainer.jsx";

const IDLE_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 hours
const PUBLIC_PATHS = ["/", "/login", "/register"];
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

function hasRequiredProfileFields(user = {}) {
  return Boolean(
    String(user.contact || user.contact_number || "").trim()
    && String(user.profileImageUrl || user.profile_image_url || "").trim()
    && (user.passwordChanged || user.password_changed)
  );
}

function isProfileComplete(user = {}) {
  return Boolean(user.profileCompleted && hasRequiredProfileFields(user));
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const showFooter = location.pathname === "/" && !isAuthenticated(parseUser());
  const idleTimerRef = useRef(null);

  function parseUser() {
    const stored = localStorage.getItem("user");
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  function isAuthenticated(user) {
    return Boolean(user && (user.id || user.user_id || user.userId));
  }

  function isStayLoggedIn(user) {
    return Boolean(user && user.stayLoggedIn);
  }

  function getRole(user) {
    return String(user?.role || "").toLowerCase();
  }

  function getUserId(user) {
    return user?.id || user?.user_id || user?.userId;
  }

  function getDefaultDashboardPath(role) {
    if (role === "teacher") return "/TeacherDashboard";
    if (role === "admin") return "/AdminDashboard";
    return "/StudentDashboard";
  }

  function isAllowedForRole(path, role) {
    const normalizedPath = path.toLowerCase();
    const rolePaths = {
      student: [
        "/",
        "/login",
        "/register",
        "/studentdashboard",
        "/assignments",
        "/assignmentsdropbox",
        "/remarks",
        "/bookslessons",
        "/bookscontent",
        "/bookscontent/",
        "/calendar",
        "/account",
        "/reschedule",
        "/call",
      ],
      teacher: [
        "/",
        "/login",
        "/register",
        "/teacherdashboard",
        "/passremarks",
        "/teacherassignment",
        "/teacherbookslessons",
        "/teacherbookslessons/",
        "/calendar",
        "/account",
        "/reschedule",
        "/call",
      ],
      admin: [
        "/",
        "/login",
        "/register",
        "/admindashboard",
        "/account",
      ],
    };

    const allowed = rolePaths[role] || ["/", "/login", "/register"];
    return allowed.some((allowedPath) => {
      if (allowedPath === "/") {
        return normalizedPath === "/";
      }
      if (allowedPath.endsWith("/")) {
        return normalizedPath.startsWith(allowedPath);
      }
      return normalizedPath === allowedPath;
    });
  }

  function clearSession() {
    localStorage.removeItem("user");
    localStorage.removeItem("lastActivityAt");
    window.dispatchEvent(new Event("userLoggedOut"));
  }

  function logoutDueToInactivity() {
    clearSession();
    notify?.("You have been logged out due to inactivity.", "info");
    navigate("/login", { replace: true });
  }

  function resetIdleTimer() {
    const user = parseUser();
    if (!isAuthenticated(user)) return;

    localStorage.setItem("lastActivityAt", String(Date.now()));
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(logoutDueToInactivity, IDLE_TIMEOUT_MS);
  }

  useEffect(() => {
    const path = location.pathname.toLowerCase();
    const user = parseUser();
    const authenticated = isAuthenticated(user);
    const role = getRole(user);
    const defaultPath = getDefaultDashboardPath(role);

    if (!authenticated && !PUBLIC_PATHS.includes(path)) {
      navigate("/login", { replace: true });
      return;
    }

    if (authenticated) {
      const profileComplete = isProfileComplete(user);
      const currentUserId = getUserId(user);

      if (!profileComplete && path !== "/account") {
        navigate("/account", { replace: true });
        return;
      }

      if ((path === "/" || path === "/login" || path === "/register") && profileComplete) {
        navigate(defaultPath, { replace: true });
        return;
      }

      if (!isAllowedForRole(path, role)) {
        navigate(defaultPath, { replace: true });
        return;
      }

      async function checkAccountStatus() {
        if (!currentUserId) return;
        try {
          const response = await fetch(`http://localhost:3001/api/users/${currentUserId}`);
          if (!response.ok) {
            if (response.status === 404) {
              clearSession();
              notify?.("Your account could not be verified. Please sign in again or contact the administrator.", "warning");
              navigate("/login", { replace: true });
            }
            return;
          }

          const data = await response.json();
          const status = String(data?.user?.status || "").toLowerCase();
          if (status === "archived") {
            clearSession();
            notify?.("Your account has been archived and your session has ended. Please contact the administrator to request account reactivation.", "warning");
            navigate("/login", { replace: true });
          }
        } catch (error) {
          console.warn("Could not verify account status:", error);
        }
      }

      checkAccountStatus();
      const accountStatusTimer = window.setInterval(checkAccountStatus, 10000);
      window.addEventListener("focus", checkAccountStatus);

      const stayLoggedIn = isStayLoggedIn(user);
      if (!stayLoggedIn) {
        const lastActivity = Number(localStorage.getItem("lastActivityAt") || 0);
        const now = Date.now();
        if (lastActivity && now - lastActivity >= IDLE_TIMEOUT_MS) {
          logoutDueToInactivity();
          return;
        }
        resetIdleTimer();

        ACTIVITY_EVENTS.forEach((eventName) =>
          window.addEventListener(eventName, resetIdleTimer, { passive: true })
        );

        return () => {
          window.clearInterval(accountStatusTimer);
          window.removeEventListener("focus", checkAccountStatus);
          ACTIVITY_EVENTS.forEach((eventName) =>
            window.removeEventListener(eventName, resetIdleTimer)
          );
          if (idleTimerRef.current) {
            window.clearTimeout(idleTimerRef.current);
          }
        };
      }

      return () => {
        window.clearInterval(accountStatusTimer);
        window.removeEventListener("focus", checkAccountStatus);
      };
    }

    return undefined;
  }, [location.pathname, navigate, notify]);

  return (
    <>
      <Header />
      <div className='main'>
        <Outlet />
      </div>
      {showFooter && <Footer />}
    </>
  )
}

export default App

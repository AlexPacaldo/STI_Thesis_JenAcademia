import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import './teacherTheme.css'
import Header from './components/Header'
import Footer from './components/Footer'
import Sidebar from './components/Sidebar'

import { Outlet, useLocation, useNavigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { useNotification } from "./components/NotificationContainer.jsx";
import { clearStoredUser, readStoredUser } from "./utils/sessionUser.js";
import { clearSessionToken } from "./utils/apiAuth.js";
import { apiFetch } from "./utils/apiAuth.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS, readNamespacedStorageValue } from "./utils/storageKeys.js";
import { API_BASE_URL } from "./utils/api.js";

const IDLE_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 hours
const ACCOUNT_STATUS_CHECK_MS = 60 * 1000;
const LINE_STATUS_TIMEOUT_MS = 15 * 1000;
const PUBLIC_PATHS = ["/", "/login", "/setup-account", "/forgot-password", "/reset-password"];
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

function isProfileComplete(user) {
  return Boolean(user?.profileCompleted);
}

function isSetupAccountPath(path) {
  const normalizedPath = path.toLowerCase();
  return normalizedPath === "/setup-account" || normalizedPath.startsWith("/setup-account/");
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  // footer visibility will be computed after hideHeaderPaths
  const idleTimerRef = useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lineGate, setLineGate] = useState(null);

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
        "/studentdashboard",
        "/assignments",
        "/assignmentsdropbox",
        "/remarks",
        "/classhistory",
        "/contractreview",
        "/bookslessons",
        "/bookscontent",
        "/bookscontent/",
        "/calendar",
        "/classroom/",
        "/account",
        "/reschedule",
        "/call",
      ],
      teacher: [
        "/",
        "/login",
        "/teacherdashboard",
        "/teacherclasshistory",
        "/teacherstudents",
        "/contractreview",
        "/passremarks",
        "/teacherassignment",
        "/teacherbookslessons",
        "/teacherbookslessons/",
        "/calendar",
        "/classroom/",
        "/account",
        "/reschedule",
        "/call",
      ],
      admin: [
        "/",
        "/login",
        "/admindashboard",
        "/adminbookscontent",
        "/adminbookscontent/",
        "/account",
      ],
    };

    const allowed = rolePaths[role] || ["/", "/login"];
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

  function isPublicPath(path) {
    const normalizedPath = path.toLowerCase();
    return PUBLIC_PATHS.some((publicPath) => {
      if (publicPath === "/") return normalizedPath === "/";
      return normalizedPath === publicPath || normalizedPath.startsWith(`${publicPath}/`);
    });
  }

  const clearSession = useCallback(() => {
    clearStoredUser();
    // The bearer token is the credential; leaving it behind after sign-out would
    // keep admin access alive until it expired on its own.
    clearSessionToken();
    localStorage.removeItem(STORAGE_KEYS.lastActivityAt);
    localStorage.removeItem(LEGACY_STORAGE_KEYS.lastActivityAt);
    window.dispatchEvent(new Event("userLoggedOut"));
  }, []);

  const logoutDueToInactivity = useCallback(() => {
    clearSession();
    notify?.("You have been logged out due to inactivity.", "info");
    navigate("/login", { replace: true });
  }, [clearSession, navigate, notify]);

  const resetIdleTimer = useCallback(() => {
    const user = readStoredUser();
    if (!isAuthenticated(user)) return;

    localStorage.setItem(STORAGE_KEYS.lastActivityAt, String(Date.now()));
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(logoutDueToInactivity, IDLE_TIMEOUT_MS);
  }, [logoutDueToInactivity]);

  useEffect(() => {
    const path = location.pathname.toLowerCase();
    const user = readStoredUser();
    const authenticated = isAuthenticated(user);
    const role = getRole(user);
    const defaultPath = getDefaultDashboardPath(role);

    if (!authenticated && !isPublicPath(path)) {
      navigate("/login", { replace: true });
      return;
    }

    if (authenticated) {
      const profileComplete = isProfileComplete(user);
      const currentUserId = getUserId(user);

      if (isSetupAccountPath(path)) {
        return undefined;
      }

      if (!profileComplete && path !== "/account") {
        navigate("/account", { replace: true });
        return;
      }

      if (isPublicPath(path) && profileComplete) {
        navigate(defaultPath, { replace: true });
        return;
      }

      if (!isAllowedForRole(path, role)) {
        navigate(defaultPath, { replace: true });
        return;
      }

      if (role === "student" && currentUserId) {
        setLineGate((current) => current?.userId === currentUserId
          ? current
          : { userId: currentUserId, status: "checking" });
      }

      async function checkAccountStatus() {
        if (!currentUserId) return;
        try {
          const response = await apiFetch(`${API_BASE_URL}/api/users/${currentUserId}`);
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

      async function checkRequiredLineSetup() {
        if (role !== "student" || !currentUserId) return;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), LINE_STATUS_TIMEOUT_MS);
        try {
          const response = await apiFetch(`${API_BASE_URL}/api/users/${currentUserId}/line`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            setLineGate({ userId: currentUserId, status: "required" });
            if (path !== "/account") navigate("/account", { replace: true });
            return;
          }
          const data = await response.json();
          const setupRequired = !data?.linked;
          setLineGate({
            userId: currentUserId,
            status: setupRequired ? "required" : "ready",
          });
          if (setupRequired && path !== "/account") {
            navigate("/account", { replace: true });
          }
        } catch (error) {
          console.warn("Could not check required LINE setup:", error);
          setLineGate({ userId: currentUserId, status: "required" });
          if (path !== "/account") navigate("/account", { replace: true });
        } finally {
          window.clearTimeout(timeout);
        }
      }

      // Closing evaluations are required. When a teacher or student still has
      // one pending, every page sends them back to the review screen until
      // their side is submitted. The review page itself is exempt, otherwise
      // the guard would fight its own route.
      async function checkRequiredContractReview() {
        if (!["teacher", "student"].includes(role)) return;
        if (path === "/contractreview") return;
        try {
          const response = await apiFetch(`${API_BASE_URL}/api/contract-reviews`);
          if (!response.ok) return;
          const data = await response.json();
          const hasPending = Array.isArray(data?.reviews)
            && data.reviews.some((review) => review.pending_for_you);
          if (!hasPending) return;
          notify?.("Please complete your required contract review before continuing.", "info");
          navigate("/ContractReview", { replace: true });
        } catch (error) {
          console.warn("Could not check required contract reviews:", error);
        }
      }

      checkAccountStatus();
      checkRequiredLineSetup();
      checkRequiredContractReview();
      const accountStatusTimer = window.setInterval(checkAccountStatus, ACCOUNT_STATUS_CHECK_MS);
      const requiredLineTimer = window.setInterval(checkRequiredLineSetup, ACCOUNT_STATUS_CHECK_MS);
      window.addEventListener("focus", checkAccountStatus);
      window.addEventListener("focus", checkRequiredLineSetup);

      const stayLoggedIn = isStayLoggedIn(user);
      if (!stayLoggedIn) {
        const lastActivity = Number(readNamespacedStorageValue(STORAGE_KEYS.lastActivityAt, LEGACY_STORAGE_KEYS.lastActivityAt) || 0);
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
          window.clearInterval(requiredLineTimer);
          window.removeEventListener("focus", checkAccountStatus);
          window.removeEventListener("focus", checkRequiredLineSetup);
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
        window.clearInterval(requiredLineTimer);
        window.removeEventListener("focus", checkAccountStatus);
        window.removeEventListener("focus", checkRequiredLineSetup);
      };
    }

    return undefined;
  }, [clearSession, location.pathname, logoutDueToInactivity, navigate, notify, resetIdleTimer]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname, location.search]);

  const hideHeaderPaths = ["/", "/login", "/setup-account", "/forgot-password", "/reset-password"];
  const currentUser = readStoredUser();
  const currentRole = getRole(currentUser);
  const currentUserId = getUserId(currentUser);
  const currentPath = location.pathname.toLowerCase();
  const lineGateMatchesCurrentUser = lineGate?.userId === currentUserId;
  const studentLineGatePending =
    currentRole === "student" &&
    (!lineGateMatchesCurrentUser || lineGate.status === "checking") &&
    !isSetupAccountPath(currentPath);
  const studentLineSetupRequired =
    currentRole === "student" &&
    lineGateMatchesCurrentUser &&
    (lineGate.status === "required" || (
      currentPath === "/account" && !isProfileComplete(currentUser)
    ));
  const studentLineSetupRedirecting =
    studentLineSetupRequired && currentPath !== "/account";
  const shouldShowHeader = !hideHeaderPaths.some((publicPath) => {
    return publicPath === "/" ? currentPath === "/" : currentPath === publicPath || currentPath.startsWith(`${publicPath}/`);
  }) && !studentLineSetupRequired;
  const isAccountPage = currentPath === "/account";
  const isAccountPageNewUser = isAccountPage && !isProfileComplete(currentUser);
  const shouldShowSidebar = shouldShowHeader && !isAccountPageNewUser;
  const isTeacherTheme = currentRole === "teacher";
  const isAdminPage = getRole(readStoredUser()) === "admin" && !isAccountPage;
  const showFooter = location.pathname === "/" && !isAuthenticated(readStoredUser());
  const isFullBleedPath = location.pathname === "/" || location.pathname === "/login" || currentPath.startsWith("/setup-account/") || currentPath.startsWith("/forgot-password") || currentPath.startsWith("/reset-password/") || studentLineSetupRequired;

  if (studentLineGatePending || studentLineSetupRedirecting) {
    return (
      <main className="line-setup-gate" role="status">
        <span aria-hidden="true">💬</span>
        <h1>{studentLineSetupRedirecting ? "Let’s set up LINE first!" : "Getting your account ready…"}</h1>
        <p>
          {studentLineSetupRedirecting
            ? "We’ll take you to the next step now."
            : "Please wait a moment."}
        </p>
      </main>
    );
  }

  return (
    <>
      <div className={`app-container ${isFullBleedPath ? 'full-bleed' : ''} ${isTeacherTheme ? 'teacher-theme' : ''}`}>
        {shouldShowSidebar && (
          <Sidebar
            isMobileOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />
        )}

        <div className={`app-layout ${isFullBleedPath ? 'full-bleed' : ''} ${isAccountPageNewUser ? 'account-no-sidebar' : ''}`}>
          {shouldShowHeader && (
            <Header
              isSidebarOpen={isSidebarOpen}
              onMenuClick={() => setIsSidebarOpen((open) => !open)}
            />
          )}
          <main className={`content-area ${isFullBleedPath ? 'full-bleed' : ''} ${isAdminPage ? 'admin-content' : ''}`}>
            <div className={`content-inner ${isFullBleedPath ? 'full-bleed' : ''} ${isAdminPage ? 'admin-content' : ''}`}>
              <div key={location.pathname} style={{ animation: 'fadeIn 0.32s cubic-bezier(0.22,1,0.36,1) both' }}>
                {/* Wraps the routed page, not the whole app, so a crash on one
                    screen leaves the header, sidebar and every other route
                    usable. resetKey is the pathname, which means navigating away
                    clears the error automatically - without it a student who hit
                    a broken page would still be looking at the error after
                    choosing somewhere else. */}
                <ErrorBoundary
                  resetKey={location.pathname}
                  onBack={() => navigate(-1)}
                >
                  <Outlet />
                </ErrorBoundary>
              </div>
            </div>
          </main>
        </div>

      </div>

      {showFooter && <Footer />}
    </>
  )
}

export default App

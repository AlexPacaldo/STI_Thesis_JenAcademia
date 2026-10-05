import { useState, useEffect } from "react";
import styles from "../assets/login.module.css";
import Girl from "../assets/img/homepage/Girl.png";
import { useNotification } from "../components/NotificationContainer.jsx";
import { Link } from "react-router-dom";
import { writeStoredUser } from "../utils/sessionUser.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS, writeNamespacedStorageValue } from "../utils/storageKeys.js";
import { API_BASE_URL } from "../utils/api.js";

export default function Login() {
  const { notify } = useNotification() || {};
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  async function handleLogin(e) {
    e.preventDefault();

    try {
      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        notify(data.message || "Login failed", "error");
        return;
      }

      const userToStore = {
        id: data.user.id,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        role: data.user.role,
        profileCompleted: data.user.profileCompleted,
        passwordChanged: data.user.passwordChanged,
        profileImageUrl: data.user.profileImageUrl,
        assignedTeacherId: data.user.assignedTeacherId || null,
        timezone: data.user.timezone,
        stayLoggedIn: stayLoggedIn,
      };
      writeStoredUser(userToStore);
      writeNamespacedStorageValue(
        STORAGE_KEYS.lastActivityAt,
        Date.now(),
        LEGACY_STORAGE_KEYS.lastActivityAt
      );

      if (data.user.role === "teacher") {
        writeNamespacedStorageValue(STORAGE_KEYS.teacherId, data.user.id, LEGACY_STORAGE_KEYS.teacherId);
        localStorage.removeItem(STORAGE_KEYS.studentId);
        localStorage.removeItem(STORAGE_KEYS.courseId);
        localStorage.removeItem(LEGACY_STORAGE_KEYS.studentId);
        localStorage.removeItem(LEGACY_STORAGE_KEYS.courseId);
      } else if (data.user.role === "student") {
        writeNamespacedStorageValue(STORAGE_KEYS.studentId, data.user.id, LEGACY_STORAGE_KEYS.studentId);
        localStorage.removeItem(STORAGE_KEYS.teacherId);
        if (data.user.assignedTeacherId) {
          writeNamespacedStorageValue(STORAGE_KEYS.teacherId, data.user.assignedTeacherId, LEGACY_STORAGE_KEYS.teacherId);
        }
        if (data.user.courseId) {
          writeNamespacedStorageValue(STORAGE_KEYS.courseId, data.user.courseId, LEGACY_STORAGE_KEYS.courseId);
        }
      }

      if (!userToStore.profileCompleted) {
        window.location.href = "/account";
        return;
      }

      if (data.user.role === "teacher") {
        window.location.href = "/TeacherDashboard";
      } else if (data.user.role === "admin") {
        window.location.href = "/AdminDashboard";
      } else {
        window.location.href = "/StudentDashboard";
      }
    } catch (err) {
      console.error("Login error:", err);
      notify("Network or server error. Please try again.", "error");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.backRow}>
        <Link to="/" className={styles.backButton}>
          ← Back
        </Link>
      </div>

      <section className={styles.loginSection}>
        <div className={styles.decorativeArea}>
          <img src={Girl} alt="Student learning" className={styles.heroImage} />
        </div>

        <div className={styles.loginCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Welcome Back</span>
            <h1>Sign in to continue learning</h1>
            <p>Access your classes, progress, and teacher messages in one elegant space.</p>
          </div>

          <form onSubmit={handleLogin} className={styles.formSection}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              className={styles.inputField}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                className={styles.inputField}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className={styles.peekButton}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={stayLoggedIn}
                onChange={(e) => setStayLoggedIn(e.target.checked)}
              />
              <span>Stay logged in</span>
            </label>

            <button type="submit" className={styles.submitbtn}>
              Log In
            </button>

            <div className={styles.formFooter}>
              <Link to="/forgot-password" className={styles.forgotPass}>
                Forgot Password?
              </Link>
            </div>
          </form>

          
        </div>
      </section>
    </div>
  );
}

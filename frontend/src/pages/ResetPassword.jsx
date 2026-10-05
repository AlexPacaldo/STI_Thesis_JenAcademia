import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import styles from "../assets/login.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState("");
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function validateToken() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/reset-password/${encodeURIComponent(token || "")}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Invalid reset link");
      } catch (err) {
        if (!ignore) setTokenError(err.message);
      } finally {
        if (!ignore) setValidating(false);
      }
    }
    validateToken();
    return () => { ignore = true; };
  }, [token]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 8) {
      notify("Password must be at least 8 characters.", "warning");
      return;
    }
    if (form.password !== form.confirmPassword) {
      notify("Passwords do not match.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/reset-password/${encodeURIComponent(token || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Could not reset password");
      notify("Password updated. You can now sign in.", "success");
      navigate("/login", { replace: true });
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );

  const EyeOffIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );

  return (
    <div className={styles.page}>
      <div className={styles.backRow}>
        <Link to="/login" className={styles.backButton}>
          ← Back to login
        </Link>
      </div>

      <section className={styles.loginSection}>
        <div className={styles.loginCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Password Reset</span>
            <h1>Set a new password</h1>
            <p>
              {validating
                ? "Validating your reset link..."
                : tokenError
                ? tokenError
                : "Choose a strong password for your account."}
            </p>
          </div>

          {!validating && !tokenError && (
            <form onSubmit={handleSubmit} className={styles.formSection}>
              <label htmlFor="password">New Password</label>
              <div className={styles.passwordWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  className={styles.inputField}
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className={styles.peekButton}
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className={styles.passwordWrapper}>
                <input
                  type={showConfirm ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  className={styles.inputField}
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className={styles.peekButton}
                  onClick={() => setShowConfirm((p) => !p)}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              <button type="submit" className={styles.submitbtn} disabled={submitting}>
                {submitting ? "Saving..." : "Set New Password"}
              </button>
            </form>
          )}

          {!validating && tokenError && (
            <div className={styles.formSection}>
              <Link to="/forgot-password" className={styles.submitbtn} style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
                Request a new link
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

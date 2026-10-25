import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import styles from "../assets/passwordReset.module.css";
import PasswordResetProgress from "../components/PasswordResetProgress.jsx";
import { API_BASE_URL } from "../utils/api.js";

const STEPS = ["New password", "All done"];

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function validateToken() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/reset-password/${encodeURIComponent(token || "")}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || "This reset link is no longer available.");
      } catch (err) {
        if (!ignore) {
          setTokenError(err.message || "We couldn't check this link. Please request a new one.");
        }
      } finally {
        if (!ignore) setValidating(false);
      }
    }

    validateToken();
    return () => {
      ignore = true;
    };
  }, [token]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setFormError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (form.password.length < 8) {
      setFormError("Your password needs at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setFormError("Those passwords don’t match yet. Try again.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/reset-password/${encodeURIComponent(token || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "We couldn't save your password. Please try again.");
      setComplete(true);
    } catch (err) {
      setFormError(err.message || "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="reset-title">
        <div className={styles.topRow}>
          <Link to="/login" className={styles.backLink}>← Back to sign in</Link>
          <span className={styles.badge}>Account help</span>
        </div>

        {!validating && !tokenError && (
          <PasswordResetProgress steps={STEPS} currentStep={complete ? 1 : 0} />
        )}

        {validating ? (
          <div className={styles.content} role="status" aria-live="polite">
            <span className={styles.bigIcon} aria-hidden="true">🔎</span>
            <p className={styles.eyebrow}>One moment</p>
            <h1 id="reset-title">Checking your link…</h1>
            <p className={styles.description}>We’re making sure it’s safe to set a new password.</p>
          </div>
        ) : tokenError ? (
          <div className={styles.content} role="alert">
            <span className={styles.bigIcon} aria-hidden="true">📭</span>
            <p className={styles.eyebrow}>Let’s try again</p>
            <h1 id="reset-title">This link needs a fresh start</h1>
            <p className={styles.description}>{tokenError}</p>
            <Link to="/forgot-password" className={styles.primaryButton}>Ask for a new link</Link>
          </div>
        ) : complete ? (
          <div className={styles.content} role="status" aria-live="polite">
            <span className={styles.bigIcon} aria-hidden="true">🎉</span>
            <p className={styles.eyebrow}>Step 2 · All done</p>
            <h1 id="reset-title">You did it!</h1>
            <p className={styles.description}>
              Your new password is ready. You can use it the next time you sign in.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => navigate("/login", { replace: true })}
            >
              Sign in with my new password
            </button>
          </div>
        ) : (
          <div className={styles.content}>
            <span className={styles.bigIcon} aria-hidden="true">🔐</span>
            <p className={styles.eyebrow}>Step 1 · Make a new password</p>
            <h1 id="reset-title">Choose your new password</h1>
            <p className={styles.description}>
              Make it at least 8 characters long, then type it again so we know it’s right.
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="password">New password</label>
                <div className={styles.passwordWrap}>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-describedby="password-hint"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="At least 8 characters"
                    required
                  />
                  <button
                    type="button"
                    className={styles.showButton}
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? "Hide new password" : "Show new password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="confirmPassword">Type it one more time</label>
                <div className={styles.passwordWrap}>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    placeholder="Type the same password"
                    required
                  />
                  <button
                    type="button"
                    className={styles.showButton}
                    onClick={() => setShowConfirm((shown) => !shown)}
                    aria-label={showConfirm ? "Hide password confirmation" : "Show password confirmation"}
                  >
                    {showConfirm ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <p id="password-hint" className={styles.passwordHint}>
                {form.password.length >= 8 ? "✓ Great! Your password is long enough." : "Use 8 or more characters."}
              </p>
              {formError && <p className={styles.errorMessage} role="alert">{formError}</p>}

              <button type="submit" className={styles.primaryButton} disabled={submitting}>
                {submitting ? "Saving your password…" : "Save my new password"}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}

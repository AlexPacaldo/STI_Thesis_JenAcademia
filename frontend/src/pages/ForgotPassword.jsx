import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "../assets/passwordReset.module.css";
import PasswordResetProgress from "../components/PasswordResetProgress.jsx";
import { API_BASE_URL } from "../utils/api.js";

const STEPS = ["Your email", "Check your email"];

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "We couldn't send the link. Please try again.");
      setSent(true);
    } catch (err) {
      setError(err.message || "We couldn't reach the server. Check your connection and try again.");
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

        <PasswordResetProgress steps={STEPS} currentStep={sent ? 1 : 0} />

        {!sent ? (
          <div className={styles.content}>
            <span className={styles.bigIcon} aria-hidden="true">🔑</span>
            <p className={styles.eyebrow}>A little password help</p>
            <h1 id="reset-title">Let’s get you back in!</h1>
            <p className={styles.description}>
              Tell us the email you use for JEN Academia. We’ll send you a safe link to choose a new password.
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.field} htmlFor="email">
                <span>Your email address</span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  required
                />
              </label>

              {error && <p className={styles.errorMessage} role="alert">{error}</p>}

              <button type="submit" className={styles.primaryButton} disabled={submitting}>
                {submitting ? "Sending your link…" : "Send me a reset link"}
              </button>
            </form>
            <p className={styles.footerHint}>You’ll need to open the link from your email to continue.</p>
          </div>
        ) : (
          <div className={styles.content} role="status" aria-live="polite">
            <span className={styles.bigIcon} aria-hidden="true">📬</span>
            <p className={styles.eyebrow}>Step 2 · Check your email</p>
            <h1 id="reset-title">Your next step is in your inbox!</h1>
            <p className={styles.description}>
              If there’s an account for <strong>{email.trim()}</strong>, a reset link is on its way.
            </p>
            <div className={styles.tip}>
              <strong>Can’t see it?</strong> Check your spam or junk folder. The link will only work for a little while.
            </div>
            <Link to="/login" className={styles.primaryButton}>Back to sign in</Link>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                setSent(false);
                setError("");
              }}
            >
              Try a different email address
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

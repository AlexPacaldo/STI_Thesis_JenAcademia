import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "../assets/login.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";

export default function ForgotPassword() {
  const { notify } = useNotification() || {};
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.message || "Something went wrong", "error");
        return;
      }
      setSent(true);
    } catch {
      notify("Network or server error. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

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
            <h1>Forgot your password?</h1>
            <p>
              {sent
                ? "Check your inbox — if that email is registered, we sent a reset link."
                : "Enter your email and we'll send you a link to reset your password."}
            </p>
          </div>

          {!sent && (
            <form onSubmit={handleSubmit} className={styles.formSection}>
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

              <button type="submit" className={styles.submitbtn} disabled={submitting}>
                {submitting ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          )}

          {sent && (
            <div className={styles.formSection}>
              <Link to="/login" className={styles.submitbtn} style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
                Back to login
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

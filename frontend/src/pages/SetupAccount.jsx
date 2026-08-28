import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import styles from "../assets/login.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { API_BASE_URL } from "../utils/api.js";
import { clearStoredUser, readStoredUser } from "../utils/sessionUser.js";

export default function SetupAccount() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [currentUser, setCurrentUser] = useState(() => readStoredUser());

  useEffect(() => {
    let ignore = false;

    async function loadInvite() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/account-setup/${encodeURIComponent(token || "")}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Invite link is invalid");
        if (!ignore) setInvite(data.invite);
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadInvite();
    return () => {
      ignore = true;
    };
  }, [token]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isDifferentLoggedInUser) {
      notify?.("Please log out of the current account before using this invite.", "warning");
      return;
    }

    if (form.password.length < 8) {
      notify?.("Password must be at least 8 characters.", "warning");
      return;
    }
    if (form.password !== form.confirmPassword) {
      notify?.("Passwords do not match.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/account-setup/${encodeURIComponent(token || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Could not complete setup");
      notify?.("Password set. Please sign in to complete your profile.", "success");
      navigate("/login", { replace: true });
    } catch (err) {
      notify?.(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogoutAndContinue() {
    clearStoredUser();
    setCurrentUser(null);
    window.dispatchEvent(new Event("userLoggedOut"));
    notify?.("Signed out. You can continue setting up this invited account.", "info");
  }

  const fullName = `${invite?.firstName || ""} ${invite?.lastName || ""}`.trim();
  const isDifferentLoggedInUser =
    Boolean(invite?.userId && currentUser?.id) &&
    String(invite.userId) !== String(currentUser.id);
  const currentUserName = `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim();

  return (
    <div className={styles.page}>
      <div className={styles.backRow}>
        <Link to="/login" className={styles.backButton}>
          Back to login
        </Link>
      </div>

      <section className={styles.loginSection}>
        <div className={styles.loginCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Account Setup</span>
            <h1>Set your account password</h1>
            {loading ? (
              <p>Checking your invite link...</p>
            ) : error ? (
              <p>{error}</p>
            ) : (
              <p>
                {fullName ? `${fullName}, ` : ""}use this form to secure your JEN Academia account for {invite.email}.
              </p>
            )}
          </div>

          {!loading && !error && isDifferentLoggedInUser && (
            <div className={styles.formSection}>
              <p>
                This invite is for {invite.email}, but this browser is currently signed in as{" "}
                {currentUserName || currentUser?.role || "another account"}.
              </p>
              <button type="button" className={styles.submitbtn} onClick={handleLogoutAndContinue}>
                Log out and continue setup
              </button>
              <Link to="/login" className={styles.forgotPass}>
                Go to login
              </Link>
            </div>
          )}

          {!loading && !error && !isDifferentLoggedInUser && (
            <form onSubmit={handleSubmit} className={styles.formSection}>
              <label htmlFor="password">New Password</label>
              <input
                type="password"
                id="password"
                name="password"
                className={styles.inputField}
                placeholder="At least 8 characters"
                value={form.password}
                onChange={handleChange}
                required
                minLength={8}
              />

              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                className={styles.inputField}
                placeholder="Re-enter your password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                minLength={8}
              />

              <button type="submit" className={styles.submitbtn} disabled={submitting}>
                {submitting ? "Saving..." : "Set Password"}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

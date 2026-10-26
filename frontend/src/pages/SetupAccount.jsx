import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import styles from "../assets/setupAccount.module.css";
import { API_BASE_URL } from "../utils/api.js";
import { clearStoredUser, readStoredUser } from "../utils/sessionUser.js";
import { clearSessionToken } from "../utils/apiAuth.js";

const SETUP_STEPS = ["Hello", "Secret password", "Ready"];

export default function SetupAccount() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [currentUser, setCurrentUser] = useState(() => readStoredUser());

  useEffect(() => {
    let ignore = false;

    async function loadInvite() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/account-setup/${encodeURIComponent(token || "")}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "This invite link is not ready.");
        if (!ignore) setInvite(data.invite);
      } catch (err) {
        if (!ignore) setError(err.message || "We could not open this invite. Ask your teacher for help.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadInvite();
    return () => {
      ignore = true;
    };
  }, [token]);

  const fullName = `${invite?.firstName || ""} ${invite?.lastName || ""}`.trim();
  const roleName = invite?.role === "teacher" ? "teacher" : "student";
  const isDifferentLoggedInUser =
    Boolean(invite?.userId && (currentUser?.id || currentUser?.user_id)) &&
    String(invite.userId) !== String(currentUser.id || currentUser.user_id);
  const currentUserName = `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim();

  function handleLogoutAndContinue() {
    clearStoredUser();
    clearSessionToken();
    setCurrentUser(null);
    window.dispatchEvent(new Event("userLoggedOut"));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (isDifferentLoggedInUser) {
      setError("Please sign out of the other account first.");
      return;
    }
    if (form.password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Those passwords do not match yet. Try again.");
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
      if (!res.ok) throw new Error(data?.message || "We could not save your password. Try again.");
      setStep(2);
    } catch (err) {
      setError(err.message || "We could not save your password. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="setup-title">
        <div className={styles.topRow}>
          <Link to="/login" className={styles.backLink}>Back to sign in</Link>
          <span className={styles.roleBadge}>
            {roleName === "teacher" ? "Teacher" : "Student"}
          </span>
        </div>

        {loading ? (
          <div className={styles.messageState} role="status">Opening your invite...</div>
        ) : error && !invite ? (
          <div className={styles.messageState} role="alert">
            <span className={styles.bigIcon} aria-hidden="true">💌</span>
            <h1 id="setup-title">We couldn’t open your invite</h1>
            <p>{error}</p>
            <Link className={styles.primaryButton} to="/login">Go to sign in</Link>
          </div>
        ) : (
          <>
            <div className={styles.progress} aria-label={`Step ${step + 1} of ${SETUP_STEPS.length}`}>
              {SETUP_STEPS.map((label, index) => (
                <div
                  key={label}
                  className={`${styles.progressStep} ${index <= step ? styles.progressActive : ""}`}
                  aria-current={index === step ? "step" : undefined}
                >
                  <span>{index < step ? "✓" : index + 1}</span>
                  <small>{label}</small>
                </div>
              ))}
            </div>

            {step === 0 && (
              <div className={styles.stepContent}>
                <span className={styles.bigIcon} aria-hidden="true">🌟</span>
                <p className={styles.eyebrow}>Your new JEN Academia account</p>
                <h1 id="setup-title">Hi{fullName ? `, ${fullName}` : ""}!</h1>
                <p className={styles.description}>
                  Let’s make your {roleName} account ready. First, we’ll make a secret password.
                </p>
                <div className={styles.nextNote}>
                  After you sign in, we’ll help you add your picture and contact details. Then we’ll show you around.
                </div>
                <button type="button" className={styles.primaryButton} onClick={() => setStep(1)}>
                  Let’s go
                </button>
              </div>
            )}

            {step === 1 && (
              <form className={styles.stepContent} onSubmit={handleSubmit}>
                <span className={styles.bigIcon} aria-hidden="true">🔐</span>
                <p className={styles.eyebrow}>Step 1</p>
                <h1 id="setup-title">Make a secret password</h1>
                <p className={styles.description}>Choose a password with at least 8 characters. Keep it secure.</p>

                {isDifferentLoggedInUser && (
                  <div className={styles.errorMessage} role="alert">
                    This invite is for {invite.email}, but this browser is signed in
                    {currentUserName ? ` as ${currentUserName}` : " to another account"}.
                    <button type="button" className={styles.secondaryButton} onClick={handleLogoutAndContinue}>
                      Sign out and keep going
                    </button>
                  </div>
                )}

                <label className={styles.field}>
                  <span>Your new password</span>
                  <div className={styles.passwordWrap}>
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={8}
                      value={form.password}
                      onChange={(event) => {
                        setForm((current) => ({ ...current, password: event.target.value }));
                        setError("");
                      }}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword((shown) => !shown)}>
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>
                <label className={styles.field}>
                  <span>Type it one more time</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    value={form.confirmPassword}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, confirmPassword: event.target.value }));
                      setError("");
                    }}
                    required
                  />
                </label>
                {error && <p className={styles.errorMessage} role="alert">{error}</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setStep(0)}>
                    Back
                  </button>
                  <button type="submit" className={styles.primaryButton} disabled={submitting || isDifferentLoggedInUser}>
                    {submitting ? "Saving..." : "Save my password"}
                  </button>
                </div>
              </form>
            )}

            {step === 2 && (
              <div className={styles.stepContent}>
                <span className={styles.bigIcon} aria-hidden="true">🎉</span>
                <p className={styles.eyebrow}>Password saved</p>
                <h1 id="setup-title">You did it!</h1>
                <p className={styles.description}>
                  Sign in with <strong>{invite.email}</strong>. We’ll help you finish your profile and show you how to use the website.
                </p>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => navigate("/login", { replace: true })}
                >
                  Go to sign in
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

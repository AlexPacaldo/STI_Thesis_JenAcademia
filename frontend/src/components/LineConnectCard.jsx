import axios from "axios";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "../assets/lineConnect.module.css";
import { API_BASE_URL } from "../utils/api.js";
import { OpenLineArt, SendCodeArt, TickArt, WaitingArt } from "./LineStepArt.jsx";
import { useNotification } from "./NotificationContainer.jsx";

const API = API_BASE_URL;
const POLL_INTERVAL_MS = 4000;

function formatExpiry(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * The LINE linking guide, written to be followed by a child.
 *
 * !! Three numbered actions, one per card, and a green tick when it worked.
 * !! The code is short-lived and one-use: it is the only proof that the person
 * !! holding the phone is the person signed in to this account, so it must not
 * !! be treated as a permanent connection string.
 *
 * !! `required` hides Disconnect and pauses the reminder switch. Those are
 * !! choices for somebody who already knows how LINE works, not for a first
 * !! sign-in that cannot continue without the link.
 */
export default function LineConnectCard({
  userId,
  required = false,
  showHeader = true,
  onStateChange,
}) {
  const { notify } = useNotification() || {};
  const headingId = useId();
  const [status, setStatus] = useState({
    loading: true,
    configured: false,
    webhookConfigured: false,
    linked: false,
    displayName: "",
    remindersEnabled: true,
    addFriendUrl: "",
    basicId: "",
    botName: "",
  });
  const [linkCode, setLinkCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const wasLinkedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) return null;
    try {
      const response = await axios.get(`${API}/api/users/${userId}/line`);
      const next = { loading: false, ...response.data };
      setStatus(next);
      setError("");

      if (next.linked) {
        setLinkCode(null);
        if (!wasLinkedRef.current && linkCode) {
          notify?.("LINE connected. Reminders will arrive in your LINE chat.", "success");
        }
        wasLinkedRef.current = true;
      } else {
        wasLinkedRef.current = false;
      }

      return next;
    } catch (err) {
      setStatus((current) => ({ ...current, loading: false }));
      setError(
        err?.response?.data?.message || "We could not check LINE. Press try again."
      );
      return null;
    }
  }, [userId, linkCode, notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tell the parent whether the account can move on. The onboarding wizard
  // uses this to keep its Next button locked until the green tick appears.
  const usable = Boolean(status.configured && status.webhookConfigured);
  useEffect(() => {
    onStateChange?.({ loading: status.loading, linked: status.linked, usable });
  }, [status.loading, status.linked, usable, onStateChange]);

  // While a code is on screen, check whether the chat has completed the link.
  // Polling is cheap (one authenticated read every four seconds) and avoids
  // asking the child to reload the page after sending the code.
  useEffect(() => {
    if (!linkCode || status.linked) return undefined;
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [linkCode, status.linked, refresh]);

  async function connect() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await axios.post(`${API}/api/users/${userId}/line/link-code`);
      setLinkCode(response.data);
      setStatus((current) => ({
        ...current,
        addFriendUrl: response.data.addFriendUrl || current.addFriendUrl,
        basicId: response.data.basicId || current.basicId,
        botName: response.data.botName || current.botName,
      }));
    } catch (err) {
      setError(err?.response?.data?.message || "We could not make a secret number. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!linkCode?.code) return;
    try {
      await navigator.clipboard.writeText(linkCode.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Copying is a shortcut, not the only way: the number stays on screen
      // and can be typed by hand.
      setCopied(false);
    }
  }

  async function toggleReminders() {
    const next = !status.remindersEnabled;
    setBusy(true);
    setError("");
    try {
      await axios.patch(`${API}/api/users/${userId}/line/reminders`, { enabled: next });
      setStatus((current) => ({ ...current, remindersEnabled: next }));
      notify?.(next ? "LINE reminders turned on." : "LINE reminders paused.", "success");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not save that choice.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await axios.delete(`${API}/api/users/${userId}/line`);
      setStatus((current) => ({
        ...current,
        linked: false,
        displayName: "",
        linkedAt: null,
      }));
      setLinkCode(null);
      setConfirmingDisconnect(false);
      wasLinkedRef.current = false;
      notify?.("LINE disconnected. You will no longer get reminders there.", "success");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not disconnect LINE. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!userId) return null;

  const botName = status.botName || "JEN Academia";
  const addFriendUrl = status.addFriendUrl || "";
  const code = linkCode?.code || "";
  const expires = formatExpiry(linkCode?.expiresAt);

  return (
    <section
      className={`${styles.card} ${required ? styles.requiredCard : ""}`}
      aria-labelledby={showHeader ? headingId : undefined}
      aria-label={showHeader ? undefined : "Connect LINE steps"}
    >
      {showHeader ? (
        <header className={styles.head}>
          <span className={styles.headIcon} aria-hidden="true">💬</span>
          <div className={styles.headText}>
            <h2 id={headingId} className={styles.title}>
              {required ? "Connect LINE" : "LINE messages"}
            </h2>
            <p className={styles.subtitle}>
              We send your class reminders here. It is free, and it takes one minute.
            </p>
          </div>
          {status.linked ? <span className={styles.connectedBadge}>✅ Connected</span> : null}
        </header>
      ) : null}

      {status.loading ? (
        <p className={styles.muted}>Checking LINE…</p>
      ) : null}

      {!status.loading && !status.configured ? (
        <p className={styles.notice}>
          {required
            ? "LINE is not ready yet. Please ask the school administrator to finish setting it up. You can continue once it is ready."
            : "LINE is not ready yet. Your teacher will finish setting it up. You can keep going and connect it later."}
        </p>
      ) : null}

      {!status.loading && status.configured && !status.webhookConfigured ? (
        <p className={styles.notice}>
          {required
            ? "LINE is almost ready. Please ask the school administrator to finish setting it up. You can continue once it is ready."
            : "LINE is almost ready. The school still has one setting to finish. You can keep going and connect it later."}
        </p>
      ) : null}

      {!status.loading && status.configured && status.linked ? (
        <div className={styles.success}>
          <figure className={styles.successArt}>
            <TickArt />
          </figure>
          <p className={styles.successTitle}>You are connected!</p>
          <p className={styles.successBody}>
            <strong>{status.displayName || "Your LINE account"}</strong>
            {status.botName ? <> · {status.botName}</> : null}
          </p>
          <p className={styles.successBody}>
            Your class reminders will pop up in LINE. Nothing else to do.
          </p>

          {!required ? (
            <>
              <label className={styles.toggleRow}>
                <span>
                  <span className={styles.toggleLabel}>Send me reminders</span>
                  <span className={styles.muted}>
                    Turn this off to keep the link but stop every LINE message.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={Boolean(status.remindersEnabled)}
                  onChange={toggleReminders}
                  disabled={busy}
                />
              </label>

              {confirmingDisconnect ? (
                <div className={styles.confirmRow}>
                  <span>Disconnect LINE from this account?</span>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => setConfirmingDisconnect(false)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={disconnect}
                      disabled={busy}
                    >
                      {busy ? "Disconnecting…" : "Yes, disconnect"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => setConfirmingDisconnect(true)}
                    disabled={busy}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {!status.loading && status.configured && !status.linked ? (
        !code ? (
          <div className={styles.start}>
            <ol className={styles.previewSteps}>
              <li>
                <span className={styles.previewArt}>
                  <OpenLineArt />
                </span>
                <span className={styles.previewText}>
                  <span className={styles.previewNumber} aria-hidden="true">1</span>
                  Open LINE
                </span>
              </li>
              <li>
                <span className={styles.previewArt}>
                  <SendCodeArt />
                </span>
                <span className={styles.previewText}>
                  <span className={styles.previewNumber} aria-hidden="true">2</span>
                  Send us the secret number
                </span>
              </li>
              <li>
                <span className={styles.previewArt}>
                  <WaitingArt />
                </span>
                <span className={styles.previewText}>
                  <span className={styles.previewNumber} aria-hidden="true">3</span>
                  Wait for the green tick ✅
                </span>
              </li>
            </ol>
            <button
              type="button"
              className={styles.bigButton}
              onClick={connect}
              disabled={busy}
            >
              {busy ? "Getting your number…" : "Show my secret number 🔢"}
            </button>
          </div>
        ) : (
          <div className={styles.guide} aria-live="polite">
            <div className={styles.step}>
              <div className={styles.stepHead}>
                <span className={styles.stepNumber} aria-hidden="true">1</span>
                <p className={styles.stepTitle}>Open LINE</p>
              </div>
              <figure className={styles.stepArt}>
                <OpenLineArt />
              </figure>
              <div className={styles.stepBody}>
                <p className={styles.stepText}>
                  Add <strong>{botName}</strong> as a friend.
                </p>
                {addFriendUrl ? (
                  <a
                    className={styles.bigButton}
                    href={addFriendUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open LINE
                  </a>
                ) : null}
                {status.basicId ? (
                  <p className={styles.stepHint}>
                    Cannot find it? Search for <strong>{status.basicId}</strong>.
                  </p>
                ) : null}
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepHead}>
                <span className={styles.stepNumber} aria-hidden="true">2</span>
                <p className={styles.stepTitle}>Type this secret number</p>
              </div>
              <figure className={styles.stepArt}>
                <SendCodeArt code={code} />
              </figure>
              <div className={styles.stepBody}>
                <div className={styles.code}>{code}</div>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={copyCode}
                >
                  {copied ? "Copied! ✅" : "Copy the number"}
                </button>
                <p className={styles.stepHint}>
                  Send it in the chat with {botName}.
                </p>
                {expires ? (
                  <p className={styles.stepHint}>It works until {expires}.</p>
                ) : null}
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepHead}>
                <span className={styles.stepNumber} aria-hidden="true">3</span>
                <p className={styles.stepTitle}>Wait for the green tick</p>
              </div>
              <figure className={styles.stepArt}>
                <WaitingArt />
              </figure>
              <div className={styles.stepBody}>
                <p className={styles.stepText}>
                  We check by ourselves. This card changes when it works.
                </p>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={refresh}
                  disabled={busy}
                >
                  Check again
                </button>
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={connect}
                disabled={busy}
              >
                {busy ? "Getting a new number…" : "Get a new number"}
              </button>
            </div>
          </div>
        )
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" className={styles.retryButton} onClick={refresh}>
            Try again
          </button>
        </div>
      ) : null}
    </section>
  );
}

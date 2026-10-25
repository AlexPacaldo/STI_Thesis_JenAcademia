import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../assets/lineConnect.module.css";
import { API_BASE_URL } from "../utils/api.js";
import { useNotification } from "./NotificationContainer.jsx";

const API = API_BASE_URL;
const POLL_INTERVAL_MS = 5000;

function formatExpiry(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Account-page card for linking a LINE account and controlling reminders.
 *
 * !! The code shown here is deliberately short-lived and one-use. It is the
 * !! only proof that the person holding the phone is the person signed in to
 * !! this account; treating it like a permanent connection string would let
 * !! anyone who saw a screenshot link their own LINE to somebody else's
 * !! classes.
 */
export default function LineConnectCard({ userId }) {
  const { notify } = useNotification() || {};
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
        err?.response?.data?.message || "Could not check your LINE connection. Try again in a moment."
      );
      return null;
    }
  }, [userId, linkCode, notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // While a code is on screen, check whether the chat has completed the link.
  // Polling is cheap (one authenticated read every five seconds) and avoids
  // asking the student to reload the page after they send the code.
  useEffect(() => {
    if (!linkCode || status.linked) return undefined;
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [linkCode, status.linked, refresh]);

  async function connect() {
    setBusy(true);
    setError("");
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
      setError(err?.response?.data?.message || "Could not create a linking code. Try again.");
    } finally {
      setBusy(false);
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
      setError(err?.response?.data?.message || "Could not save that preference.");
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

  return (
    <section className={styles.card} aria-labelledby="line-reminders-title">
      <div className={styles.head}>
        <div>
          <h2 id="line-reminders-title" className={styles.title}>
            LINE reminders
          </h2>
          <p className={styles.subtitle}>
            Get a message in LINE when your class is about to start, or when someone
            asks to reschedule it.
          </p>
        </div>
        {status.linked ? <span className={styles.connectedBadge}>Connected</span> : null}
      </div>

      {status.loading ? <p className={styles.muted}>Checking your LINE connection…</p> : null}

      {!status.loading && !status.configured ? (
        <p className={styles.notice}>
          LINE reminders are not available yet. Ask the admin to connect the school&apos;s
          LINE Official Account.
        </p>
      ) : null}

      {!status.loading && status.configured && !status.webhookConfigured ? (
        <p className={styles.notice}>
          LINE is connected to the school, but the webhook secret is missing, so accounts
          cannot be linked yet. Ask the admin to finish the setup.
        </p>
      ) : null}

      {!status.loading && status.configured && status.linked ? (
        <div className={styles.linkedBody}>
          <p className={styles.linkedLine}>
            <strong>{status.displayName || "Your LINE account"}</strong>
            {status.botName ? <span className={styles.muted}> · via {status.botName}</span> : null}
          </p>

          <label className={styles.toggleRow}>
            <span>
              <span className={styles.toggleLabel}>Send reminders</span>
              <span className={styles.muted}>
                Turn this off to keep the link but pause every LINE message.
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
        </div>
      ) : null}

      {!status.loading && status.configured && !status.linked ? (
        <div className={styles.linkBody}>
          {!linkCode ? (
            <button type="button" className={styles.primaryButton} onClick={connect} disabled={busy}>
              {busy ? "Creating a code…" : "Connect LINE"}
            </button>
          ) : (
            <div className={styles.codeBody} aria-live="polite">
              <p className={styles.stepTitle}>Your linking code</p>
              <div className={styles.code}>{linkCode.code}</div>
              {formatExpiry(linkCode.expiresAt) ? (
                <p className={styles.muted}>Expires at {formatExpiry(linkCode.expiresAt)}.</p>
              ) : null}

              <ol className={styles.steps}>
                <li>
                  {status.addFriendUrl ? (
                    <>
                      Add the school&apos;s LINE Official Account:{" "}
                      <a
                        className={styles.link}
                        href={status.addFriendUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        open LINE and add {status.botName || "JEN Academia"}
                      </a>
                      .
                    </>
                  ) : (
                    <>
                      Open LINE and add{" "}
                      <strong>{status.botName || "the school's Official Account"}</strong>
                      {status.basicId ? <> (search for {status.basicId})</> : null}.
                    </>
                  )}
                </li>
                <li>Send the six-digit code above to that chat.</li>
                <li>Come back here — this card will update by itself.</li>
              </ol>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={connect}
                  disabled={busy}
                >
                  {busy ? "Getting a new code…" : "Get a new code"}
                </button>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={refresh}
                  disabled={busy}
                >
                  I sent it — check again
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

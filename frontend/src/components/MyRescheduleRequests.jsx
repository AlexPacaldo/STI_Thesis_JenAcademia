import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../utils/api.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import {
  convertDateTime,
  DEFAULT_TIMEZONE,
  humanTime,
} from "../utils/timezone.js";
import styles from "./MyRescheduleRequests.module.css";

const API = API_BASE_URL;

const STATUS_META = {
  pending: {
    label: "Pending",
    description: "Waiting for the other person to respond. Your class time has not changed.",
    className: styles.pending,
  },
  approved: {
    label: "Approved",
    description: "Approved. Your calendar has been updated.",
    className: styles.approved,
  },
  declined: {
    label: "Declined",
    description: "This request was declined.",
    className: styles.declined,
  },
  cancelled: {
    label: "Cancelled",
    description: "You cancelled this request before it was resolved.",
    className: styles.cancelled,
  },
};

function formatRequestedMoment(request, viewerTimezone) {
  const moment = convertDateTime(
    request.requested_date,
    request.requested_time,
    request.teacher_timezone || DEFAULT_TIMEZONE,
    viewerTimezone || DEFAULT_TIMEZONE
  );
  const date = new Date(`${moment.date}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? moment.date
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  return `${dateLabel} at ${humanTime(moment.time)}`;
}

export default function MyRescheduleRequests({
  userId,
  viewerTimezone,
  refreshToken = 0,
}) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualRefreshToken, setManualRefreshToken] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState(null);
  const [workingRequestId, setWorkingRequestId] = useState(null);
  const [actionError, setActionError] = useState("");
  const requestVersion = useRef(0);
  const triggerRef = useRef(null);
  const closeButtonRef = useRef(null);

  const fetchRequests = useCallback(async (showLoading = false) => {
    if (!userId) return;

    const version = ++requestVersion.current;
    if (showLoading) setLoading(true);
    try {
      const response = await axios.get(
        `${API}/api/calendar/my-submitted-reschedule-requests/${userId}`
      );
      if (version === requestVersion.current) {
        setRequests(response.data?.requests || []);
        setError("");
      }
    } catch (requestError) {
      console.error("Error fetching your reschedule requests:", requestError);
      if (version === requestVersion.current) {
        setError(
          requestError?.response?.data?.message ||
            "Your reschedule requests could not be loaded."
        );
      }
    } finally {
      if (version === requestVersion.current && showLoading) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchRequests(true);
    return () => {
      requestVersion.current += 1;
    };
  }, [fetchRequests, refreshToken, manualRefreshToken]);

  useEffect(() => {
    if (!requests.some((request) => request.status === "pending")) return undefined;

    const intervalId = window.setInterval(() => {
      void fetchRequests(false);
    }, 30_000);
    const handleVisibilityChange = () => {
      if (!document.hidden) void fetchRequests(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchRequests, requests]);

  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const latestStatus = STATUS_META[requests[0]?.status]?.label;
  const pillStatus = pendingCount
    ? `${pendingCount} pending`
    : latestStatus || (loading ? "Loading" : "Check status");

  const performRequestAction = async () => {
    if (!confirmingAction || workingRequestId) return;

    const { request, action } = confirmingAction;
    setWorkingRequestId(request.request_id);
    setActionError("");
    try {
      if (action === "cancel") {
        await axios.post(
          `${API}/api/calendar/reschedule-requests/${request.request_id}/cancel`,
          { user_id: userId }
        );
      } else {
        await axios.delete(
          `${API}/api/calendar/my-submitted-reschedule-requests/${userId}/${request.request_id}`
        );
      }
      setConfirmingAction(null);
      await fetchRequests(true);
    } catch (requestError) {
      console.error(
        `Error ${action === "cancel" ? "cancelling" : "removing"} reschedule request:`,
        requestError
      );
      setActionError(
        requestError?.response?.data?.message ||
          `Could not ${action} this request. Please try again.`
      );
    } finally {
      setWorkingRequestId(null);
    }
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement;
    const triggerElement = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = document.querySelector("[role='dialog'][aria-labelledby='my-reschedule-requests-title']");
      const focusable = dialog?.querySelectorAll(
        "button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])"
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      } else {
        triggerElement?.focus();
      }
    };
  }, [isOpen]);

  if (!error && requests.length === 0) return null;

  return (
    <>
      <div className={styles.triggerWrap}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          onClick={() => setIsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={`View your reschedule request status. ${pillStatus}.`}
        >
          <span className={styles.triggerIcon} aria-hidden="true">↻</span>
          <span>Reschedule status</span>
          <span className={`${styles.triggerBadge} ${pendingCount ? styles.pending : styles.triggerResolved}`}>
            {pillStatus}
          </span>
        </button>
      </div>

      {isOpen && (
        <ModalPortal>
          <div
            className={styles.backdrop}
            onClick={(event) => {
              if (event.target === event.currentTarget) setIsOpen(false);
            }}
          >
            <section
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="my-reschedule-requests-title"
              aria-describedby="my-reschedule-requests-description"
            >
              <div className={styles.heading}>
                <div>
                  <p className={styles.eyebrow}>Schedule updates</p>
                  <h2 id="my-reschedule-requests-title">Your reschedule requests</h2>
                  <p className={styles.intro} id="my-reschedule-requests-description">
                    Track requests you have sent. Your class only moves after approval.
                  </p>
                </div>
                <div className={styles.headingActions}>
                  <button
                    type="button"
                    className={styles.refreshButton}
                    onClick={() => setManualRefreshToken((value) => value + 1)}
                    disabled={loading}
                  >
                    {loading ? "Refreshing…" : "Refresh"}
                  </button>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setIsOpen(false)}
                    aria-label="Close reschedule status"
                  >
                    ×
                  </button>
                </div>
              </div>

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              {actionError && (
                <p className={styles.error} role="alert">
                  {actionError}
                </p>
              )}

              {requests.length > 0 && (
                <div className={styles.list} aria-live="polite">
                  {requests.map((request) => {
                    const status = STATUS_META[request.status] || {
                      label: "Status unavailable",
                      description: "We could not identify this request’s status.",
                      className: styles.unknown,
                    };

                    return (
                      <article className={styles.card} key={request.request_id}>
                        <div className={styles.cardHeading}>
                          <div className={styles.className}>
                            {request.class_name || "Class reschedule"}
                          </div>
                          <span className={`${styles.badge} ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className={styles.requestedTime}>
                          Requested time:{" "}
                          <strong>{formatRequestedMoment(request, viewerTimezone)}</strong>
                        </p>
                        <p className={styles.description}>{status.description}</p>
                        {request.status === "declined" && request.decline_reason && (
                          <p className={styles.declineReason}>
                            Response: {request.decline_reason}
                          </p>
                        )}
                        {request.status === "pending" || ["approved", "declined", "cancelled"].includes(request.status) ? (
                          <div className={styles.requestActions}>
                            {confirmingAction?.request.request_id === request.request_id ? (
                              <div className={styles.confirmActions} role="group" aria-label="Confirm request action">
                                <span>
                                  {confirmingAction.action === "cancel"
                                    ? "Cancel this pending request?"
                                    : "Remove this resolved request?"}
                                </span>
                                <button
                                  type="button"
                                  className={styles.confirmButton}
                                  onClick={performRequestAction}
                                  disabled={workingRequestId === request.request_id}
                                >
                                  {workingRequestId === request.request_id
                                    ? "Working…"
                                    : confirmingAction.action === "cancel"
                                      ? "Confirm cancel"
                                      : "Confirm remove"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.keepButton}
                                  onClick={() => setConfirmingAction(null)}
                                  disabled={workingRequestId === request.request_id}
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={styles.requestAction}
                                onClick={() => {
                                  setActionError("");
                                  setConfirmingAction({
                                    request,
                                    action: request.status === "pending" ? "cancel" : "remove",
                                  });
                                }}
                                disabled={workingRequestId === request.request_id}
                              >
                                {request.status === "pending" ? "Cancel request" : "Remove"}
                              </button>
                            )}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

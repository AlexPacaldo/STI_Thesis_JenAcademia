import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../utils/api.js";
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
  const requestVersion = useRef(0);

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

  if (!error && requests.length === 0) return null;

  return (
    <section
      className={styles.panel}
      aria-labelledby="my-reschedule-requests-title"
      aria-busy={loading}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Schedule updates</p>
          <h2 id="my-reschedule-requests-title">Your reschedule requests</h2>
          <p className={styles.intro}>
            Track requests you have sent. Your class only moves after approval.
          </p>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => setManualRefreshToken((value) => value + 1)}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

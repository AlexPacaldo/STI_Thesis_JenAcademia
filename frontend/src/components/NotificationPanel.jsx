import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/notificationPanel.module.css";
import kid from "../assets/studentKid.module.css";
import {
    clearLocalNotificationsForUser,
    getLocalNotificationsForUser,
    markAllLocalNotificationsReadForUser,
    markLocalNotificationRead,
    mergeNotifications,
} from "../utils/localNotificationStore.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { formatDateInTimezone, getStoredUserTimezone, parseServerTimestamp } from "../utils/timezone.js";
import { useNotification } from "./NotificationContainer";
import { API_BASE_URL } from "../utils/api.js";
import { getNotificationTargetUrl } from "../utils/notificationNavigation.js";
import { dispatchNotificationsChanged } from "../utils/localNotificationStore.js";

const API = API_BASE_URL;

const DECLINE_REASON_MIN_LENGTH = 5;
const DECLINE_REASON_MAX_LENGTH = 500;

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "reschedule", label: "New times" },
  { value: "assignment", label: "Homework" },
  { value: "remark", label: "Teacher notes" },
  { value: "announcement", label: "News" },
  { value: "class_reminder", label: "Reminders" },
];

const TYPE_META = {
  reschedule: { label: "New time", icon: "bi-calendar-event", accent: "#9a5a05", tint: "#fdf1df" },
  assignment: { label: "Homework", icon: "bi-clipboard", accent: "#245394", tint: "#eaf1ff" },
  remark: { label: "Teacher note", icon: "bi-star", accent: "#816200", tint: "#fff7dd" },
  announcement: { label: "School news", icon: "bi-megaphone", accent: "#2f7a3d", tint: "#edf7e9" },
  class_reminder: { label: "Reminder", icon: "bi-bell", accent: "#1f6b66", tint: "#e7f5f3" },
  general: { label: "Update", icon: "bi-pin-angle", accent: "#5e7268", tint: "#f1f4f2" },
};

const getTypeMeta = (type) => TYPE_META[type] || TYPE_META.general;

function formatNotificationTime(value) {
  const date = parseServerTimestamp(value);
  if (!date) return "";

  const timeZone = getStoredUserTimezone();
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);

  const todayKey = formatDateInTimezone(new Date(), timeZone);
  const yesterdayKey = formatDateInTimezone(new Date(Date.now() - 86400000), timeZone);
  const dateKey = formatDateInTimezone(date, timeZone);

  if (dateKey === todayKey) return `Today at ${timeLabel}`;
  if (dateKey === yesterdayKey) return `Yesterday at ${timeLabel}`;

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);

  return `${dateLabel} at ${timeLabel}`;
}

export default function NotificationPanel({ userId, isOpen, onClose }) {
  const { notify } = useNotification() || {};
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [selectedType, setSelectedType] = useState("all"); // filter by type
  const [actionInProgress, setActionInProgress] = useState(null); // track which notification is being acted on
  const [confirmAction, setConfirmAction] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineReasonError, setDeclineReasonError] = useState("");

  // Keep the page behind the drawer still while it is open.
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Fetch all notifications for this user
  const loadNotifications = useCallback(async (pageNum = 1, type = "all") => {
    if (!userId) return;
    setLoading(true);
    const currentUser = readStoredUser() || {};
    const userName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim();
    let localNotifications = getLocalNotificationsForUser({ userId, userName });
    if (type !== "all") {
      localNotifications = localNotifications.filter((notif) => notif.type === type);
    }

    try {
      const params = { page: pageNum, limit: 15 };
      if (type !== "all") params.type = type;

      const response = await axios.get(`${API}/api/notifications/${userId}`, { params });
      const apiNotifications = response.data.notifications || [];
      const merged = mergeNotifications(apiNotifications, localNotifications);
      setNotifications(merged);
      setTotalNotifications((response.data.total || 0) + localNotifications.length);
      setPage(pageNum);
    } catch (err) {
      console.error("Error loading notifications:", err);
      setNotifications(localNotifications);
      setTotalNotifications(localNotifications.length);
      setPage(pageNum);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isOpen && userId) {
      loadNotifications(1, selectedType);
    }
  }, [isOpen, userId, selectedType, loadNotifications]);

  useEffect(() => {
    if (!isOpen || !userId) return undefined;
    const refresh = () => { void loadNotifications(page, selectedType); };
    const onCancelled = (event) => {
      setConfirmAction(current => current && String(current.relatedId) === String(event.detail?.request_id) ? null : current);
    };
    window.addEventListener("notificationsChanged", refresh);
    window.addEventListener("rescheduleRequestCancelled", onCancelled);
    return () => {
      window.removeEventListener("notificationsChanged", refresh);
      window.removeEventListener("rescheduleRequestCancelled", onCancelled);
    };
  }, [isOpen, userId, page, selectedType, loadNotifications]);

  // Mark notification as read
  const handleMarkAsRead = async (notificationId) => {
    try {
      await axios.put(`${API}/api/notifications/${notificationId}/read`);
      markLocalNotificationRead(notificationId);
      dispatchNotificationsChanged();
      setNotifications(prev =>
        prev.map(n => n.notification_id === notificationId ? { ...n, is_read: true } : n)
      );
    } catch (err) {
      console.error("Error marking as read:", err);
      markLocalNotificationRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n.notification_id === notificationId ? { ...n, is_read: true } : n)
      );
    }
  };

  const markNotificationReadLocally = (notificationId) => {
    markLocalNotificationRead(notificationId);
    setNotifications(prev =>
      prev.map(n => n.notification_id === notificationId ? { ...n, is_read: true } : n)
    );
  };

  const handleNotificationClick = async (notification) => {
    if (!notification) return;

    if (!notification.is_read) {
      markNotificationReadLocally(notification.notification_id);
      handleMarkAsRead(notification.notification_id).catch(() => {});
    }

    const currentUser = readStoredUser() || {};
    const targetUrl = getNotificationTargetUrl(
      notification,
      currentUser.role,
      window.location.origin
    );
    navigate(targetUrl);
    onClose?.();
  };

  const closeConfirmAction = () => {
    setConfirmAction(null);
    setDeclineReason("");
    setDeclineReasonError("");
  };

  // Escape closes the confirmation first, then the drawer.
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (confirmAction) {
        setConfirmAction(null);
        setDeclineReason("");
        setDeclineReasonError("");
        return;
      }
      onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, confirmAction]);

  const requestDeleteNotification = (notificationId) => {
    setConfirmAction({
      type: "delete-notification",
      notificationId,
      title: "Delete this note?",
      message: "It will go away for good. You cannot get it back.",
      confirmLabel: "Delete note"
    });
  };

  const requestClearAllNotifications = () => {
    setConfirmAction({
      type: "clear-all-notifications",
      title: "Clear all notes?",
      message: "Every note will go away. You cannot get them back.",
      confirmLabel: "Clear all"
    });
  };

  const requestMarkAllAsRead = () => {
    setConfirmAction({
      type: "mark-all-read",
      title: "Mark everything as read?",
      message: "All your notes will stop saying New.",
      confirmLabel: "Mark all read"
    });
  };

  const requestApproveReschedule = (notificationId, relatedId) => {
    setConfirmAction({
      type: "approve-reschedule",
      notificationId,
      relatedId,
      title: "Move the class?",
      message: "The class will move to the new time.",
      confirmLabel: "Yes, move it"
    });
  };

  const requestRejectReschedule = (notificationId, relatedId) => {
    setDeclineReason("");
    setDeclineReasonError("");
    setConfirmAction({
      type: "reject-reschedule",
      notificationId,
      relatedId,
      title: "Reject request?",
      message: "Tell them why the new time does not work.",
      confirmLabel: "Reject request",
      requiresReason: true
    });
  };

  const performConfirmAction = async () => {
    if (!confirmAction) return;

    const action = confirmAction;

    // A decline without a reason tells the requester nothing, so the reason is
    // validated before anything is sent and the dialog stays open on failure.
    const trimmedDeclineReason = declineReason.trim();
    if (action.type === "reject-reschedule") {
      if (trimmedDeclineReason.length < DECLINE_REASON_MIN_LENGTH) {
        setDeclineReasonError(
          `Please write a little more (at least ${DECLINE_REASON_MIN_LENGTH} characters) so they understand.`
        );
        return;
      }
      if (trimmedDeclineReason.length > DECLINE_REASON_MAX_LENGTH) {
        setDeclineReasonError(`Please keep the reason under ${DECLINE_REASON_MAX_LENGTH} characters.`);
        return;
      }
    }

    const currentUser = readStoredUser() || {};
    const userName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim();

    if (action.type === "delete-notification") {
      try {
        await axios.delete(`${API}/api/notifications/${action.notificationId}`);
        setNotifications(prev => prev.filter(n => n.notification_id !== action.notificationId));
        setTotalNotifications(prev => Math.max(0, prev - 1));
        dispatchNotificationsChanged();
        notify("Notification deleted", "success");
      } catch (err) {
        console.error("Error deleting notification:", err);
        notify("Failed to delete notification", "error");
      }
    }

    if (action.type === "clear-all-notifications") {
      try {
        await axios.delete(`${API}/api/notifications/user/${userId}`);
        clearLocalNotificationsForUser({ userId, userName });
        dispatchNotificationsChanged();
        setNotifications([]);
        setTotalNotifications(0);
        notify("All notifications cleared", "success");
      } catch (err) {
        console.error("Error clearing notifications:", err);
        clearLocalNotificationsForUser({ userId, userName });
        setNotifications([]);
        setTotalNotifications(0);
        notify("All notifications cleared", "success");
      }
    }

    if (action.type === "mark-all-read") {
      try {
        await axios.put(`${API}/api/users/${userId}/notifications/read-all`);
        markAllLocalNotificationsReadForUser({ userId, userName });
        dispatchNotificationsChanged();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        notify("All notifications marked as read", "success");
      } catch (err) {
        console.error("Error marking all as read:", err);
        markAllLocalNotificationsReadForUser({ userId, userName });
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        notify("All notifications marked as read", "success");
      }
    }

    if (action.type === "approve-reschedule") {
      setActionInProgress(action.notificationId);
      try {
        await axios.post(`${API}/api/calendar/reschedule-requests/${action.relatedId}/approve`, {
          user_id: userId
        });
        notify("Reschedule request approved and calendar updated!", "success");
        setNotifications(prev => prev.filter(n => n.notification_id !== action.notificationId));
        setTotalNotifications(Math.max(0, totalNotifications - 1));
      } catch (err) {
        console.error("Error approving reschedule:", err);
        notify(err?.response?.data?.message || "Failed to approve reschedule request", "error");
        if (err?.response?.status === 409) void loadNotifications(page, selectedType);
      } finally {
        setActionInProgress(null);
      }
    }

    if (action.type === "reject-reschedule") {
      setActionInProgress(action.notificationId);
      try {
        await axios.post(`${API}/api/calendar/reschedule-requests/${action.relatedId}/reject`, {
          user_id: userId,
          reason: trimmedDeclineReason
        });
        notify("Reschedule request declined and the requester was notified", "success");
        setNotifications(prev => prev.filter(n => n.notification_id !== action.notificationId));
        setTotalNotifications(Math.max(0, totalNotifications - 1));
      } catch (err) {
        console.error("Error rejecting reschedule:", err);
        notify(err?.response?.data?.message || "Failed to decline reschedule request", "error");
      } finally {
        setActionInProgress(null);
      }
    }

    closeConfirmAction();
  };

  // Get notification title based on type if not provided
  const getNotificationTitle = (notification) => {
    if (notification.title) return notification.title;
    
    const titles = {
      reschedule: "Reschedule Request",
      assignment: "New Assignment",
      remark: "Class Remark",
      announcement: "Announcement",
      class_reminder: "Class Reminder",
      general: "Notification"
    };
    return titles[notification.type] || "Notification";
  };

  const renderNotificationMessage = (message, type, relatedType) => {
    const lines = String(message || "").split("\n");

    return lines.map((line, index) => {
      const trimmed = line.trim();
      if (relatedType === "teacher_availability") {
        const summary = trimmed.match(/^(.+?) updated availability for (\d+) dates? in (.+?) from (.+?) to (.+?) \(([^)]+)\)\.(?: Break: (.+?) to (.+?)\.)?$/);
        if (summary) {
          const [, teacher, count, month, start, end, zone, breakStart, breakEnd] = summary;
          return (
            <span key={index}>
              <span>{teacher} updated availability for {count} {count === "1" ? "date" : "dates"} in {month}.</span>
              <span className={styles.scheduleLine}>
                <span className={styles.scheduleLabel}>Hours</span>
                <span className={styles.scheduleValue}>{start} - {end}<span className={styles.scheduleTimezone}>{zone}</span></span>
              </span>
              {breakStart && <span className={styles.scheduleLine}>
                <span className={styles.scheduleLabel}>Break</span>
                <span className={styles.scheduleValue}>{breakStart} - {breakEnd}</span>
              </span>}
            </span>
          );
        }
        if (trimmed.startsWith("Dates: ")) {
          const dateText = trimmed.slice(7).replace(/\.$/, "");
          const dates = [...dateText.matchAll(/([A-Za-z]+) (\d{1,2}), (\d{4})/g)];
          const reconstructed = dates.map(match => match[0]).join(", ");
          if (dates.length && reconstructed === dateText && dates.every(match => match[1] === dates[0][1] && match[3] === dates[0][3])) {
            const days = dates.map(match => Number(match[2]));
            const ranges = [];
            for (let i = 0; i < days.length; i += 1) {
              const start = days[i];
              while (i + 1 < days.length && days[i + 1] === days[i] + 1) i += 1;
              ranges.push(start === days[i] ? `${start}` : `${start}-${days[i]}`);
            }
            return (
              <span key={index} className={styles.scheduleLine}>
                <span className={styles.scheduleLabel}>Dates</span>
                <span className={styles.scheduleValue}>{dates[0][1]} {ranges.join(", ")}, {dates[0][3]}</span>
              </span>
            );
          }
        }
      }
      const schedule = type === "reschedule" && trimmed.match(/^(Current|Previous|Requested|New):\s*(.+)$/i);
      if (schedule) {
        const [, label, rawValue] = schedule;
        // Older notifications repeat the date at both ends of a same-day range.
        const value = rawValue.replace(
          /([A-Za-z]{3} \d{1,2}, \d{4}), (\d{1,2}:\d{2} [AP]M) - \1, (\d{1,2}:\d{2} [AP]M)/,
          "$1 at $2 - $3"
        );
        const timezone = value.match(/\s*\(([^()]+)\)$/);
        return (
          <span key={index} className={styles.scheduleLine}>
            <span className={styles.scheduleLabel}>{label}</span>
            <span className={styles.scheduleValue}>
              {timezone ? value.slice(0, timezone.index) : value}
              {timezone && <span className={styles.scheduleTimezone}>{timezone[1]}</span>}
            </span>
          </span>
        );
      }
      if (trimmed.toLowerCase().startsWith("reason:")) {
        return (
          <span key={index} className={styles.reasonLine}>
            <span className={styles.scheduleLabel}>Reason</span>
            <span>{trimmed.slice(7).trim()}</span>
          </span>
        );
      }
      return <span key={index}>{line}</span>;
    });
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const totalPages = Math.max(1, Math.ceil(totalNotifications / 15));
  const selectedFilter = FILTER_OPTIONS.find(option => option.value === selectedType) || FILTER_OPTIONS[0];

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <section
        className={styles.panel}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        aria-describedby="notifications-subtitle"
      >
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <span className={styles.headerIcon} aria-hidden="true"><i className="bi bi-bell-fill" /></span>
            <div className={styles.headerText}>
              <div className={styles.titleRow}>
                <h2 id="notifications-title" className={styles.title}>Notifications</h2>
                {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount} new</span>}
              </div>
              <p id="notifications-subtitle" className={styles.headerSub}>
                {unreadCount > 0
                  ? "Here's what's new!"
                  : notifications.length > 0
                    ? "You're all caught up!"
                    : "New notes will show up here"}
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close notifications">
            ×
          </button>
        </header>

        <div className={styles.toolbar}>
          <p className={styles.filterPrompt}>Show me</p>
          <div className={styles.filters} role="group" aria-label="Filter notifications">
            {FILTER_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`${styles.filterPill} ${selectedType === option.value ? styles.filterPillActive : ""}`}
                aria-pressed={selectedType === option.value}
                onClick={() => {
                  setSelectedType(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.skeletonList} role="status" aria-busy="true">
              <span className={styles.srOnly}>Loading notifications…</span>
              {[0, 1, 2].map(index => (
                <div className={styles.skeletonCard} key={index} aria-hidden="true">
                  <span className={styles.skeletonIcon} />
                  <span className={styles.skeletonBody}>
                    <span className={styles.skeletonLine} />
                    <span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
                    <span className={styles.skeletonLine} />
                  </span>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><i className="bi bi-check2-circle" /></div>
              <h3 className={styles.emptyTitle}>
                {selectedType === "all" ? "Nothing here yet" : `No ${selectedFilter.label.toLowerCase()} right now`}
              </h3>
              <p className={styles.emptyText}>
                {selectedType === "all"
                  ? "New notes from your classes will show up here."
                  : "Try another filter or check back later!"}
              </p>
              {selectedType !== "all" && (
                <button type="button" className={styles.emptyReset} onClick={() => setSelectedType("all")}>
                  Show everything
                </button>
              )}
            </div>
          ) : (
            <div className={styles.notificationsList}>
              {notifications.map(notif => {
                const meta = getTypeMeta(notif.type);
                const timestamp = formatNotificationTime(notif.created_at);
                const canRespond = notif.type === "reschedule" && notif.title === "Reschedule Request";

                return (
                  <div
                    key={notif.notification_id}
                    className={`${styles.notificationItem} ${!notif.is_read ? styles.unread : ""}`}
                    style={{ "--type-accent": meta.accent, "--type-tint": meta.tint }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${!notif.is_read ? "New " : ""}${getNotificationTitle(notif)}`}
                    onClick={() => handleNotificationClick(notif)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNotificationClick(notif);
                      }
                    }}
                  >
                    <div className={styles.notifIcon} aria-hidden="true"><i className={`bi ${meta.icon}`} /></div>

                    <div className={styles.notifContent}>
                      <div className={styles.notifMeta}>
                        {!notif.is_read && <span className={styles.newBadge}>New</span>}
                        <span className={styles.notifType}>{meta.label}</span>
                        {timestamp && <span className={styles.notifTime}>{timestamp}</span>}
                      </div>

                      <h3 className={styles.notifTitle}>{getNotificationTitle(notif)}</h3>
                      <p className={styles.notifMessage}>{renderNotificationMessage(notif.message, notif.type, notif.related_type)}</p>

                      <div className={styles.cardActions}>
                        {canRespond ? (
                          <>
                            <button
                              type="button"
                              className={`${styles.cardBtn} ${styles.cardBtnPrimary}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                requestApproveReschedule(notif.notification_id, notif.related_id);
                              }}
                              disabled={actionInProgress === notif.notification_id}
                            >
                              <i className="bi bi-check-circle" aria-hidden="true" />
                              {actionInProgress === notif.notification_id ? "Sending…" : "Approve"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.cardBtn} ${styles.cardBtnGhost}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                requestRejectReschedule(notif.notification_id, notif.related_id);
                              }}
                              disabled={actionInProgress === notif.notification_id}
                            >
                              <i className="bi bi-x-lg" aria-hidden="true" />
                              {actionInProgress === notif.notification_id ? "Sending…" : "Decline"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.cardBtn} ${styles.cardBtnGhost} ${styles.cardBtnWide}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDeleteNotification(notif.notification_id);
                              }}
                            >
                              <i className="bi bi-trash" aria-hidden="true" />
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={`${styles.cardBtn} ${styles.cardBtnPrimary}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNotificationClick(notif);
                              }}
                            >
                              <i className="bi bi-eye" aria-hidden="true" />
                              Open
                            </button>
                            <button
                              type="button"
                              className={`${styles.cardBtn} ${styles.cardBtnGhost}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDeleteNotification(notif.notification_id);
                              }}
                            >
                              <i className="bi bi-trash" aria-hidden="true" />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!loading && notifications.length > 0 && (
          <footer className={styles.footer}>
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => loadNotifications(page - 1, selectedType)}
                  className={styles.pageBtn}
                  aria-label="Previous page"
                >
                  <span aria-hidden="true">←</span>
                  Back
                </button>
                <span className={styles.pageInfo}>
                  Page <strong>{page}</strong> of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => loadNotifications(page + 1, selectedType)}
                  className={styles.pageBtn}
                  aria-label="Next page"
                >
                  Next
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            )}

            <div className={styles.footerActions}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className={styles.footerBtnPrimary}
                  onClick={requestMarkAllAsRead}
                >
                  <i className="bi bi-check-circle" aria-hidden="true" />
                  Mark all as read
                </button>
              )}
              <button
                type="button"
                className={styles.footerBtnGhost}
                onClick={requestClearAllNotifications}
              >
                <i className="bi bi-brush" aria-hidden="true" />
                Clear all
              </button>
            </div>
          </footer>
        )}

        {confirmAction && (
          <div className={styles.confirmBackdrop} onClick={closeConfirmAction}>
            <div
              className={`${kid.filterDialog} ${styles.confirmCard}`}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 440 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
            >
              <div className={kid.filterHead}>
                <div>
                  <h3 id="confirm-title" className={kid.filterTitle}>{confirmAction.title}</h3>
                  <p className={kid.filterSub}>{confirmAction.message}</p>
                </div>
                <button type="button" className={kid.filterClose} onClick={closeConfirmAction} aria-label="Close">
                  ×
                </button>
              </div>
              <div className={kid.filterBody}>
                {confirmAction.requiresReason && (
                  <div className={kid.pastCard}>
                    <label
                      htmlFor="decline-reason-input"
                      className={kid.detailLabel}
                    >
                      Why not? <span className={kid.summaryValue}>*</span>
                    </label>
                    <textarea
                      id="decline-reason-input"
                      rows={4}
                      autoFocus
                      maxLength={DECLINE_REASON_MAX_LENGTH}
                      value={declineReason}
                      onChange={(e) => {
                        setDeclineReason(e.target.value);
                        if (declineReasonError) setDeclineReasonError("");
                      }}
                      placeholder="Tell them why this new time does not work."
                      className={`${styles.reasonInput} ${declineReasonError ? styles.reasonInputError : ""}`}
                    />
                    {declineReasonError ? (
                      <div className={kid.error}>
                        {declineReasonError}
                      </div>
                    ) : (
                      <p className={kid.summaryLabel}>
                        This note goes to the other person. Please use at least {DECLINE_REASON_MIN_LENGTH} characters.
                      </p>
                    )}
                  </div>
                )}

                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    onClick={closeConfirmAction}
                    className={`${kid.btn} ${kid.btnGhost}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={performConfirmAction}
                    disabled={confirmAction.requiresReason && declineReason.trim().length < DECLINE_REASON_MIN_LENGTH}
                    className={`${kid.btn} ${kid.btnPrimary}`}
                  >
                    {confirmAction.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

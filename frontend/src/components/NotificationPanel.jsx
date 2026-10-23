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
import { getStoredUserTimezone, parseServerTimestamp } from "../utils/timezone.js";
import { useNotification } from "./NotificationContainer";
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;

const DECLINE_REASON_MIN_LENGTH = 5;
const DECLINE_REASON_MAX_LENGTH = 500;

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "reschedule", label: "Reschedules" },
  { value: "assignment", label: "Assignments" },
  { value: "remark", label: "Remarks" },
  { value: "announcement", label: "Announcements" },
  { value: "class_reminder", label: "Reminders" },
];

const TYPE_META = {
  reschedule: { label: "Reschedule", accent: "#9a5a05", tint: "#fdf1df" },
  assignment: { label: "Assignment", accent: "#245394", tint: "#eaf1ff" },
  remark: { label: "Remark", accent: "#816200", tint: "#fff7dd" },
  announcement: { label: "Announcement", accent: "#2f7a3d", tint: "#edf7e9" },
  class_reminder: { label: "Class reminder", accent: "#1f6b66", tint: "#e7f5f3" },
  general: { label: "Update", accent: "#5e7268", tint: "#f1f4f2" },
};

const getTypeMeta = (type) => TYPE_META[type] || TYPE_META.general;

function TypeIcon({ type }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    className: styles.typeIconSvg,
  };

  switch (type) {
    case "reschedule":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M16 3v4M8 3v4M3 11h18" />
          <path d="M8 15h3M8 18h6" />
        </svg>
      );
    case "assignment":
      return (
        <svg {...props}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1.5" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case "remark":
      return (
        <svg {...props}>
          <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3Z" />
        </svg>
      );
    case "announcement":
      return (
        <svg {...props}>
          <path d="m3 11 18-7v16L3 13v-2Z" />
          <path d="M7 12.5V17a2.5 2.5 0 0 0 4.8 1" />
        </svg>
      );
    case "class_reminder":
      return (
        <svg {...props}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      );
  }
}

function formatNotificationTime(value) {
  const date = parseServerTimestamp(value);
  if (!date) return null;

  const timeZone = getStoredUserTimezone();
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);

  return { dateLabel, timeLabel };
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

  // Mark notification as read
  const handleMarkAsRead = async (notificationId) => {
    try {
      await axios.put(`${API}/api/notifications/${notificationId}/read`);
      markLocalNotificationRead(notificationId);
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

    const targetUrl = getNotificationTargetUrl(notification);
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
      title: "Delete notification?",
      message: "Are you sure you want to delete this notification? This cannot be undone.",
      confirmLabel: "Delete"
    });
  };

  const getNotificationTargetUrl = (notification) => {
    const actionUrl = notification.action_url || notification.actionUrl;
    const relatedId = notification.related_id ?? notification.relatedId;
    const currentUser = readStoredUser() || {};
    const role = currentUser.role;

    if (actionUrl && typeof actionUrl === "string" && actionUrl.trim()) {
      return actionUrl;
    }

    if (notification.type === "assignment" && relatedId) {
      return `/assignmentsDropbox?assignmentId=${relatedId}`;
    }
    if (notification.type === "remark") {
      return "/remarks";
    }
    if (notification.type === "reschedule" || notification.type === "class_reminder") {
      return "/Calendar";
    }
    if (notification.type === "announcement") {
      if (role === "teacher") return "/TeacherDashboard";
      if (role === "admin") return "/AdminDashboard";
      return "/StudentDashboard";
    }
    return "/";
  };

  const requestClearAllNotifications = () => {
    setConfirmAction({
      type: "clear-all-notifications",
      title: "Clear all notifications?",
      message: "Are you sure you want to clear all notifications? This will remove them permanently.",
      confirmLabel: "Clear All"
    });
  };

  const requestMarkAllAsRead = () => {
    setConfirmAction({
      type: "mark-all-read",
      title: "Mark all notifications as read?",
      message: "Are you sure you want to mark all notifications as read? This will clear the unread badge.",
      confirmLabel: "Mark All as Read"
    });
  };

  const requestApproveReschedule = (notificationId, relatedId) => {
    setConfirmAction({
      type: "approve-reschedule",
      notificationId,
      relatedId,
      title: "Approve reschedule?",
      message: "Approve this reschedule request? This will update the calendar.",
      confirmLabel: "Approve"
    });
  };

  const requestRejectReschedule = (notificationId, relatedId) => {
    setDeclineReason("");
    setDeclineReasonError("");
    setConfirmAction({
      type: "reject-reschedule",
      notificationId,
      relatedId,
      title: "Decline reschedule request?",
      message: "Decline this reschedule request? The requester will be notified along with your reason.",
      confirmLabel: "Decline",
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
          `Please give a reason of at least ${DECLINE_REASON_MIN_LENGTH} characters so the requester understands the decision.`
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
        notify("Failed to approve reschedule request", "error");
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

  const renderNotificationMessage = (message) => {
    const lines = String(message || "").split("\n");

    return lines.map((line, index) => {
      if (line.trim().toLowerCase().startsWith("reason:")) {
        return (
          <span key={`${line}-${index}`} className={styles.reasonLine}>
            {line}
          </span>
        );
      }

      return (
        <span key={`${line}-${index}`}>
          {line}
        </span>
      );
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
          <div className={styles.headerText}>
            <p className={styles.eyebrow}>Inbox</p>
            <div className={styles.titleRow}>
              <h2 id="notifications-title" className={styles.title}>Notifications</h2>
              {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount}</span>}
            </div>
            <p id="notifications-subtitle" className={styles.headerSub}>
              {unreadCount > 0
                ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}`
                : notifications.length > 0
                  ? "You're all caught up"
                  : "Updates from your classes will show up here"}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className={styles.toolbar}>
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
              <div className={styles.emptyIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h16v14H4z" />
                  <path d="M4 13h4l2 3h4l2-3h4" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>
                {selectedType === "all" ? "You're all caught up" : `No ${selectedFilter.label.toLowerCase()} right now`}
              </h3>
              <p className={styles.emptyText}>
                {selectedType === "all"
                  ? "New assignments, remarks, announcements, and reminders will appear here."
                  : "Try another filter or check back later for updates."}
              </p>
              {selectedType !== "all" && (
                <button type="button" className={styles.emptyReset} onClick={() => setSelectedType("all")}>
                  Show all notifications
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
                    aria-label={`${!notif.is_read ? "Unread " : ""}${getNotificationTitle(notif)}`}
                    onClick={() => handleNotificationClick(notif)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNotificationClick(notif);
                      }
                    }}
                  >
                    <div className={styles.notifIcon}>
                      <TypeIcon type={notif.type} />
                    </div>

                    <div className={styles.notifContent}>
                      <div className={styles.notifMeta}>
                        <span className={styles.notifType}>{meta.label}</span>
                        {timestamp && (
                          <span className={styles.notifTime}>
                            <span className={styles.metaDot} aria-hidden="true">•</span>
                            {timestamp.dateLabel} · {timestamp.timeLabel}
                          </span>
                        )}
                        {!notif.is_read && <span className={styles.unreadDot} aria-hidden="true" />}
                      </div>

                      <h3 className={styles.notifTitle}>{getNotificationTitle(notif)}</h3>
                      <p className={styles.notifMessage}>{renderNotificationMessage(notif.message)}</p>

                      {canRespond && (
                        <div className={styles.rescheduleActions}>
                          <button
                            type="button"
                            className={`${styles.inlineBtn} ${styles.inlineBtnPrimary}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              requestApproveReschedule(notif.notification_id, notif.related_id);
                            }}
                            disabled={actionInProgress === notif.notification_id}
                          >
                            {actionInProgress === notif.notification_id ? "Sending…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            className={`${styles.inlineBtn} ${styles.inlineBtnGhost}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              requestRejectReschedule(notif.notification_id, notif.related_id);
                            }}
                            disabled={actionInProgress === notif.notification_id}
                          >
                            {actionInProgress === notif.notification_id ? "Sending…" : "Decline"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className={styles.notifActions}>
                      {!notif.is_read && (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notif.notification_id);
                          }}
                          title="Mark as read"
                          aria-label="Mark notification as read"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m5 12 4 4L19 6" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteNotification(notif.notification_id);
                        }}
                        title="Delete notification"
                        aria-label="Delete notification"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                          <path d="M10 11v5M14 11v5" />
                        </svg>
                      </button>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
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
                  Mark all as read
                </button>
              )}
              <button
                type="button"
                className={styles.footerBtnGhost}
                onClick={requestClearAllNotifications}
              >
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
                      Reason for declining <span className={kid.summaryValue}>*</span>
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
                      placeholder="Explain why this request is being declined. The requester will see this reason."
                      className={`${styles.reasonInput} ${declineReasonError ? styles.reasonInputError : ""}`}
                    />
                    {declineReasonError ? (
                      <div className={kid.error}>
                        {declineReasonError}
                      </div>
                    ) : (
                      <p className={kid.summaryLabel}>
                        This reason is shared with the requester. Minimum {DECLINE_REASON_MIN_LENGTH} characters.
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

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
  reschedule: { label: "New time", emoji: "📅", accent: "#9a5a05", tint: "#fdf1df" },
  assignment: { label: "Homework", emoji: "📋", accent: "#245394", tint: "#eaf1ff" },
  remark: { label: "Teacher note", emoji: "⭐", accent: "#816200", tint: "#fff7dd" },
  announcement: { label: "School news", emoji: "📢", accent: "#2f7a3d", tint: "#edf7e9" },
  class_reminder: { label: "Reminder", emoji: "🔔", accent: "#1f6b66", tint: "#e7f5f3" },
  general: { label: "Update", emoji: "📌", accent: "#5e7268", tint: "#f1f4f2" },
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
      title: "Delete this note?",
      message: "It will go away for good. You cannot get it back.",
      confirmLabel: "Delete note"
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
      title: "Keep the old time?",
      message: "Tell them why the new time does not work.",
      confirmLabel: "Keep old time",
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
          <div className={styles.headerMain}>
            <span className={styles.headerIcon} aria-hidden="true">🔔</span>
            <div className={styles.headerText}>
              <div className={styles.titleRow}>
                <h2 id="notifications-title" className={styles.title}>Notifications</h2>
                {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount} new</span>}
              </div>
              <p id="notifications-subtitle" className={styles.headerSub}>
                {unreadCount > 0
                  ? "Here's what's new!"
                  : notifications.length > 0
                    ? "You're all caught up! 🎉"
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
              <div className={styles.emptyIcon} aria-hidden="true">🎉</div>
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
                    <div className={styles.notifIcon} aria-hidden="true">{meta.emoji}</div>

                    <div className={styles.notifContent}>
                      <div className={styles.notifMeta}>
                        {!notif.is_read && <span className={styles.newBadge}>✨ New</span>}
                        <span className={styles.notifType}>{meta.label}</span>
                        {timestamp && <span className={styles.notifTime}>{timestamp}</span>}
                      </div>

                      <h3 className={styles.notifTitle}>{getNotificationTitle(notif)}</h3>
                      <p className={styles.notifMessage}>{renderNotificationMessage(notif.message)}</p>

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
                              <span aria-hidden="true">✅</span>
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
                              <span aria-hidden="true">✖️</span>
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
                              <span aria-hidden="true">🗑️</span>
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
                              <span aria-hidden="true">👀</span>
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
                              <span aria-hidden="true">🗑️</span>
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
                  <span aria-hidden="true">✅</span>
                  Mark all as read
                </button>
              )}
              <button
                type="button"
                className={styles.footerBtnGhost}
                onClick={requestClearAllNotifications}
              >
                <span aria-hidden="true">🧹</span>
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

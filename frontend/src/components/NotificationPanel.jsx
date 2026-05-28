import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/notificationPanel.module.css";
import {
    clearLocalNotificationsForUser,
    getLocalNotificationsForUser,
    markAllLocalNotificationsReadForUser,
    markLocalNotificationRead,
    mergeNotifications,
} from "../utils/localNotificationStore.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { getStoredUserTimezone } from "../utils/timezone.js";
import { useNotification } from "./NotificationContainer";
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;

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

  // Fetch all notifications for this user
  const loadNotifications = async (pageNum = 1, type = "all") => {
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
  };

  useEffect(() => {
    if (isOpen && userId) {
      loadNotifications(1, selectedType);
    }
  }, [isOpen, userId, selectedType]);

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

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    const currentUser = readStoredUser() || {};
    const userName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim();
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
  };

  const closeConfirmAction = () => setConfirmAction(null);

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
    setConfirmAction({
      type: "reject-reschedule",
      notificationId,
      relatedId,
      title: "Reject reschedule?",
      message: "Reject this reschedule request? The requester will be notified.",
      confirmLabel: "Reject"
    });
  };

  const performConfirmAction = async () => {
    if (!confirmAction) return;

    const action = confirmAction;
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
          user_id: userId
        });
        notify("Reschedule request rejected", "success");
        setNotifications(prev => prev.filter(n => n.notification_id !== action.notificationId));
        setTotalNotifications(Math.max(0, totalNotifications - 1));
      } catch (err) {
        console.error("Error rejecting reschedule:", err);
        notify("Failed to reject reschedule request", "error");
      } finally {
        setActionInProgress(null);
      }
    }

    closeConfirmAction();
  };

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    const icons = {
      reschedule: "📅",
      assignment: "📋",
      remark: "⭐",
      announcement: "📢",
      class_reminder: "🔔",
      general: "ℹ️"
    };
    return icons[type] || "📌";
  };

  // Get notification color based on type
  const getNotificationColor = (type) => {
    const colors = {
      reschedule: "#fff3cd",
      assignment: "#cfe2ff",
      remark: "#fff3cd",
      announcement: "#f8f9fa",
      class_reminder: "#d1ecf1",
      general: "#e2e3e5"
    };
    return colors[type] || "#f8f9fa";
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

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const totalPages = Math.ceil(totalNotifications / 15);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Notifications {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Type Filter */}
        <div className={styles.filterBar}>
          {["all", "reschedule", "assignment", "remark", "announcement", "class_reminder"].map(type => (
            <button
              key={type}
              className={`${styles.filterBtn} ${selectedType === type ? styles.active : ""}`}
              onClick={() => {
                setSelectedType(type);
                setPage(1);
              }}
            >
              {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ")}
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : notifications.length === 0 ? (
            <div className={styles.empty}>
              <p>No notifications yet</p>
            </div>
          ) : (
            <>
              <div className={styles.notificationsList}>
                {notifications.map(notif => (
                  <div
                    key={notif.notification_id}
                    className={`${styles.notificationItem} ${!notif.is_read ? styles.unread : ""}`}
                    style={{ borderLeftColor: getNotificationColor(notif.type) }}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className={styles.notifIcon}>{getNotificationIcon(notif.type)}</div>
                    
                    <div className={styles.notifContent}>
                      <div className={styles.notifHeader}>
                        <h4 className={styles.notifTitle}>{getNotificationTitle(notif)}</h4>
                        <span className={styles.notifType}>{notif.type}</span>
                      </div>
                      <p className={styles.notifMessage}>{notif.message}</p>
                      <span className={styles.notifTime}>
                        {new Date(notif.created_at).toLocaleDateString([], { timeZone: getStoredUserTimezone() })} {new Date(notif.created_at).toLocaleTimeString([], { timeZone: getStoredUserTimezone(), hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className={styles.notifActions}>
                      {notif.type === "reschedule" && notif.title === "Reschedule Request" ? (
                        <>
                          <button
                            className={styles.approveBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              requestApproveReschedule(notif.notification_id, notif.related_id);
                            }}
                            title="Approve reschedule"
                            disabled={actionInProgress === notif.notification_id}
                          >
                            {actionInProgress === notif.notification_id ? "..." : "✓"}
                          </button>
                          <button
                            className={styles.rejectBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              requestRejectReschedule(notif.notification_id, notif.related_id);
                            }}
                            title="Reject reschedule"
                            disabled={actionInProgress === notif.notification_id}
                          >
                            {actionInProgress === notif.notification_id ? "..." : "✕"}
                          </button>
                        </>
                      ) : (
                        <>
                          {!notif.is_read && (
                            <button
                              className={styles.markReadBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkAsRead(notif.notification_id);
                              }}
                              title="Mark as read"
                            >
                              ✓
                            </button>
                          )}
                          <button
                            className={styles.deleteBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDeleteNotification(notif.notification_id);
                            }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    disabled={page === 1}
                    onClick={() => loadNotifications(page - 1, selectedType)}
                    className={styles.pageBtn}
                  >
                    ← Prev
                  </button>
                  <span className={styles.pageInfo}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => loadNotifications(page + 1, selectedType)}
                    className={styles.pageBtn}
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* Footer Actions */}
              <div className={styles.footerActions}>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className={styles.markAllReadBtn}
                    onClick={requestMarkAllAsRead}
                  >
                    Mark All as Read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    className={styles.clearAllBtn}
                    onClick={requestClearAllNotifications}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {confirmAction && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: "20px",
            }}
            onClick={closeConfirmAction}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "16px",
                padding: "24px",
                maxWidth: "420px",
                width: "100%",
                boxShadow: "0 24px 60px rgba(0,0,0,0.16)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>{confirmAction.title}</h3>
              <p style={{ margin: "0 0 24px", color: "#55606c", lineHeight: 1.6 }}>{confirmAction.message}</p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={closeConfirmAction}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "12px",
                    border: "1px solid #d0d5db",
                    background: "#fff",
                    color: "#13251f",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={performConfirmAction}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "12px",
                    border: "none",
                    background: "#26423b",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {confirmAction.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

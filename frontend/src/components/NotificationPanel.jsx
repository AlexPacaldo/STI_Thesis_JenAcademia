import axios from "axios";
import { useEffect, useState } from "react";
import styles from "../assets/notificationPanel.module.css";
import {
  clearLocalNotificationsForUser,
  getLocalNotificationsForUser,
  markAllLocalNotificationsReadForUser,
  markLocalNotificationRead,
  mergeNotifications,
} from "../utils/localNotificationStore.js";
import { getStoredUserTimezone } from "../utils/timezone.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { useNotification } from "./NotificationContainer";

const API = "http://localhost:3001";

export default function NotificationPanel({ userId, isOpen, onClose }) {
  const { notify } = useNotification() || {};
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [selectedType, setSelectedType] = useState("all"); // filter by type
  const [actionInProgress, setActionInProgress] = useState(null); // track which notification is being acted on

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

  // Delete all notifications
  const handleClearAll = async () => {
    const currentUser = readStoredUser() || {};
    const userName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim();
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
  };

  // Approve reschedule request
  const handleApproveReschedule = async (notificationId, relatedId) => {
    setActionInProgress(notificationId);
    try {
      await axios.post(`${API}/api/calendar/reschedule-requests/${relatedId}/approve`, {
        user_id: userId
      });
      notify("Reschedule request approved and calendar updated!", "success");
      // Remove the notification from the list
      setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
      setTotalNotifications(Math.max(0, totalNotifications - 1));
    } catch (err) {
      console.error("Error approving reschedule:", err);
      notify("Failed to approve reschedule request", "error");
    } finally {
      setActionInProgress(null);
    }
  };

  // Reject reschedule request
  const handleRejectReschedule = async (notificationId, relatedId) => {
    setActionInProgress(notificationId);
    try {
      await axios.post(`${API}/api/calendar/reschedule-requests/${relatedId}/reject`, {
        user_id: userId
      });
      notify("Reschedule request rejected", "success");
      // Remove the notification from the list
      setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
      setTotalNotifications(Math.max(0, totalNotifications - 1));
    } catch (err) {
      console.error("Error rejecting reschedule:", err);
      notify("Failed to reject reschedule request", "error");
    } finally {
      setActionInProgress(null);
    }
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
                            onClick={() => handleApproveReschedule(notif.notification_id, notif.related_id)}
                            title="Approve reschedule"
                            disabled={actionInProgress === notif.notification_id}
                          >
                            {actionInProgress === notif.notification_id ? "..." : "✓"}
                          </button>
                          <button
                            className={styles.rejectBtn}
                            onClick={() => handleRejectReschedule(notif.notification_id, notif.related_id)}
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
                              onClick={() => handleMarkAsRead(notif.notification_id)}
                              title="Mark as read"
                            >
                              ✓
                            </button>
                          )}
                          <button
                            className={styles.deleteBtn}
                            onClick={() => handleDelete(notif.notification_id)}
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
                    className={styles.markAllReadBtn}
                    onClick={handleMarkAllAsRead}
                  >
                    Mark All as Read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    className={styles.clearAllBtn}
                    onClick={handleClearAll}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

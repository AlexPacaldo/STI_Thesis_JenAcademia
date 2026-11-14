import axios from "axios";
import React, { useState, useCallback, useEffect } from "react";
import Notification from "./Notification";
import styles from "../assets/notificationContainer.module.css";
import { getLocalUnreadCount } from "../utils/localNotificationStore.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";

export const NotificationContext = React.createContext();
const BADGE_REFRESH_MS = 15 * 1000;
const API = API_BASE_URL;

// NOT Date.now().
//
// These ids are React keys and the handle removeNotification matches on, and a
// clock is not unique: several notifications raised in the same millisecond get
// the same id. That is easy to hit - a page that fires four loads on mount and
// has all four fail (an outage, a CORS failure) raises all four in one tick, and
// the console fills with "Encountered two children with the same key".
//
// It is worse than console noise. With a duplicated key React reconciles against
// the wrong node, so dismissing one toast can make a different one vanish, and an
// exit animation can remove the wrong element.
//
// A counter is unique by construction. Nothing reads the id as a timestamp.
let nextNotificationId = 0;

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => readStoredUser());
  const [unreadCount, setUnreadCount] = useState(0);
  const currentUserId = currentUser?.id || currentUser?.user_id || currentUser?.userId;
  const currentUserRole = currentUser?.role;

  useEffect(() => {
    const handleProfileUpdate = (event) => {
      setCurrentUser(event.detail || readStoredUser());
    };
    const handleStorageChange = () => setCurrentUser(readStoredUser());
    const handleLogout = () => setCurrentUser(null);

    window.addEventListener("userProfileUpdated", handleProfileUpdate);
    window.addEventListener("userLoggedOut", handleLogout);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("userProfileUpdated", handleProfileUpdate);
      window.removeEventListener("userLoggedOut", handleLogout);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    const supportedRole = ["student", "teacher", "admin"].includes(currentUserRole);
    if (!currentUserId || !supportedRole) {
      setUnreadCount(0);
      return;
    }

    const userName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim();
    const localCount = getLocalUnreadCount({ userId: currentUserId, userName });
    try {
      const response = await axios.get(`${API}/api/notifications/unread/${currentUserId}`);
      setUnreadCount(Number(response.data.unreadCount || 0) + localCount);
    } catch (err) {
      console.error("Error fetching unread notification count:", err);
      setUnreadCount(localCount);
    }
  }, [currentUser, currentUserId, currentUserRole]);

  useEffect(() => {
    if (!currentUserId || !["student", "teacher", "admin"].includes(currentUserRole)) {
      setUnreadCount(0);
      return undefined;
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshUnreadCount();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshUnreadCount();
    }, BADGE_REFRESH_MS);

    void refreshUnreadCount();
    window.addEventListener("notificationsChanged", refreshUnreadCount);
    window.addEventListener("storage", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("notificationsChanged", refreshUnreadCount);
      window.removeEventListener("storage", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [currentUserId, currentUserRole, refreshUnreadCount]);

  const addNotification = useCallback((message, type = "info", duration = 4000) => {
    nextNotificationId += 1;
    const id = nextNotificationId;
    setNotifications((prev) => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback(
    (message, type = "info", duration = 4000) => addNotification(message, type, duration),
    [addNotification]
  );

  return (
    <NotificationContext.Provider
      value={{ notify, addNotification, removeNotification, unreadCount }}
    >
      {children}
      <div className={styles.container}>
        {notifications.map((notif) => (
          <Notification
            key={notif.id}
            id={notif.id}
            message={notif.message}
            type={notif.type}
            duration={notif.duration}
            onClose={removeNotification}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = React.useContext(NotificationContext);
  if (!context) {
    console.error("useNotification must be used within NotificationProvider");
  }
  return context;
}

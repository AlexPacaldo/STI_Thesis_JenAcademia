import React, { useState, useCallback } from "react";
import Notification from "./Notification";
import styles from "../assets/notificationContainer.module.css";

export const NotificationContext = React.createContext();

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((message, type = "info", duration = 4000) => {
    const id = Date.now();
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
    <NotificationContext.Provider value={{ notify, addNotification, removeNotification }}>
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

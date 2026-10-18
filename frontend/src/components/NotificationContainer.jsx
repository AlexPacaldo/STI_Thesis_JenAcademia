import React, { useState, useCallback } from "react";
import Notification from "./Notification";
import styles from "../assets/notificationContainer.module.css";

export const NotificationContext = React.createContext();

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

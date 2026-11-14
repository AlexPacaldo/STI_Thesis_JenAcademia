import { useState, useEffect } from "react";
import styles from "../assets/notification.module.css";

export default function Notification({ id, message, type = "info", duration = 4000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!isVisible) {
      const timer = setTimeout(() => onClose(id), 300);
      return () => clearTimeout(timer);
    }
    if (duration > 0) {
      const timer = setTimeout(() => setIsVisible(false), duration);
      return () => clearTimeout(timer);
    }
  }, [duration, id, onClose, isVisible]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true"
      className={`${styles.notification} ${styles[type]} ${!isVisible ? styles.exit : ""}`}>
      <div className={styles.content}>
        <span className={styles.icon}>
          {type === "success" && "✓"}
          {type === "error" && "✕"}
          {type === "warning" && "!"}
          {type === "info" && "ℹ"}
        </span>
        <span className={styles.message}>{message}</span>
      </div>
      <button
        type="button"
        className={styles.close}
        onClick={() => setIsVisible(false)}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
}

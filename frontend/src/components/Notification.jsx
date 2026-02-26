import { useState, useEffect } from "react";
import styles from "../assets/notification.module.css";

export default function Notification({ id, message, type = "info", duration = 4000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose(id), 300); // Allow animation to complete
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, id, onClose]);

  return (
    <div className={`${styles.notification} ${styles[type]} ${!isVisible ? styles.exit : ""}`}>
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
        className={styles.close}
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => onClose(id), 300);
        }}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
}

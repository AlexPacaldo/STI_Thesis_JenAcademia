import { useId, useState } from "react";
import styles from "./PasswordInput.module.css";

export default function PasswordInput({ className = "", label = "password", id, disabled, ...props }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <span className={styles.field}>
      <input {...props} id={inputId} disabled={disabled} type={visible ? "text" : "password"}
        className={`${className} ${styles.input}`} />
      <button type="button" className={styles.toggle} disabled={disabled}
        aria-label={`${visible ? "Hide" : "Show"} ${label}`} aria-controls={inputId} aria-pressed={visible}
        onMouseDown={event => event.preventDefault()} onClick={() => setVisible(value => !value)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </span>
  );
}

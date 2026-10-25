import styles from "../assets/passwordReset.module.css";

export default function PasswordResetProgress({ steps, currentStep }) {
  return (
    <ol className={styles.progress} aria-label={`Step ${currentStep + 1} of ${steps.length}`}>
      {steps.map((label, index) => (
        <li
          key={label}
          className={[
            styles.progressStep,
            index === currentStep ? styles.progressStepActive : "",
            index < currentStep ? styles.progressStepComplete : "",
          ].filter(Boolean).join(" ")}
          aria-current={index === currentStep ? "step" : undefined}
        >
          <span className={styles.stepNumber} aria-hidden="true">
            {index < currentStep ? "✓" : index + 1}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

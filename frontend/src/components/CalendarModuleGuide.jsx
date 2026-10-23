import { useEffect, useState } from "react";
import styles from "../assets/calendarModuleGuide.module.css";
import ModalPortal from "../utils/ModalPortal.jsx";

const STUDENT_STEPS = [
  {
    icon: "🗓️",
    title: "Use your Calendar",
    text: "Here is how to find your classes:",
    instructions: [
      "Look through your upcoming classes.",
      "Tap a class to see its details.",
      "Tap Book a class when you want to schedule another class.",
    ],
    target: "calendar",
  },
  {
    icon: "📅",
    title: "Book a class",
    text: "Follow these steps to book a class:",
    instructions: [
      "Tap Book a class.",
      "Choose a day that works for you.",
      "Choose an available time.",
      "Check the day and time, then tap Book to send your booking.",
    ],
    target: "book-class",
  },
  {
    icon: "🔁",
    title: "Reschedule a class",
    text: "Follow these steps to ask for a new class time:",
    instructions: [
      "Close this guide and tap the class you need to change.",
      "Tap Request for Reschedule.",
      "Choose a new day and available time.",
      "Tell your teacher why you need a change, then send the request.",
      "Wait for your teacher to approve it.",
    ],
    target: "class",
  },
];

const TEACHER_STEPS = [
  {
    icon: "🗓️",
    title: "Use your Calendar",
    text: "Follow these steps to find classes in your Calendar:",
    instructions: [
      "Use the arrows to move to another month.",
      "Choose Month or List to change how you view your schedule.",
      "Choose a day or class to see its details.",
    ],
    target: "calendar",
  },
  {
    icon: "🟢",
    title: "Set your availability",
    text: "Follow these steps to add your available teaching times:",
    instructions: [
      "Tap Set Availability.",
      "Choose a day and set the start and end times you are free.",
      "Tap Save Availability.",
      "To change a time later, open your availabilities and edit or remove it.",
    ],
    target: "set-availability",
    action: "Set availability",
  },
  {
    icon: "🔁",
    title: "Reschedule a class",
    text: "Follow these steps to ask for a different class time:",
    instructions: [
      "Close this guide and select the class.",
      "Choose Request for Reschedule.",
      "Pick an available day and time.",
      "Write a reason, then send the request.",
      "Wait for the student to approve it.",
    ],
    target: "class",
  },
];

export default function CalendarModuleGuide({ role, userId, isReady }) {
  const steps = role === "teacher" ? TEACHER_STEPS : STUDENT_STEPS;
  const storageKey = `jenacademia.calendar-guide.v1:${role}:${userId || "account"}`;
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  useEffect(() => {
    if (!isReady || !["student", "teacher"].includes(role)) return;
    try {
      setOpen(localStorage.getItem(storageKey) !== "done");
    } catch (error) {
      console.warn("Could not check whether the Calendar guide was seen:", error);
      setOpen(true);
    }
  }, [isReady, role, storageKey]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function finish() {
    try {
      localStorage.setItem(storageKey, "done");
    } catch (error) {
      console.warn("Could not remember that the Calendar guide was seen:", error);
    }
    setOpen(false);
    setStepIndex(0);
  }

  function replay() {
    setStepIndex(0);
    setOpen(true);
  }

  function nextStep() {
    if (stepIndex < steps.length - 1) setStepIndex((index) => index + 1);
    else finish();
  }

  if (!["student", "teacher"].includes(role)) return null;

  return (
    <>
      <div className={styles.helpRow}>
        <p>Need help with the calendar?</p>
        <button type="button" className={styles.helpButton} onClick={replay}>
          <span aria-hidden="true">💡</span> Show me how
        </button>
      </div>

      {open && (
        <ModalPortal>
          <div className={styles.backdrop}>
            <section
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="calendar-guide-title"
              aria-describedby="calendar-guide-description"
            >
              <div className={styles.topRow}>
                <span className={styles.stepCount}>Calendar • {stepIndex + 1} of {steps.length}</span>
                <button type="button" className={styles.skipButton} onClick={finish}>Close guide</button>
              </div>
              <div className={styles.progressTrack} aria-hidden="true">
                <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
              </div>
              <div className={styles.content}>
                <span className={styles.icon} aria-hidden="true">{step.icon}</span>
                <h2 id="calendar-guide-title">{step.title}</h2>
                {step.text && <p id="calendar-guide-description">{step.text}</p>}
                {step.instructions && (
                  <ol className={styles.instructions}>
                    {step.instructions.map((instruction) => (
                      <li key={instruction}>{instruction}</li>
                    ))}
                  </ol>
                )}
              </div>
              <div className={styles.actions}>
                {stepIndex > 0 && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setStepIndex((index) => index - 1)}
                  >
                    Back
                  </button>
                )}
                <button type="button" className={styles.primaryButton} onClick={nextStep}>
                  {stepIndex === steps.length - 1 ? "Finish" : "Next"}
                </button>
              </div>
            </section>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

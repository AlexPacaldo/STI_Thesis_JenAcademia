import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/firstStepsGuide.module.css";
import { readStoredUser } from "../utils/sessionUser.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import GuidePreview, { ExampleSituation } from "./GuidePreview.jsx";
import { getGuideSteps } from "./firstStepsGuideSteps.js";

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function readUserIdentity() {
  const user = readStoredUser() || {};
  return {
    id: user.id ?? user.user_id ?? user.userId ?? "account",
    role: String(user.role || "student").toLowerCase(),
  };
}

export default function FirstStepsGuide() {
  const navigate = useNavigate();
  const identity = readUserIdentity();
  const storageKey = `jenacademia.first-steps.v1:${identity.role}:${identity.id}`;
  const steps = getGuideSteps(identity.role);
  const [open, setOpen] = useState(false);
  const [guideCompleted, setGuideCompleted] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef(null);
  const backdropRef = useRef(null);
  const returnFocusRef = useRef(null);
  const helpButtonRef = useRef(null);
  const restoreFocusRef = useRef(false);
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const finishGuide = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "done");
    } catch (error) {
      console.warn("Could not remember that the welcome guide was seen:", error);
    }
    restoreFocusRef.current = true;
    setGuideCompleted(true);
    setOpen(false);
    setStepIndex(0);
  }, [storageKey]);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(storageKey) === "done";
      setGuideCompleted(completed);
      setOpen(!completed);
    } catch (error) {
      console.warn("Could not check whether the welcome guide was seen:", error);
      setGuideCompleted(false);
      setOpen(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Move focus into the dialog once, when it opens. It must not run again on
  // every step, or a keyboard user pressing Enter on "Next step" would lose the
  // button under their finger.
  useEffect(() => {
    if (!open) return;
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      returnFocusRef.current = document.activeElement;
    }
    dialogRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Hand focus back when the guide closes. Normally that is whatever opened it
  // (the "Show me how" button, or the control the user was holding). On the very
  // first run there was no trigger, so the replay button takes over — it only
  // exists after this render, which is why the focus happens in an effect.
  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    const target = returnFocusRef.current instanceof HTMLElement
      ? returnFocusRef.current
      : helpButtonRef.current;
    returnFocusRef.current = null;
    target?.focus({ preventScroll: true });
  }, [open]);

  // Keep the keyboard inside the dialog while it is open, close on Escape, and
  // let the arrow keys move between steps. This is a modal: Esc and the arrow
  // keys are what people try first.
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finishGuide();
        return;
      }
      if (event.key === "Tab") {
        const focusable = dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE)) : [];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowRight" && stepIndex < steps.length - 1) {
        setStepIndex((current) => current + 1);
      } else if (event.key === "ArrowLeft" && stepIndex > 0) {
        setStepIndex((current) => current - 1);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, stepIndex, steps.length, finishGuide]);

  // A long step should open at its beginning, not halfway down. The backdrop is
  // the scroll container (the dialog is taller than a phone screen).
  useEffect(() => {
    if (open) backdropRef.current?.scrollTo({ top: 0 });
  }, [open, stepIndex]);

  function showGuideAgain() {
    setStepIndex(0);
    setOpen(true);
  }

  function openLinkedPage() {
    const destination = step.path;
    finishGuide();
    navigate(destination);
  }

  return (
    <>
      {guideCompleted !== null && (
        <button type="button" ref={helpButtonRef} className={styles.helpButton} onClick={showGuideAgain}>
          <span aria-hidden="true">💡</span>
          Show me how
        </button>
      )}

      {open && (
        <ModalPortal>
          <div
            ref={backdropRef}
            className={styles.backdrop}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) finishGuide();
            }}
          >
            <section
              ref={dialogRef}
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="first-steps-title"
              aria-describedby="first-steps-description"
              tabIndex={-1}
            >
              <div className={styles.dialogTop}>
                <span className={styles.stepCount} aria-live="polite">
                  <span aria-hidden="true">🧭</span> Step {stepIndex + 1} of {steps.length}
                </span>
                <button type="button" className={styles.skipButton} onClick={finishGuide}>
                  Skip for now
                </button>
              </div>

              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label="Guide progress"
                aria-valuemin={1}
                aria-valuemax={steps.length}
                aria-valuenow={stepIndex + 1}
              >
                <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
              </div>

              <div className={styles.stepHead}>
                <span className={styles.bigIcon} aria-hidden="true">{step.icon}</span>
                <div className={styles.stepTitleGroup}>
                  <span className={styles.moduleBadge}>{step.module}</span>
                  <h2 id="first-steps-title">{step.title}</h2>
                </div>
              </div>

              <div className={styles.body}>
                <div className={styles.copyCol}>
                  <p id="first-steps-description" className={styles.description}>{step.text}</p>
                  <ol className={styles.pointList}>
                    {step.points.map((point) => <li key={point}>{point}</li>)}
                  </ol>
                </div>
                <div className={styles.visualCol}>
                  <GuidePreview preview={step.preview} role={identity.role} module={step.module} />
                </div>
              </div>

              <ExampleSituation example={step.preview?.example} />

              <div className={styles.actions}>
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setStepIndex((current) => current - 1)}
                  >
                    <span aria-hidden="true">←</span> Back
                  </button>
                ) : <span />}
                <div className={styles.actionGroup}>
                  {step.path && (
                    <button type="button" className={styles.ghostButton} onClick={openLinkedPage}>
                      {step.action} <span aria-hidden="true">›</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      if (isLastStep) finishGuide();
                      else setStepIndex((current) => current + 1);
                    }}
                  >
                    {isLastStep ? "I’m ready!" : "Next step"}
                    {!isLastStep && <span aria-hidden="true"> →</span>}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

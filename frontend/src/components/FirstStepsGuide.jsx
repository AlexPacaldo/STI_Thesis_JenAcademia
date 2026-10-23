import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/firstStepsGuide.module.css";
import { readStoredUser } from "../utils/sessionUser.js";
import ModalPortal from "../utils/ModalPortal.jsx";

function readUserIdentity() {
  const user = readStoredUser() || {};
  return {
    id: user.id ?? user.user_id ?? user.userId ?? "account",
    role: String(user.role || "student").toLowerCase(),
  };
}

function getGuideSteps(role) {
  if (role === "teacher") {
    return [
      {
        icon: "👋",
        title: "Hello, teacher!",
        module: "Home",
        text: "Home is your starting place. It shows your day and gives you quick links.",
        points: [
          "Look here for today’s classes and important updates.",
          "Use the menu to open Calendar, students, assignments, and books.",
          "Come back to Home whenever you want to start again.",
        ],
      },
      {
        icon: "🗓️",
        title: "Set your teaching times",
        module: "Calendar",
        text: "Tell students when you are free for class.",
        points: [
          "Open Calendar and choose Set Availability.",
          "Pick a day. Choose the time you can start and finish.",
          "If you want, add a break time.",
          "Press Save Availability. Your free times will show on the calendar.",
          "To change a time later, open your availabilities and edit that day.",
        ],
        action: "Open Calendar",
        path: "/Calendar",
      },
      {
        icon: "🔁",
        title: "Change a class time",
        module: "Calendar",
        text: "Use the calendar when you or a student needs a different class time.",
        points: [
          "Open Calendar and choose the class.",
          "Choose the option to reschedule the class.",
          "Pick a free day and time. Add a short reason.",
          "Check the new time and send the request.",
          "The other person must answer before the change is final.",
        ],
        action: "Open Calendar",
        path: "/Calendar",
      },
      {
        icon: "🧒",
        title: "Find your students",
        module: "My students",
        text: "Open My students to see the students you teach.",
        points: [
          "Find a student in your student list.",
          "Choose their name to see their information.",
          "Use the student’s name in Assignments or Remarks when you need to add something.",
        ],
        action: "See my students",
        path: "/teacherStudents",
      },
      {
        icon: "🕰️",
        title: "Look at class history",
        module: "Class history",
        text: "Class history shows classes that have already happened.",
        points: [
          "Open Class history from the menu.",
          "Look through the class list or search for a student.",
          "Open a class to see its notes and details.",
        ],
        action: "Open class history",
        path: "/teacherClassHistory",
      },
      {
        icon: "⭐",
        title: "Review a student’s progress",
        module: "Contract reviews",
        text: "Use Contract reviews to rate progress when a review is ready.",
        points: [
          "Open Contract reviews.",
          "Choose the student or review waiting for you.",
          "Pick a level for each skill.",
          "Write a helpful note, check your answers, then submit.",
        ],
        action: "Open contract reviews",
        path: "/ContractReview",
      },
      {
        icon: "💬",
        title: "Leave a remark",
        module: "Remarks",
        text: "Remarks are short notes about a student’s class.",
        points: [
          "Open Remarks and choose a student.",
          "Choose the class the note is about.",
          "Write a kind, clear note.",
          "Check the student and class, then submit the remark.",
        ],
        action: "Open remarks",
        path: "/PassRemarks",
      },
      {
        icon: "✏️",
        title: "Give and check assignments",
        module: "Assignments",
        text: "Use Assignments to give work and read what students send back.",
        points: [
          "Choose a student, then open Assign Task.",
          "Write the instructions. Add a file or due date if needed.",
          "Check the details and post the task.",
          "Open View Submissions to read the student’s answer or open their file.",
          "Use Manage Assignments to check or change posted work.",
        ],
        action: "Open assignments",
        path: "/teacherAssignment",
      },
      {
        icon: "📚",
        title: "Open your books",
        module: "My books",
        text: "My books has the lesson books shared with you.",
        points: [
          "Open My books and choose a book.",
          "Choose a lesson to open its file.",
          "Use the progress view to see how students are doing.",
        ],
        action: "Open My books",
        path: "/teacherBooksLessons",
      },
    ];
  }

  return [
    {
      icon: "👋",
      title: "Hello, learner!",
      module: "Home",
      text: "Home is your starting place. It shows what is happening today.",
      points: [
        "Look here for classes, assignments, and your class count.",
        "Use the menu to open Calendar, books, and other parts of school.",
        "Come back to Home whenever you want to start again.",
      ],
    },
    {
      icon: "🗓️",
      title: "Book a class",
      module: "Calendar",
      text: "Pick one day and one time with your teacher.",
      points: [
        "Open Calendar and tap Book a class.",
        "Choose a day, then choose a time your teacher is free.",
        "Check the teacher, day, and time.",
        "Tap Book to send your booking.",
      ],
      action: "Open Calendar",
      path: "/Calendar",
    },
    {
      icon: "🔁",
      title: "Ask to change a class",
      module: "Calendar",
      text: "If you cannot come, ask your teacher for a new time.",
      points: [
        "Open Calendar and choose your class.",
        "Tap Ask to change the time.",
        "Choose a free new day and time. Tell your teacher why.",
        "Check the new time and send your request.",
        "Your teacher must say yes before the class time changes.",
      ],
      action: "Open Calendar",
      path: "/Calendar",
    },
    {
      icon: "📖",
      title: "Look at class history",
      module: "Class history",
      text: "Class history shows classes you have already had.",
      points: [
        "Open Class history from the menu.",
        "Look through the list of past classes.",
        "Choose a class to see its details.",
      ],
      action: "Open class history",
      path: "/classHistory",
    },
    {
      icon: "⭐",
      title: "Share a contract review",
      module: "Contract reviews",
      text: "When a review is ready, you can tell us about your learning.",
      points: [
        "Open Contract reviews.",
        "Choose the review waiting for you.",
        "Pick the answers that feel right.",
        "Write a note if you want, check your answers, then submit.",
      ],
      action: "Open contract reviews",
      path: "/ContractReview",
    },
    {
      icon: "✏️",
      title: "Do your assignments",
      module: "Assignments",
      text: "Assignments shows the work your teacher gave you.",
      points: [
        "Open Assignments and choose a task.",
        "Read the instructions and due date.",
        "Write your answer or add your file.",
        "Check it, then tap Submit.",
        "If editing is allowed, open the task again and choose Edit.",
      ],
      action: "Open assignments",
      path: "/assignments",
    },
    {
      icon: "💬",
      title: "Read your remarks",
      module: "Remarks",
      text: "Remarks are notes your teacher has shared with you.",
      points: [
        "Open Remarks from the menu.",
        "Choose a note to read what your teacher said.",
        "Use the note to remember what you did well or can practise.",
      ],
      action: "Open remarks",
      path: "/remarks",
    },
    {
      icon: "📖",
      title: "Read a lesson",
      module: "Books/Lessons",
      text: "Open Books/Lessons to find your books and lessons.",
      points: [
        "Choose a book to open it.",
        "Choose the lesson you are ready to read.",
        "Read the file. Your place is saved if you leave.",
        "When you reach the bottom, tap Mark as Complete.",
        "Finishing a lesson opens the next one.",
      ],
      action: "Open Books/Lessons",
      path: "/booksLessons",
    },
  ];
}

export default function FirstStepsGuide() {
  const navigate = useNavigate();
  const identity = readUserIdentity();
  const storageKey = `jenacademia.first-steps.v1:${identity.role}:${identity.id}`;
  const steps = getGuideSteps(identity.role);
  const [open, setOpen] = useState(false);
  const [guideCompleted, setGuideCompleted] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

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

  function finishGuide() {
    try {
      localStorage.setItem(storageKey, "done");
    } catch (error) {
      console.warn("Could not remember that the welcome guide was seen:", error);
    }
    setGuideCompleted(true);
    setOpen(false);
    setStepIndex(0);
  }

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
      {guideCompleted === false && (
        <button type="button" className={styles.helpButton} onClick={showGuideAgain}>
          <span aria-hidden="true">💡</span>
          Show me how
        </button>
      )}

      {open && (
        <ModalPortal>
          <div className={styles.backdrop}>
            <section
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="first-steps-title"
              aria-describedby="first-steps-description"
            >
            <div className={styles.dialogTop}>
              <span className={styles.stepCount}>Step {stepIndex + 1} of {steps.length}</span>
              <button type="button" className={styles.skipButton} onClick={finishGuide}>
                Skip for now
              </button>
            </div>
            <div className={styles.progressTrack} aria-hidden="true">
              <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
            </div>
            <div className={styles.stepContent}>
              <span className={styles.bigIcon} aria-hidden="true">{step.icon}</span>
              <h2 id="first-steps-title">{step.title}</h2>
              <span className={styles.moduleBadge}>{step.module}</span>
              <p id="first-steps-description" className={styles.description}>{step.text}</p>
              <ol className={styles.pointList}>
                {step.points.map((point) => <li key={point}>{point}</li>)}
              </ol>
            </div>
            <div className={styles.actions}>
              {stepIndex > 0 ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setStepIndex((current) => current - 1)}
                >
                  Back
                </button>
              ) : <span />}
              {step.path ? (
                <button type="button" className={styles.primaryButton} onClick={openLinkedPage}>
                  {step.action}
                </button>
              ) : stepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => setStepIndex((current) => current + 1)}
                >
                  Next
                </button>
              ) : (
                <button type="button" className={styles.primaryButton} onClick={finishGuide}>
                  I’m ready!
                </button>
              )}
            </div>
            {step.path && (
              <button
                type="button"
                className={styles.nextButton}
                onClick={() => {
                  if (stepIndex === steps.length - 1) finishGuide();
                  else setStepIndex((current) => current + 1);
                }}
              >
                {stepIndex === steps.length - 1 ? "Finish guide" : "Keep looking around"}
              </button>
            )}
            </section>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

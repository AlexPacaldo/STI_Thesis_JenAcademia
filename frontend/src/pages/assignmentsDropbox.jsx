// src/pages/AssignmentDetail.jsx
import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import styles from "../assets/assignmentsDropbox.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";

export default function AssignmentsDropbox() {
  const { notify } = useNotification() || {};
  const [comment, setComment] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const assignmentId = searchParams.get("assignmentId");

  const assignmentList = useMemo(() => {
    const stored = localStorage.getItem("teacherAssignments");
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }, []);

  const selectedAssignment = useMemo(
    () => assignmentList.find((item) => String(item.id) === String(assignmentId)),
    [assignmentId, assignmentList]
  );

  const assignmentInstructions =
    selectedAssignment?.instructions ||
    selectedAssignment?.description ||
    "";

  const currentStudent = useMemo(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return user.firstName || user.first_name
        ? `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim()
        : user.name || user.fullName || selectedAssignment?.student || "Student";
    } catch {
      return selectedAssignment?.student || "Student";
    }
  }, [selectedAssignment?.student]);

  const onSubmitComment = () => {
    if (!selectedAssignment) {
      setSubmitMessage("Please open an assignment before submitting.");
      return;
    }

    if (!comment.trim()) {
      setSubmitMessage("Please write your comment before submitting.");
      return;
    }

    let storedSubmissions = [];
    try {
      storedSubmissions = JSON.parse(localStorage.getItem("studentSubmissions") || "[]");
    } catch {
      storedSubmissions = [];
    }

    const submittedAt = new Date().toLocaleString();
    const submission = {
      id: `${selectedAssignment.id}-${currentStudent}`,
      assignmentId: selectedAssignment.id,
      assignmentName: selectedAssignment.name,
      assignedStudent: selectedAssignment.student || currentStudent,
      student: currentStudent,
      teacherId: selectedAssignment.teacherId ?? null,
      teacherName: selectedAssignment.teacherName || "Teacher Jen",
      file: "Comment submission",
      comments: comment.trim(),
      status: "Submitted",
      submittedAt,
    };

    const nextSubmissions = storedSubmissions.filter(
      (item) =>
        !(
          String(item.assignmentId) === String(selectedAssignment.id) &&
          (item.student === currentStudent || item.assignedStudent === selectedAssignment.student)
        )
    );

    localStorage.setItem("studentSubmissions", JSON.stringify([...nextSubmissions, submission]));
    notify("Assignment has been submitted!", "success");
    setSubmitMessage(`Submitted on ${submittedAt}.`);
    setComment("");
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        <div className={styles.centerContent}>
          <h1><b>{selectedAssignment?.name || "Activity 1"}</b></h1>
        </div>
        <br />

        <div className={styles.tabContainer}>
          <button type="button" className={`${styles.tabButton} ${styles.activeTab}`}>
            Instructions
          </button>
        </div>
        <br />

        <div className={styles.instructionContent}>
          <div className={styles.leftSide}>
            {selectedAssignment ? (
              <div className={styles.instructionsPanel}>
                <h4>Instructions:</h4>
                <textarea
                  className={styles.instructionsBox}
                  placeholder="Write your instructions here..."
                  value={assignmentInstructions}
                  readOnly
                />

                <div className={styles.responsePanel}>
                  <label htmlFor="studentComment" className={styles.responseLabel}>
                    <b>Your Answer:</b>
                  </label>
                  <textarea
                    id="studentComment"
                    className={styles.commentBox}
                    placeholder="Write your answer here..."
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value);
                      setSubmitMessage("");
                    }}
                  />
                  <button
                    type="button"
                    className={styles.submitComment}
                    onClick={onSubmitComment}
                    disabled={!selectedAssignment}
                  >
                    Submit
                  </button>
                  {submitMessage ? (
                    <p className={styles.submitMessage}>{submitMessage}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p>
                No assignment is currently selected. Please return to the assignments list and open your assigned task.
              </p>
            )}
          </div>

          <div className={styles.rightSide}>
            <div className={styles.card}>
              <img src={teacherPic} alt="Teacher" className={styles.teacherImg} />
              <span>
                <b>{selectedAssignment?.teacherName || "Teacher Jen"}</b>
              </span>
              <br /><br />
              <h2>{selectedAssignment?.subject || "English 101"}</h2>
              <p>
                <strong>Due Date:</strong> {selectedAssignment?.due || "November 10, 2025"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

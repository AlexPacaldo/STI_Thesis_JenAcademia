// src/pages/AssignmentDetail.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import styles from "../assets/assignmentsDropbox.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";

const API = "http://localhost:3001";

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function getUserName(user) {
  return user.firstName || user.first_name
    ? `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim()
    : user.name || user.fullName || "Student";
}

export default function AssignmentsDropbox() {
  const { notify } = useNotification() || {};
  const [comment, setComment] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const assignmentId = searchParams.get("assignmentId");

  const currentUser = useMemo(getCurrentUser, []);
  const currentStudentId = currentUser.id ?? currentUser.user_id ?? null;
  const currentStudent = getUserName(currentUser);

  useEffect(() => {
    if (!assignmentId) return;

    let ignore = false;
    setIsLoading(true);
    setSubmitMessage("");

    fetch(`${API}/api/assignments/${assignmentId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || "Could not load assignment");
        }
        return data.assignment;
      })
      .then((assignment) => {
        if (ignore) return;
        setSelectedAssignment(assignment);
        setComment(assignment.comments || "");
        if (assignment.submissionId) {
          setSubmitMessage(`Submitted on ${assignment.submittedAt}.`);
        }
      })
      .catch((err) => {
        console.error("Load assignment detail error:", err);
        if (!ignore) {
          setSelectedAssignment(null);
          setSubmitMessage(err.message || "Could not load assignment.");
        }
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [assignmentId]);

  const assignmentInstructions =
    selectedAssignment?.instructions ||
    selectedAssignment?.description ||
    "";

  const onSubmitComment = async () => {
    if (!selectedAssignment) {
      setSubmitMessage("Please open an assignment before submitting.");
      return;
    }

    if (!currentStudentId) {
      setSubmitMessage("Please log in as a student before submitting.");
      return;
    }

    if (!comment.trim()) {
      setSubmitMessage("Please write your comment before submitting.");
      return;
    }

    try {
      const res = await fetch(`${API}/api/assignments/${selectedAssignment.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: currentStudentId,
          submissionText: comment,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not submit assignment");
      }

      const submittedAt = data.submission?.submittedAt || new Date().toLocaleString();
      setSelectedAssignment((prev) => ({
        ...prev,
        submissionId: data.submission?.submissionId,
        comments: data.submission?.comments || comment.trim(),
        submittedAt,
        status: "submitted",
      }));
      notify?.("Assignment has been submitted!", "success");
      setSubmitMessage(`Submitted on ${submittedAt}.`);
      setComment("");
    } catch (err) {
      console.error("Submit assignment error:", err);
      setSubmitMessage(err.message || "Could not submit assignment.");
      notify?.(err.message || "Could not submit assignment.", "error");
    }
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        <div className={styles.centerContent}>
          <h1><b>{selectedAssignment?.name || (isLoading ? "Loading assignment..." : "Assignment")}</b></h1>
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
                {submitMessage || "No assignment is currently selected. Please return to the assignments list and open your assigned task."}
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
              <h2>{selectedAssignment?.subject || "General"}</h2>
              <p>
                <strong>Student:</strong> {selectedAssignment?.student || currentStudent}
              </p>
              <p>
                <strong>Due Date:</strong> {selectedAssignment?.due || "No due date"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

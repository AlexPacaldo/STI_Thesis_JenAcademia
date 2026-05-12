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

function getAssignmentDisplayText(assignment) {
  return assignment?.instructions || assignment?.description || assignment?.name || "Assignment";
}

function formatDueDate(assignment) {
  const dueDate = assignment?.dueDate || "";
  const dueTime = assignment?.dueTime || "";

  if (dueDate) {
    const [year, month, day] = dueDate.split("-").map(Number);
    const [hour = 0, minute = 0] = dueTime.split(":").map(Number);
    const date = new Date(year, month - 1, day, hour, minute);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: dueTime ? "numeric" : undefined,
        minute: dueTime ? "2-digit" : undefined,
      });
    }
  }

  if (assignment?.due) {
    return String(assignment.due).replace("T", " ");
  }

  return "No due date";
}

function getAttemptsUsed(assignment) {
  return Number(assignment?.attemptsUsed ?? assignment?.attemptCount ?? 0);
}

function getAttemptLimit(assignment) {
  const limit = Number(assignment?.attemptLimit);
  return Number.isInteger(limit) && limit > 0 ? limit : null;
}

export default function AssignmentsDropbox() {
  const { notify } = useNotification() || {};
  const [comment, setComment] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
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

  const isAssignmentPastDue = () => {
    if (!selectedAssignment?.dueDate) return false;
    const now = new Date();
    const [year, month, day] = selectedAssignment.dueDate.split("-").map(Number);
    let dueDateTime;
    if (selectedAssignment.dueTime) {
      const [hour, minute] = selectedAssignment.dueTime.split(":").map(Number);
      dueDateTime = new Date(year, month - 1, day, hour, minute, 0);
    } else {
      dueDateTime = new Date(year, month - 1, day, 23, 59, 59);
    }
    return dueDateTime < now;
  };

  const attemptLimit = getAttemptLimit(selectedAssignment);
  const attemptsUsed = getAttemptsUsed(selectedAssignment);
  const isAttemptLimitReached = attemptLimit !== null && attemptsUsed >= attemptLimit;

  const onSubmitComment = async () => {
    if (!selectedAssignment) {
      setSubmitMessage("Please open an assignment before submitting.");
      return;
    }

    if (!currentStudentId) {
      setSubmitMessage("Please log in as a student before submitting.");
      return;
    }

    if (isAssignmentPastDue()) {
      setSubmitMessage("This assignment is past due and can no longer be submitted.");
      return;
    }

    if (isAttemptLimitReached) {
      setSubmitMessage("Attempt limit reached. You can no longer submit this assignment.");
      return;
    }

    if (!comment.trim() && !selectedFile) {
      setSubmitMessage("Please write a comment or attach a file before submitting.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("studentId", currentStudentId);
      if (comment.trim()) {
        formData.append("submissionText", comment.trim());
      }
      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const res = await fetch(`${API}/api/assignments/${selectedAssignment.id}/submissions`, {
        method: "POST",
        body: formData,
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
        fileUrl: data.submission?.fileUrl || prev?.fileUrl,
        attemptLimit: data.submission?.attemptLimit ?? prev?.attemptLimit,
        attemptsUsed: data.submission?.attemptsUsed ?? data.submission?.attemptCount ?? (getAttemptsUsed(prev) + 1),
        attemptCount: data.submission?.attemptCount ?? data.submission?.attemptsUsed ?? (getAttemptsUsed(prev) + 1),
        submittedAt,
        status: "submitted",
      }));
      notify?.("Assignment has been submitted!", "success");
      setSubmitMessage(`Submitted on ${submittedAt}.`);
      setComment("");
      setSelectedFile(null);
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
          <h1><b>{selectedAssignment ? getAssignmentDisplayText(selectedAssignment) : (isLoading ? "Loading assignment..." : "Assignment")}</b></h1>
        </div>
        {selectedAssignment && isAssignmentPastDue() ? (
          <div className={styles.pastDueAlert}>
            ⚠️ This assignment is past due and cannot be submitted
          </div>
        ) : selectedAssignment && isAttemptLimitReached ? (
          <div className={styles.pastDueAlert}>
            Attempt limit reached. You can no longer submit this assignment.
          </div>
        ) : null}
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
                  <label htmlFor="submissionFile" className={styles.fileLabel}>
                    Upload file (any type)
                  </label>
                  <input
                    id="submissionFile"
                    type="file"
                    className={styles.fileInput}
                    onChange={(e) => {
                      setSelectedFile(e.target.files?.[0] ?? null);
                      setSubmitMessage("");
                    }}
                  />
                  {selectedFile ? (
                    <p className={styles.fileInfo}>Attached: {selectedFile.name}</p>
                  ) : selectedAssignment?.fileUrl ? (
                    <p className={styles.fileInfo}>
                      Current file: <a href={selectedAssignment.fileUrl} target="_blank" rel="noreferrer">{selectedAssignment.fileUrl.split("/").pop()}</a>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.submitComment}
                    onClick={onSubmitComment}
                    disabled={!selectedAssignment || isAssignmentPastDue() || isAttemptLimitReached}
                  >
                    Submit
                  </button>
                  {submitMessage ? (
                    <p className={styles.submitMessage} style={{ color: isAssignmentPastDue() || isAttemptLimitReached ? "#dc2626" : "#374151" }}>
                      {submitMessage}
                    </p>
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
                <strong>Due Date:</strong> {formatDueDate(selectedAssignment)}
              </p>
              <p>
                <strong>Attempts:</strong> {attemptsUsed}
                {attemptLimit !== null ? ` / ${attemptLimit}` : " / Unlimited"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

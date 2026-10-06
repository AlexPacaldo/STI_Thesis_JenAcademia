import { useEffect, useMemo, useState } from "react";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/teacherAssignment.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { addLocalNotification } from "../utils/localNotificationStore.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;

function normalizeFileUrl(url) {
  if (!url) return "";
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/uploads/")) return `${API}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API}/${cleaned}`;
  return cleaned;
}

function getUserName(user) {
  return user.firstName || user.first_name
    ? `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim()
    : user.name || user.fullName || "";
}

function studentProfileSrc(student) {
  const url = student?.profileImageUrl || student?.profile_image_url || student?.profile_picture;
  if (!url) return userPic;
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  // uploads paths arrive both with and without a leading slash; a bare concat
  // produces "localhost:3001uploads/..." with no separator, which 404s.
  if (cleaned.startsWith("/uploads/")) return `${API}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API}/${cleaned}`;
  return cleaned;
}

// The API returns submittedAt as a MySQL-formatted string
// ("2026-08-27 16:14"), which is not valid ISO - new Date() parses it
// inconsistently across browsers. Parse the parts explicitly and build a local
// Date so the output is stable.
function formatSubmittedAt(value) {
  if (!value) return "Not submitted";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    );
    if (!Number.isNaN(parsed.getTime())) {
      const dateText = parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timeText = parsed.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${dateText} at ${timeText}`;
    }
  }

  const fallback = new Date(value);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return String(value);
}

function formatStudent(student) {
  return {
    id: student.user_id ?? student.id ?? student.studentId,
    name:
      student.name ||
      `${student.first_name || student.firstName || ""} ${student.last_name || student.lastName || ""}`.trim(),
    courseId: student.course_id ?? student.courseId ?? null,
    profileImageUrl: student.profileImageUrl || student.profile_image_url || student.profile_picture || "",
  };
}

function getSubmissionFileName(url) {
  if (!url) return "";
  return decodeURIComponent(String(url).split("/").pop() || "Submitted file");
}

function renderSubmissionPreview(url) {
  const fileUrl = normalizeFileUrl(url);
  if (!fileUrl) return null;

  const ext = fileUrl.split(".").pop().split("?")[0].toLowerCase();
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) {
    return <audio controls src={fileUrl} className={styles.filePlayer} />;
  }
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) {
    return <video controls src={fileUrl} className={styles.filePlayer} />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
    return <img src={fileUrl} alt="Submitted file" className={styles.submissionImage} />;
  }
  if (["pdf", "txt"].includes(ext)) {
    return (
      <iframe
        title="Submitted file preview"
        src={fileUrl}
        className={styles.submissionDocument}
      />
    );
  }
  return (
    <div className={styles.unsupportedPreview}>
      This file type cannot be previewed here. Use Open file or Download.
    </div>
  );
}

function renderSubmissionFile(url) {
  const fileUrl = normalizeFileUrl(url);
  if (!fileUrl) return null;

  return (
    <div className={styles.submissionFilePreview}>
      <span className={styles.submissionLabel}>Submitted file</span>
      <p className={styles.fileName}>{getSubmissionFileName(fileUrl)}</p>
      <div className={styles.fileActions}>
        <a href={fileUrl} target="_blank" rel="noreferrer">
          Open file
        </a>
        <a href={fileUrl} download>
          Download
        </a>
      </div>
      {renderSubmissionPreview(fileUrl)}
    </div>
  );
}

function getAssignmentInstructions(submission, assignments) {
  if (submission.assignmentInstructions) return submission.assignmentInstructions;
  const assignment = assignments.find(
    (item) => String(item.id ?? item.assignmentId) === String(submission.assignmentId)
  );
  return assignment?.instructions || assignment?.description || "";
}

export default function AssignTask() {
  const { notify } = useNotification() || {};
  const [query, setQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [due, setDue] = useState("");
  const [instructions, setInstructions] = useState("");
  const [hasAttemptLimit, setHasAttemptLimit] = useState(false);
  const [attemptLimit, setAttemptLimit] = useState("1");
  const [activeTab, setActiveTab] = useState("assign");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const currentUser = useMemo(() => readStoredUser() || {}, []);

  const currentTeacherId = currentUser.id ?? currentUser.user_id ?? null;
  const teacherName = getUserName(currentUser) || "You";

  const closeConfirmAction = () => setConfirmAction(null);
  const requestCreateAssignment = () => {
    if (!selectedStudent) {
      notify?.("Please select a student before posting an assignment.", "warning");
      return;
    }
    const selectedStudentName = selectedStudent?.name || "selected student";
    setConfirmAction({
      type: "create-assignment",
      title: `Give assignment to ${selectedStudentName}?`,
      message: `Are you sure you want to post this assignment for ${selectedStudentName}?`,
      confirmLabel: "Post Assignment"
    });
  };

  const createAssignment = async () => {
    try {
      const res = await fetch(`${API}/api/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: currentTeacherId,
          studentId: selectedStudent.id,
          courseId: selectedStudent.courseId,
          title: `Task for ${selectedStudent.name}`,
          instructions,
          due,
          attemptLimit: hasAttemptLimit ? Number(attemptLimit) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not create assignment");
      }

      setTeacherAssignments((prev) => [data.assignment, ...prev]);

      addLocalNotification({
        recipientId: selectedStudent.id,
        recipientName: selectedStudent.name,
        senderName: teacherName,
        message: `New assignment posted by ${teacherName}: "${data.assignment.name}"${data.assignment.due ? ` due ${data.assignment.due}` : ""}.`,
        type: "assignment",
        title: "New Assignment",
        relatedId: data.assignment.id,
      });

      notify?.("Assignment posted to student!", "success");
      setInstructions("");
      setDue("");
      setHasAttemptLimit(false);
      setAttemptLimit("1");
    } catch (err) {
      console.error("Create assignment error:", err);
      notify?.(err.message || "Could not create assignment.", "error");
    }
  };

  const performConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "create-assignment") {
      await createAssignment();
    }
    closeConfirmAction();
  };

  useEffect(() => {
    if (!currentTeacherId) return;

    let ignore = false;
    setIsLoading(true);

    Promise.all([
      fetch(`${API}/api/teacher/${currentTeacherId}/students`).then((res) => res.json()),
      fetch(`${API}/api/teacher/${currentTeacherId}/assignments`).then((res) => res.json()),
      fetch(`${API}/api/teacher/${currentTeacherId}/submissions`).then((res) => res.json()),
    ])
      .then(([studentsData, assignmentsData, submissionsData]) => {
        if (ignore) return;
        const assignments = assignmentsData.assignments || [];
        setEnrolledStudents((studentsData.students || []).map(formatStudent).filter((student) => student.id));
        setTeacherAssignments(assignments);
        setSubmissions(
          (submissionsData.submissions || []).map((submission) => ({
            ...submission,
            assignmentInstructions: getAssignmentInstructions(submission, assignments),
          }))
        );
      })
      .catch((err) => {
        console.error("Error loading assignment data:", err);
        notify?.("Could not load assignment data from the database.", "error");
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [currentTeacherId, notify]);

  const students = useMemo(() => {
    const map = new Map();

    enrolledStudents.forEach((student) => {
      if (student.id && student.name) map.set(String(student.id), student);
    });

    teacherAssignments.forEach((assignment) => {
      if (assignment.studentId && assignment.student) {
        const existing = map.get(String(assignment.studentId));
        map.set(String(assignment.studentId), {
          id: assignment.studentId,
          name: assignment.student,
          courseId: assignment.courseId ?? existing?.courseId ?? null,
          profileImageUrl: existing?.profileImageUrl || assignment.profileImageUrl || assignment.profile_image_url || "",
        });
      }
    });

    submissions.forEach((submission) => {
      if (submission.studentId && submission.student) {
        const existing = map.get(String(submission.studentId));
        map.set(String(submission.studentId), {
          id: submission.studentId,
          name: submission.student,
          courseId: submission.courseId ?? existing?.courseId ?? null,
          profileImageUrl: existing?.profileImageUrl || submission.profileImageUrl || submission.profile_image_url || "",
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [enrolledStudents, teacherAssignments, submissions]);

  const selectedStudent = students.find((student) => String(student.id) === String(selectedStudentId));
  const selected = selectedStudent?.name || "";

  const currentSubmissions = submissions.filter(
    (item) => String(item.studentId) === String(selectedStudentId)
  );

  const filtered = students.filter((student) =>
    student.name.toLowerCase().includes(query.toLowerCase())
  );

  const getDueDateTime = () => {
    if (!due) return null;
    const [datePart, timePart] = due.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    if (timePart) {
      const [hour, minute] = timePart.split(":").map(Number);
      return new Date(year, month - 1, day, hour, minute, 0);
    } else {
      return new Date(year, month - 1, day, 23, 59, 59);
    }
  };

  const isDueDateValid = () => {
    const dueDateTime = getDueDateTime();
    if (!dueDateTime) return false;
    return dueDateTime >= new Date();
  };

  const onSubmit = async () => {
    if (!selectedStudent || !instructions.trim()) {
      notify?.("Please select a student and add instructions.", "warning");
      return;
    }

    if (due && !isDueDateValid()) {
      notify?.("Due date must be in the future. Please select a current or future date and time.", "error");
      return;
    }

    const parsedAttemptLimit = hasAttemptLimit ? Number(attemptLimit) : null;
    if (hasAttemptLimit && (!Number.isInteger(parsedAttemptLimit) || parsedAttemptLimit < 1)) {
      notify?.("Attempt limit must be a whole number greater than 0.", "warning");
      return;
    }

    requestCreateAssignment();
  };

  return (
    <div className={styles.cont}>
      <div className={styles.Center}>
        <div className={styles.leftCard}>
          <div className={styles.searchContainer}>
            <i className="bi bi-search" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search students"
            />
          </div>

          <div className={styles.studentList}>
            {filtered.length > 0 ? (
              filtered.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className={`${styles.boxCard} ${String(selectedStudentId) === String(student.id) ? styles.Active : ""}`}
                  onClick={() => {
                    setSelectedStudentId(student.id);
                    setSelectedSubmission(null);
                  }}
                >
                  <div className={styles.studentSummary}>
                    <img
                      src={studentProfileSrc(student)}
                      alt={student.name}
                      className={styles.studentAvatar}
                      onError={(event) => {
                        event.currentTarget.src = userPic;
                      }}
                    />
                    <h1>{student.name}</h1>
                  </div>
                </button>
              ))
            ) : (
              <div className={styles.emptyState} style={{ padding: 18 }}>
                {isLoading ? "Loading students..." : "No students are currently assigned to this teacher."}
              </div>
            )}
          </div>
        </div>

        <div className={`${styles.rightCard} ${activeTab === "submissions" ? styles.rightCardFill : ""}`}>
          <div className={styles.rightContent}>
            <div className={styles.tabBar} role="tablist">
              <button
                type="button"
                className={`${styles.tabButton} ${activeTab === "assign" ? styles.activeTab : ""}`}
                onClick={() => setActiveTab("assign")}
              >
                Assign Task
              </button>
              <button
                type="button"
                className={`${styles.tabButton} ${activeTab === "submissions" ? styles.activeTab : ""}`}
                onClick={() => setActiveTab("submissions")}
              >
                View Submissions
              </button>
            </div>

            {activeTab === "assign" ? (
              <>
                <div className={styles.user}>
                  <img src={studentProfileSrc(selectedStudent)} alt={selected || "Selected student"} />
                  <div>
                    <h1>{selected || "Select a student"}</h1>
                  </div>
                </div>
                <div className={styles.bottomInfo}>
                  <div className={styles.infoCard}>
                    <div className={styles.Date}>
                      <label htmlFor="due" className={styles.label}>
                        <b>Due Date (optional):</b>
                      </label>
                      <input
                        id="due"
                        type="datetime-local"
                        className={styles.dateBox}
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                      {due && !isDueDateValid() ? (
                        <p className={styles.dateError}>
                          Due date must be in the future
                        </p>
                      ) : null}
                    </div>
                    <div className={styles.AttemptLimit}>
                      <label htmlFor="hasAttemptLimit" className={styles.checkboxLabel}>
                        <input
                          id="hasAttemptLimit"
                          type="checkbox"
                          checked={hasAttemptLimit}
                          onChange={(e) => setHasAttemptLimit(e.target.checked)}
                        />
                        Limit attempts
                      </label>
                      {hasAttemptLimit ? (
                        <input
                          type="number"
                          className={styles.attemptInput}
                          min="1"
                          step="1"
                          value={attemptLimit}
                          onChange={(e) => setAttemptLimit(e.target.value)}
                          aria-label="Maximum submission attempts"
                        />
                      ) : null}
                    </div>
                    <div className={styles.Instructions}>
                      <h4>Instructions:</h4>
                      <textarea
                        id="comment"
                        className={styles.commentBox}
                        placeholder="Write your instructions here..."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                      />
                      <button type="button" className={styles.submitComment} onClick={onSubmit}>
                        Create Assignment
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.submissionsPanel}>
                <h2>{selected || "Selected student"}'s Submissions</h2>
                <div className={styles.submissionList}>
                  {currentSubmissions.length === 0 ? (
                    <div className={styles.emptyState}>
                      No submissions found for {selected || "this student"}.
                    </div>
                  ) : (
                    currentSubmissions.map((item) => {
                      const isExpanded = selectedSubmission?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`${styles.submissionRow} ${isExpanded ? styles.submissionRowExpanded : ""}`}
                        >
                          <div className={styles.submissionSummary}>
                            <div className={styles.submissionSummaryText}>
                              <strong>{item.student}</strong>
                              <p className={styles.submissionTask}>
                                {item.assignmentName || "Assignment"}
                              </p>
                              <p className={styles.submissionMeta}>
                                <i className="bi bi-clock" aria-hidden="true" />
                                {formatSubmittedAt(item.submittedAt)}
                                {item.attemptsUsed ? ` · Attempt ${item.attemptsUsed}` : ""}
                                {item.attemptLimit ? ` of ${item.attemptLimit}` : ""}
                              </p>
                            </div>
                            <div className={styles.submissionActions}>
                              <span className={styles.submissionStatus}>{item.status}</span>
                              <button
                                type="button"
                                className={styles.submissionAction}
                                aria-expanded={isExpanded}
                                onClick={() => {
                                  // Toggle in place. Previously this opened a
                                  // separate panel below the whole list, so the
                                  // teacher had to scroll past every submission
                                  // to reach the one they just clicked.
                                  setSelectedSubmission(isExpanded ? null : item);
                                }}
                              >
                                {isExpanded ? "Hide" : "View"}
                              </button>
                            </div>
                          </div>

                          {isExpanded ? (
                            <div className={styles.submissionDetail}>
                              <div className={styles.submissionBlock}>
                                <span className={styles.submissionLabel}>Instructions</span>
                                <p className={styles.submissionInstructionsText}>
                                  {item.assignmentInstructions || "No instructions recorded for this assignment."}
                                </p>
                              </div>

                              <div className={styles.submissionBlock}>
                                <span className={styles.submissionLabel}>Student answer</span>
                                <p className={styles.submissionAnswer}>
                                  {item.comments || "Comment submission - no written answer."}
                                </p>
                              </div>

                              {item.fileUrl ? (
                                <div className={styles.submissionBlock}>
                                  <span className={styles.submissionLabel}>Attachment</span>
                                  {renderSubmissionFile(item.fileUrl)}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {confirmAction && (
        <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.48)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: "20px",
              animation: "fadeInFast 0.18s ease-out",
            }}
            onClick={closeConfirmAction}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid rgba(38, 66, 59, 0.12)",
                borderRadius: "24px",
                padding: "24px",
                maxWidth: "440px",
                width: "100%",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
                animation: "scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: "1.2rem", fontWeight: 800, color: "#13251f" }}>{confirmAction.title}</h3>
              <p style={{ margin: "0 0 20px", color: "#5e7268", lineHeight: 1.6, fontSize: "0.95rem" }}>{confirmAction.message}</p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeConfirmAction}
                  style={{
                    minHeight: "42px",
                    padding: "10px 18px",
                    borderRadius: "14px",
                    border: "1px solid rgba(38, 66, 59, 0.14)",
                    background: "#fff",
                    color: "#26423b",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={performConfirmAction}
                  style={{
                    minHeight: "42px",
                    padding: "10px 18px",
                    borderRadius: "14px",
                    border: "none",
                    background: "#26423b",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {confirmAction.confirmLabel}
                </button>
              </div>
            </div>
          </div>
      )}
    </div>
  );
}

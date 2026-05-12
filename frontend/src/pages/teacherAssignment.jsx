import { useEffect, useMemo, useState } from "react";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/teacherAssignment.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { addLocalNotification } from "../utils/localNotificationStore.js";

const API = "http://localhost:3001";

function getUserName(user) {
  return user.firstName || user.first_name
    ? `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim()
    : user.name || user.fullName || "";
}

function formatStudent(student) {
  return {
    id: student.user_id ?? student.id ?? student.studentId,
    name:
      student.name ||
      `${student.first_name || student.firstName || ""} ${student.last_name || student.lastName || ""}`.trim(),
    courseId: student.course_id ?? student.courseId ?? null,
  };
}

function getSubmissionFileName(url) {
  if (!url) return "";
  return url.split("/").pop();
}

function renderSubmissionPreview(url) {
  if (!url) return null;
  const ext = url.split(".").pop().split("?")[0].toLowerCase();
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) {
    return <audio controls src={url} className={styles.filePlayer} />;
  }
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) {
    return <video controls src={url} className={styles.filePlayer} />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
    return <img src={url} alt="Submitted file" className={styles.submissionImage} />;
  }
  return null;
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

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const currentTeacherId = currentUser.id ?? currentUser.user_id ?? null;
  const teacherName = getUserName(currentUser) || "You";

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
          attemptLimit: parsedAttemptLimit,
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
                <h1>{student.name}</h1>
              </button>
            ))
          ) : (
            <div className={styles.emptyState} style={{ padding: 18 }}>
              {isLoading ? "Loading students..." : "No students are currently assigned to this teacher."}
            </div>
          )}
        </div>

        <div className={styles.rightCard}>
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
                  <img src={userPic} alt="Selected student" />
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
                    <br />
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
                    currentSubmissions.map((item) => (
                      <div key={item.id} className={styles.submissionRow}>
                        <div>
                          <strong>{item.student}</strong>
                          <p>{item.assignmentName || "Assignment"}</p>
                          <div className={styles.submissionInstructions}>
                            <span>Instructions</span>
                            <p>{item.assignmentInstructions || "No instructions recorded for this assignment."}</p>
                          </div>
                          {item.comments ? (
                            <>
                              <span className={styles.submissionLabel}>Student answer</span>
                              <p>{item.comments}</p>
                            </>
                          ) : null}
                          {item.fileUrl ? (
                            <div className={styles.submissionFilePreview}>
                              <span className={styles.submissionLabel}>Submitted file</span>
                              <p>
                                <a href={item.fileUrl} target="_blank" rel="noreferrer">
                                  {getSubmissionFileName(item.fileUrl)}
                                </a>
                              </p>
                            </div>
                          ) : null}
                          {renderSubmissionPreview(item.fileUrl)}
                          {!item.comments && !item.fileUrl ? (
                            <p>Comment submission</p>
                          ) : null}
                          <p className={styles.submissionMeta}>{item.submittedAt}</p>
                          {item.attemptsUsed ? (
                            <p className={styles.submissionMeta}>
                              Attempts: {item.attemptsUsed}{item.attemptLimit ? ` / ${item.attemptLimit}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <div className={styles.submissionActions}>
                          <span className={styles.submissionStatus}>{item.status}</span>
                          <button
                            type="button"
                            className={styles.submissionAction}
                            onClick={() => {
                              setSelectedSubmission(item);
                            }}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedSubmission ? (
                  <div className={styles.submissionDetail}>
                    <h3>Submission Details</h3>
                    <p><strong>Student:</strong> {selectedSubmission.student}</p>
                    <p><strong>Assignment:</strong> {selectedSubmission.assignmentName || "Assignment"}</p>
                    <p><strong>Instructions:</strong> {selectedSubmission.assignmentInstructions || "No instructions recorded for this assignment."}</p>
                    {selectedSubmission.comments ? (
                      <p><strong>Student answer:</strong> {selectedSubmission.comments}</p>
                    ) : null}
                    {selectedSubmission.fileUrl ? (
                      <div className={styles.submissionFilePreview}>
                        <p>
                          <strong>Submitted file: </strong>
                          <a href={selectedSubmission.fileUrl} target="_blank" rel="noreferrer">
                            {getSubmissionFileName(selectedSubmission.fileUrl)}
                          </a>
                        </p>
                        {renderSubmissionPreview(selectedSubmission.fileUrl)}
                      </div>
                    ) : null}
                    {!selectedSubmission.comments && !selectedSubmission.fileUrl ? (
                      <p><strong>Student answer:</strong> Comment submission</p>
                    ) : null}
                    <p><strong>Status:</strong> {selectedSubmission.status}</p>
                    <p>
                      <strong>Attempts:</strong> {selectedSubmission.attemptsUsed || 1}
                      {selectedSubmission.attemptLimit ? ` / ${selectedSubmission.attemptLimit}` : ""}
                    </p>
                    <p><strong>Submitted at:</strong> {selectedSubmission.submittedAt}</p>
                    <button
                      type="button"
                      className={styles.closeDetail}
                      onClick={() => setSelectedSubmission(null)}
                    >
                      Close
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

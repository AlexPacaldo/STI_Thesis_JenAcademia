import { useEffect, useMemo, useRef, useState } from "react";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/teacherAssignment.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { addLocalNotification } from "../utils/localNotificationStore.js";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";
import { getStoredUserTimezone, parseServerTimestamp } from "../utils/timezone.js";
import { apiFetch } from "../utils/apiAuth.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import ModalPortal from "../utils/ModalPortal.jsx";
import {
  downloadAuthenticatedFile,
  openSubmissionFile,
  useAuthenticatedFileUrl,
} from "../utils/authenticatedFile.js";

const API = API_BASE_URL;

function getUserName(user) {
  return user.firstName || user.first_name
    ? `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim()
    : user.name || user.fullName || "";
}


// The API returns submittedAt / postedAt as a MySQL-formatted string
// ("2026-08-27 16:14"), which is not valid ISO. These come from
// CURRENT_TIMESTAMP columns and are therefore UTC. The previous version parsed
// the parts into a local Date, which treated them as wall-clock and shifted
// every timestamp by the UTC offset. See parseServerTimestamp.
function formatSubmittedAt(value) {
  if (!value) return "Not submitted";

  const instant = parseServerTimestamp(value);
  if (!instant) return String(value);

  const zone = getStoredUserTimezone();
  const dateText = instant.toLocaleDateString("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeText = instant.toLocaleTimeString("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateText} at ${timeText}`;
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

// Rendered through the session token rather than a plain URL: these are
// <img>/<video>/<iframe> sources, which cannot send an Authorization header.
// The file is fetched with the header and handed over as a blob: URL.
function SubmissionPreview({ url }) {
  const { url: fileUrl, error, loading } = useAuthenticatedFileUrl(url);
  if (!url) return null;

  if (loading) {
    return <p className={styles.fileName}>Loading file…</p>;
  }
  if (error) {
    return (
      <p className={styles.unsupportedPreview}>
        This file could not be loaded. Use Open file or Download.
      </p>
    );
  }

  const ext = String(url).split(".").pop().split("?")[0].toLowerCase();
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

function SubmissionFile({ url }) {
  // Reported rather than swallowed: the realistic failure here is a blocked
  // pop-up, and without this the click looks like it did nothing at all.
  const { notify } = useNotification() || {};
  if (!url) return null;

  return (
    <div className={styles.submissionFilePreview}>
      <span className={styles.submissionLabel}>Submitted file</span>
      <p className={styles.fileName}>{getSubmissionFileName(url)}</p>
      <div className={styles.fileActions}>
        <button type="button" onClick={() =>
          openSubmissionFile(url).catch((err) => notify?.(err.message, "error"))
        }>
          Open file
        </button>
        <button type="button" onClick={() => downloadAuthenticatedFile(url)}>
          Download
        </button>
      </div>
      <SubmissionPreview url={url} />
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
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [hasAttemptLimit, setHasAttemptLimit] = useState(false);
  const [attemptLimit, setAttemptLimit] = useState("1");
  const [activeTab, setActiveTab] = useState("assign");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editedInstructions, setEditedInstructions] = useState("");
  const [editedAttachmentFile, setEditedAttachmentFile] = useState(null);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const fileInputRef = useRef(null);

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
    const attachmentNote = attachmentFile ? ` with the attached file "${attachmentFile.name}"` : "";
    setConfirmAction({
      type: "create-assignment",
      title: `Give assignment to ${selectedStudentName}?`,
      message: `Are you sure you want to post this assignment for ${selectedStudentName}${attachmentNote}?`,
      confirmLabel: "Post Assignment"
    });
  };

  const createAssignment = async () => {
    try {
      // Sent as multipart rather than JSON so the worksheet rides along with the
      // assignment in one request. Content-Type is left to fetch, which has to
      // supply the multipart boundary itself - setting it by hand produces a
      // body the server cannot parse.
      const formData = new FormData();
      formData.append("teacherId", currentTeacherId);
      formData.append("studentId", selectedStudent.id);
      formData.append("courseId", selectedStudent.courseId ?? "");
      formData.append("title", `Task for ${selectedStudent.name}`);
      formData.append("instructions", instructions);
      formData.append("due", due);
      formData.append("attemptLimit", hasAttemptLimit ? Number(attemptLimit) : "");
      if (attachmentFile) {
        formData.append("file", attachmentFile, attachmentFile.name);
      }

      const res = await apiFetch(`${API}/api/assignments`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        // data.error is the server-side cause, attached outside production. It
        // is preferred over data.message so the toast names the real problem -
        // a missing column, a bad multipart body - rather than a generic string
        // that sends you to the Railway log to find out what actually broke.
        throw new Error(data.error || data.message || "Could not create assignment");
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
      setAttachmentFile(null);
      // Cleared directly rather than via a controlled input: the element is
      // uncontrolled, so React will not reset the visible file name on its own.
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Create assignment error:", err);
      notify?.(err.message || "Could not create assignment.", "error");
    }
  };

  const requestArchiveAssignment = (assignment) => {
    const isArchived = Number(assignment.isArchived) === 1;
    setConfirmAction({
      type: isArchived ? "unarchive-assignment" : "archive-assignment",
      assignment,
      title: isArchived ? "Restore this assignment?" : "Archive this assignment?",
      message: isArchived
        ? `"${assignment.name || "Assignment"}" will be visible to the student again. Existing submissions will be kept.`
        : `"${assignment.name || "Assignment"}" will be hidden from the student. Existing submissions will be kept, and you can restore it later.`,
      confirmLabel: isArchived ? "Restore" : "Archive",
    });
  };

  const updateAssignment = async (assignment, changes, file = null) => {
    try {
      const body = file ? new FormData() : JSON.stringify(changes);
      if (file) {
        Object.entries(changes).forEach(([key, value]) => body.append(key, String(value)));
        body.append("file", file, file.name);
      }

      const res = await apiFetch(`${API}/api/assignments/${assignment.id}`, {
        method: "PATCH",
        ...(file ? {} : { headers: { "Content-Type": "application/json" } }),
        body,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not update the assignment");
      }

      const updatedAssignment = data.assignment;
      setTeacherAssignments((prev) =>
        prev.map((item) =>
          String(item.id ?? item.assignmentId) === String(assignment.id)
            ? { ...item, ...updatedAssignment }
            : item
        )
      );
      setSubmissions((prev) =>
        prev.map((item) =>
          String(item.assignmentId) === String(assignment.id) &&
          changes.instructions !== undefined
            ? { ...item, assignmentInstructions: changes.instructions }
            : item
        )
      );
      notify?.(data.message || "Assignment updated.", "success");
      return updatedAssignment;
    } catch (err) {
      console.error("Update assignment error:", err);
      notify?.(err.message || "Could not update the assignment.", "error");
      return null;
    }
  };

  const saveAssignmentInstructions = async () => {
    if (!editingAssignment || !editedInstructions.trim()) {
      notify?.("Instructions cannot be empty.", "warning");
      return;
    }

    setIsSavingInstructions(true);
    const updated = await updateAssignment(editingAssignment, {
      instructions: editedInstructions.trim(),
    }, editedAttachmentFile);
    setIsSavingInstructions(false);
    if (updated) {
      setEditingAssignment(null);
      setEditedInstructions("");
      setEditedAttachmentFile(null);
    }
  };

  const performConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "create-assignment") {
      await createAssignment();
    } else if (
      confirmAction.type === "archive-assignment" ||
      confirmAction.type === "unarchive-assignment"
    ) {
      await updateAssignment(confirmAction.assignment, {
        isArchived: confirmAction.type === "archive-assignment",
      });
    }
    closeConfirmAction();
  };

  useEffect(() => {
    if (!currentTeacherId) return;

    let ignore = false;
    setIsLoading(true);

    Promise.all([
      apiFetch(`${API}/api/teacher/${currentTeacherId}/students`).then((res) => res.json()),
      apiFetch(`${API}/api/teacher/${currentTeacherId}/assignments`).then((res) => res.json()),
      apiFetch(`${API}/api/teacher/${currentTeacherId}/submissions`).then((res) => res.json()),
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

  // Newest first, so a mistake made moments ago is the first thing seen.
  const postedAssignments = useMemo(
    () =>
      [...teacherAssignments].sort(
        (a, b) => new Date(String(b.postedAt || 0).replace(" ", "T")) - new Date(String(a.postedAt || 0).replace(" ", "T"))
      ),
    [teacherAssignments]
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
                    <AuthenticatedImage
                      src={student.profileImageUrl || student.profile_image_url || student.profile_picture}
                      alt={student.name}
                      className={styles.studentAvatar}
                      fallback={<img src={userPic} alt={student.name} className={styles.studentAvatar} />}
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
                  <AuthenticatedImage
                    src={
                      selectedStudent?.profileImageUrl ||
                      selectedStudent?.profile_image_url ||
                      selectedStudent?.profile_picture
                    }
                    alt={selected || "Selected student"}
                    fallback={<img src={userPic} alt={selected || "Selected student"} />}
                  />
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
                      <div className={styles.Attachment}>
                        <label htmlFor="attachment" className={styles.label}>
                          <b>Attach a file (optional):</b>
                        </label>
                        <input
                          id="attachment"
                          ref={fileInputRef}
                          type="file"
                          className={styles.fileInput}
                          onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                        />
                        {attachmentFile ? (
                          <p className={styles.fileInfo}>
                            Attached: {attachmentFile.name}
                          </p>
                        ) : null}
                      </div>
                      <button type="button" className={styles.submitComment} onClick={onSubmit}>
                        Create Assignment
                      </button>
                    </div>
                  </div>
                </div>
                <div className={styles.postedPanel}>
                  <h2>Manage assignments</h2>
                  <div className={styles.postedList}>
                    {postedAssignments.length === 0 ? (
                      <div className={styles.emptyState}>
                        {isLoading ? "Loading assignments..." : "You have not posted any assignments yet."}
                      </div>
                    ) : (
                      postedAssignments.map((assignment) => {
                        const isArchived = Number(assignment.isArchived) === 1;
                        return (
                          <div
                            key={assignment.id}
                            className={`${styles.postedRow} ${isArchived ? styles.postedRowArchived : ""}`}
                          >
                            <div className={styles.postedRowText}>
                              <strong>{assignment.name || "Assignment"}</strong>
                              <p className={styles.postedMeta}>
                                {assignment.student || "Student"}
                                {assignment.subject ? ` · ${assignment.subject}` : ""}
                                {assignment.postedAt ? ` · ${formatSubmittedAt(assignment.postedAt)}` : ""}
                              </p>
                              {isArchived ? (
                                <span className={styles.archivedBadge}>Archived</span>
                              ) : null}
                              <p className={styles.postedInstructions}>
                                {assignment.instructions || "No instructions provided."}
                              </p>
                              {assignment.attachmentName ? (
                                <p className={styles.fileInfo}>
                                  <i className="bi bi-paperclip" aria-hidden="true" />{" "}
                                  {assignment.attachmentName}
                                </p>
                              ) : null}
                            </div>
                            <div className={styles.postedActions}>
                              <button
                                type="button"
                                className={styles.editBtn}
                                onClick={() => {
                                  setEditingAssignment(assignment);
                                  setEditedInstructions(assignment.instructions || "");
                                  setEditedAttachmentFile(null);
                                }}
                              >
                                Edit instructions
                              </button>
                              <button
                                type="button"
                                className={isArchived ? styles.restoreBtn : styles.archiveBtn}
                                onClick={() => requestArchiveAssignment(assignment)}
                              >
                                {isArchived ? "Unarchive" : "Archive"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            ) : activeTab === "submissions" ? (
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
                                  {<SubmissionFile url={item.fileUrl} />}
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
            ) : null}
          </div>
        </div>
      </div>
      {confirmAction && (
        <ModalPortal>
          <div className={styles.modalBackdrop} onClick={closeConfirmAction}>
            <section className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
              <h2>{confirmAction.title}</h2>
              <p className={styles.confirmBody}>{confirmAction.message}</p>
              <div className={styles.confirmActions}>
                <button type="button" className={styles.textBtn} onClick={closeConfirmAction}>
                  Cancel
                </button>
                <button type="button" className={styles.primaryBtn} onClick={performConfirmAction}>
                  {confirmAction.confirmLabel}
                </button>
              </div>
            </section>
          </div>
        </ModalPortal>
      )}
      {editingAssignment && (
        <ModalPortal>
          <div
            className={styles.modalBackdrop}
            onClick={() => {
              if (!isSavingInstructions) {
                setEditingAssignment(null);
                setEditedInstructions("");
                setEditedAttachmentFile(null);
              }
            }}
          >
            <section className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
              <h2>Edit assignment instructions</h2>
              <label className={styles.label} htmlFor="editAssignmentInstructions">
                Instructions for {editingAssignment.student || "student"}
              </label>
              <textarea
                id="editAssignmentInstructions"
                className={styles.commentBox}
                value={editedInstructions}
                onChange={(event) => setEditedInstructions(event.target.value)}
                autoFocus
              />
              <div className={styles.Attachment}>
                <label className={styles.label} htmlFor="editAssignmentAttachment">
                  Add or replace attachment (optional)
                </label>
                {editedAttachmentFile ? (
                  <p className={styles.fileInfo}>Selected: {editedAttachmentFile.name}</p>
                ) : editingAssignment.attachmentName ? (
                  <p className={styles.fileInfo}>
                    Current attachment: {editingAssignment.attachmentName}
                  </p>
                ) : null}
                <input
                  id="editAssignmentAttachment"
                  type="file"
                  className={styles.fileInput}
                  onChange={(event) =>
                    setEditedAttachmentFile(event.target.files?.[0] ?? null)
                  }
                  disabled={isSavingInstructions}
                />
              </div>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.textBtn}
                  onClick={() => {
                    setEditingAssignment(null);
                    setEditedInstructions("");
                    setEditedAttachmentFile(null);
                  }}
                  disabled={isSavingInstructions}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={saveAssignmentInstructions}
                  disabled={isSavingInstructions || !editedInstructions.trim()}
                >
                  {isSavingInstructions ? "Saving..." : "Save instructions"}
                </button>
              </div>
            </section>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

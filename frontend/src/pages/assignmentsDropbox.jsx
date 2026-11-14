// src/pages/AssignmentDetail.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "../assets/assignmentsDropbox.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { apiFetch } from "../utils/apiAuth.js";
import {
  getSubmissionFilePreviewUrl,
  openAssignmentFile,
  openSubmissionFile,
} from "../utils/authenticatedFile.js";
import { compressFileIfImage } from "../utils/imageCompression.js";
import ModalPortal from "../utils/ModalPortal.jsx";
import {
  ASSIGNMENT_UPLOAD_ACCEPT,
  ASSIGNMENT_UPLOAD_TYPE_LABEL,
  getAssignmentUploadError,
  MAX_ASSIGNMENT_FILES,
  MAX_ASSIGNMENT_FILE_BYTES,
  MAX_ASSIGNMENT_TOTAL_BYTES,
} from "../utils/assignmentUploadLimits.js";

const API = API_BASE_URL;

function normalizeFileUrl(url) {
  if (!url) return "";
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/uploads/")) return `${API}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API}/${cleaned}`;
  return cleaned;
}

function getFileName(url) {
  if (!url) return "Submitted file";
  return decodeURIComponent(String(url).split("/").pop() || "Submitted file");
}

const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "ogv", "mov", "m4v"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "oga"];

function getFileExtension(url) {
  const clean = String(url || "").split("?")[0].split("#")[0];
  return clean.includes(".") ? clean.split(".").pop().toLowerCase() : "";
}

function SubmissionPreview({ fileUrl, fileName: providedFileName, storedPath }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const ext = getFileExtension(fileUrl);
  const fileName = providedFileName || getFileName(fileUrl);

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);

    getSubmissionFilePreviewUrl(storedPath ?? fileUrl)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch((error) => {
        if (!cancelled) setPreviewError(error);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileUrl, storedPath]);

  if (previewLoading) return <p className={styles.fileInfo}>Loading file…</p>;
  if (previewError) return <p className={styles.fileInfo}>This file could not be loaded.</p>;

  if (VIDEO_EXTENSIONS.includes(ext)) {
    return (
      <video className={styles.previewMedia} controls preload="metadata" src={previewUrl}>
        Your browser cannot play this video.
        <button
          type="button"
          onClick={() => openSubmissionFile(storedPath ?? fileUrl).catch(() => {})}
        >
          Open it instead
        </button>
        .
      </video>
    );
  }

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return (
      <img className={styles.previewImage} src={previewUrl} alt={fileName} loading="lazy" />
    );
  }

  if (AUDIO_EXTENSIONS.includes(ext)) {
    return <audio className={styles.previewMedia} controls preload="metadata" src={previewUrl} />;
  }

  if (ext === "pdf") {
    return (
      <iframe className={styles.previewFrame} src={previewUrl} title={`${fileName} preview`} />
    );
  }

  return (
    <p className={styles.previewUnsupported}>No preview for this kind of file.</p>
  );
}

function getCurrentUser() {
  return readStoredUser() || {};
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
        hour12: dueTime ? true : undefined,
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

function AssignmentAttachment({ url, name, onError }) {
  if (!url) return null;

  const label = name || getFileName(url);

  return (
    <button
      type="button"
      className={styles.cardAttachment}
      onClick={() => openAssignmentFile(url).catch(onError)}
      title={`Open ${label} in a new tab`}
    >
      <span className={styles.cardAttachmentIcon} aria-hidden="true">📎</span>
      {label}
    </button>
  );
}

function getAttemptLimit(assignment) {
  const limit = Number(assignment?.attemptLimit);
  return Number.isInteger(limit) && limit > 0 ? limit : null;
}

function getAssignmentFiles(assignment) {
  if (Array.isArray(assignment?.attachmentFiles) && assignment.attachmentFiles.length) {
    return assignment.attachmentFiles;
  }
  return assignment?.attachmentUrl
    ? [{ url: assignment.attachmentUrl, name: assignment.attachmentName }]
    : [];
}

function getSubmissionFiles(submission) {
  const files = submission?.submissionFiles ?? submission?.files;
  if (Array.isArray(files) && files.length) return files;
  const fileUrl = submission?.fileUrl ?? submission?.file_url;
  return fileUrl
    ? [{
        url: fileUrl,
        name: submission.fileName ?? submission.file_name ?? getFileName(fileUrl),
      }]
    : [];
}

function SelectedFileList({ files, onRemove }) {
  return (
    <ul className={styles.selectedFileList}>
      {files.map((file, index) => (
        <li
          className={styles.selectedFileItem}
          key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
        >
          <span className={styles.selectedFileName}>{file.name}</span>
          <button
            type="button"
            className={styles.removeSelectedFileButton}
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(index)}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatSubmissionDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

export default function AssignmentsDropbox() {
  const { notify } = useNotification() || {};
  const [comment, setComment] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileUploadError, setFileUploadError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingSubmission, setIsEditingSubmission] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [submissionHistory, setSubmissionHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("instructions");
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const assignmentId = searchParams.get("assignmentId");

  const handleBack = () => {
    const historyIndex = typeof window !== "undefined" ? window.history.state?.idx : 0;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
    } else {
      navigate("/assignments");
    }
  };

  const currentUser = useMemo(getCurrentUser, []);
  const currentStudentId = currentUser.id ?? currentUser.user_id ?? null;

  // Derived from selectedAssignment; must be declared before the useEffect hooks
  // that reference it in their dependency arrays.
  const attemptLimit = getAttemptLimit(selectedAssignment);
  const attemptsUsed = getAttemptsUsed(selectedAssignment);
  const isAttemptLimitReached = attemptLimit !== null && attemptsUsed >= attemptLimit;

  const hasExistingSubmission = Boolean(selectedAssignment?.submissionId);
  const canResubmit = hasExistingSubmission && !isAttemptLimitReached;

  useEffect(() => {
    if (!assignmentId) return;

    let ignore = false;
    setIsLoading(true);
    setSubmitMessage("");
    setIsEditingSubmission(false);
    setComment("");
    setSelectedFiles([]);
    setFileUploadError("");

    apiFetch(`${API}/api/assignments/${assignmentId}`)
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

  const submittedAnswer = selectedAssignment?.comments || "";
  const submittedFiles = getSubmissionFiles(selectedAssignment).map((file) => ({
    ...file,
    url: normalizeFileUrl(file.url),
  }));
  const assignmentFiles = getAssignmentFiles(selectedAssignment);
  const canSubmit = !isAttemptLimitReached && !isAssignmentPastDue();
  const submitButtonLabel = canResubmit ? "Submit Again" : "Submit";

  const startEditingSubmission = () => {
    setComment(submittedAnswer);
    setSelectedFiles([]);
    setFileUploadError("");
    setSubmitMessage("");
    setIsEditingSubmission(true);
  };

  const cancelEditingSubmission = () => {
    setComment("");
    setSelectedFiles([]);
    setFileUploadError("");
    setSubmitMessage("");
    setIsEditingSubmission(false);
  };

  const addSelectedFiles = (files) => {
    const nextFiles = [...selectedFiles, ...files];
    setSelectedFiles(nextFiles);
    setFileUploadError(getAssignmentUploadError(nextFiles));
    setSubmitMessage("");
  };

  const removeSelectedFile = (indexToRemove) => {
    const nextFiles = selectedFiles.filter((_, index) => index !== indexToRemove);
    setSelectedFiles(nextFiles);
    setFileUploadError(getAssignmentUploadError(nextFiles));
    setSubmitMessage("");
  };

  const openSubmissionHistory = async () => {
    setIsHistoryOpen(true);
    setIsLoadingHistory(true);
    setHistoryError("");

    try {
      const res = await apiFetch(`${API}/api/assignments/${selectedAssignment.id}/submission-history`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not load submission history.");
      }
      const previousSubmissions = Array.isArray(data.history) ? data.history : [];
      const currentSubmission = selectedAssignment?.submissionId
        ? [{
            history_id: "current-submission",
            isCurrent: true,
            submission_text: selectedAssignment.comments,
            file_url: selectedAssignment.fileUrl,
            file_name: selectedAssignment.fileName,
            files: selectedAssignment.submissionFiles,
            submitted_at: selectedAssignment.submittedAt,
          }]
        : [];
      setSubmissionHistory([...currentSubmission, ...previousSubmissions]);
    } catch (err) {
      console.error("Load assignment submission history error:", err);
      setHistoryError(err.message || "Could not load submission history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const saveSubmissionEdit = async () => {
    if (!selectedAssignment || (!comment.trim() && !selectedFiles.length && !submittedFiles.length)) {
      setSubmitMessage("Please write an answer or attach a file before saving.");
      return;
    }

    const uploadError = getAssignmentUploadError(selectedFiles);
    if (uploadError) {
      setFileUploadError(uploadError);
      return;
    }

    if (isAssignmentPastDue()) {
      setSubmitMessage("This assignment is past due and can no longer be edited.");
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append("submissionText", comment.trim());
      for (const file of selectedFiles) {
        const uploadFile = await compressFileIfImage(file, {
          outputType: file.type === "image/png" ? "image/png" : "image/jpeg",
        });
        formData.append("files", uploadFile, uploadFile.name);
      }

      const res = await apiFetch(`${API}/api/assignments/${selectedAssignment.id}/submission`, {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not update submission");
      }

      const submission = data.submission || {};
      setSelectedAssignment((prev) => ({
        ...prev,
        comments: submission.comments ?? "",
        fileUrl: submission.fileUrl ?? prev.fileUrl,
        fileName: submission.fileName ?? prev.fileName,
        submissionFiles: submission.submissionFiles ?? prev.submissionFiles,
        submittedAt: submission.submittedAt ?? prev.submittedAt,
      }));
      setIsEditingSubmission(false);
      setSelectedFiles([]);
      setFileUploadError("");
      setSubmitMessage("");
      notify?.("Submission updated!", "success");
    } catch (err) {
      console.error("Edit assignment submission error:", err);
      setSubmitMessage(err.message || "Could not update submission.");
      notify?.(err.message || "Could not update submission.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitComment = async () => {
    if (!selectedAssignment) {
      setSubmitMessage("Please open an assignment before submitting.");
      return;
    }

    if (!currentStudentId) {
      setSubmitMessage("Please log in before submitting.");
      return;
    }

    if (isAssignmentPastDue()) {
      setSubmitMessage("This assignment is past due and can no longer be submitted.");
      return;
    }

    if (isAttemptLimitReached) {
      setSubmitMessage("You have used all your tries. You can no longer submit this assignment.");
      return;
    }

    if (!comment.trim() && !selectedFiles.length) {
      setSubmitMessage("Please write an answer or attach a file before submitting.");
      return;
    }

    const uploadError = getAssignmentUploadError(selectedFiles);
    if (uploadError) {
      setFileUploadError(uploadError);
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append("studentId", currentStudentId);
      if (comment.trim()) {
        formData.append("submissionText", comment.trim());
      }
      for (const file of selectedFiles) {
        const uploadFile = await compressFileIfImage(file, {
          outputType: file.type === "image/png" ? "image/png" : "image/jpeg",
        });
        formData.append("files", uploadFile, uploadFile.name);
      }

      const res = await apiFetch(`${API}/api/assignments/${selectedAssignment.id}/submissions`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not submit assignment");
      }

      const submission = data.submission || {};
      setSelectedAssignment((prev) => ({
        ...prev,
        submissionId: submission.submissionId ?? submission.id ?? prev.submissionId,
        comments: submission.comments ?? "",
        fileUrl: submission.fileUrl ?? null,
        fileName: submission.fileName ?? null,
        submissionFiles: submission.submissionFiles ?? [],
        submittedAt: submission.submittedAt ?? prev.submittedAt,
        attemptsUsed: Number(submission.attemptsUsed ?? submission.attemptCount ?? prev.attemptsUsed ?? 1),
        attemptCount: Number(submission.attemptCount ?? submission.attemptsUsed ?? prev.attemptCount ?? 1),
      }));
      notify?.("Assignment submitted!", "success");
      setComment("");
      setSelectedFiles([]);
      setFileUploadError("");
    } catch (err) {
      console.error("Submit assignment error:", err);
      setSubmitMessage(err.message || "Could not submit assignment.");
      notify?.(err.message || "Could not submit assignment.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestSubmitAssignment = () => {
    if (!selectedAssignment) {
      setSubmitMessage("Please open an assignment before submitting.");
      return;
    }

    if (!currentStudentId) {
      setSubmitMessage("Please log in before submitting.");
      return;
    }

    if (isAssignmentPastDue()) {
      setSubmitMessage("This assignment is past due and can no longer be submitted.");
      return;
    }

    if (isAttemptLimitReached) {
      setSubmitMessage("You have used all your tries. You can no longer submit this assignment.");
      return;
    }

    if (!comment.trim() && !selectedFiles.length) {
      setSubmitMessage("Please write an answer or attach a file before submitting.");
      return;
    }

    const uploadError = getAssignmentUploadError(selectedFiles);
    if (uploadError) {
      setFileUploadError(uploadError);
      return;
    }

    setSubmitMessage("");
    setShowSubmitConfirmation(true);
  };

  const confirmSubmitAssignment = () => {
    setShowSubmitConfirmation(false);
    onSubmitComment();
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        <button type="button" className={styles.backButton} onClick={handleBack}>
          <span className={styles.backArrow} aria-hidden="true">&#9664;</span>
          Back
        </button>

        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === "instructions" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("instructions")}
          >
            Instructions
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === "submissions" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("submissions")}
          >
            Submissions
          </button>
        </div>

        {selectedAssignment && isAssignmentPastDue() ? (
          <div className={styles.alertCard}>
            <span className={styles.alertIcon} aria-hidden="true">⏰</span>
            This assignment is past due and cannot be submitted.
          </div>
        ) : selectedAssignment && isAttemptLimitReached ? (
          <div className={styles.alertCard}>
            <span className={styles.alertIcon} aria-hidden="true">🚫</span>
            You have used all your tries for this assignment.
          </div>
        ) : null}

        <div className={styles.contentWrapper}>
          {activeTab === "instructions" ? (
            <div className={styles.instructionsPanel}>
              {selectedAssignment ? (
                <>
                  <div className={styles.instructionSheet}>
                    <span className={styles.instructionIcon} aria-hidden="true">📝</span>
                    <h2 className={styles.instructionHead}>Assignment Instructions</h2>
                    <div className={styles.instructionText}>
                      {assignmentInstructions || "No instructions were provided for this assignment."}
                    </div>
                    <div className={styles.attemptInfo}>
                      <span className={styles.attemptInfoLabel}>Attempts allowed</span>
                      <strong>
                        {attemptLimit === null
                          ? "Unlimited"
                          : `${attemptLimit} ${attemptLimit === 1 ? "attempt" : "attempts"}`}
                      </strong>
                      {attemptLimit !== null ? (
                        <span className={styles.attemptInfoUsed}>
                          Used: {attemptsUsed} of {attemptLimit}
                        </span>
                      ) : null}
                    </div>
                    {assignmentFiles.map((file) => (
                      <AssignmentAttachment
                        key={file.id ?? file.url}
                        url={file.url}
                        name={file.name}
                        onError={() => notify?.("That file could not be opened. Please try again.", "error")}
                      />
                    ))}
                  </div>

                  {canSubmit ? (
                    <div className={styles.responsePanel}>
                      <h2 className={styles.responseHead}>
                        {hasExistingSubmission ? "Resubmit your answer" : "Submit your answer"}
                      </h2>
                      <textarea
                        className={styles.commentBox}
                        placeholder="Write your answer"
                        value={comment}
                        onChange={(e) => {
                          setComment(e.target.value);
                          setSubmitMessage("");
                        }}
                      />
                      <label className={styles.fileLabel}>
                        <span className={styles.fileIcon} aria-hidden="true">📎</span>
                        Attach files
                      </label>
                      <input
                        type="file"
                        multiple
                        accept={ASSIGNMENT_UPLOAD_ACCEPT}
                        className={styles.fileInput}
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          if (files.length) addSelectedFiles(files);
                          event.target.value = "";
                        }}
                      />
                      <p className={styles.fileInfo}>
                        Up to {MAX_ASSIGNMENT_FILES} files, {MAX_ASSIGNMENT_FILE_BYTES / (1024 * 1024)} MiB each, {MAX_ASSIGNMENT_TOTAL_BYTES / (1024 * 1024)} MiB total.
                      </p>
                      <p className={styles.fileInfo}>{ASSIGNMENT_UPLOAD_TYPE_LABEL}</p>
                      {selectedFiles.length ? (
                        <SelectedFileList files={selectedFiles} onRemove={removeSelectedFile} />
                      ) : null}
                      {fileUploadError ? <p className={styles.submitMessage}>{fileUploadError}</p> : null}
                      <div className={styles.editorActions}>
                        <button
                          type="button"
                          className={styles.submitComment}
                          onClick={requestSubmitAssignment}
                          disabled={!selectedAssignment || isAssignmentPastDue() || isAttemptLimitReached || isSubmitting}
                        >
                          {isSubmitting ? "Submitting..." : submitButtonLabel}
                        </button>
                      </div>
                      {submitMessage ? (
                        <p className={styles.submitMessage}>{submitMessage}</p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p>{submitMessage || "Please open your assignment from the list."}</p>
              )}
            </div>
          ) : (
            <div className={styles.submissionPanel}>
              {hasExistingSubmission ? (
                <div className={styles.submissionCard}>
                  <h2 className={styles.submissionHead}>Your submission</h2>
                  <div className={styles.submissionActions}>
                    {!isEditingSubmission ? (
                      <button
                        type="button"
                        className={styles.editSubmissionButton}
                        onClick={startEditingSubmission}
                        disabled={isAssignmentPastDue()}
                      >
                        Edit submission
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={styles.editSubmissionButton}
                      onClick={openSubmissionHistory}
                    >
                      Submission history
                    </button>
                  </div>
                  {isEditingSubmission ? (
                    <div className={styles.editSubmissionForm}>
                      <label className={styles.editSubmissionLabel} htmlFor="edit-submission-text">
                        Update your answer
                      </label>
                      <textarea
                        id="edit-submission-text"
                        className={styles.commentBox}
                        placeholder="Write your answer"
                        value={comment}
                        onChange={(event) => {
                          setComment(event.target.value);
                          setSubmitMessage("");
                        }}
                      />
                      {submittedFiles.length ? (
                        <p className={styles.editSubmissionFileNote}>
                          Current attachments: {submittedFiles.map((file) => file.name || getFileName(file.url)).join(", ")}
                          {selectedFiles.length
                            ? ` · Replacement selected: ${selectedFiles.map((file) => file.name).join(", ")}`
                            : ""}
                        </p>
                      ) : null}
                      <label className={styles.fileLabel}>
                        <span className={styles.fileIcon} aria-hidden="true">📎</span>
                        {submittedFiles.length
                          ? "Replace attached files (optional; leave blank to keep current files)"
                          : "Attach files"}
                      </label>
                      <input
                        type="file"
                        multiple
                        accept={ASSIGNMENT_UPLOAD_ACCEPT}
                        className={styles.fileInput}
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          if (files.length) addSelectedFiles(files);
                          event.target.value = "";
                        }}
                      />
                      <p className={styles.fileInfo}>
                        Selected files are added to the replacement set; up to {MAX_ASSIGNMENT_FILES} files, {MAX_ASSIGNMENT_FILE_BYTES / (1024 * 1024)} MiB each, {MAX_ASSIGNMENT_TOTAL_BYTES / (1024 * 1024)} MiB total.
                      </p>
                      <p className={styles.fileInfo}>{ASSIGNMENT_UPLOAD_TYPE_LABEL}</p>
                      {selectedFiles.length ? (
                        <SelectedFileList files={selectedFiles} onRemove={removeSelectedFile} />
                      ) : null}
                      {fileUploadError ? (
                        <p className={styles.submitMessage} role="alert">{fileUploadError}</p>
                      ) : null}
                      <div className={styles.editorActions}>
                        <button
                          type="button"
                          className={styles.submitComment}
                          onClick={saveSubmissionEdit}
                          disabled={isSubmitting || isAssignmentPastDue()}
                        >
                          {isSubmitting ? "Saving..." : "Save changes"}
                        </button>
                        <button
                          type="button"
                          className={styles.cancelEditButton}
                          onClick={cancelEditingSubmission}
                          disabled={isSubmitting}
                        >
                          Cancel
                        </button>
                      </div>
                      {submitMessage ? (
                        <p className={styles.submitMessage} role="alert">{submitMessage}</p>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      {isAssignmentPastDue() ? (
                        <p className={styles.editSubmissionNote}>
                          Submissions can no longer be edited after the due date.
                        </p>
                      ) : null}
                    </>
                  )}
                  {!isEditingSubmission && submittedAnswer ? (
                    <div className={styles.submissionAnswerBlock}>
                      <p className={styles.submissionAnswerText}>{submittedAnswer}</p>
                    </div>
                  ) : null}
                  {!isEditingSubmission && submittedFiles.length ? (
                    <div className={styles.submittedFileInfo}>
                      <span className={styles.submittedFileLabel}>SUBMITTED FILES</span>
                      {submittedFiles.map((file) => (
                        <div className={styles.submissionFileItem} key={file.id ?? file.url}>
                          <p className={styles.submissionFileName}>
                            {file.name || getFileName(file.url)}
                          </p>
                          <div className={styles.submissionFileActions}>
                            <button
                              type="button"
                              className={styles.submissionFileButton}
                              onClick={() =>
                                openSubmissionFile(file.url).catch(() =>
                                  notify?.("That file could not be opened. Please try again.", "error")
                                )
                              }
                            >
                              Open file
                            </button>
                          </div>
                          <SubmissionPreview fileUrl={file.url} fileName={file.name} />
                        </div>
                      ))}
                    </div>
                  ) : null}

                </div>
              ) : (
                <div className={styles.emptySubmission}>
                  <span className={styles.emptyIcon} aria-hidden="true">📭</span>
                  <p className={styles.emptyText}>No submission yet.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showSubmitConfirmation ? (
        <ModalPortal>
          <div
            className={styles.submitConfirmBackdrop}
            onClick={() => setShowSubmitConfirmation(false)}
          >
            <section
              className={styles.submitConfirmModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="submitConfirmTitle"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="submitConfirmTitle">
                {canResubmit ? "Confirm resubmission" : "Confirm submission"}
              </h2>
              <p>
                {canResubmit
                  ? "Are you sure you want to submit this assignment again? This will use another attempt."
                  : "Are you sure you want to submit this assignment?"}
              </p>
              <div className={styles.submitConfirmActions}>
                <button
                  type="button"
                  className={styles.submitConfirmCancel}
                  onClick={() => setShowSubmitConfirmation(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.submitConfirmButton}
                  onClick={confirmSubmitAssignment}
                >
                  Confirm submission
                </button>
              </div>
            </section>
          </div>
        </ModalPortal>
      ) : null}
      {isHistoryOpen ? (
        <ModalPortal>
          <div
            className={styles.submitConfirmBackdrop}
            onClick={() => setIsHistoryOpen(false)}
          >
            <section
              className={styles.historyModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="submissionHistoryTitle"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.historyHeader}>
                <h2 id="submissionHistoryTitle">Submission history</h2>
                <button
                  type="button"
                  className={styles.cancelEditButton}
                  onClick={() => setIsHistoryOpen(false)}
                  aria-label="Close submission history"
                >
                  Close
                </button>
              </div>
              {isLoadingHistory ? (
                <p className={styles.historyMessage}>Loading submission history…</p>
              ) : historyError ? (
                <p className={styles.historyError} role="alert">{historyError}</p>
              ) : submissionHistory.length === 0 ? (
                <p className={styles.historyMessage}>There are no past submissions yet.</p>
              ) : (
                <div className={styles.historyList}>
                  {submissionHistory.map((submission, index) => (
                    <article
                      className={styles.historyEntry}
                      key={submission.isCurrent ? "current-submission" : submission.history_id}
                    >
                      <h3>
                        {submission.isCurrent
                          ? "Current submission"
                          : `Previous submission ${submissionHistory.length - index}`}
                      </h3>
                      <p className={styles.historyDate}>
                        Submitted {formatSubmissionDate(submission.submitted_at)}
                      </p>
                      {submission.submission_text ? (
                        <div className={styles.submissionAnswerBlock}>
                          <p className={styles.submissionAnswerText}>{submission.submission_text}</p>
                        </div>
                      ) : null}
                      {getSubmissionFiles(submission).map((file) => (
                        <button
                          type="button"
                          className={styles.submissionFileButton}
                          key={file.id ?? file.url}
                          onClick={() =>
                            openSubmissionFile(file.url).catch(() =>
                              notify?.("That file could not be opened. Please try again.", "error")
                            )
                          }
                        >
                          Open {file.name || getFileName(file.url)}
                        </button>
                      ))}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

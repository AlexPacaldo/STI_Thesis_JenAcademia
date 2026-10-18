// src/pages/AssignmentDetail.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "../assets/assignmentsDropbox.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import { getStoredUserTimezone } from "../utils/timezone.js";
import { API_BASE_URL } from "../utils/api.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { apiFetch } from "../utils/apiAuth.js";
import {
  openAuthenticatedFile,
  useAuthenticatedFileUrl,
} from "../utils/authenticatedFile.js";
import { compressFileIfImage } from "../utils/imageCompression.js";

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

// Renders the submitted media inline instead of only offering a download link,
// so a student can review their own work without leaving the page.
function SubmissionPreview({ fileUrl, storedPath }) {
  // Fetched with the session token and handed over as a blob: URL: these are
  // <img>/<video>/<audio> sources, which cannot send an Authorization header.
  const { url: blobUrl, error, loading } = useAuthenticatedFileUrl(storedPath ?? fileUrl);
  const ext = getFileExtension(fileUrl);
  const fileName = getFileName(fileUrl);

  if (loading) return <p className={styles.fileInfo}>Loading file…</p>;
  if (error) {
    return <p className={styles.fileInfo}>This file could not be loaded.</p>;
  }

  if (VIDEO_EXTENSIONS.includes(ext)) {
    return (
      <video className={styles.previewMedia} controls preload="metadata" src={blobUrl}>
        Your browser cannot play this video.{" "}
        <button type="button" onClick={() => openAuthenticatedFile(storedPath ?? fileUrl)}>
          Open it instead
        </button>
        .
      </video>
    );
  }

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return (
      <img
        className={styles.previewImage}
        src={blobUrl}
        alt={fileName}
        loading="lazy"
      />
    );
  }

  if (AUDIO_EXTENSIONS.includes(ext)) {
    return <audio className={styles.previewMedia} controls preload="metadata" src={blobUrl} />;
  }

  if (ext === "pdf") {
    return (
      <iframe
        className={styles.previewFrame}
        src={fileUrl}
        title={`${fileName} preview`}
      />
    );
  }

  return (
    <p className={styles.previewUnsupported}>
      No inline preview available for this file type.
    </p>
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
        timeZone: getStoredUserTimezone(),
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

function formatPostedDate(assignment) {
  const postedAt = assignment?.postedAt || assignment?.createdAt || "";
  if (!postedAt) return "Not available";

  const normalized = String(postedAt).replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return String(postedAt);
  }

  return date.toLocaleString(undefined, {
    timeZone: getStoredUserTimezone(),
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatSubmissionDate(value) {
  if (!value) return "";
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    timeZone: getStoredUserTimezone(),
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getAttemptsUsed(assignment) {
  return Number(assignment?.attemptsUsed ?? assignment?.attemptCount ?? 0);
}

/**
 * The worksheet the teacher attached to the task, as a link that opens in a new
 * tab.
 *
 * Deliberately a button driving openAuthenticatedFile rather than an <a href>.
 * /uploads sits behind the session token, and a plain link cannot send the
 * Authorization header, so the raw href would come back 401. That helper fetches
 * the file with the header and hands the blob: URL to window.open instead.
 *
 * Opening in a new tab (rather than previewing inline) keeps the instructions
 * and the submit box on screen, which is where a student needs to stay while
 * working through the attached material.
 */
function AssignmentAttachment({ url, name, onError }) {
  if (!url) return null;

  const label = name || getFileName(url);

  return (
    <a
      href="#"
      className={styles.attachmentLink}
      onClick={(event) => {
        event.preventDefault();
        // Rejects when the file cannot be fetched, which a bare href would
        // surface as an unstyled error tab or a silent no-op behind a
        // pop-up blocker. Either way the student needs to know why nothing
        // happened.
        openAuthenticatedFile(url).catch(onError);
      }}
      title={`Open ${label} in a new tab`}
    >
      <i className="bi bi-paperclip" aria-hidden="true" />
      <span className={styles.attachmentLinkText}>
        <strong>{label}</strong>
        <span>Open in a new tab</span>
      </span>
      <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
    </a>
  );
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
  const [showSubmission, setShowSubmission] = useState(false);
  const [showResubmissionEditor, setShowResubmissionEditor] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const assignmentId = searchParams.get("assignmentId");

  const handleBack = () => {
    // Only pop the history stack when there is an in-app entry behind us.
    // On a direct link / refresh there is nothing to go back to, so fall back
    // to the assignments list instead of leaving the site.
    const historyIndex = typeof window !== "undefined" ? window.history.state?.idx : 0;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
    } else {
      navigate("/assignments");
    }
  };

  const currentUser = useMemo(getCurrentUser, []);
  const currentStudentId = currentUser.id ?? currentUser.user_id ?? null;

  useEffect(() => {
    if (!assignmentId) return;

    let ignore = false;
    setIsLoading(true);
    setSubmitMessage("");
    setShowSubmission(false);
    setShowResubmissionEditor(false);

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
        setComment(assignment.comments || "");
        if (assignment.submissionId) {
          const submittedAt = formatSubmissionDate(assignment.submittedAt);
          setSubmitMessage(submittedAt ? `Submitted on ${submittedAt}.` : "Submitted.");
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

  const submissionStatus = selectedAssignment?.submissionId ? "Submitted" : "Not submitted";
  const submittedAnswer = selectedAssignment?.comments || "";
  const submittedFileUrl = normalizeFileUrl(selectedAssignment?.fileUrl);
  const hasSubmissionContent = Boolean(selectedAssignment?.submissionId && (submittedAnswer || submittedFileUrl));
  // Guards against showSubmission staying true after the submission disappears,
  // which would otherwise hide the instructions behind a tab that no longer
  // exists.
  const isViewingSubmission = showSubmission && hasSubmissionContent;
  const hasExistingSubmission = Boolean(selectedAssignment?.submissionId);
  const canResubmit = hasExistingSubmission && !isAttemptLimitReached;
  const submitButtonLabel = canResubmit ? "Submit Again" : "Submit";
  const showResponseEditor = !hasExistingSubmission || showResubmissionEditor;

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
        const uploadFile = await compressFileIfImage(selectedFile);
        formData.append("file", uploadFile, uploadFile.name);
      }

      const res = await apiFetch(`${API}/api/assignments/${selectedAssignment.id}/submissions`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not submit assignment");
      }

      const submittedAt = formatSubmissionDate(data.submission?.submittedAt || new Date());
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
      setSubmitMessage(submittedAt ? `Submitted on ${submittedAt}.` : "Submitted.");
      setComment("");
      setSelectedFile(null);
    } catch (err) {
      console.error("Submit assignment error:", err);
      setSubmitMessage(err.message || "Could not submit assignment.");
      notify?.(err.message || "Could not submit assignment.", "error");
    }
  };

  const closeConfirmAction = () => setConfirmAction(null);

  const requestSubmitAssignment = () => {
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

    setConfirmAction({
      type: "submit-assignment",
      title: submitButtonLabel === "Submit Again" ? "Submit again?" : "Submit assignment?",
      message: `Are you sure you want to ${submitButtonLabel.toLowerCase()}?`,
      confirmLabel: submitButtonLabel,
    });
  };

  const performConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "submit-assignment") {
      await onSubmitComment();
    }
    closeConfirmAction();
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        <div className={styles.centerContent}>
          <button type="button" className={styles.backButton} onClick={handleBack}>
            <i className="bi bi-arrow-left" aria-hidden="true" />
            <span>Back to Assignments</span>
          </button>
          <h1><b>{selectedAssignment ? getAssignmentDisplayText(selectedAssignment) : (isLoading ? "Loading assignment..." : "Assignment")}</b></h1>
          {selectedAssignment ? (
            <p className={styles.assignmentMeta}>
              {selectedAssignment.subject || "General"} | {submissionStatus}
            </p>
          ) : null}
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

        <div className={styles.tabContainer} role="tablist" aria-label="Assignment views">
          <button
            type="button"
            role="tab"
            aria-selected={!isViewingSubmission}
            className={`${styles.tabButton} ${!isViewingSubmission ? styles.activeTab : ""}`}
            onClick={() => setShowSubmission(false)}
          >
            Instructions
          </button>
          {hasSubmissionContent ? (
            <button
              type="button"
              role="tab"
              aria-selected={isViewingSubmission}
              className={`${styles.tabButton} ${isViewingSubmission ? styles.activeTab : styles.submissionTab}`}
              onClick={() => setShowSubmission((current) => !current)}
            >
              {isViewingSubmission ? "Hide submission" : "View submission"}
            </button>
          ) : null}
        </div>

        <div className={styles.instructionContent}>
          <div className={styles.leftSide}>
            {selectedAssignment ? (
              <>
                {/* Shown ABOVE the instructions: this used to render below them,
                    so clicking "View submissions" appeared to do nothing until
                    you scrolled past the whole instruction sheet. */}
                {isViewingSubmission ? (
                  <section className={styles.submissionViewer}>
                    <div className={styles.submissionViewerHeader}>
                      <span>Submitted Work</span>
                      <strong>{selectedAssignment?.submittedAt ? `Submitted on ${formatSubmissionDate(selectedAssignment.submittedAt)}` : "Submitted"}</strong>
                    </div>
                    {submittedAnswer ? (
                      <div className={styles.submittedAnswer}>
                        <span>Answer</span>
                        <p>{submittedAnswer}</p>
                      </div>
                    ) : null}
                    {submittedFileUrl ? (
                      <div className={styles.submittedFile}>
                        <div className={styles.submittedFileHeader}>
                          <span>File</span>
                          <button
                            type="button"
                            className={styles.textBtn}
                            onClick={() => openAuthenticatedFile(selectedAssignment?.fileUrl)}
                            title={getFileName(submittedFileUrl)}
                          >
                            {getFileName(submittedFileUrl)}
                          </button>
                        </div>
                        <SubmissionPreview fileUrl={submittedFileUrl} storedPath={selectedAssignment?.fileUrl} />
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {/* Instructions are hidden while viewing the submission - the two
                    tabs now swap content instead of stacking it. */}
                {!isViewingSubmission ? (
                  <div className={styles.instructionsPanel}>
                    <section className={styles.instructionSheet}>
                      <div className={styles.instructionHeader}>
                        <span className={styles.instructionIcon}>i</span>
                        <div>
                          <span>Assignment Instructions</span>
                          <h4>Read before submitting</h4>
                        </div>
                      </div>
                      <div className={styles.instructionText}>
                        {assignmentInstructions || "No instructions were provided for this assignment."}
                      </div>
                      <AssignmentAttachment
                        url={selectedAssignment?.attachmentUrl}
                        name={selectedAssignment?.attachmentName}
                        onError={() =>
                          notify?.("That file could not be opened. Please try again.", "error")
                        }
                      />
                    </section>
                  </div>
                ) : null}

                {canResubmit && !showResubmissionEditor ? (
                  <button
                    type="button"
                    className={styles.resubmitButton}
                    onClick={() => setShowResubmissionEditor(true)}
                    disabled={!selectedAssignment || isAssignmentPastDue() || isAttemptLimitReached}
                  >
                    <i className="bi bi-arrow-repeat" aria-hidden="true" />
                    Submit Again
                  </button>
                ) : null}

                {showResponseEditor ? (
                  <div className={styles.responsePanel}>
                    <label htmlFor="studentComment" className={styles.responseLabel}>
                      <b>Your Answer:</b>
                    </label>
                    <textarea
                      id="studentComment"
                      className={styles.commentBox}
                      placeholder="Write your answer"
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
                        Current file:{" "}
                        <button
                          type="button"
                          className={styles.textBtn}
                          onClick={() => openAuthenticatedFile(selectedAssignment.fileUrl)}
                        >
                          {selectedAssignment.fileUrl.split("/").pop()}
                        </button>
                      </p>
                    ) : null}
                    <div className={styles.editorActions}>
                      {canResubmit ? (
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={() => {
                            setShowResubmissionEditor(false);
                            setSubmitMessage("");
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.submitComment}
                        onClick={requestSubmitAssignment}
                        disabled={!selectedAssignment || isAssignmentPastDue() || isAttemptLimitReached}
                      >
                        {submitButtonLabel}
                      </button>
                    </div>
                    {submitMessage ? (
                      <p className={styles.submitMessage} style={{ color: isAssignmentPastDue() || isAttemptLimitReached ? "#dc2626" : "#374151" }}>
                        {submitMessage}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p>
                {submitMessage || "No assignment is currently selected. Please return to the assignments list and open your assigned task."}
              </p>
            )}
          </div>

          <div className={styles.rightSide}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryHeader}>
                <span className={styles.statusPill}>{submissionStatus}</span>
                <span className={styles.coursePill}>{selectedAssignment?.subject || "General"}</span>
              </div>

              <div className={styles.peopleBlock}>
                <div className={styles.personRow}>
                  <AuthenticatedImage
                    src={
                      selectedAssignment?.teacherProfileImageUrl ||
                      selectedAssignment?.teacher_profile_image_url
                    }
                    alt="Teacher profile"
                    className={styles.profileImg}
                    fallback={<img src={teacherPic} alt="Teacher profile" className={styles.profileImg} />}
                  />
                  <div>
                    <span className={styles.kicker}>Teacher</span>
                    <strong>{selectedAssignment?.teacherName || "Teacher Jen"}</strong>
                  </div>
                </div>
              </div>

              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span>Due Date</span>
                  <strong>{formatDueDate(selectedAssignment)}</strong>
                </div>
                <div className={styles.detailItem}>
                  <span>Attempts</span>
                  <strong>
                    {attemptsUsed}
                    {attemptLimit !== null ? ` / ${attemptLimit}` : " / Unlimited"}
                  </strong>
                </div>
                <div className={`${styles.detailItem} ${styles.wideDetail}`}>
                  <span>Posted</span>
                  <strong>{formatPostedDate(selectedAssignment)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {confirmAction && (
        <div className={styles.modalBackdrop} onClick={closeConfirmAction}>
          <section className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{confirmAction.title}</h2>
            </div>
            <div className={styles.modalBody}>
              <p>{confirmAction.message}</p>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.textBtn} onClick={closeConfirmAction}>
                Cancel
              </button>
              <button type="button" className={styles.primaryBtn} onClick={performConfirmAction}>
                {confirmAction.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

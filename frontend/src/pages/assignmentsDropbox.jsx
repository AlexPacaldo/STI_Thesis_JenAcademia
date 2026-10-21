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
  downloadAuthenticatedFile,
  openAssignmentFile,
  openSubmissionFile,
  useAuthenticatedFileUrl,
} from "../utils/authenticatedFile.js";
import { compressFileIfImage } from "../utils/imageCompression.js";
import ModalPortal from "../utils/ModalPortal.jsx";

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

function SubmissionPreview({ fileUrl, storedPath }) {
  const { url: blobUrl, error, loading } = useAuthenticatedFileUrl(storedPath ?? fileUrl);
  const ext = getFileExtension(fileUrl);
  const fileName = getFileName(fileUrl);

  if (loading) return <p className={styles.fileInfo}>Loading file…</p>;
  if (error) return <p className={styles.fileInfo}>This file could not be loaded.</p>;

  if (VIDEO_EXTENSIONS.includes(ext)) {
    return (
      <video className={styles.previewMedia} controls preload="metadata" src={blobUrl}>
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
      <img className={styles.previewImage} src={blobUrl} alt={fileName} loading="lazy" />
    );
  }

  if (AUDIO_EXTENSIONS.includes(ext)) {
    return <audio className={styles.previewMedia} controls preload="metadata" src={blobUrl} />;
  }

  if (ext === "pdf") {
    return (
      <iframe className={styles.previewFrame} src={blobUrl} title={`${fileName} preview`} />
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

export default function AssignmentsDropbox() {
  const { notify } = useNotification() || {};
  const [comment, setComment] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [submitMessage, setSubmitMessage] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("instructions");
  const [submissionHistory, setSubmissionHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
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

  useEffect(() => {
    if (!assignmentId) return;

    let ignore = false;
    setIsLoading(true);
    setSubmitMessage("");

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

  useEffect(() => {
    if (activeTab !== "submissions" || !assignmentId || !hasExistingSubmission) return;

    let ignore = false;
    setSubmissionHistory([]);
    setShowHistory(false);

    apiFetch(`${API}/api/assignments/${assignmentId}/submission-history`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          // History endpoint may not exist on older deployments; ignore silently.
          if (res.status === 404) return;
          throw new Error(data.message || "Could not load submission history");
        }
        return data.history || [];
      })
      .then((history) => {
        if (ignore) return;
        if (history.length > 0) {
          setSubmissionHistory(history);
          setShowHistory(true);
        }
      })
      .catch((err) => {
        console.error("Load submission history error:", err);
      });

    return () => {
      ignore = true;
    };
  }, [activeTab, assignmentId, hasExistingSubmission]);

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
  const hasExistingSubmission = Boolean(selectedAssignment?.submissionId);
  const canResubmit = hasExistingSubmission && !isAttemptLimitReached;
  const canSubmit = !isAttemptLimitReached && !isAssignmentPastDue();
  const submitButtonLabel = canResubmit ? "Submit Again" : "Submit";

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

    if (!comment.trim() && !selectedFile) {
      setSubmitMessage("Please write an answer or attach a file before submitting.");
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

      setSelectedAssignment((prev) => ({ ...prev, submissionId: data.submission?.submissionId }));
      notify?.("Assignment submitted!", "success");
      setSubmitMessage("Submitted!");
      setComment("");
      setSelectedFile(null);
    } catch (err) {
      console.error("Submit assignment error:", err);
      setSubmitMessage(err.message || "Could not submit assignment.");
      notify?.(err.message || "Could not submit assignment.", "error");
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

    if (!comment.trim() && !selectedFile) {
      setSubmitMessage("Please write an answer or attach a file before submitting.");
      return;
    }

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
                    <AssignmentAttachment
                      url={selectedAssignment?.attachmentUrl}
                      name={selectedAssignment?.attachmentName}
                      onError={() => notify?.("That file could not be opened. Please try again.", "error")}
                    />
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
                        Attach a file
                      </label>
                      <input
                        type="file"
                        className={styles.fileInput}
                        onChange={(e) => {
                          setSelectedFile(e.target.files?.[0] ?? null);
                          setSubmitMessage("");
                        }}
                      />
                      {selectedFile ? (
                        <p className={styles.fileInfo}>
                          <span className={styles.fileIcon} aria-hidden="true">📎</span>
                          Attached: {selectedFile.name}
                        </p>
                      ) : null}
                      <div className={styles.editorActions}>
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
                  {submittedAnswer ? (
                    <div className={styles.submissionAnswerBlock}>
                      <p className={styles.submissionAnswerText}>{submittedAnswer}</p>
                    </div>
                  ) : null}
                  <div className={styles.submittedFileInfo}>
                    <span className={styles.submittedFileLabel}>SUBMITTED FILE</span>
                    <p className={styles.submissionFileName}>
                      {getFileName(submittedFileUrl)}
                    </p>
                  </div>
                  {submittedFileUrl ? (
                    <div className={styles.submissionFileActions}>
                      <button
                        type="button"
                        className={styles.submissionFileButton}
                        onClick={() =>
                          openSubmissionFile(submittedFileUrl).catch(() =>
                            notify?.("That file could not be opened. Please try again.", "error")
                          )
                        }
                      >
                        Open file
                      </button>
                      <button
                        type="button"
                        className={styles.submissionFileButton}
                        onClick={() => downloadAuthenticatedFile(submittedFileUrl)}
                      >
                        Download
                      </button>
                    </div>
                  ) : null}
                  <SubmissionPreview fileUrl={submittedFileUrl} />

                  {submissionHistory.length > 0 ? (
                    <div className={styles.submissionHistory}>
                      <button
                        type="button"
                        className={styles.historyButton}
                        onClick={() => setShowHistory(!showHistory)}
                        aria-expanded={showHistory}
                      >
                        {showHistory ? "Hide history" : "View submission history"}
                      </button>
                      {showHistory && (
                        <div className={styles.historyList}>
                          {submissionHistory.map((item) => (
                            <div key={item.history_id} className={styles.historyItem}>
                              <div className={styles.historyMeta}>
                                <span className={styles.historyAttempt}>
                                  Attempt {item.attempt_count}
                                </span>
                                <span className={styles.historyDate}>
                                  {new Date(item.submitted_at).toLocaleString()}
                                </span>
                              </div>
                              {item.submission_text ? (
                                <p className={styles.historyText}>{item.submission_text}</p>
                              ) : null}
                              {item.file_url ? (
                                <div className={styles.historyFile}>
                                  <button
                                    type="button"
                                    className={styles.historyFileButton}
                                    onClick={() =>
                                      openSubmissionFile(item.file_url).catch(() =>
                                        notify?.("That file could not be opened.", "error")
                                      )
                                    }
                                  >
                                    {getFileName(item.file_url)}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
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
    </div>
  );
}

// src/pages/BooksContent.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { useNavigate, useParams } from "react-router-dom";
import styles from "../assets/booksContent.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";

const API_BASE = "http://localhost:3001";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const getProgressPercentage = (item) => {
  const value = Number(item?.progress_percentage ?? (item?.is_completed ? 100 : 0));
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const isLessonCompleted = (item) => {
  return Boolean(item?.is_completed) || getProgressPercentage(item) >= 100;
};

const getAssetUrl = (url) => {
  if (!url) return "";
  return String(url).startsWith("http") ? url : `${API_BASE}${url}`;
};

function PdfLessonViewer({ fileUrl, title, onRendered }) {
  const containerRef = useRef(null);
  const renderTokenRef = useRef(0);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !fileUrl) return undefined;

    const renderToken = renderTokenRef.current + 1;
    renderTokenRef.current = renderToken;
    let cancelled = false;
    let activeDocument = null;

    container.replaceChildren();
    setStatus("loading");

    const renderPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        activeDocument = pdf;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled || renderTokenRef.current !== renderToken) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(container.clientWidth - 28, 320);
          const scale = Math.min(1.6, Math.max(0.8, availableWidth / baseViewport.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          const outputScale = window.devicePixelRatio || 1;

          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = styles.pdfPage;

          const wrapper = document.createElement("div");
          wrapper.className = styles.pdfPageWrap;
          wrapper.appendChild(canvas);
          container.appendChild(wrapper);

          await page.render({
            canvasContext: context,
            viewport,
            transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
          }).promise;
        }

        if (!cancelled && renderTokenRef.current === renderToken) {
          setStatus("ready");
          window.requestAnimationFrame(() => onRendered?.());
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error rendering PDF:", error);
          setStatus("error");
          onRendered?.();
        }
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      activeDocument?.destroy?.();
    };
  }, [fileUrl, onRendered]);

  return (
    <div className={styles.pdfViewerShell}>
      {status === "loading" && <p className={styles.emptyText}>Loading file preview...</p>}
      {status === "error" && (
        <div className={styles.documentPreview}>
          <div>
            <h3>{title}</h3>
            <p>This file could not be previewed here. Open it in a separate tab instead.</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className={styles.pdfPages} />
    </div>
  );
}

export default function BooksContent({ mode = "student" }) {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const [book, setBook] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [completingLessonId, setCompletingLessonId] = useState(null);
  const [activeTeacherTab, setActiveTeacherTab] = useState("content");
  const [studentProgress, setStudentProgress] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [accessError, setAccessError] = useState("");
  const [readLessons, setReadLessons] = useState({});
  const [showPdfFullscreen, setShowPdfFullscreen] = useState(false);
  const readerViewportRef = useRef(null);
  const fullscreenReaderRef = useRef(null);

  const isTeacherView = mode === "teacher";
  const teacherId = useMemo(() => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
    return localStorage.getItem("teacher_id") || storedUser.id || storedUser.user_id || storedUser.userId || null;
  }, []);
  const studentId = useMemo(() => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
    return storedUser.id || storedUser.user_id || storedUser.userId || localStorage.getItem("student_id") || null;
  }, []);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    const loadBookContent = async () => {
      try {
        setLoading(true);
        setAccessError("");

        if (!isTeacherView) {
          const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
          const currentStudentId = storedUser.id || storedUser.user_id || storedUser.userId || studentId;
          const packageResponse = await fetch(`${API_BASE}/api/calendar/student-package/${currentStudentId}`);

          if (packageResponse.ok) {
            const packageData = await packageResponse.json();
            if (Number(packageData.package?.classes_left) <= 0) {
              notify?.("Contact the admin for a new contract to view Books / Lessons.", "error");
              navigate("/Calendar");
              return;
            }
          }
        }

        const accessQuery = !isTeacherView
          ? studentId
            ? `?student_id=${encodeURIComponent(studentId)}`
            : ""
          : teacherId
            ? `?teacher_id=${encodeURIComponent(teacherId)}`
            : "";
        const lessonQuery = new URLSearchParams({ book_id: bookId });
        if (!isTeacherView) {
          lessonQuery.set("student_id", studentId);
        } else if (teacherId) {
          lessonQuery.set("teacher_id", teacherId);
        }

        const [bookResponse, lessonsResponse, progressResponse] = await Promise.all([
          fetch(`${API_BASE}/api/books/${bookId}${accessQuery}`),
          fetch(`${API_BASE}/api/lessons?${lessonQuery.toString()}`),
          isTeacherView
            ? fetch(`${API_BASE}/api/teacher/book/${bookId}/progress?teacher_id=${encodeURIComponent(teacherId)}`)
            : fetch(`${API_BASE}/api/lesson-progress?student_id=${studentId}&book_id=${bookId}`),
        ]);

        if (bookResponse.status === 403 || lessonsResponse.status === 403) {
          setAccessError("You do not have access to this book.");
          notify?.("You do not have access to this book.", "error");
          return;
        }

        if (!bookResponse.ok) throw new Error("Failed to fetch book");
        if (!lessonsResponse.ok) throw new Error("Failed to fetch lessons");

        const bookData = await bookResponse.json();
        const lessonsData = await lessonsResponse.json();
        const lessonsList = lessonsData.lessons || [];

        setBook(bookData.book);
        setLessons(lessonsList);
        setSelectedLesson(lessonsList[0] || null);

        if (progressResponse) {
          if (!progressResponse.ok) throw new Error("Failed to fetch progress");
          const progressData = await progressResponse.json();
          const progressMap = {};
          (progressData.progress || []).forEach((item) => {
            progressMap[item.lesson_id] = item;
          });
          setProgress(progressMap);
        }
      } catch (err) {
        console.error("Error loading book content:", err);
        notify?.(`Error: ${err.message}`, "error");
      } finally {
        setLoading(false);
      }
    };

    loadBookContent();
  }, [bookId, isTeacherView, navigate, notify, studentId]);

  useEffect(() => {
    if (!isTeacherView || activeTeacherTab !== "progress" || !bookId) return;

    const loadStudentProgress = async () => {
      try {
        setProgressLoading(true);
        setProgressError("");

        const response = await fetch(`${API_BASE}/api/teacher/book/${bookId}/progress?teacher_id=${encodeURIComponent(teacherId)}`);
        if (!response.ok) throw new Error("Failed to fetch student progress");

        const data = await response.json();
        setStudentProgress(data.students || []);
      } catch (err) {
        console.error("Error loading student progress:", err);
        setProgressError(err.message || "Failed to load student progress.");
      } finally {
        setProgressLoading(false);
      }
    };

    loadStudentProgress();
  }, [activeTeacherTab, bookId, isTeacherView]);

  const selectedFileUrl = useMemo(() => {
    if (!selectedLesson?.file_path) return "";
    return `${API_BASE}${selectedLesson.file_path}`;
  }, [selectedLesson]);

  const selectedFileName = useMemo(() => {
    if (!selectedLesson?.file_path) return "";
    return selectedLesson.file_path.split("/").pop()?.replace(/^\d+-/, "") || "Lesson material";
  }, [selectedLesson]);

  const canPreviewFile = useMemo(() => {
    const fileName = selectedFileName.toLowerCase();
    return fileName.endsWith(".pdf") || fileName.endsWith(".txt");
  }, [selectedFileName]);

  const isPdfFile = useMemo(() => selectedFileName.toLowerCase().endsWith(".pdf"), [selectedFileName]);

  const selectedLessonId = selectedLesson?.lesson_id;
  const selectedLessonCompleted = selectedLessonId ? isLessonCompleted(progress[selectedLessonId]) : false;
  const lessonRequiresScroll = Boolean(selectedFileUrl);
  const selectedLessonReadReady = selectedLessonCompleted || !lessonRequiresScroll || Boolean(readLessons[selectedLessonId]);

  const markSelectedLessonRead = useCallback(() => {
    if (!selectedLessonId) return;
    setReadLessons((current) => {
      if (current[selectedLessonId]) return current;
      return { ...current, [selectedLessonId]: true };
    });
  }, [selectedLessonId]);

  const checkReaderBottom = useCallback((viewport) => {
    if (!viewport || !selectedLessonId || !lessonRequiresScroll) return;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromBottom <= 12) {
      markSelectedLessonRead();
    }
  }, [lessonRequiresScroll, markSelectedLessonRead, selectedLessonId]);

  const handleReaderScroll = useCallback(() => {
    checkReaderBottom(readerViewportRef.current);
  }, [checkReaderBottom]);

  const handleFullscreenScroll = useCallback(() => {
    checkReaderBottom(fullscreenReaderRef.current);
  }, [checkReaderBottom]);

  useEffect(() => {
    const viewport = readerViewportRef.current;
    if (!viewport || !selectedLessonId) return;

    viewport.scrollTop = 0;

    const checkIfScrollable = window.setTimeout(() => {
      if (!lessonRequiresScroll || viewport.scrollHeight <= viewport.clientHeight + 12) {
        markSelectedLessonRead();
      }
    }, 80);

    return () => window.clearTimeout(checkIfScrollable);
  }, [selectedLessonId, lessonRequiresScroll, markSelectedLessonRead]);

  const handleLessonClick = (lesson) => {
    if (!isTeacherView) {
      const lessonIndex = lessons.findIndex((item) => item.lesson_id === lesson.lesson_id);
      const previousLesson = lessons[lessonIndex - 1];
      const isLocked = lessonIndex > 0 && !isLessonCompleted(progress[previousLesson?.lesson_id]);

      if (isLocked) {
        notify?.("Please complete the previous lesson first.", "warning");
        return;
      }
    }

    setSelectedLesson(lesson);
  };

  const markLessonComplete = async () => {
    if (!selectedLesson || isTeacherView || selectedLessonCompleted) return;
    if (!selectedLessonReadReady) {
      notify?.("Please scroll to the bottom of the lesson file before marking it complete.", "warning");
      return;
    }

    try {
      const completedLesson = selectedLesson;
      const currentLessonIndex = lessons.findIndex(
        (lesson) => lesson.lesson_id === completedLesson.lesson_id
      );
      const nextLesson = lessons[currentLessonIndex + 1] || null;

      setCompletingLessonId(completedLesson.lesson_id);

      const response = await fetch(`${API_BASE}/api/lesson-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          lesson_id: completedLesson.lesson_id,
          is_completed: 1,
          status: "Completed",
        }),
      });

      if (!response.ok) throw new Error("Failed to complete lesson");

      const data = await response.json();
      const completedProgress = data.progress || {
        student_id: studentId,
        lesson_id: completedLesson.lesson_id,
        progress_percentage: 100,
        is_completed: 1,
      };

      setProgress((current) => ({
        ...current,
        [completedLesson.lesson_id]: completedProgress,
      }));

      if (nextLesson) {
        setSelectedLesson(nextLesson);
        notify?.("Lesson completed. Next lesson unlocked.", "success");
      } else {
        notify?.("Lesson marked as completed.", "success");
      }
    } catch (err) {
      console.error("Error completing lesson:", err);
      notify?.(`Error: ${err.message}`, "error");
    } finally {
      setCompletingLessonId(null);
    }
  };

  const getCompletionPercentage = () => {
    if (lessons.length === 0) return 0;
    const completedCount = lessons.filter((lesson) =>
      isLessonCompleted(progress[lesson.lesson_id])
    );
    return Math.round((completedCount.length / lessons.length) * 100);
  };

  if (loading) {
    return (
      <div className={styles.Center}>
        <p className={styles.stateMessage}>Loading lessons...</p>
      </div>
    );
  }

  if (!bookId || !book) {
    return (
      <div className={styles.Center}>
        <p className={styles.stateMessage}>{accessError || "Book not found."}</p>
      </div>
    );
  }

  return (
    <div className={styles.Center}>
      <div className={styles.CenterContent}>
        <div className={styles.TopContent}>
          <div className={styles.Teacher}>
            {book.cover_url ? (
              <img src={`${API_BASE}${book.cover_url}`} alt="Book cover" className={styles.bookCoverImg} />
            ) : (
              <img src={teacherPic} alt="Teacher" />
            )}
            {isTeacherView && (
              <div style={{ marginLeft: 12 }}>
                <button type="button" onClick={() => setShowCoverModal(true)}>Change Cover</button>
              </div>
            )}
            <div>
              <h1><b>{book.title}</b></h1>
              <p>{isTeacherView ? "Uploaded lessons" : book.author || "Your Teacher"}</p>
            </div>
          </div>
          <div className={styles.Date}>
            <h1><b>{lessons.length}</b></h1>
            <p>{lessons.length === 1 ? "Lesson" : "Lessons"}</p>
          </div>
        </div>

        {!isTeacherView && (
          <div className={styles.progressContainer}>
            <h3>Your Progress: {getCompletionPercentage()}% completed</h3>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${getCompletionPercentage()}%` }}
              />
            </div>
          </div>
        )}

        {isTeacherView && (
          <div className={styles.teacherTabs} role="tablist" aria-label="Teacher book sections">
            <button
              type="button"
              className={`${styles.teacherTab} ${activeTeacherTab === "content" ? styles.activeTeacherTab : ""}`}
              onClick={() => setActiveTeacherTab("content")}
              role="tab"
              aria-selected={activeTeacherTab === "content"}
            >
              Lesson Content
            </button>
            <button
              type="button"
              className={`${styles.teacherTab} ${activeTeacherTab === "progress" ? styles.activeTeacherTab : ""}`}
              onClick={() => setActiveTeacherTab("progress")}
              role="tab"
              aria-selected={activeTeacherTab === "progress"}
            >
              See Students Progress
            </button>
          </div>
        )}

        {isTeacherView && activeTeacherTab === "progress" ? (
          <section className={styles.progressPanel}>
            <div className={styles.progressPanelHeader}>
              <div>
                <h2>Students Progress</h2>
                <p>{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"} in this book</p>
              </div>
            </div>

            {progressLoading ? (
              <p className={styles.emptyText}>Loading student progress...</p>
            ) : progressError ? (
              <p className={styles.emptyText}>{progressError}</p>
            ) : studentProgress.length === 0 ? (
              <p className={styles.emptyText}>No active students are enrolled in this book's course yet.</p>
            ) : (
              <div className={styles.progressTableWrap}>
                <table className={styles.progressTable}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Completed Lessons</th>
                      <th>Status</th>
                      <th>Lesson Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentProgress.map((student) => (
                      <tr
                        key={student.studentId}
                        className={student.courseCompleted ? styles.courseCompletedRow : ""}
                      >
                        <td>
                          <div className={styles.studentCell}>
                            {student.profileImageUrl ? (
                              <img src={getAssetUrl(student.profileImageUrl)} alt={student.name} />
                            ) : (
                              <div className={styles.studentInitial}>
                                {(student.name || "S").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <strong>{student.name}</strong>
                              <span>{student.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.progressCount}>
                            <strong>{student.completedLessons} / {student.totalLessons} Lessons</strong>
                            <span>{student.progressPercentage}% Complete</span>
                            <div className={styles.tableProgressBar}>
                              <div style={{ width: `${student.progressPercentage}%` }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${student.courseCompleted ? styles.statusDone : ""}`}>
                            {student.status}
                          </span>
                        </td>
                        <td>
                          <div className={styles.lessonBreakdown}>
                            {student.lessons.map((lesson) => (
                              <span
                                key={lesson.lessonId}
                                className={lesson.isCompleted ? styles.lessonDone : styles.lessonPending}
                              >
                                L{lesson.lessonNumber}: {lesson.isCompleted ? "Done" : "Pending"}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
        <div className={styles.bookLayout}>
          <aside className={styles.lessonsList}>
            <h3>Lessons</h3>
            <div className={styles.lessonsContainer}>
              {lessons.length === 0 && (
                <p className={styles.emptyText}>No lessons uploaded for this book yet.</p>
              )}

              {lessons.map((lesson) => {
                const isCompleted = progress[lesson.lesson_id]?.is_completed;
                const lessonIndex = lessons.findIndex((item) => item.lesson_id === lesson.lesson_id);
                const previousLesson = lessons[lessonIndex - 1];
                const isLocked = !isTeacherView && lessonIndex > 0 && !isLessonCompleted(progress[previousLesson?.lesson_id]);

                return (
                  <button
                    type="button"
                    key={lesson.lesson_id}
                    className={`${styles.lessonButton} ${
                      selectedLesson?.lesson_id === lesson.lesson_id ? styles.active : ""
                    } ${isCompleted ? styles.completed : ""} ${isLocked ? styles.locked : ""}`}
                    onClick={() => handleLessonClick(lesson)}
                    aria-disabled={isLocked}
                  >
                    <span className={styles.lessonNumber}>Lesson {lesson.lesson_number}</span>
                    <span className={styles.lessonTitle}>{lesson.title}</span>
                    <span className={styles.lessonProgressText}>
                      {isLocked ? "Locked" : isCompleted ? "Completed" : "In Progress"}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className={styles.bookContent}>
            {selectedLesson ? (
              <>
                <div className={styles.lessonHeader}>
                  <span>Lesson {selectedLesson.lesson_number}</span>
                  <h2>{selectedLesson.title}</h2>
                </div>

                {selectedLesson.content && (
                  <p className={styles.lessonContent}>{selectedLesson.content}</p>
                )}

                <section
                  className={styles.readerViewport}
                  aria-label="Lesson reading area"
                  onScroll={handleReaderScroll}
                  ref={readerViewportRef}
                >
                  {selectedFileUrl ? (
                    <section className={styles.fileSection}>
                      <div className={styles.fileInfo}>
                        <h3>Uploaded File</h3>
                        <p>{selectedFileName}</p>
                      </div>

                      <div className={styles.fileActions}>
                        {isPdfFile ? (
                          <button
                            type="button"
                            className={styles.fileActionBtn}
                            onClick={() => setShowPdfFullscreen(true)}
                          >
                            Full screen
                          </button>
                        ) : (
                          <a href={selectedFileUrl} target="_blank" rel="noopener noreferrer">
                            Open file
                          </a>
                        )}
                        <a href={selectedFileUrl} download>
                          Download
                        </a>
                      </div>

                      {isPdfFile ? (
                        <PdfLessonViewer
                          fileUrl={selectedFileUrl}
                          title={selectedLesson.title}
                          onRendered={handleReaderScroll}
                        />
                      ) : canPreviewFile ? (
                        <iframe
                          title={`${selectedLesson.title} file preview`}
                          className={styles.filePreview}
                          src={selectedFileUrl}
                          onLoad={handleReaderScroll}
                        />
                      ) : (
                        <div className={styles.documentPreview}>
                          <div>
                            <h3>{selectedFileName}</h3>
                            <p>This document opens in a separate tab or downloads to your device.</p>
                          </div>
                        </div>
                      )}
                    </section>
                  ) : (
                    <div className={styles.noPreview}>
                      <p>No file was uploaded for this lesson.</p>
                    </div>
                  )}
                </section>

                {!isTeacherView && (
                  <div className={styles.lessonActions}>
                    <div className={`${styles.lessonStatus} ${selectedLessonCompleted ? styles.statusCompleted : ""}`}>
                      {selectedLessonCompleted ? "Completed" : selectedLessonReadReady ? "Ready" : "Scroll to Bottom"}
                    </div>
                    <button
                      type="button"
                      className={`${styles.completeBtn} ${selectedLessonCompleted ? styles.completedBtn : ""}`}
                      onClick={markLessonComplete}
                      disabled={selectedLessonCompleted || !selectedLessonReadReady || completingLessonId === selectedLesson.lesson_id}
                    >
                      {selectedLessonCompleted
                        ? "Completed"
                        : completingLessonId === selectedLesson.lesson_id
                          ? "Saving..."
                          : "Mark as Complete"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.emptyText}>Select a lesson to view its uploaded file.</p>
            )}
          </main>
        </div>
        )}
      </div>

      {/* Change Cover Modal (teacher only) */}
      {showCoverModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Change Book Cover</h2>
            <label>
              Select cover image:
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              />
            </label>

            <div className={styles.modalButtons}>
              <button
                onClick={async () => {
                  if (!coverFile) {
                    notify?.("Please choose an image file", "error");
                    return;
                  }

                  try {
                    const fd = new FormData();
                    fd.append("cover", coverFile);
                    fd.append("title", book.title);
                    fd.append("description", book.description || "");
                    if (teacherId) {
                      fd.append("teacher_id", teacherId);
                    }

                    const res = await fetch(`${API_BASE}/api/books/${book.book_id}`, {
                      method: "PUT",
                      body: fd,
                    });

                    if (!res.ok) throw new Error("Failed to upload cover");

                    notify?.("Cover updated", "success");
                    setShowCoverModal(false);
                    setCoverFile(null);
                    // reload book
                    const bookQuery = teacherId ? `?teacher_id=${encodeURIComponent(teacherId)}` : "";
                    const bk = await (await fetch(`${API_BASE}/api/books/${bookId}${bookQuery}`)).json();
                    setBook(bk.book);
                  } catch (err) {
                    console.error(err);
                    notify?.(`Error: ${err.message}`, "error");
                  }
                }}
                className={styles.confirmBtn}
              >
                Save
              </button>
              <button onClick={() => { setShowCoverModal(false); setCoverFile(null); }} className={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPdfFullscreen && selectedFileUrl && isPdfFile && (
        <div className={styles.fullscreenPdf}>
          <div className={styles.fullscreenHeader}>
            <div>
              <h2>{selectedLesson?.title || "Lesson file"}</h2>
              <p>{selectedFileName}</p>
            </div>
            <button type="button" onClick={() => setShowPdfFullscreen(false)}>
              Close
            </button>
          </div>

          <div
            className={styles.fullscreenReader}
            onScroll={handleFullscreenScroll}
            ref={fullscreenReaderRef}
          >
            <PdfLessonViewer
              fileUrl={selectedFileUrl}
              title={selectedLesson?.title || "Lesson file"}
              onRendered={handleFullscreenScroll}
            />
          </div>
        </div>
      )}

    </div>
  );
}

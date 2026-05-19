// src/pages/BooksContent.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styles from "../assets/booksContent.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";

const API_BASE = "http://localhost:3001";

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

  const isTeacherView = mode === "teacher";
  const studentId = useMemo(() => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
    return storedUser.id || storedUser.user_id || storedUser.userId || localStorage.getItem("student_id") || "1";
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

        const accessQuery = !isTeacherView ? `?student_id=${encodeURIComponent(studentId)}` : "";
        const lessonQuery = new URLSearchParams({ book_id: bookId });
        if (!isTeacherView) lessonQuery.set("student_id", studentId);

        const [bookResponse, lessonsResponse, progressResponse] = await Promise.all([
          fetch(`${API_BASE}/api/books/${bookId}${accessQuery}`),
          fetch(`${API_BASE}/api/lessons?${lessonQuery.toString()}`),
          isTeacherView
            ? Promise.resolve(null)
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

        const response = await fetch(`${API_BASE}/api/teacher/book/${bookId}/progress`);
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

  const selectedLessonId = selectedLesson?.lesson_id;
  const selectedLessonCompleted = selectedLessonId ? isLessonCompleted(progress[selectedLessonId]) : false;

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
                            {student.courseCompleted && <span>100% Complete</span>}
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

                <section className={styles.readerViewport} aria-label="Lesson reading area">
                  {selectedFileUrl ? (
                    <section className={styles.fileSection}>
                      <div className={styles.fileInfo}>
                        <h3>Uploaded File</h3>
                        <p>{selectedFileName}</p>
                      </div>

                      <div className={styles.fileActions}>
                        <a href={selectedFileUrl} target="_blank" rel="noopener noreferrer">
                          Open file
                        </a>
                        <a href={selectedFileUrl} download>
                          Download
                        </a>
                      </div>

                      {canPreviewFile ? (
                        <iframe
                          title={`${selectedLesson.title} file preview`}
                          className={styles.filePreview}
                          src={selectedFileUrl}
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
                      {selectedLessonCompleted ? "Completed" : "In Progress"}
                    </div>
                    <button
                      type="button"
                      className={`${styles.completeBtn} ${selectedLessonCompleted ? styles.completedBtn : ""}`}
                      onClick={markLessonComplete}
                      disabled={selectedLessonCompleted || completingLessonId === selectedLesson.lesson_id}
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

                    const res = await fetch(`${API_BASE}/api/books/${book.book_id}`, {
                      method: "PUT",
                      body: fd,
                    });

                    if (!res.ok) throw new Error("Failed to upload cover");

                    notify?.("Cover updated", "success");
                    setShowCoverModal(false);
                    setCoverFile(null);
                    // reload book
                    const bk = await (await fetch(`${API_BASE}/api/books/${bookId}`)).json();
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

    </div>
  );
}

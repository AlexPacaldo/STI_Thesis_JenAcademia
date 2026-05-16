// src/pages/BooksContent.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import styles from "../assets/booksContent.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";

const API_BASE = "http://localhost:3001";

export default function BooksContent({ mode = "student" }) {
  const { bookId } = useParams();
  const { notify } = useNotification() || {};
  const [book, setBook] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverFile, setCoverFile] = useState(null);

  const isTeacherView = mode === "teacher";
  const studentId = localStorage.getItem("student_id") || "1";

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    const loadBookContent = async () => {
      try {
        setLoading(true);

        const [bookResponse, lessonsResponse, progressResponse] = await Promise.all([
          fetch(`${API_BASE}/api/books/${bookId}`),
          fetch(`${API_BASE}/api/lessons?book_id=${bookId}`),
          isTeacherView
            ? Promise.resolve(null)
            : fetch(`${API_BASE}/api/lesson-progress?student_id=${studentId}&book_id=${bookId}`),
        ]);

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
  }, [bookId, isTeacherView, notify, studentId]);

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

  const handleLessonClick = async (lesson) => {
    setSelectedLesson(lesson);

    if (isTeacherView || progress[lesson.lesson_id]) return;

    try {
      const response = await fetch(`${API_BASE}/api/lesson-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          lesson_id: lesson.lesson_id,
          is_completed: 0,
          time_spent_minutes: 0,
        }),
      });

      if (response.ok) {
        setProgress((current) => ({
          ...current,
          [lesson.lesson_id]: {
            student_id: studentId,
            lesson_id: lesson.lesson_id,
            is_completed: 0,
          },
        }));
      }
    } catch (err) {
      console.error("Error marking lesson as viewed:", err);
    }
  };

  const toggleLessonCompletion = async (lesson) => {
    const currentProgress = progress[lesson.lesson_id];
    const isCurrentlyCompleted = currentProgress?.is_completed;

    try {
      const response = await fetch(`${API_BASE}/api/lesson-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          lesson_id: lesson.lesson_id,
          is_completed: isCurrentlyCompleted ? 0 : 1,
          time_spent_minutes: 0,
        }),
      });

      if (!response.ok) throw new Error("Failed to update progress");

      setProgress((current) => ({
        ...current,
        [lesson.lesson_id]: {
          ...currentProgress,
          student_id: studentId,
          lesson_id: lesson.lesson_id,
          is_completed: isCurrentlyCompleted ? 0 : 1,
        },
      }));

      notify?.(
        isCurrentlyCompleted ? "Lesson marked incomplete" : "Lesson marked complete!",
        "success"
      );
    } catch (err) {
      console.error("Error updating progress:", err);
      notify?.(`Error: ${err.message}`, "error");
    }
  };

  const getCompletionPercentage = () => {
    if (lessons.length === 0) return 0;
    const completedCount = lessons.filter(
      (lesson) => progress[lesson.lesson_id]?.is_completed
    ).length;
    return Math.round((completedCount / lessons.length) * 100);
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
        <p className={styles.stateMessage}>Book not found.</p>
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
            <h3>Your Progress: {getCompletionPercentage()}%</h3>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${getCompletionPercentage()}%` }}
              />
            </div>
          </div>
        )}

        <div className={styles.bookLayout}>
          <aside className={styles.lessonsList}>
            <h3>Lessons</h3>
            <div className={styles.lessonsContainer}>
              {lessons.length === 0 && (
                <p className={styles.emptyText}>No lessons uploaded for this book yet.</p>
              )}

              {lessons.map((lesson) => {
                const isCompleted = progress[lesson.lesson_id]?.is_completed;

                return (
                  <button
                    type="button"
                    key={lesson.lesson_id}
                    className={`${styles.lessonButton} ${
                      selectedLesson?.lesson_id === lesson.lesson_id ? styles.active : ""
                    } ${isCompleted ? styles.completed : ""}`}
                    onClick={() => handleLessonClick(lesson)}
                  >
                    <span className={styles.lessonNumber}>Lesson {lesson.lesson_number}</span>
                    <span className={styles.lessonTitle}>{lesson.title}</span>
                    {isCompleted && <span className={styles.checkmark}>Done</span>}
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
                      <div className={styles.noPreview}>
                        <p>This file type opens in a separate tab or downloads to your device.</p>
                      </div>
                    )}
                  </section>
                ) : (
                  <div className={styles.noPreview}>
                    <p>No file was uploaded for this lesson.</p>
                  </div>
                )}

                {!isTeacherView && (
                  <div className={styles.lessonActions}>
                    <button
                      type="button"
                      className={`${styles.completeBtn} ${
                        progress[selectedLesson.lesson_id]?.is_completed ? styles.completedBtn : ""
                      }`}
                      onClick={() => toggleLessonCompletion(selectedLesson)}
                    >
                      {progress[selectedLesson.lesson_id]?.is_completed
                        ? "Completed"
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

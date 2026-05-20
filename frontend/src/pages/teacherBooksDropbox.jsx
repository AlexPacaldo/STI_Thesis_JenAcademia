// src/pages/Notes.jsx
import { useEffect, useState } from "react";
import styles from "../assets/teacherBooksDropbox.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";

export default function TeacherBooksDropbox() {
  const { notify } = useNotification() || {};
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState("");
  const [lessonData, setLessonData] = useState({
    lesson_number: "",
    title: "",
    content: "",
    file: null,
  });

  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const teacherId = localStorage.getItem("teacher_id") || storedUser.id || storedUser.user_id || storedUser.userId || null;

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/teacher/books?teacher_id=${teacherId}`
      );
      if (!response.ok) throw new Error("Failed to fetch books");

      const data = await response.json();
      setBooks(data.books || []);
    } catch (err) {
      console.error("Error fetching books:", err);
      notify?.(`Error: ${err.message}`, "error");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ];

      if (!allowedTypes.includes(file.type)) {
        notify?.("Only PDF, DOC, DOCX, and TXT files are allowed", "error");
        e.target.value = "";
        return;
      }

      setLessonData({ ...lessonData, file });
    }
  };

  const handleSubmit = async () => {
    if (!selectedBook.trim()) {
      notify?.("Please select a book", "error");
      return;
    }

    if (!lessonData.lesson_number.trim() || !lessonData.title.trim()) {
      notify?.(
        "Lesson number and title are required",
        "error"
      );
      return;
    }

    if (!lessonData.file) {
      notify?.("Please select a file to upload", "error");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("book_id", selectedBook);
      formData.append("lesson_number", lessonData.lesson_number);
      formData.append("title", lessonData.title);
      formData.append("content", lessonData.content || "");
      formData.append("file", lessonData.file);
      formData.append("teacher_id", teacherId);

      const response = await fetch("http://localhost:3001/api/lessons", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to create lesson");
      }

      notify?.("Lesson uploaded successfully!", "success");
      setLessonData({
        lesson_number: "",
        title: "",
        content: "",
        file: null,
      });
      setSelectedBook("");

      // Reset file input
      const fileInput = document.getElementById("file-input");
      if (fileInput) fileInput.value = "";
    } catch (err) {
      console.error("Error uploading lesson:", err);
      notify?.(`Error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.Cont}>
      <div className={styles.Center}>
        {/* Left column */}
        <div className={styles.leftCard}>
          <div className={styles.words}>
            <h1><b>Book Selection:</b></h1>
            <select
              className={styles.commentBox}
              value={selectedBook}
              onChange={(e) => setSelectedBook(e.target.value)}
            >
              <option value="">-- Select a Book --</option>
              {books.map((book) => (
                <option key={book.book_id} value={book.book_id}>
                  {book.title}
                </option>
              ))}
            </select>
            <br />

            <h1><b>Lesson Number:</b></h1>
            <input
              type="number"
              className={styles.commentBox}
              placeholder="e.g., 1, 2, 3..."
              value={lessonData.lesson_number}
              onChange={(e) =>
                setLessonData({
                  ...lessonData,
                  lesson_number: e.target.value,
                })
              }
            />
            <br />

            <h1><b>Lesson Title:</b></h1>
            <textarea
              className={styles.commentBox}
              placeholder="Write your lesson title here..."
              value={lessonData.title}
              onChange={(e) =>
                setLessonData({ ...lessonData, title: e.target.value })
              }
            />
            <br />

            <h1><b>Upload File (PDF, DOC, DOCX, TXT):</b></h1>
            <input
              type="file"
              id="file-input"
              className={styles.fileInput}
              accept=".pdf,.doc,.docx,.txt"
              onChange={handleFileChange}
            />
            {lessonData.file && (
              <p className={styles.fileName}>📎 {lessonData.file.name}</p>
            )}
            <br />

            <button
              type="button"
              className={styles.submitComment}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Uploading..." : "Upload Lesson"}
            </button>
          </div>
        </div>

        {/* Right column */}
        <div className={styles.rightCard}>
          <div className={styles.rightContent}>
            <h1><b>Description (Optional):</b></h1>
            <textarea
              className={styles.postBox}
              placeholder="Write additional description or notes for this lesson..."
              value={lessonData.content}
              onChange={(e) =>
                setLessonData({ ...lessonData, content: e.target.value })
              }
            />
            <br />

            <div className={styles.infoBox}>
              <h3>📋 Instructions:</h3>
              <ul>
                <li>Select a book from the dropdown</li>
                <li>Enter the lesson number</li>
                <li>Add a lesson title</li>
                <li>Upload a file (PDF, DOC, DOCX, or TXT)</li>
                <li>Optionally add a description</li>
                <li>Click "Upload Lesson" to save</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

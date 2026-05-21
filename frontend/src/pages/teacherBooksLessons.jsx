// src/pages/BooksLessons.jsx
import { useEffect, useState } from "react";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/teacherBooksLessons.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";

export default function TeacherBooksLessons() {
  const { notify } = useNotification() || {};
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", description: "", coverFile: null });
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [editingBookId, setEditingBookId] = useState(null);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState("");
  const [uploadingLesson, setUploadingLesson] = useState(false);
  const [lessonData, setLessonData] = useState({
    title: "",
    content: "",
    file: null,
  });

  const API_BASE = "http://localhost:3001";



  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const teacherId = localStorage.getItem("teacher_id") || storedUser.id || storedUser.user_id || storedUser.userId || null;
  const [teacherCourses, setTeacherCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  useEffect(() => {
    fetchBooks();
    loadTeacherCourses();
  }, []);

  const loadTeacherCourses = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/teacher-courses`);
      if (!response.ok) throw new Error("Failed to fetch teacher courses");
      const data = await response.json();
      const courses = (data.teacherCourses || []).filter(
        (course) => String(course.teacher_id) === String(teacherId)
      );
      setTeacherCourses(courses);
      if (courses.length > 0) {
        setSelectedCourseId(courses[0].course_id);
      }
    } catch (err) {
      console.error("Error loading teacher courses:", err);
    }
  };

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/teacher/books?teacher_id=${teacherId}`);
      if (!response.ok) throw new Error("Failed to fetch books");
      
      const data = await response.json();
      setBooks(data.books || []);
    } catch (err) {
      console.error("Error fetching books:", err);
      setError(err.message);
      notify?.(`Error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBook = async () => {
    if (!newBook.title.trim()) {
      notify?.("Book title is required", "error");
      return;
    }

    try {
      if (!selectedCourseId) {
        notify?.("Please select a valid course before creating a book.", "error");
        return;
      }

      const formData = new FormData();
      formData.append("title", newBook.title);
      formData.append("description", newBook.description || "");
      formData.append("course_id", selectedCourseId);
      formData.append("teacher_id", teacherId);
      if (newBook.coverFile) {
        formData.append("cover", newBook.coverFile);
      }

      const response = await fetch("http://localhost:3001/api/books", {
        method: "POST",
        body: formData,
      });


      if (!response.ok) throw new Error("Failed to create book");

      notify?.("Book created successfully!", "success");
      setNewBook({ title: "", description: "", coverFile: null });
      setShowCreateModal(false);
      fetchBooks();

    } catch (err) {
      console.error("Error creating book:", err);
      notify?.(`Error: ${err.message}`, "error");
    }
  };

  const handleDeleteBook = async (bookId) => {
    if (!window.confirm("Are you sure you want to delete this book?")) return;

    try {
      const response = await fetch(`http://localhost:3001/api/books/${bookId}?teacher_id=${encodeURIComponent(teacherId)}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete book");

      notify?.("Book deleted successfully", "success");
      fetchBooks();
    } catch (err) {
      console.error("Error deleting book:", err);
      notify?.(`Error: ${err.message}`, "error");
    }
  };

  const openLessonModal = (bookId = "") => {
    setSelectedBook(bookId ? String(bookId) : "");
    setShowLessonModal(true);
  };

  const closeLessonModal = () => {
    setShowLessonModal(false);
    setSelectedBook("");
    setLessonData({
      title: "",
      content: "",
      file: null,
    });
  };

  const handleLessonFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setLessonData({ ...lessonData, file: null });
      return;
    }

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
  };

  const handleUploadLesson = async () => {
    if (!selectedBook.trim()) {
      notify?.("Please select a book", "error");
      return;
    }

    if (!lessonData.title.trim()) {
      notify?.("Lesson title is required", "error");
      return;
    }

    if (!lessonData.file) {
      notify?.("Please select a file to upload", "error");
      return;
    }

    try {
      setUploadingLesson(true);

      const formData = new FormData();
      formData.append("book_id", selectedBook);
      formData.append("title", lessonData.title);
      formData.append("content", lessonData.content || "");
      formData.append("file", lessonData.file);
      formData.append("teacher_id", teacherId);

      const response = await fetch(`${API_BASE}/api/lessons`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to create lesson");
      }

      notify?.("Lesson uploaded successfully!", "success");
      closeLessonModal();
      fetchBooks();
    } catch (err) {
      console.error("Error uploading lesson:", err);
      notify?.(`Error: ${err.message}`, "error");
    } finally {
      setUploadingLesson(false);
    }
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        {/* Top Section */}
        <div className={styles.TopSegment}>
          <div className={styles.TopContent}>
            <h1><b>Books & Lessons</b></h1>
            <p>Manage your course materials and resources.</p>
            <button 
              className={styles.createBookBtn}
              onClick={() => setShowCreateModal(true)}
            >
              + Create New Book
            </button>
          </div>
        </div>
        <br />

        {/* Loading/Error State */}
        {loading && <p className={styles.loading}>Loading books...</p>}
        {error && <p className={styles.error}>Error: {error}</p>}

        {/* Books Grid */}
        {!loading && books.length > 0 && (
          <div className={styles.AvailableLessons}>
            {books.map((book) => (
              <div key={book.book_id} className={styles.LessonsCard}>
                {book.cover_url ? (
                  <img className={styles.bookCover} src={`${API_BASE}${book.cover_url}`} alt="Book cover" />
                ) : (
                  <div className={styles.bookImagePlaceholder}>
                    <span className={styles.placeholder}>Book</span>
                  </div>
                )}

                <br />
                <h1><b>{book.title}</b></h1>
                <p className={styles.description}>{book.description || "No description"}</p>
                <div className={styles.Uploaded}>
                  <img src={userPic} alt="Teacher" />
                  <h3>You</h3>
                </div>
                <p className={styles.lessonCount}>{book.lesson_count || 0} lessons</p>
                <div className={styles.bookActions}>
                  <a href={`/teacherBooksLessons/${book.book_id}`}>
                    <button type="button" className={styles.viewBtn}>View</button>
                  </a>
                  <button
                    type="button"
                    className={styles.viewBtn}
                    onClick={() => openLessonModal(book.book_id)}
                  >
                    Upload Lesson
                  </button>
                  <button 
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteBook(book.book_id)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className={styles.viewBtn}
                    onClick={() => { setEditingBookId(book.book_id); setShowCoverModal(true); }}
                  >
                    Edit Cover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && books.length === 0 && (
          <div className={styles.noBooks}>
            <p>No books yet. Create your first book to get started!</p>
          </div>
        )}
      </div>

      {/* Create Book Modal */}
      {showCreateModal && (
        <div className={styles.modal}>
          <div className={`${styles.modalContent} ${styles.createBookModalContent}`}>
            <h2>Create New Book</h2>
            <label className={styles.formLabel}>
              Title:
              <input
                className={styles.modalField}
                type="text"
                placeholder="Enter book title..."
                value={newBook.title}
                onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
              />
            </label>
            <label className={styles.formLabel}>
              Description (optional):
              <textarea
                className={styles.modalTextarea}
                placeholder="Enter book description..."
                value={newBook.description}
                onChange={(e) => setNewBook({ ...newBook, description: e.target.value })}
              />
            </label>

            <label className={styles.formLabel}>
              Course:
              <select
                className={styles.modalField}
                value={selectedCourseId || ""}
                onChange={(e) => setSelectedCourseId(e.target.value || null)}
              >
                <option value="">Select course</option>
                {teacherCourses.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.course_name}
                  </option>
                ))}
              </select>
            </label>

            {!teacherCourses.length && (
              <p className={styles.error}>
                No courses are assigned to this teacher yet. Ask the administrator to assign a course before creating books.
              </p>
            )}

            <label className={styles.formLabel}>
              Cover (optional):
              <input
                className={styles.modalField}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setNewBook({ ...newBook, coverFile: file });
                }}
              />
            </label>

            <div className={styles.modalButtons}>

              <button onClick={handleCreateBook} className={styles.confirmBtn}>Create</button>
              <button onClick={() => setShowCreateModal(false)} className={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Lesson Modal */}
      {showLessonModal && (
        <div className={styles.modal}>
          <div className={`${styles.modalContent} ${styles.lessonModalContent}`}>
            <h2>Upload Lesson</h2>
            <p className={styles.autoLessonNote}>
              The lesson number will be assigned automatically.
            </p>

            <label>
              Lesson Title:
              <input
                className={styles.lessonInput}
                type="text"
                placeholder="Enter lesson title"
                value={lessonData.title}
                onChange={(e) =>
                  setLessonData({ ...lessonData, title: e.target.value })
                }
              />
            </label>

            <label>
              File:
              <input
                className={styles.lessonInput}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleLessonFileChange}
              />
            </label>

            {lessonData.file && (
              <p className={styles.selectedFileName}>{lessonData.file.name}</p>
            )}

            <label>
              Description (optional):
              <textarea
                className={styles.lessonTextarea}
                placeholder="Write additional notes for this lesson..."
                value={lessonData.content}
                onChange={(e) =>
                  setLessonData({ ...lessonData, content: e.target.value })
                }
              />
            </label>

            <div className={styles.modalButtons}>
              <button
                type="button"
                onClick={handleUploadLesson}
                className={styles.confirmBtn}
                disabled={uploadingLesson}
              >
                {uploadingLesson ? "Uploading..." : "Upload"}
              </button>
              <button type="button" onClick={closeLessonModal} className={styles.cancelBtn}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Cover Modal */}
      {showCoverModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Edit Book Cover</h2>
            <label>
              Select image:
              <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
            </label>

            <div className={styles.modalButtons}>
              <button
                className={styles.confirmBtn}
                onClick={async () => {
                  if (!coverFile || !editingBookId) {
                    notify?.("Please select an image", "error");
                    return;
                  }
                  try {
                    const fd = new FormData();
                    fd.append('cover', coverFile);
                    fd.append('teacher_id', teacherId);
                    const res = await fetch(`${API_BASE}/api/books/${editingBookId}`, {
                      method: 'PUT',
                      body: fd,
                    });
                    if (!res.ok) throw new Error('Failed to update cover');
                    notify?.('Cover updated', 'success');
                    setShowCoverModal(false);
                    setCoverFile(null);
                    setEditingBookId(null);
                    fetchBooks();
                  } catch (err) {
                    console.error(err);
                    notify?.(`Error: ${err.message}`, 'error');
                  }
                }}
              >
                Save
              </button>
              <button className={styles.cancelBtn} onClick={() => { setShowCoverModal(false); setCoverFile(null); setEditingBookId(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

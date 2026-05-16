// src/pages/BooksLessons.jsx
import { useEffect, useState } from "react";
import topImage from "../assets/img/Books-Lessons/top.jpg";
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

  const API_BASE = "http://localhost:3001";



  const teacherId = localStorage.getItem("teacher_id") || "1"; // Get from session
  const courseId = localStorage.getItem("course_id") || "1"; // Get from session

  useEffect(() => {
    fetchBooks();
  }, []);

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
      const formData = new FormData();
      formData.append("title", newBook.title);
      formData.append("description", newBook.description || "");
      formData.append("course_id", courseId);
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
      const response = await fetch(`http://localhost:3001/api/books/${bookId}`, {
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

        {/* Available Lessons Segment */}
        <div className={styles.AvailableLessonSegment}>
          <img src={topImage} alt="Top banner" />
          <div className={styles.ContentAvailable}>
            <h1><b>Your Published Books</b></h1>
            <p>
              Manage your books and lessons. Upload new lessons or edit existing ones
              to keep your course materials up to date.
            </p>
            <a href="/teacherBooksDropbox">+ Upload New Lesson</a>
          </div>
        </div>

        {/* Loading/Error State */}
        {loading && <p className={styles.loading}>Loading books...</p>}
        {error && <p className={styles.error}>Error: {error}</p>}

        {/* Books Grid */}
        {!loading && books.length > 0 && (
          <div className={styles.AvailableLessons}>
            {books.map((book) => (
              <div key={book.book_id} className={styles.LessonsCard}>
                {book.cover_url ? (
                  <img className={styles.bookCover} src={`${API_BASE}/${book.cover_url}`} alt="Book cover" />
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
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteBook(book.book_id)}
                  >
                    Delete
                  </button>
+                 <button
+                    type="button"
+                    className={styles.viewBtn}
+                    onClick={() => { setEditingBookId(book.book_id); setShowCoverModal(true); }}
+                  >
+                    Edit Cover
+                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && books.length === 0 && (
          <div className={styles.noBooks}>
            <p>No books yet. Create your first book to get started!</p>
            <button 
              className={styles.createBookBtn}
              onClick={() => setShowCreateModal(true)}
            >
              + Create Your First Book
            </button>
          </div>
        )}
      </div>

      {/* Create Book Modal */}
      {showCreateModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Create New Book</h2>
            <label>
              Title:
              <input
                type="text"
                placeholder="Enter book title..."
                value={newBook.title}
                onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
              />
            </label>
            <label>
              Description (optional):
              <textarea
                placeholder="Enter book description..."
                value={newBook.description}
                onChange={(e) => setNewBook({ ...newBook, description: e.target.value })}
              />
            </label>

            <label>
              Cover (optional):
              <input
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
+
+      {/* Edit Cover Modal */}
+      {showCoverModal && (
+        <div className={styles.modal}>
+          <div className={styles.modalContent}>
+            <h2>Edit Book Cover</h2>
+            <label>
+              Select image:
+              <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
+            </label>
+
+            <div className={styles.modalButtons}>
+              <button
+                className={styles.confirmBtn}
+                onClick={async () => {
+                  if (!coverFile || !editingBookId) {
+                    notify?.("Please select an image", "error");
+                    return;
+                  }
+                  try {
+                    const fd = new FormData();
+                    fd.append('cover', coverFile);
+                    const res = await fetch(`${API_BASE}/api/books/${editingBookId}`, {
+                      method: 'PUT',
+                      body: fd,
+                    });
+                    if (!res.ok) throw new Error('Failed to update cover');
+                    notify?.('Cover updated', 'success');
+                    setShowCoverModal(false);
+                    setCoverFile(null);
+                    setEditingBookId(null);
+                    fetchBooks();
+                  } catch (err) {
+                    console.error(err);
+                    notify?.(`Error: ${err.message}`, 'error');
+                  }
+                }}
+              >Save</button>
+              <button className={styles.cancelBtn} onClick={() => { setShowCoverModal(false); setCoverFile(null); setEditingBookId(null); }}>Cancel</button>
+            </div>
+          </div>
+        </div>
+      )}
*** End Patch
    </div>
  );
}

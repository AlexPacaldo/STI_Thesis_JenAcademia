// src/pages/BooksLessons.jsx
import { useEffect, useMemo, useState } from "react";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/teacherBooksLessons.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS, readNamespacedStorageValue } from "../utils/storageKeys.js";
import { API_BASE_URL } from "../utils/api.js";
import { compressFileIfImage } from "../utils/imageCompression.js";

const API_BASE = API_BASE_URL;

function absoluteUrl(url) {
  if (!url) return "";
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  // uploads paths arrive both with and without a leading slash; a bare concat
  // produces "localhost:3001uploads/..." with no separator, which 404s.
  if (cleaned.startsWith("/uploads/")) return `${API_BASE}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API_BASE}/${cleaned}`;
  return cleaned;
}

function formatArchivedAt(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archivingBookId, setArchivingBookId] = useState(null);
  const [archivingBookTitle, setArchivingBookTitle] = useState("");
  // 'active' | 'archived' - archived books are a soft delete, so the owner needs
  // a way to see them and bring them back.
  const [statusFilter, setStatusFilter] = useState("active");
  // Covers whose URL 404s. Tracked so we can swap in the placeholder instead of
  // hiding the image, which previously left an empty frame with the lesson
  // badge floating above it.
  const [coverErrors, setCoverErrors] = useState({});

  const storedUser = readStoredUser() || {};
  const teacherId = readNamespacedStorageValue(STORAGE_KEYS.teacherId, LEGACY_STORAGE_KEYS.teacherId) || storedUser.id || storedUser.user_id || storedUser.userId || null;
  const teacherProfileImageUrl = storedUser?.profileImageUrl || storedUser?.profile_image_url || "";
  const teacherPicUrl = useMemo(() => absoluteUrl(teacherProfileImageUrl) || userPic, [teacherProfileImageUrl]);
  const [teacherCourses, setTeacherCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  useEffect(() => {
    loadTeacherCourses();
  }, []);

  // Refetch whenever the active/archived filter changes.
  useEffect(() => {
    fetchBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

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
      const response = await fetch(
        `${API_BASE_URL}/api/teacher/books?teacher_id=${teacherId}&status=${statusFilter}`
      );
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
        const compressedCover = await compressFileIfImage(newBook.coverFile);
        formData.append("cover", compressedCover, compressedCover.name);
      }

      const response = await fetch(`${API_BASE_URL}/api/books`, {
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

  const handleArchiveBook = (bookId, bookTitle) => {
    setArchivingBookId(bookId);
    setArchivingBookTitle(bookTitle);
    setShowArchiveConfirm(true);
  };

  const confirmArchiveBook = async () => {
    if (!archivingBookId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/books/${archivingBookId}/archive?teacher_id=${encodeURIComponent(teacherId)}`, {
        method: "PUT",
      });

      if (!response.ok) throw new Error("Failed to archive book");

      notify?.("Book archived successfully", "success");
      setShowArchiveConfirm(false);
      setArchivingBookId(null);
      setArchivingBookTitle("");
      fetchBooks();
    } catch (err) {
      console.error("Error archiving book:", err);
      notify?.(`Error: ${err.message}`, "error");
    }
  };

  const handleRestoreBook = async (bookId, bookTitle) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/books/${bookId}/restore?teacher_id=${encodeURIComponent(teacherId)}`,
        { method: "PUT" }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to restore book");

      notify?.(`"${bookTitle}" restored`, "success");
      fetchBooks();
    } catch (err) {
      console.error("Error restoring book:", err);
      notify?.(`Error: ${err.message}`, "error");
    }
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        {/* Top Section - title/subtitle stacked left, action on the right */}
        <div className={styles.TopSegment}>
          <div className={styles.TopContent}>
            <div className={styles.TopContentText}>
              <h1>Books &amp; Lessons</h1>
              <p>Manage your course materials and resources.</p>
            </div>
            <div className={styles.TopContentActions}>
              <div className={styles.statusFilters} role="tablist" aria-label="Filter books">
                {[
                  { key: "active", label: "Active" },
                  { key: "archived", label: "Archived" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === option.key}
                    className={`${styles.statusFilter} ${statusFilter === option.key ? styles.statusFilterActive : ""}`}
                    onClick={() => setStatusFilter(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.createBookBtn}
                onClick={() => setShowCreateModal(true)}
              >
                <i className="bi bi-plus-lg" aria-hidden="true" />
                Create New Book
              </button>
            </div>
          </div>
        </div>

        {/* Loading/Error State */}
        {loading && <p className={styles.loading}>Loading books...</p>}
        {error && <p className={styles.error}>Error: {error}</p>}

        {/* Books Grid */}
        {!loading && books.length > 0 && (
          <div className={styles.AvailableLessons}>
            {books.map((book) => {
              const isArchived = book.status === "archived";
              return (
              <div key={book.book_id} className={`${styles.LessonsCard} ${isArchived ? styles.LessonsCardArchived : ""}`}>
                <div className={styles.coverWrap}>
                  {book.cover_url && !coverErrors[book.book_id] ? (
                    <img
                      className={styles.bookCover}
                      src={absoluteUrl(book.cover_url)}
                      alt=""
                      onError={() =>
                        setCoverErrors((prev) => ({ ...prev, [book.book_id]: true }))
                      }
                    />
                  ) : (
                    <div className={styles.bookImagePlaceholder}>
                      <span className={styles.placeholder}>Book</span>
                    </div>
                  )}
                  <span className={styles.lessonBadge}>
                    {book.lesson_count || 0} {book.lesson_count === 1 ? "lesson" : "lessons"}
                  </span>
                  {isArchived ? (
                    <span className={styles.archivedBadge}>Archived</span>
                  ) : null}
                </div>

                <div className={styles.cardBody}>
                  <h3 className={styles.bookTitle}>{book.title}</h3>
                  <p className={styles.description}>{book.description || "No description"}</p>

                  <div className={styles.Uploaded}>
                    <img src={teacherPicUrl} alt="" />
                    <span>Added by you</span>
                  </div>

                  <div className={styles.bookActions}>
                    {isArchived ? (
                      <>
                        <button
                          type="button"
                          className={styles.restoreBtn}
                          onClick={() => handleRestoreBook(book.book_id, book.title)}
                        >
                          <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                          Restore
                        </button>
                        {book.archived_at ? (
                          <p className={styles.archivedNote}>
                            Archived {formatArchivedAt(book.archived_at)}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <a href={`/teacherBooksLessons/${book.book_id}`} className={styles.viewAction}>
                          View Lessons
                        </a>
                        <div className={styles.secondaryActions}>
                          <button
                            type="button"
                            className={styles.editBtn}
                            onClick={() => { setEditingBookId(book.book_id); setShowCoverModal(true); }}
                          >
                            Edit Cover
                          </button>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => handleArchiveBook(book.book_id, book.title)}
                          >
                            Archive
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {!loading && books.length === 0 && (
          <div className={styles.noBooks}>
            {statusFilter === "archived" ? (
              <p>No archived books. Anything you archive will show up here and can be restored.</p>
            ) : (
              <p>No books yet. Create your first book to get started!</p>
            )}
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
                    const compressedCover = await compressFileIfImage(coverFile);
                    fd.append('cover', compressedCover, compressedCover.name);
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

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Archive Book</h2>
            <p>Are you sure you want to archive the book <strong>"{archivingBookTitle}"</strong>?</p>
            <p style={{ fontSize: "14px", color: "#666" }}>This will archive the book and all its associated lessons.</p>

            <div className={styles.modalButtons}>
              <button
                className={styles.confirmBtn}
                onClick={confirmArchiveBook}
              >
                Archive
              </button>
              <button 
                className={styles.cancelBtn} 
                onClick={() => { 
                  setShowArchiveConfirm(false); 
                  setArchivingBookId(null); 
                  setArchivingBookTitle(""); 
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

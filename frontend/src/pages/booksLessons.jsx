// src/pages/BooksLessons.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/booksLessons.module.css";
import userPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS, readNamespacedStorageValue } from "../utils/storageKeys.js";
import { API_BASE_URL } from "../utils/api.js";

const API_BASE = API_BASE_URL;

// Mirrors profileSrc() in remarks.jsx / assignmentsDropbox.jsx: uploads paths
// come back from the API both with and without a leading slash, and Windows
// paths may use "\". Returns the shared default when the teacher has no photo.
function profileSrc(url) {
  if (!url) return userPic;
  const cleaned = String(url).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/uploads/")) return `${API_BASE}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API_BASE}/${cleaned}`;
  return cleaned;
}


export default function StudentBooksLessons() {
  const { notify } = useNotification() || {};
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const courseId = readNamespacedStorageValue(STORAGE_KEYS.courseId, LEGACY_STORAGE_KEYS.courseId) || "1";

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const storedUser = readStoredUser() || {};
      const studentId = storedUser.id || storedUser.user_id || storedUser.userId;

      if (studentId) {
        const packageResponse = await fetch(`${API_BASE}/api/calendar/student-package/${studentId}`);
        if (packageResponse.ok) {
          const packageData = await packageResponse.json();
          if (Number(packageData.package?.classes_left) <= 0) {
            notify?.("Contact the admin for a new contract to view Books / Lessons.", "error");
            navigate("/Calendar");
            return;
          }
        }
      }

      const bookParams = new URLSearchParams({ course_id: courseId });
      if (studentId) bookParams.set("student_id", studentId);

      const response = await fetch(`${API_BASE}/api/books?${bookParams.toString()}`);
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

  const handleBookClick = (bookId) => {
    navigate(`/booksContent/${bookId}`);
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        {/* Compact page header. Previously this was two stacked cards - a
            "Books & Lessons" title block followed by a large banner with an
            "Available Lessons" heading and a paragraph of filler copy - which
            pushed every book below the fold. */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeaderMain}>
            <span className={styles.headerIcon} aria-hidden="true">
              <i className="bi bi-journal-bookmark-fill" />
            </span>
            <div className={styles.pageHeaderText}>
              <h1>Books &amp; Lessons</h1>
              <p>Explore the resources uploaded by your teachers.</p>
            </div>
          </div>
          {!loading && !error && books.length > 0 ? (
            <div className={styles.countTile}>
              <span className={styles.countValue}>{books.length}</span>
              <span className={styles.countLabel}>
                {books.length === 1 ? "Book" : "Books"}
              </span>
            </div>
          ) : null}
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
                  <img
                    className={styles.bookCover}
                    src={`${API_BASE}${book.cover_url.startsWith("/") ? "" : "/"}${book.cover_url}`}
                    alt=""
                  />
                ) : (
                  <div className={styles.bookImagePlaceholder}>
                    <span className={styles.placeholder}>Book</span>
                  </div>
                )}

                <div className={styles.cardBody}>
                  <h3 className={styles.bookTitle}>{book.title}</h3>
                  <div className={styles.Uploaded}>
                    <img
                      src={profileSrc(book.teacher_profile_image_url)}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.src = userPic;
                      }}
                    />
                    <span className={styles.uploadedBy}>
                      {book.author || book.teacher_name || "Teacher"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBookClick(book.book_id)}
                  >
                    View Lessons
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && books.length === 0 && (
          <div className={styles.noBooks}>
            <p>No books available yet. Check back soon!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// src/pages/BooksLessons.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/booksLessons.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS, readNamespacedStorageValue } from "../utils/storageKeys.js";
import { API_BASE_URL } from "../utils/api.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { apiFetch } from "../utils/apiAuth.js";

const API_BASE = API_BASE_URL;

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
            notify?.(
              "An active class plan is required to access Books & Lessons. Please contact the administrator about a new plan.",
              "error"
            );
            navigate("/Calendar");
            return;
          }
        }
      }

      const bookParams = new URLSearchParams({ course_id: courseId });
      if (studentId) bookParams.set("student_id", studentId);

      const response = await apiFetch(`${API_BASE}/api/books?${bookParams.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch books");

      const data = await response.json();
      setBooks(data.books || []);
    } catch (err) {
      console.error("Error fetching books:", err);
      const message = "We couldn’t load your books. Please try again.";
      setError(message);
      notify?.(message, "error");
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
        {error && <p className={styles.error}>{error}</p>}

        {/* Books Grid */}
        {!loading && books.length > 0 && (
          <div className={styles.AvailableLessons}>
            {books.map((book) => (
              <div key={book.book_id} className={styles.LessonsCard}>
                {book.cover_url ? (
                  <AuthenticatedImage
                    className={styles.bookCover}
                    src={book.cover_url}
                    alt=""
                  />
                ) : (
                  <div className={styles.bookImagePlaceholder}>
                    <span className={styles.placeholder}>Book</span>
                  </div>
                )}

                <div className={styles.cardBody}>
                  <h3 className={styles.bookTitle}>{book.title}</h3>
                  {/* A book can be distributed to several teachers at once, so
                      there is no single "uploaded by" person to show here. */}
                  <div className={styles.Uploaded}>
                    <i className="bi bi-people" aria-hidden="true" />
                    <span className={styles.uploadedBy}>
                      {book.author || book.teacher_names || "Assigned by the admin"}
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

// src/pages/teacherBooksLessons.jsx
//
// Read-only view of the books the admin distributed to this teacher. Teachers
// no longer create, edit, archive or delete books - that all lives in the admin
// dashboard - so this page is intentionally just a list with links through to
// the lessons and the students' progress.
import { useEffect, useState } from "react";
import styles from "../assets/teacherBooksLessons.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { readStoredUser } from "../utils/sessionUser.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS, readNamespacedStorageValue } from "../utils/storageKeys.js";
import { API_BASE_URL } from "../utils/api.js";

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

export default function TeacherBooksLessons() {
  const { notify } = useNotification() || {};
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Covers whose URL 404s. Tracked so we can swap in the placeholder instead of
  // hiding the image, which previously left an empty frame with the lesson
  // badge floating above it.
  const [coverErrors, setCoverErrors] = useState({});

  const storedUser = readStoredUser() || {};
  const teacherId = readNamespacedStorageValue(STORAGE_KEYS.teacherId, LEGACY_STORAGE_KEYS.teacherId) || storedUser.id || storedUser.user_id || storedUser.userId || null;

  useEffect(() => {
    fetchBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/api/teacher/books?teacher_id=${teacherId}&status=active`
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

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        {/* Same compact header as the student view: icon, title, one line of
            context and a count tile. The old stacked segment wasted the top of
            the page on a heading with nothing beside it. */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeaderMain}>
            <span className={styles.headerIcon} aria-hidden="true">
              <i className="bi bi-journal-bookmark-fill" />
            </span>
            <div className={styles.pageHeaderText}>
              <h1>Books &amp; Lessons</h1>
              <p>Books assigned to you by the administrator.</p>
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

        {loading && <p className={styles.loading}>Loading books...</p>}
        {error && <p className={styles.error}>Error: {error}</p>}

        {!loading && books.length > 0 && (
          <div className={styles.AvailableLessons}>
            {books.map((book) => (
              <div key={book.book_id} className={styles.LessonsCard}>
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

                <div className={styles.cardBody}>
                  <h3 className={styles.bookTitle}>{book.title}</h3>

                  {/* The course, not a person: these books are assigned to the
                      signed-in teacher, so an "uploaded by" name would just be
                      their own face. */}
                  <div className={styles.Uploaded}>
                    <i className="bi bi-mortarboard" aria-hidden="true" />
                    <span className={styles.uploadedBy}>
                      {book.course_name || "Course not set"}
                    </span>
                  </div>

                  <a href={`/teacherBooksLessons/${book.book_id}`} className={styles.viewAction}>
                    View Lessons
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && books.length === 0 && (
          <div className={styles.noBooks}>
            <p>No books assigned to you yet. The administrator will distribute them here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

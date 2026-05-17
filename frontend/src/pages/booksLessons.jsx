// src/pages/BooksLessons.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/booksLessons.module.css";
import topImage from "../assets/img/Books-Lessons/top.jpg";
import userPic from "../assets/img/Navbar/user.jpg";
import { useNotification } from "../components/NotificationContainer.jsx";

const API_BASE = "http://localhost:3001";


export default function StudentBooksLessons() {
  const { notify } = useNotification() || {};
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const courseId = localStorage.getItem("course_id") || "1";

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
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

      const response = await fetch(
        `http://localhost:3001/api/books?course_id=${courseId}`
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

  const handleBookClick = (bookId) => {
    navigate(`/booksContent/${bookId}`);
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        {/* Top Section */}
        <div className={styles.TopSegment}>
          <div className={styles.TopContent}>
            <h1><b>Books & Lessons</b></h1>
            <p>Explore the resources uploaded by your teachers.</p>
          </div>
        </div>
        <br />

        {/* Available Lessons Segment */}
        <div className={styles.AvailableLessonSegment}>
          <img src={topImage} alt="Top banner" />
          <div className={styles.ContentAvailable}>
            <h1><b>Available Lessons</b></h1>
            <p>
              You'll find a collection of lessons and books here designed to help
              you learn the English language. Whether you're just starting or
              looking to improve your skills, these resources will guide you step
              by step and make learning simple and enjoyable.
            </p>
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
                  <img
                    className={styles.bookCover}
                    src={`${API_BASE}${book.cover_url}`}
                    alt="Book cover"
                  />
                ) : (
                  <div className={styles.bookImagePlaceholder}>
                    <span className={styles.placeholder}>Book</span>
                  </div>
                )}

                <br />

                <h1><b>{book.title}</b></h1>
                <div className={styles.Uploaded}>
                  <img src={userPic} alt="Teacher" />
                  <h3>{book.author || "Your Teacher"}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => handleBookClick(book.book_id)}
                >
                  Check it out!
                </button>
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

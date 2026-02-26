// src/pages/BooksLessons.jsx
import styles from "../assets/teacherBooksLessons.module.css";
import topImage from "../assets/img/Books-Lessons/top.jpg";
import lesson1 from "../assets/img/Books-Lessons/lesson1.jpg";
import lesson2 from "../assets/img/Books-Lessons/lesson2.jpg";
import lesson3 from "../assets/img/Books-Lessons/card-lesson3.jpg";
import card1 from "../assets/img/Books-Lessons/card-lesson1.jpg";
import card2 from "../assets/img/Books-Lessons/card-lesson2.jpg";
import card3 from "../assets/img/Books-Lessons/card-lesson3.jpg";
import userPic from "../assets/img/Navbar/user.jpg";

export default function booksLessons() {
  return (
    <div className={styles.cont}>
    <div className={styles.center}>
      {/* Top Section */}
      <div className={styles.TopSegment}>
        <div className={styles.TopContent}>
          <h1><b>Books & Lessons</b></h1>
          <p>Explore the resources uploaded by your teachers.</p>
          <div className={styles.CourseCard}>
            <button type="button">Business English</button>
          </div>
        </div>
        </div>
        <br />
        
      {/* Available Lessons Segment */}
      <div className={styles.AvailableLessonSegment}>
        <img src={topImage} alt="Top banner" />
        <div className={styles.ContentAvailable}>
          <h1><b>Available Lessons</b></h1>
          <p>
            You’ll find a collection of lessons and books here designed to help
            you learn the English language. Whether you’re just starting or
            looking to improve your skills, these resources will guide you step
            by step and make learning simple and enjoyable.
          </p>
          <a href="/teacherBooksDropbox">Upload New Lesson</a>
        </div>
      </div>

      {/* Carousel Section */}
      <div className={styles.carouselSegment}>
        <div id="carouselExampleIndicators" className={`carousel slide`} data-bs-ride="carousel">
          <div className={`carousel-indicators`}>
            <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="0" className="active"></button>
            <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="1"></button>
            <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="2"></button>
          </div>

          <div className="carousel-inner">
            <div className={`carousel-item active ${styles.imgEdit}`}>
              <img src={lesson1} alt="First slide" />
            </div>
            <div className={`carousel-item ${styles.imgEdit}`}>
              <img src={lesson2} alt="Second slide" />
            </div>
            <div className={`carousel-item ${styles.imgEdit}`}>
              <img src={lesson3} alt="Third slide" />
            </div>
          </div>

          <button className="carousel-control-prev" type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide="prev">
            <span className="carousel-control-prev-icon" aria-hidden="true"></span>
          </button>
          <button className="carousel-control-next" type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide="next">
            <span className="carousel-control-next-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    <br />
      {/* Lesson Cards Section */}
      <div className={styles.AvailableLessons}>
        {[card1, card2, card3].map((card, index) => (
          <div key={index} className={styles.LessonsCard}>
            <img src={card} alt={`Lesson ${index + 1}`} />
            <br />
            <h1><b>Business English</b></h1>
            <div className={styles.Uploaded}>
              <img src={userPic} alt="Teacher" />
              <h3>Teacher Jen</h3>
            </div>
            <a href="/booksContent">
              <button type="button">Check it out!</button>
            </a>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

// src/pages/BooksContent.jsx
import styles from "../assets/booksContent.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";

export default function booksContent() {
  const glossary = [
    {
      term: "Courage",
      definition: "The ability to face fear or uncertainty with strength and confidence.",
    },
    {
      term: "Resilience",
      definition: "The capacity to recover quickly from difficulties; emotional toughness.",
    },
    {
      term: "Beginnings",
      definition: "The point in time or space at which something starts; a fresh start.",
    },
    {
      term: "Journey",
      definition: "An act of traveling from one place to another, both physically and emotionally.",
    },
  ];

  return (
    <div className={styles.Center}>
      <div className={styles.CenterContent}>
        {/* Top Section */}
        <div className={styles.TopContent}>
          <div className={styles.Teacher}>
            <img src={teacherPic} alt="Teacher" />
            <h1>
              <b>Teacher Jen</b>
            </h1>
          </div>
          <div className={styles.Date}>
            <h1>
              <b>June 09, 2025</b>
            </h1>
          </div>
        </div>

        {/* Book Layout */}
        <div className={styles.bookLayout}>
          <div className={styles.bookContent}>
            <h2>Chapter 1: The Journey Begins</h2>
            <p>
              The wind whispered softly across the pages of her open book, carrying the scent of
              rain and distant memories. This chapter explores the courage it takes to start
              something new — and the beauty found in every beginning.
            </p>
            <p>
              As you read through, notice how each passage connects to the meanings provided on the
              right. These definitions aim to help deepen your understanding of key ideas used
              throughout this chapter.
            </p>
          </div>

          {/* Glossary Section */}
          <div className={styles.glossarySection}>
            {glossary.map((g, index) => (
              <div key={index} className={styles.glossaryBox}>
                <h5>
                  <strong>{g.term}</strong>
                </h5>
                <p>{g.definition}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

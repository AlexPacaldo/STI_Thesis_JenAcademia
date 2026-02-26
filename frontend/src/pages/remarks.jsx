// src/pages/Remarks.jsx
import styles from "../assets/remarks.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";

export default function Remarks() {
  const remarks = [
    {
      id: 1,
      teacher: "Teacher Jen",
      date: "Oct 1, 2025",
      text: "The student actively participates in class and communicates clearly. Confidence and vocabulary show steady improvement.",
      avatar: teacherPic,
    },
    {
      id: 2,
      teacher: "Teacher Jen",
      date: "Oct 2, 2025",
      text: "The student demonstrates excellent comprehension and applies feedback effectively. Great enthusiasm during lessons.",
      avatar: teacherPic,
    },
    {
      id: 3,
      teacher: "Teacher Jen",
      date: "Oct 3, 2025",
      text: "The student demonstrates excellent comprehension and applies feedback effectively. Great enthusiasm during lessons.",
      avatar: teacherPic,
    },
    {
      id: 4,
      teacher: "Teacher Jen",
      date: "Oct 4, 2025",
      text: "The student demonstrates excellent comprehension and applies feedback effectively. Great enthusiasm during lessons.",
      avatar: teacherPic,
    },
    {
      id: 5,
      teacher: "Teacher Jen",
      date: "Oct 5, 2025",
      text: "The student demonstrates excellent comprehension and applies feedback effectively. Great enthusiasm during lessons.",
      avatar: teacherPic,
    },
  ];

  return (
    <section className={styles.Center}>
      <div className={styles.CenterContent}>
        <br />
        <h1><b>Teacher’s Remarks</b></h1>

        {remarks.map((r) => (
          <div key={r.id} className={styles.remarksCard}>
            <div className={styles.remarksHeader}>
              <div className={styles.teacherInfo}>
                <img src={r.avatar} alt={r.teacher} className={styles.avatar} />
                <h3>{r.teacher}</h3>
              </div>
              <span className={styles.date}>{r.date}</span>
            </div>
            <p>{r.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

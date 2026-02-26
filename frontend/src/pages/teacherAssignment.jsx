import { useMemo, useState } from "react";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/teacherAssignment.module.css";
import userPic from "../assets/img/Navbar/user.jpg"; // adjust if needed

export default function AssignTask() {
  const { notify } = useNotification() || {};
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("Alexander John Pacaldo");
  const [due, setDue] = useState("");
  const [instructions, setInstructions] = useState("");

  const students = useMemo(
    () => [
      "Alexander John Pacaldo",
      "James Layton",
      "Samantha Calvin",
      "Layla James",
      "Karol Basagre",
      "Jessie Gray",
      "Ariana Grande",
    ],
    []
  );

  const filtered = students.filter((s) =>
    s.toLowerCase().includes(query.toLowerCase())
  );

  const onSubmit = () => {
    if (!selected || !due || !instructions.trim()) {
      notify("Please select a student, set a due date, and add instructions.", "warning");
      return;
    }
    // TODO: send to API
    console.log({ student: selected, due, instructions });
    notify("Assignment created!", "success");
    setInstructions("");
    setDue("");
  };

  return (
    <div className={styles.cont}>
    <div className={styles.Center}>
      {/* Left column */}
      <div className={styles.leftCard}>
        <div className={styles.searchContainer}>
          {/* Requires Bootstrap Icons CSS globally if you keep <i>. Or replace with your own SVG. */}
          <i className="bi bi-search" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search students"
          />
        </div>

        {filtered.map((name) => (
          <button
            key={name}
            type="button"
            className={`${styles.boxCard} ${selected === name ? styles.Active : ""}`}
            onClick={() => setSelected(name)}
          >
            <h1>{name}</h1>
          </button>
        ))}
      </div>

      {/* Right column */}
      <div className={styles.rightCard}>
        <div className={styles.rightContent}>
          <div className={styles.user}>
            <img src={userPic} alt="Selected student" />
            <h1>{selected}</h1>
          </div>

          <div className={styles.bottomInfo}>
            <div className={styles.infoCard}>
              <div className={styles.Date}>
                <label htmlFor="due" className={styles.label}>
                  <b>Due Date:</b>
                </label>
                <input
                  id="due"
                  type="datetime-local"
                  className={styles.dateBox}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </div>
                <br />
              <div className={styles.Instructions}>
                <h4>Instructions:</h4>
                <textarea
                  id="comment"
                  className={styles.commentBox}
                  placeholder="Write your instructions here..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
                <button type="button" className={styles.submitComment} onClick={onSubmit}>
                  Submit Remarks
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

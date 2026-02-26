// src/pages/AssignmentDetail.jsx
import { useRef, useState } from "react";
import styles from "../assets/assignmentsDropbox.module.css";
import teacherPic from "../assets/img/Navbar/user.jpg";

export default function assignmentsDropbox() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [comment, setComment] = useState("");

  const onPickFile = () => fileInputRef.current?.click();
  const onFileChange = (e) => setFile(e.target.files?.[0] ?? null);
  const onSubmitComment = () => {
    if (!comment.trim()) return;
    // TODO: send comment to API
    console.log("comment:", comment);
    setComment("");
  };

  return (
   <div className={styles.cont}>
    <div className={styles.center}>
      <div className={styles.centerContent}>
        <h1><b>Activity 1</b></h1>
      </div>
      <br />

      <div className={styles.instruction}>
        <h1>Instructions</h1>
      </div>
      <br />
      <div className={styles.instructionContent}>
        {/* Left column */}
        <div className={styles.leftSide}>
          <p>
            This assignment requires you to analyze the role of social media in contemporary
            political discourse and construct an evidence-based argument for its positive or
            negative impact on political polarization. You will demonstrate your ability to
            research complex topics, synthesize academic sources, and articulate a focused thesis.
            <br />
            <br />
            <b>Task:</b>
            <br />
            Develop a clear, arguable thesis stating your position on the primary effect of social
            media (positive, negative, or mixed) on political polarization in a specific country or
            region.
            <br />
            <br />
            Support your thesis using logical reasoning and evidence from credible sources.
            <br />
            <br />
            The essay must include an introduction with your thesis, well-structured body
            paragraphs, and a compelling conclusion.
            <br />
          </p>

          <button type="button" className={styles.uploadBtn} onClick={onPickFile}>
            {file ? `Selected: ${file.name}` : "Upload File"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            id="formFile"
            hidden
            onChange={onFileChange}
          />
        </div>

        {/* Right column */}
        <div className={styles.rightSide}>
          <div className={styles.card}>
            <img src={teacherPic} alt="Teacher" className={styles.teacherImg} />
            <span>
              <b>Teacher Jen</b>
            </span>
            <br /><br />
            <h2>English 101</h2>
            <p>
              <strong>Due Date:</strong> November 10, 2025
            </p>

            <label htmlFor="comment" className={styles.label}>
              <b>Comments:</b>
            </label>
            <textarea
              id="comment"
              className={styles.commentBox}
              placeholder="Write your comment here..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button type="button" className={styles.submitComment} onClick={onSubmitComment}>
              Submit Comment
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
    
  );
}

// src/pages/Notes.jsx
import { useState } from "react";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/teacherBooksDropbox.module.css";

export default function Notes() {
  const { notify } = useNotification() || {};
  // left side (word + description)
  const [word, setWord] = useState("");
  const [desc, setDesc] = useState("");
  const [preview, setPreview] = useState([
    { id: 1, word: "Courage", desc: "The ability to face fear or uncertainty with strength and confidence." },
    { id: 2, word: "Resilience", desc: "The capacity to recover quickly from difficulties; emotional toughness." },
  ]);

  // right side (title + content)
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const addWord = () => {
    if (!word.trim() || !desc.trim()) return;
    setPreview((p) => [...p, { id: Date.now(), word: word.trim(), desc: desc.trim() }]);
    setWord("");
    setDesc("");
  };

  const submitPost = () => {
    if (!title.trim() || !content.trim()) return;
    // TODO: send { title, content, preview } to API
    console.log({ title, content, preview });
    setTitle("");
    setContent("");
    notify("Note submitted!", "success");
  };

  return (
    <div className={styles.Cont}>
    <div className={styles.Center}>
      {/* Left column */}
      <div className={styles.leftCard}>
        <div className={styles.words}>
          <h1><b>Words:</b></h1>
          <textarea
            id="word"
            className={styles.commentBox}
            placeholder="Write your word to note here..."
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
          <br />
          <h1><b>Description:</b></h1>
          <textarea
            id="description"
            className={styles.commentBox}
            placeholder="Write your description to note here..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <br />
          <button type="button" className={styles.submitComment} onClick={addWord}>
            Submit
          </button>
          <br />
        </div>

        <div className={styles.wordPreview}>
          {preview.map((item) => (
            <div key={item.id} className={styles.card}>
              <h1>{item.word}</h1>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right column */}
      <div className={styles.rightCard}>
        <div className={styles.rightContent}>
          <h1><b>Title:</b></h1>
          <textarea
            id="title"
            className={styles.commentBox}
            placeholder="Write your title to note here..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
            <br />
          <h1><b>Content:</b></h1>
          <textarea
            id="content"
            className={styles.postBox}
            placeholder="Write your content to note here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
            <br />
          <button type="button" className={styles.submitComment} onClick={submitPost}>
            Submit
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}

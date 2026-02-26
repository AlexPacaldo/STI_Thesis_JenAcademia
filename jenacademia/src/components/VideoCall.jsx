import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useNotification } from "./NotificationContainer.jsx";
import styles from "../assets/videoCall.module.css";

export default function VideoCall() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/video-sessions/${classId}`);
        const data = await response.json();
        
        if (!response.ok) {
          notify("Video session not found", "error");
          return;
        }

        setSession(data.session);
      } catch (err) {
        console.error(err);
        notify("Failed to load video session", "error");
      } finally {
        setLoading(false);
      }
    };

    if (classId) {
      fetchSession();
    }
  }, [classId, notify]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingMessage}>Loading video session...</div>
      </div>
    );
  }

  if (!session || !session.teams_meeting_link) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMessage}>
          <h2>Video Session Not Available</h2>
          <p>No Teams meeting link available for this class.</p>
          <button onClick={() => navigate(-1)} className={styles.backBtn}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.videoCard}>
        <div className={styles.header}>
          <h1>Join Class</h1>
          <button onClick={() => navigate(-1)} className={styles.closeBtn} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.content}>
          <a
            href={session.teams_meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.joinBtn}
          >
            <span className={styles.icon}>🎥</span>
            <span>Join Microsoft Teams Meeting</span>
          </a>

          <div className={styles.info}>
            <p className={styles.label}>Meeting Status:</p>
            <p className={styles.status}>{session.status}</p>
          </div>

          <div className={styles.instructions}>
            <h3>Instructions:</h3>
            <ul>
              <li>Click the button above to open the Teams meeting</li>
              <li>Ensure your microphone and camera are working</li>
              <li>Join on time to avoid missing the class</li>
              <li>Keep your audio muted unless speaking</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

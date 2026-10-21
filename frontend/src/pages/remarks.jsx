// src/pages/Remarks.jsx
import { useEffect, useState } from "react";
import teacherPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/remarks.module.css";
import { readStoredUser } from "../utils/sessionUser.js";
import { API_BASE_URL } from "../utils/api.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";
import { apiFetch } from "../utils/apiAuth.js";

const API = API_BASE_URL;

export default function Remarks() {
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const user = readStoredUser();
  const studentId = user?.id ?? user?.user_id ?? null;

  useEffect(() => {
    if (!studentId) return;

    setLoading(true);
    setError("");

    apiFetch(`${API}/api/student/${studentId}/remarks`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Could not load remarks");
        }
        return res.json();
      })
      .then((data) => {
        setRemarks(data.remarks || []);
      })
      .catch((err) => {
        console.error("Load remarks error:", err);
        setRows([]);
        setError(err.message || "Could not load remarks.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [studentId]);

  return (
    <div className={styles.page}>
      {loading ? (
        <div className={styles.loadingCard}>
          <span className={styles.loadingIcon} aria-hidden="true">⏳</span>
          <span className={styles.loadingText}>Loading your remarks...</span>
        </div>
      ) : error ? (
        <div className={styles.errorBanner}>{error}</div>
      ) : remarks.length === 0 ? (
        <div className={styles.emptyCard}>
          <span className={styles.emptyIcon} aria-hidden="true">💬</span>
          <h2 className={styles.emptyTitle}>No remarks yet</h2>
          <p className={styles.emptyText}>
            When your teacher leaves you a note, it will show up here.
          </p>
        </div>
      ) : (
        <>
          <h2 className={styles.sectionTitle}>Teacher's remarks</h2>
          {remarks.map((remark) => (
            <article key={remark.remark_id} className={styles.remarkCard}>
              <div className={styles.remarkInfo}>
                <AuthenticatedImage
                  src={remark.teacher_profile_image_url}
                  alt=""
                  className={styles.avatar}
                  fallback={<img src={teacherPic} alt="" className={styles.avatar} />}
                />
                <div className={styles.cardText}>
                  <span className={styles.cardTeacher}>{remark.teacher_name || "Teacher"}</span>
                  <span className={styles.cardTextBody}>
                    {remark.remarks || "Your teacher left you a note."}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  );
}

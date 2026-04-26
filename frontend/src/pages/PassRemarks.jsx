// src/pages/PassRemarks.jsx
import { useEffect, useState } from "react";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/teacherSchedule.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";

export default function PassRemarks() {
  const { notify } = useNotification() || {};
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [remarks, setRemarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teacherId, setTeacherId] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      setError("Please log in first.");
      setLoading(false);
      return;
    }

    let user;
    try {
      user = JSON.parse(stored);
    } catch (err) {
      setError("Unable to read current user data.");
      setLoading(false);
      return;
    }

    const currentUserId = user.id || user.user_id || null;
    if (!currentUserId || user.role !== "teacher") {
      setError("Remarks are available only for teachers.");
      setLoading(false);
      return;
    }

    setTeacherId(currentUserId);
    fetch(`http://localhost:3001/api/teacher/${currentUserId}/students`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Failed to load students.");
        }
        return res.json();
      })
      .then((data) => {
        setStudents(data.students || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Failed to load student list.");
        setLoading(false);
      });
  }, []);

  const selectedStudent = students.find((student) => student.user_id === selectedStudentId) || null;

  const handleRemarkChange = (text) => {
    if (!selectedStudentId) return;
    setRemarks((prev) => ({ ...prev, [selectedStudentId]: text }));
  };

  const handleSubmit = async () => {
    if (!selectedStudentId) {
      notify("Select a student first.", "warning");
      return;
    }

    const text = (remarks[selectedStudentId] || "").trim();
    if (text === "") {
      notify("Please write a remark before submitting.", "warning");
      return;
    }

    if (!teacherId) {
      notify("Teacher information is missing.", "error");
      return;
    }

    try {
      const classRes = await fetch(
        `http://localhost:3001/api/teacher/${teacherId}/student/${selectedStudentId}/latest-class`
      );
      if (!classRes.ok) {
        const errData = await classRes.json().catch(() => ({}));
        notify(errData.message || "No class available for this student.", "warning");
        return;
      }

      const { class: latestClass } = await classRes.json();
      if (!latestClass || !latestClass.class_id) {
        notify("No class found for this student.", "warning");
        return;
      }

      const submitRes = await fetch("http://localhost:3001/api/calendar/remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: latestClass.class_id,
          teacher_id: teacherId,
          student_id: selectedStudentId,
          remarks: text,
          rating: null,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        notify(submitData.message || "Could not submit remark.", "error");
        return;
      }

      notify("Remark submitted successfully!", "success");
      setRemarks((prev) => ({ ...prev, [selectedStudentId]: "" }));
    } catch (err) {
      console.error(err);
      notify("Server error while submitting remark.", "error");
    }
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        <div className={styles.leftCard}>
          <div style={{ padding: 16 }}>
            <h2>Enrolled Students</h2>
            {loading && <p>Loading students...</p>}
            {error && <p style={{ color: "#dc2626" }}>{error}</p>}
            {!loading && !error && students.length === 0 && (
              <p>No students are currently assigned to this teacher.</p>
            )}
          </div>
          {students.map((student) => (
            <div
              key={student.user_id}
              className={`${styles.boxCard} ${selectedStudentId === student.user_id ? styles.selected : ""}`}
              onClick={() => setSelectedStudentId(student.user_id)}
              style={{ cursor: "pointer" }}
            >
              <h1>{`${student.first_name} ${student.last_name}`}</h1>
              <p style={{ fontSize: "0.9rem", marginTop: 6 }}>{student.email}</p>
            </div>
          ))}
        </div>

        <div className={styles.rightCard}>
          <div className={styles.rightContent}>
            {selectedStudent ? (
              <>
                <div className={styles.user}>
                  <img src={userPic} alt={`${selectedStudent.first_name} ${selectedStudent.last_name}`} />
                  <h1>{`${selectedStudent.first_name} ${selectedStudent.last_name}`}</h1>
                </div>

                <div className={styles.bottomInfo}>
                  <div className={styles.infoCard}>
                    <h1>Personal Information</h1>
                    <p>Email: {selectedStudent.email}</p>
                    <p>Contact: {selectedStudent.contact || "Not provided"}</p>
                    <p>Level: {selectedStudent.proficiency_level || "Unknown"}</p>
                    <p>Course ID: {selectedStudent.course_id || "N/A"}</p>
                  </div>

                  <div className={styles.remarksBox}>
                    <h1>Remarks:</h1>
                    <textarea
                      id="comment"
                      className={styles.commentBox}
                      placeholder="Write your remarks here..."
                      value={remarks[selectedStudentId] || ""}
                      onChange={(e) => handleRemarkChange(e.target.value)}
                    />
                    <button className={styles.submitComment} onClick={handleSubmit}>
                      Submit Remarks
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 20 }}>
                <h2>Select a student to view details and add remarks</h2>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

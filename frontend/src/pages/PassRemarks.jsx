// src/pages/PassRemarks.jsx
import { useState } from "react";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/teacherSchedule.module.css";
import userPic from "../assets/img/Navbar/user.jpg";

export default function teacherSchedule() {
  const { notify } = useNotification() || {};
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [remarks, setRemarks] = useState({});

  const students = [
    { id: 101, name: "John Doe", studentId: "S-121", level: "Pro", age: 20, email: "john.doe@example.com", contact: "0912345678" },
    { id: 102, name: "Jane Smith", studentId: "S-122", level: "Pro", age: 21, email: "jane.smith@example.com", contact: "0912345679" },
    { id: 103, name: "Mike Johnson", studentId: "S-123", level: "Beginner", age: 19, email: "mike.j@example.com", contact: "0912345680" },
    { id: 104, name: "Sarah Williams", studentId: "S-124", level: "Intermediate", age: 22, email: "sarah.w@example.com", contact: "0912345681" },
    { id: 105, name: "Alex Brown", studentId: "S-125", level: "Pro", age: 23, email: "alex.b@example.com", contact: "0912345682" },
    { id: 106, name: "Emma Davis", studentId: "S-126", level: "Pro", age: 20, email: "emma.d@example.com", contact: "0912345683" },
  ];

  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;

  const handleRemarkChange = (text) => {
    if (!selectedStudentId) return;
    setRemarks((prev) => ({ ...prev, [selectedStudentId]: text }));
  };

  const handleSubmit = () => {
    if (!selectedStudentId) {
      notify("Select a student first.", "warning");
      return;
    }
    const text = (remarks[selectedStudentId] || "").trim();
    if (text === "") {
      notify("Please write a remark before submitting.", "warning");
      return;
    }
    console.log("Submitted remark for", selectedStudentId, text);
    notify("Remark submitted successfully!", "success");
    setRemarks((prev) => ({ ...prev, [selectedStudentId]: "" }));
  };

  return (
    <div className={styles.cont}>
      <div className={styles.center}>
        {/* Left student list */}
        <div className={styles.leftCard}>
          {students.map((student) => (
            <div
              key={student.id}
              className={`${styles.boxCard} ${selectedStudentId === student.id ? styles.selected : ""}`}
              onClick={() => setSelectedStudentId(student.id)}
              style={{ cursor: "pointer" }}
            >
              <h1>{student.name}</h1>
              <p style={{ fontSize: "0.9rem", marginTop: 6 }}>{student.studentId}</p>
            </div>
          ))}
        </div>

        {/* Right info card */}
        <div className={styles.rightCard}>
          <div className={styles.rightContent}>
            {selectedStudent ? (
              <>
                <div className={styles.user}>
                  <img src={userPic} alt={selectedStudent.name} />
                  <h1>{selectedStudent.name}</h1>
                </div>

                <div className={styles.bottomInfo}>
                  <div className={styles.infoCard}>
                    <h1>Personal Information</h1>
                    <p>Student ID: {selectedStudent.studentId}</p>
                    <p>Student level: {selectedStudent.level}</p>
                    <p>Age: {selectedStudent.age}</p>
                    <p>Email: {selectedStudent.email}</p>
                    <p>Contact: {selectedStudent.contact}</p>
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

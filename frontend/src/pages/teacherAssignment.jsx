import { useEffect, useMemo, useState } from "react";
import userPic from "../assets/img/Navbar/user.jpg";
import styles from "../assets/teacherAssignment.module.css";
import { useNotification } from "../components/NotificationContainer.jsx";
import { addLocalNotification } from "../utils/localNotificationStore.js";

export default function AssignTask() {
  const { notify } = useNotification() || {};
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [due, setDue] = useState("");
  const [instructions, setInstructions] = useState("");
  const [activeTab, setActiveTab] = useState("assign");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [enrolledStudents, setEnrolledStudents] = useState([]);

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const teacherName = currentUser.firstName
    ? `${currentUser.firstName} ${currentUser.lastName || ""}`.trim()
    : currentUser.name || currentUser.fullName || "You";

  // Fetch enrolled students from API
  useEffect(() => {
    const currentUserId = currentUser.id ?? currentUser.user_id ?? null;
    if (!currentUserId) return;

    fetch(`http://localhost:3001/api/teacher/${currentUserId}/students`)
      .then(async (res) => {
        if (!res.ok) {
          console.warn("Failed to fetch enrolled students");
          return;
        }
        return res.json();
      })
      .then((data) => {
        const studentNames = (data.students || []).map(
          (s) => `${s.first_name || ""} ${s.last_name || ""}`.trim()
        );
        setEnrolledStudents(studentNames);
      })
      .catch((err) => {
        console.error("Error fetching enrolled students:", err);
      });
  }, [currentUser.id, currentUser.user_id]);

  const [teacherAssignments, setTeacherAssignments] = useState(() => {
    const stored = localStorage.getItem("teacherAssignments");
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem("teacherAssignments", JSON.stringify(teacherAssignments));
  }, [teacherAssignments]);

  // ✅ No hardcoded fallback — always read real student submissions
  const [submissions, setSubmissions] = useState(() => {
    const stored = localStorage.getItem("studentSubmissions");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("studentSubmissions", JSON.stringify(submissions));
  }, [submissions]);

  // ✅ Cross-tab sync via storage event
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "studentSubmissions") {
        if (event.newValue) {
          try {
            setSubmissions(JSON.parse(event.newValue));
          } catch {
            setSubmissions([]);
          }
        } else {
          setSubmissions([]);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // ✅ Same-tab polling — catches submissions made within the same browser session
  useEffect(() => {
    const interval = setInterval(() => {
      const stored = localStorage.getItem("studentSubmissions");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Only update if data actually changed (avoid unnecessary re-renders)
          setSubmissions((prev) => {
            const prevStr = JSON.stringify(prev);
            const nextStr = JSON.stringify(parsed);
            return prevStr === nextStr ? prev : parsed;
          });
        } catch {
          // ignore
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const currentSubmissions = submissions.filter((item) => {
    const submittedFor = item.assignedStudent || item.student;
    return submittedFor === selected;
  });

  const students = useMemo(() => {
    const currentTeacherId = currentUser.id ?? currentUser.user_id ?? null;
    const names = new Set();

    // Add all enrolled students from API
    enrolledStudents.forEach((name) => {
      if (name) names.add(name);
    });

    // Add students from teacher assignments
    teacherAssignments.forEach((assignment) => {
      if (currentTeacherId && assignment.teacherId === currentTeacherId) {
        if (assignment.student) names.add(assignment.student);
      }
    });

    // Add students from submissions
    submissions.forEach((item) => {
      const submittedFor = item.assignedStudent || item.student;
      if (submittedFor) {
        if (currentTeacherId) {
          if (item.teacherId === currentTeacherId || item.teacherName === teacherName) {
            names.add(submittedFor);
          }
        } else {
          names.add(submittedFor);
        }
      }
    });

    return Array.from(names);
  }, [teacherAssignments, submissions, currentUser.id, currentUser.user_id, teacherName, enrolledStudents]);

  const filtered = students.filter((s) =>
    s.toLowerCase().includes(query.toLowerCase())
  );

  const onSubmit = () => {
    if (!selected || !due || !instructions.trim()) {
      notify("Please select a student, set a due date, and add instructions.", "warning");
      return;
    }

    const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
    const teacherName = currentUser.firstName
      ? `${currentUser.firstName} ${currentUser.lastName}`
      : "Teacher Jen";

    const assignment = {
      id: Date.now(),
      student: selected,
      teacherName,
      teacherId: currentUser.id ?? null,
      name: `Task for ${selected}`,
      subject: "Assigned by Teacher",
      due,
      instructions,
      description: instructions,
      postedAt: new Date().toLocaleString(),
      score: "Pending",
    };

    setTeacherAssignments((prev) => [...prev, assignment]);

    addLocalNotification({
      recipientName: selected,
      senderName: teacherName,
      message: `New assignment posted by ${teacherName}: "${assignment.name}" due ${due}.`,
      type: "assignment",
      title: "New Assignment",
    });

    notify("Assignment posted to student!", "success");
    setInstructions("");
    setDue("");
  };

  return (
    <div className={styles.cont}>
      <div className={styles.Center}>
        {/* Left column */}
        <div className={styles.leftCard}>
          <div className={styles.searchContainer}>
            <i className="bi bi-search" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search students"
            />
          </div>

          {filtered.length > 0 ? (
            filtered.map((name) => (
              <button
                key={name}
                type="button"
                className={`${styles.boxCard} ${selected === name ? styles.Active : ""}`}
                onClick={() => {
                  setSelected(name);
                  setSelectedSubmission(null); // ✅ clear detail panel when switching students
                }}
              >
                <h1>{name}</h1>
              </button>
            ))
          ) : (
            <div className={styles.emptyState} style={{ padding: 18 }}>
              No students are currently assigned to this teacher.
            </div>
          )}
        </div>

        {/* Right column */}
        <div className={styles.rightCard}>
          <div className={styles.rightContent}>
            <div className={styles.tabBar} role="tablist">
              <button
                type="button"
                className={`${styles.tabButton} ${activeTab === "assign" ? styles.activeTab : ""}`}
                onClick={() => setActiveTab("assign")}
              >
                Assign Task
              </button>
              <button
                type="button"
                className={`${styles.tabButton} ${activeTab === "submissions" ? styles.activeTab : ""}`}
                onClick={() => setActiveTab("submissions")}
              >
                View Submissions
              </button>
            </div>

            {activeTab === "assign" ? (
              <>
                <div className={styles.user}>
                  <img src={userPic} alt="Selected student" />
                  <div>
                    <h1>{selected || "Select a student"}</h1>
                  </div>
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
                        Create Assignment
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.submissionsPanel}>
                <h2>{selected}'s Submissions</h2>
                <div className={styles.submissionList}>
                  {currentSubmissions.length === 0 ? (
                    <div className={styles.emptyState}>
                      No submissions found for {selected}.
                    </div>
                  ) : (
                    currentSubmissions.map((item) => (
                      <div key={item.id} className={styles.submissionRow}>
                        <div>
                          <strong>{item.student}</strong>
                          <p>{item.assignmentName || "Assignment"}</p>
                          <p>{item.comments || item.file || "Comment submission"}</p>
                          <p className={styles.submissionMeta}>{item.submittedAt}</p>
                        </div>
                        <div className={styles.submissionActions}>
                          <span className={styles.submissionStatus}>{item.status}</span>
                          <button
                            type="button"
                            className={styles.submissionAction}
                            onClick={() => {
                              setSelectedSubmission(item);
                            }}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedSubmission ? (
                  <div className={styles.submissionDetail}>
                    <h3>Submission Details</h3>
                    <p><strong>Student:</strong> {selectedSubmission.student}</p>
                    <p><strong>Assignment:</strong> {selectedSubmission.assignmentName || "Assignment"}</p>
                    <p><strong>Submission:</strong> {selectedSubmission.comments || selectedSubmission.file || "Comment submission"}</p>
                    <p><strong>Status:</strong> {selectedSubmission.status}</p>
                    <p><strong>Submitted at:</strong> {selectedSubmission.submittedAt}</p>
                    <button
                      type="button"
                      className={styles.closeDetail}
                      onClick={() => setSelectedSubmission(null)}
                    >
                      Close
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

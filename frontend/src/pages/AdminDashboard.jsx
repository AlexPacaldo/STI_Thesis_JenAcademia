import { useEffect, useState } from "react";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/AdminDashboard.module.css";
import Calendar from "./Calendar.jsx"; // admin calendar view

const API = "http://localhost:3001";

// Helper to safely parse date strings
const parseDate = (dateString) => {
  if (!dateString) return null;
  try {
    // Try direct Date constructor first
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // Try manual parsing for YYYY-MM-DD format
    const parts = String(dateString).split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }
  } catch (e) {
    // fallback to null
  }
  return null;
};

// Helper to format date nicely
const formatDate = (dateString) => {
  const date = parseDate(dateString);
  if (!date || isNaN(date.getTime())) {
    return dateString || "No date";
  }
  try {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch (e) {
    return dateString || "Invalid date";
  }
};

export default function AdminDashboard() {
  const { notify } = useNotification() || {};
  const [active, setActive] = useState("calendar"); // 'calendar' | 'createTeacher' | 'createStudent' | 'archive' | 'requests'
  const [me, setMe] = useState(null);

  // data
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [requests, setRequests] = useState([]); // reschedule requests

  // create-teacher form
  const [tForm, setTForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    contact: "",
  });
  // create-student form
  const [sForm, setSForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    contact: "",
    trialNotes: "",
    level: "",
    teacherId: "",
    courseId: "",
    classesAvailed: "",
  });
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [archiveRefresh, setArchiveRefresh] = useState(0); // bump to reload archived list
  const [requestFilter, setRequestFilter] = useState("all"); // 'all', 'pending', 'approved', 'declined'
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { id, status, action }

  // ---- role gate (admin only) ----
   useEffect(() => {
     const raw = localStorage.getItem("user");
     if (!raw) {
       window.location.href = "/";
       return;
     }
     const u = JSON.parse(raw);
     setMe(u);
     if (u.role !== "admin") {
       // only admin can access
       window.location.href = "/";
     }
     // Check if profile is incomplete and redirect
     if (!u.profileCompleted) {
       window.location.href = "/account";
     }
   }, []);

  // ---- fetchers ----
  async function loadUsers() {
    try {
      const [s, t] = await Promise.all([
        axios.get(`${API}/api/admin/users?role=student&status=active`),
        axios.get(`${API}/api/admin/users?role=teacher&status=active`),
      ]);
      setStudents(s.data || []);
      setTeachers(t.data || []);
    } catch (e) {
      console.error(e);
      setStudents([]);
      setTeachers([]);
    }
  }

  useEffect(() => {
    if (!me) return;
    // preload default data
    loadUsers();
    loadCourses();
    if (active === "requests") loadRequests();
  }, [me]);

  // Fetch available courses
  async function loadCourses() {
    try {
      const r = await axios.get(`${API}/api/courses`);
      setCourses(r.data?.courses || []);
    } catch (e) {
      console.error(e);
      setCourses([]);
    }
  }

  // reload requests when tab becomes active
  useEffect(() => {
    if (active === "requests") {
      loadRequests();
    }
  }, [active]);

  // ---- actions: create teacher ----
  async function createTeacher(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...tForm, role: "teacher" };
      await axios.post(`${API}/api/admin/users`, payload); // creates teacher
      notify("Teacher created successfully!", "success");
      setTForm({ firstName: "", lastName: "", email: "", password: "", contact: "" });
      loadUsers();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to create teacher", "error");
    } finally {
      setLoading(false);
    }
  }

  // ---- actions: create student ----
  async function createStudent(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...sForm, role: "student" };
      await axios.post(`${API}/api/admin/users`, payload); // creates student
      notify("Student created successfully!", "success");
      setSForm({ firstName: "", lastName: "", email: "", password: "", contact: "", trialNotes: "", level: "", teacherId: "", courseId: "", classesAvailed: "" });
      loadUsers();
    } catch (e) {
      console.error(e);
      notify(e?.response?.data?.message || "Failed to create student", "error");
    } finally {
      setLoading(false);
    }
  }

  // ---- actions: archive ----
  async function archiveUser(id) {
    try {
      await axios.put(`${API}/api/users/${id}/status`, { status: "archived" });
      // remove from visible lists
      setStudents(prev => prev.filter(x => x.user_id !== id));
      setTeachers(prev => prev.filter(x => x.user_id !== id));
      notify("User archived successfully", "success");
      loadUsers(); // refresh the active lists
      setArchiveRefresh(r => r + 1); // tell archived component to reload
    } catch (e) {
      notify("Failed to archive user", "error");
    }
  }
  async function unarchiveUser(id) {
    try {
      await axios.put(`${API}/api/users/${id}/status`, { status: "active" });
      // optional: refetch archived lists; or ignore if not needed here
      loadUsers();
      setArchiveRefresh(r => r + 1);
      notify("User unarchived successfully", "success");
    } catch (e) {
      notify("Failed to unarchive user", "error");
    }
  }

  // ---- actions: requests ----
  async function loadRequests() {
    setRequestsLoading(true);
    try {
      const r = await axios.get(`${API}/api/admin/reschedule-requests`);
      setRequests(r.data.requests.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at)) || []);
    } catch (e) {
      console.error(e);
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }

  async function updateRequest(id, status) {
    try {
      await axios.put(`${API}/api/admin/reschedule-requests/${id}`, { status });
      const verb = status === 'approved' ? 'approved' : 'declined';
      notify(`Request ${verb} successfully`, "success");
      setConfirmDialog(null);
      loadRequests();
    } catch (e) {
      console.error(e);
      notify("Failed to update request", "error");
    }
  }

  async function deleteRequest(id) {
    try {
      await axios.delete(`${API}/api/admin/reschedule-requests/${id}`);
      notify("Request deleted successfully", "success");
      loadRequests();
    } catch (e) {
      console.error(e);
      notify("Failed to delete request", "error");
    }
  }

  async function deleteAllRequests() {
    if (!window.confirm("Are you sure you want to delete all reschedule requests?")) return;
    try {
      await axios.delete(`${API}/api/admin/reschedule-requests`);
      notify("All requests deleted successfully", "success");
      loadRequests();
    } catch (e) {
      console.error(e);
      notify("Failed to delete requests", "error");
    }
  }

  // ---- UI helpers ----
  const Tab = ({ id, label }) => (
    <button
      className={`${styles.tab} ${active === id ? styles.active : ""}`}
      onClick={() => setActive(id)}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div className={styles.Center}>
    <div className={styles.page}>
      <div className={styles.header}>
        <h1><b>Admin Console</b></h1>
        <div className={styles.tabs}>
          <Tab id="calendar" label="Calendar" />
          <Tab id="requests" label="Schedule Requests" />
          <Tab id="createTeacher" label="Create Teacher" />
          <Tab id="createStudent" label="Create Student" />
          <Tab id="archive" label="Archive Accounts" />
        </div>
      </div>

      <main className={styles.main}>
        {active === "createTeacher" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Create Teacher Account</h2>
            </div>
            <form className={styles.form} onSubmit={createTeacher}>
              <div className={styles.grid2}>
                <div>
                  <label>First Name</label>
                  <input value={tForm.firstName} onChange={(e)=>setTForm({...tForm, firstName:e.target.value})} />
                </div>
                <div>
                  <label>Last Name</label>
                  <input value={tForm.lastName} onChange={(e)=>setTForm({...tForm, lastName:e.target.value})} />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={tForm.email} onChange={(e)=>setTForm({...tForm, email:e.target.value})} />
                </div>
                <div>
                  <label>Password</label>
                  <input type="password" value={tForm.password} onChange={(e)=>setTForm({...tForm, password:e.target.value})} />
                </div>
                <div>
                  <label>Contact</label>
                  <input value={tForm.contact} onChange={(e)=>setTForm({...tForm, contact:e.target.value})} />
                </div>
              </div>
              <br />
              <br />
              <button className={styles.primary} disabled={loading}>
                {loading ? "Creating..." : "Create Teacher"}
              </button>
            </form>
          </section>
        )}

        {active === "createStudent" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Create Student Account</h2>
            </div>
            <form className={styles.form} onSubmit={createStudent}>
              <div className={styles.grid2}>
                <div>
                  <label>First Name</label>
                  <input value={sForm.firstName} onChange={(e)=>setSForm({...sForm, firstName:e.target.value})} />
                </div>
                <div>
                  <label>Last Name</label>
                  <input value={sForm.lastName} onChange={(e)=>setSForm({...sForm, lastName:e.target.value})} />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={sForm.email} onChange={(e)=>setSForm({...sForm, email:e.target.value})} />
                </div>
                <div>
                  <label>Password</label>
                  <input type="password" value={sForm.password} onChange={(e)=>setSForm({...sForm, password:e.target.value})} />
                </div>
                <div>
                  <label>Contact</label>
                  <input value={sForm.contact} onChange={(e)=>setSForm({...sForm, contact:e.target.value})} />
                </div>
              </div>
              <br />
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "1.3em", marginRight: "8px" }}>📝</span>
                  <h3 style={{ margin: "0", fontSize: "1.1em", color: "#333", fontWeight: "600" }}>Trial Class Assessment</h3>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.9em", color: "#666", lineHeight: "1.5" }}>
                  Enter detailed notes from the student's trial class session. Our AI system will analyze these notes to assess the student's proficiency level and automatically recommend the most suitable teacher for their learning needs.
                </p>
                <div>
                  <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Trial Class Notes</label>
                  <textarea
                    value={sForm.trialNotes}
                    onChange={(e)=>setSForm({...sForm, trialNotes:e.target.value})}
                    rows={5}
                    placeholder="Describe the student's performance, strengths, weaknesses, communication style, learning pace, and any specific areas of focus identified during the trial class..."
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #d0d0d0",
                      borderRadius: "6px",
                      fontFamily: "inherit",
                      fontSize: "0.9em",
                      resize: "vertical",
                      lineHeight: "1.5",
                      boxSizing: "border-box"
                    }}
                  />
                  <div style={{ marginTop: "12px", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        // AI analysis simulation - in real implementation, this would call an API
                        if (!sForm.trialNotes.trim()) {
                          notify("Please enter trial class notes before analyzing", "error");
                          return;
                        }
                        notify("AI analysis in progress... (This is a placeholder - actual AI integration needed)", "info");
                        // Simulate AI analysis delay
                        setTimeout(() => {
                          // For demo: set to intermediate level and first available teacher
                          const recommendedLevel = "intermediate";
                          const recommendedTeacher = teachers.length > 0 ? teachers[0].user_id : "";
                          setSForm(prev => ({
                            ...prev,
                            level: recommendedLevel,
                            teacherId: recommendedTeacher
                          }));
                          notify("AI analysis complete! Recommendations applied.", "success");
                        }, 2000);
                      }}
                      style={{
                        padding: "10px 20px",
                        background: "black",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.95em",
                        fontWeight: "600",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                      onMouseOver={(e) => {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
                      }}
                      onMouseOut={(e) => {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
                      }}
                    >
                      <span style={{ fontSize: "1.1em" }}>🤖</span>
                      Analyze with AI
                    </button>
                  </div>
                </div>
              </div>
              <br />
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "1.3em", marginRight: "8px" }}>🎯</span>
                  <h3 style={{ margin: "0", fontSize: "1.1em", color: "#333", fontWeight: "600" }}>AI Recommendations</h3>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.9em", color: "#666", lineHeight: "1.5" }}>
                  Based on the trial class notes, the AI has analyzed the student's proficiency level and recommended the most suitable teacher.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Proficiency Level</label>
                    <select
                      value={sForm.level}
                      onChange={(e)=>setSForm({...sForm, level:e.target.value})}
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "1px solid #d0d0d0",
                        borderRadius: "6px",
                        fontFamily: "inherit",
                        fontSize: "0.9em",
                        background: "#fff"
                      }}
                    >
                      <option value="">Select Level</option>
                      <option value="beginner">Beginner</option>
                      <option value="elementary">Elementary</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="upper-intermediate">Upper Intermediate</option>
                      <option value="advanced">Advanced</option>
                      <option value="proficient">Proficient</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Assigned Teacher</label>
                    <select
                      value={sForm.teacherId}
                      onChange={(e)=>setSForm({...sForm, teacherId:e.target.value})}
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "1px solid #d0d0d0",
                        borderRadius: "6px",
                        fontFamily: "inherit",
                        fontSize: "0.9em",
                        background: "#fff"
                      }}
                    >
                      <option value="">Select Teacher</option>
                      {teachers.map(t => (
                        <option key={t.user_id} value={t.user_id}>
                          {t.first_name} {t.last_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: "16px" }}>
                  <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Enroll in Course</label>
                  <select
                    value={sForm.courseId}
                    onChange={(e)=>setSForm({...sForm, courseId:e.target.value})}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #d0d0d0",
                      borderRadius: "6px",
                      fontFamily: "inherit",
                      fontSize: "0.9em",
                      background: "#fff",
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="">Select Course (Optional)</option>
                    {courses.map(c => (
                      <option key={c.course_id} value={c.course_id}>
                        {c.course_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <br />
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "20px", marginTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "1.3em", marginRight: "8px" }}>📊</span>
                  <h3 style={{ margin: "0", fontSize: "1.1em", color: "#333", fontWeight: "600" }}>Class Package Information</h3>
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.9em", color: "#666", lineHeight: "1.5" }}>
                  Specify the number of classes this student has purchased or availed in their package. This helps track their remaining classes and package utilization.
                </p>
                <div>
                  <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", color: "#333" }}>Number of Classes Availed</label>
                  <select
                    value={sForm.classesAvailed}
                    onChange={(e)=>setSForm({...sForm, classesAvailed:e.target.value})}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #d0d0d0",
                      borderRadius: "6px",
                      fontFamily: "inherit",
                      fontSize: "0.9em",
                      background: "#fff",
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="">Select Number of Classes</option>
                    <option value="10">10</option>
                    <option value="15">15</option>
                    <option value="20">20</option>
                  </select>
                  <div style={{ marginTop: "8px", fontSize: "0.85em", color: "#666" }}>
                    This information will be stored with the student's profile for tracking purposes.
                  </div>
                </div>
              </div>
              <br />
              <button className={styles.primary} disabled={loading}>
                {loading ? "Creating..." : "Create Student"}
              </button>
            </form>
          </section>
        )}

        {active === "archive" && (
          <section className={styles.card}>
            <div className={styles.cardHead}><h2>Archive Accounts</h2></div>
            <div className={styles.split}>
              <div>
                <h3>Students</h3>
                <ul className={styles.list}>
                  {students.length === 0 && <li className={styles.empty}>No active students</li>}
                  {students.map(s => (
                    <li key={s.user_id} className={styles.listRow}>
                      <span>{s.first_name} {s.last_name} — {s.email}</span>
                      <div>
                        <button className={styles.warn} onClick={() => archiveUser(s.user_id)}>Archive</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Teachers</h3>
                <ul className={styles.list}>
                  {teachers.length === 0 && <li className={styles.empty}>No active teachers</li>}
                  {teachers.map(t => (
                    <li key={t.user_id} className={styles.listRow}>
                      <span>{t.first_name} {t.last_name} — {t.email}</span>
                      <div>
                        <button className={styles.warn} onClick={() => archiveUser(t.user_id)}>Archive</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <details className={styles.archivedBox}>
              <summary>Show Archived Users</summary>
              <ArchivedUsers onUnarchive={unarchiveUser} refresh={archiveRefresh} />
            </details>
          </section>
        )}
        {active === "requests" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Schedule Requests</h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.9em", color: "#666" }}>Manage student reschedule requests</p>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid #e0e0e0", paddingBottom: "12px" }}>
              {["all", "pending", "approved", "declined"].map((status) => {
                const counts = {
                  all: requests.length,
                  pending: requests.filter(r => r.status === "pending").length,
                  approved: requests.filter(r => r.status === "approved").length,
                  declined: requests.filter(r => r.status === "declined").length,
                };
                return (
                  <button
                    key={status}
                    onClick={() => setRequestFilter(status)}
                    style={{
                      padding: "8px 16px",
                      border: "none",
                      background: requestFilter === status ? "#0f0f0f" : "#f5f5f5",
                      color: requestFilter === status ? "#fff" : "#333",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: requestFilter === status ? "600" : "500",
                      fontSize: "0.9em",
                      transition: "all 0.2s",
                    }}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)} ({counts[status]})
                  </button>
                );
              })}
            </div>

            {/* Clear All Button */}
            {requests.length > 0 && (
              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <button
                  onClick={deleteAllRequests}
                  className={styles.warn}
                  style={{ fontSize: "0.9em" }}
                >
                  Clear All Requests
                </button>
              </div>
            )}

            {/* Requests List */}
            <div style={{ overflowX: "auto" }}>
              {requestsLoading ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#999" }}>
                  Loading requests...
                </div>
              ) : requests.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#999" }}>
                  No reschedule requests at this time
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
                  <thead>
                    <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #e0e0e0" }}>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Class</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Requester</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Current Schedule</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Requested Schedule</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Status</th>
                      <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests
                      .filter(r => requestFilter === "all" || r.status === requestFilter)
                      .map((r) => {
                        const statusColors = {
                          pending: { bg: "#fff3cd", text: "#856404" },
                          approved: { bg: "#d4edda", text: "#155724" },
                          declined: { bg: "#f8d7da", text: "#721c24" },
                        };
                        const statusColor = statusColors[r.status] || statusColors.pending;

                        return (
                          <tr key={r.request_id} style={{ borderBottom: "1px solid #e0e0e0", background: "#fff" }}>
                            <td style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ fontWeight: "500", color: "#333" }}>{r.class_name || "Untitled Class"}</div>
                              <div style={{ fontSize: "0.8em", color: "#666", marginTop: "2px" }}>
                                Teacher: {r.teacher_first} {r.teacher_last}
                              </div>
                              {r.student_first && (
                                <div style={{ fontSize: "0.8em", color: "#666", marginTop: "2px" }}>
                                  Student: {r.student_first} {r.student_last}
                                </div>
                              )}
                              {r.reason && (
                                <div style={{ fontSize: "0.8em", color: "#666", marginTop: "4px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.reason}>
                                  Reason: {r.reason}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ fontWeight: "500" }}>{r.requester_first} {r.requester_last}</div>
                              <div style={{ fontSize: "0.8em", color: "#666" }}>{r.requester_email || ""}</div>
                            </td>
                            <td style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ fontWeight: "500" }}>{formatDate(r.scheduled_date)}</div>
                              <div style={{ fontSize: "0.8em", color: "#666" }}>{r.start_time || "—"}</div>
                            </td>
                            <td style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ fontWeight: "500" }}>{formatDate(r.requested_date)}</div>
                              <div style={{ fontSize: "0.8em", color: "#666" }}>{r.requested_time || "—"}</div>
                            </td>
                            <td style={{ padding: "12px", verticalAlign: "top" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "12px",
                                background: statusColor.bg,
                                color: statusColor.text,
                                fontSize: "0.8em",
                                fontWeight: "600",
                                textTransform: "capitalize",
                              }}>
                                {r.status}
                              </span>
                              {r.resolved_at && (
                                <div style={{ fontSize: "0.7em", color: "#999", marginTop: "4px" }}>
                                  Resolved: {formatDate(r.resolved_at)}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "12px", verticalAlign: "top" }}>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => deleteRequest(r.request_id)}
                                  className={styles.warn}
                                  style={{ fontSize: "0.8em", padding: "6px 10px" }}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* Confirmation Dialog */}
        {confirmDialog && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setConfirmDialog(null)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "8px",
                padding: "24px",
                maxWidth: "400px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1em" }}>
                {confirmDialog.status === "approved" ? "Approve Request?" : "Decline Request?"}
              </h3>
              <p style={{ margin: "0 0 24px 0", color: "#666", lineHeight: "1.6" }}>
                {confirmDialog.status === "approved"
                  ? "Are you sure you want to approve this reschedule request? The student will be notified."
                  : "Are you sure you want to decline this reschedule request? The student will be notified and may submit a new request."}
              </p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setConfirmDialog(null)}
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.9em",
                    fontWeight: "600",
                    border: "1px solid #d0d0d0",
                    background: "#fff",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateRequest(confirmDialog.id, confirmDialog.status)}
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.9em",
                    fontWeight: "600",
                    border: "none",
                    background: confirmDialog.status === "approved" ? "#28a745" : "#dc3545",
                    color: "#fff",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  {confirmDialog.status === "approved" ? "Approve" : "Decline"}
                </button>
              </div>
            </div>
          </div>
        )}
        {active === "calendar" && (
          <section className={styles.card}>
            <div className={styles.cardHead}><h2>Scheduled Classes</h2></div>
            <Calendar />
          </section>
        )}
      </main>
    </div>
    </div>
  );
}

// Lazy subcomponent to list archived users
function ArchivedUsers({ onUnarchive, refresh }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    axios
      .get(`http://localhost:3001/api/admin/users?status=archived`)
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]));
  }, [refresh]);
  return (
    <ul className={styles.list}>
      {items.length === 0 && <li className={styles.empty}>No archived users</li>}
      {items.map(u => (
        <li key={u.user_id} className={styles.listRow}>
          <span>{u.first_name} {u.last_name} — {u.email} ({u.role})</span>
          <div>
            <button className={styles.approve} onClick={() => onUnarchive(u.user_id)}>Restore</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

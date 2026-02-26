import { useEffect, useState } from "react";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/AdminDashboard.module.css";

const API = "http://localhost:3001";

export default function AdminDashboard() {
  const { notify } = useNotification() || {};
  const [active, setActive] = useState("enrollees"); // 'enrollees' | 'trials' | 'create' | 'archive'
  const [me, setMe] = useState(null);

  // data
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);

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
  });
  const [loading, setLoading] = useState(false);

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
   }, []);

  // ---- fetchers ----
  async function loadUsers() {
    try {
      const [s, t] = await Promise.all([
        axios.get(`${API}/api/admin/users?role=student&archived=0`),
        axios.get(`${API}/api/admin/users?role=teacher&archived=0`),
      ]);
      setStudents(s.data.items || []);
      setTeachers(t.data.items || []);
    } catch (e) {
      console.error(e);
      setStudents([]);
      setTeachers([]);
    }
  }

  useEffect(() => {
    if (!me) return;
    // preload default tab + archive lists
    loadUsers();
  }, [me]);

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
      setSForm({ firstName: "", lastName: "", email: "", password: "", contact: "" });
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
      await axios.patch(`${API}/api/admin/users/${id}`, { action: "archive" });
      // remove from visible lists
      setStudents(prev => prev.filter(x => x.id !== id));
      setTeachers(prev => prev.filter(x => x.id !== id));
      notify("User archived successfully", "success");
    } catch (e) {
      notify("Failed to archive user", "error");
    }
  }
  async function unarchiveUser(id) {
    try {
      await axios.patch(`${API}/api/admin/users/${id}`, { action: "unarchive" });
      // optional: refetch archived lists; or ignore if not needed here
      loadUsers();
      notify("User unarchived successfully", "success");
    } catch (e) {
      notify("Failed to unarchive user", "error");
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
                    <li key={s.id} className={styles.listRow}>
                      <span>{s.firstName} {s.lastName} — {s.email}</span>
                      <div>
                        <button className={styles.warn} onClick={() => archiveUser(s.id)}>Archive</button>
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
                    <li key={t.id} className={styles.listRow}>
                      <span>{t.firstName} {t.lastName} — {t.email}</span>
                      <div>
                        <button className={styles.warn} onClick={() => archiveUser(t.id)}>Archive</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <details className={styles.archivedBox}>
              <summary>Show Archived Users</summary>
              <ArchivedUsers onUnarchive={unarchiveUser} />
            </details>
          </section>
        )}
      </main>
    </div>
    </div>
  );
}

// Lazy subcomponent to list archived users
function ArchivedUsers({ onUnarchive }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    axios
      .get(`http://localhost:3001/api/admin/users?archived=1`)
      .then((r) => setItems(r.data.items || []))
      .catch(() => setItems([]));
  }, []);
  return (
    <ul className={styles.list}>
      {items.length === 0 && <li className={styles.empty}>No archived users</li>}
      {items.map(u => (
        <li key={u.id} className={styles.listRow}>
          <span>{u.firstName} {u.lastName} — {u.email} ({u.role})</span>
          <div>
            <button className={styles.approve} onClick={() => onUnarchive(u.id)}>Unarchive</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

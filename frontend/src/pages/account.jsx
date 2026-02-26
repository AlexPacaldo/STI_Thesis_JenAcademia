import { useEffect, useState } from "react";
import axios from "axios";
import styles from "../assets/account.module.css";
import pfp from "../assets/img/Navbar/user.jpg";

function mapUser(u = {}) {
  return {
    id: u.id ?? u.user_id ?? null,
    firstName: u.firstName ?? u.first_name ?? "",
    lastName: u.lastName ?? u.last_name ?? "",
    email: u.email ?? "",
    contact: u.contact ?? u.contact_number ?? "",
    // 👇 accept both timezone and time_zone from the server
    timezone: u.timezone ?? u.time_zone ?? "",
    role: u.role ?? "student",
  };
}


export default function account() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    contact: "",
    timezone: "",
  });
  const [saving, setSaving] = useState(false);

  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdSaving, setPwdSaving] = useState(false);

  function handleLogout() {
    localStorage.removeItem("user");
    window.location.href = "/";
  }

  // Load from localStorage and fetch fresh copy from backend
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return;

    const parsed = JSON.parse(stored);
    const mapped = mapUser(parsed);
    setUser(mapped);
    setForm(mapped);

    // Fetch fresh data from backend
    axios
      .get(`http://localhost:3001/api/users/${mapped.id}`)
      .then((res) => {
        const raw = res.data?.user ?? res.data;
        const refreshed = mapUser(raw);
        setUser(refreshed);
        setForm(refreshed);
        localStorage.setItem("user", JSON.stringify(refreshed));
      })
      .catch(() => {
        console.warn("Could not fetch user; using local data.");
      });
  }, []);


  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h2>Account</h2>
          <p>You’re not logged in.</p>
        </div>
      </main>
    );
  }

  const onChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`http://localhost:3001/api/users/${user.id}`, form);

      // Re-fetch updated user data
      const res2 = await axios.get(`http://localhost:3001/api/users/${user.id}`);
      const updated = mapUser(res2.data?.user ?? res2.data);

      // Update everything so form doesn't blank
      localStorage.setItem("user", JSON.stringify(updated));
      setUser(updated);
      setForm(updated);

      alert("Profile updated successfully!");
    } catch (err) {
      console.error(err);
      alert("Could not update profile.");
    } finally {
      setSaving(false);
    }
  }


  async function changePassword(e) {
    e.preventDefault();
    if (!pwd.next || pwd.next !== pwd.confirm) {
      alert("New password and confirm password do not match.");
      return;
    }
    setPwdSaving(true);
    try {
      const res = await axios.put(
        `http://localhost:3001/api/users/${user.id}/password`,
        { current: pwd.current, next: pwd.next }
      );
      alert(res.data?.message || "Password changed!");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (err) {
      console.error(err);
      alert(
        err?.response?.data?.message || "Could not change password. Check current password."
      );
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <main className={styles.cont}>
    <div className={styles.page}>
      <section className={styles.header}>
        <div className={styles.userBlock}>
          <img
            className={styles.avatar}
            src={pfp}
            alt="Profile"
          />
          <div>
            <h1 className={styles.title}>
              {form.firstName} {form.lastName}
            </h1>
            <div className={styles.roleBadge}>{user.role ?? "student"}</div>
          </div>
        </div>
      </section>

      <section className={styles.grid}>
        {/* Profile Card */}
        <div className={styles.card}>
          <h2>Profile Information</h2>
          <form onSubmit={saveProfile} className={styles.form}>
            <div className={styles.row}>
              <div className={styles.col}>
                <label>First Name</label>
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={onChange}
                  required
                />
              </div>
              <div className={styles.col}>
                <label>Last Name</label>
                <input
                  name="lastName"
                  value={form.lastName}
                  onChange={onChange}
                  required
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.col}>
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={onChange}
                  required
                />
              </div>
              <div className={styles.col}>
                <label>Contact</label>
                <input
                  name="contact"
                  value={form.contact}
                  onChange={onChange}
                  placeholder="09xxxxxxxxx"
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.col}>
                <label>Timezone</label>
                <select
                  name="timezone"
                  value={form.timezone}
                  onChange={onChange}
                >
                  <option value="Asia/Manila">Asia/Manila</option>
                  <option value="UTC">UTC</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.saveBtn} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        {/* Password Card */}
        <div className={styles.card}>
          <h2>Change Password</h2>
          <form onSubmit={changePassword} className={styles.form}>
            <div className={styles.row}>
              <div className={styles.col}>
                <label>Current Password</label>
                <input
                  type="password"
                  value={pwd.current}
                  onChange={(e) =>
                    setPwd((p) => ({ ...p, current: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.col}>
                <label>New Password</label>
                <input
                  type="password"
                  value={pwd.next}
                  onChange={(e) =>
                    setPwd((p) => ({ ...p, next: e.target.value }))
                  }
                  required
                />
              </div>
              <div className={styles.col}>
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={pwd.confirm}
                  onChange={(e) =>
                    setPwd((p) => ({ ...p, confirm: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.saveBtn} disabled={pwdSaving}>
                {pwdSaving ? "Updating…" : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </section>
      <button className={styles.logOut} onClick={handleLogout}>
        Log out
      </button>
    </div>
    </main>
  );
}

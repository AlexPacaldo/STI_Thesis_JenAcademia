import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useNotification } from "../components/NotificationContainer.jsx";
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
    profileCompleted: !!(u.profileCompleted ?? u.profile_completed ?? false),
  };
}


export default function account() {
  const navigate = useNavigate();
  const { notify } = useNotification() || {};
  const [user, setUser] = useState(null);
  const [isProfileIncomplete, setIsProfileIncomplete] = useState(false);
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
    
    // Check if profile is incomplete
    if (!mapped.profileCompleted) {
      setIsProfileIncomplete(true);
    }

    // Fetch fresh data from backend
    axios
      .get(`http://localhost:3001/api/users/${mapped.id}`)
      .then((res) => {
        const raw = res.data?.user ?? res.data;
        const refreshed = mapUser(raw);
        setUser(refreshed);
        setForm(refreshed);
        
        // Update profile incomplete status
        if (!refreshed.profileCompleted) {
          setIsProfileIncomplete(true);
        } else {
          setIsProfileIncomplete(false);
        }
        
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

      console.log('Account.jsx: Updated user from backend:', updated);

      // Update everything so form doesn't blank
      localStorage.setItem("user", JSON.stringify(updated));
      console.log('Account.jsx: Saved to localStorage:', updated);
      
      setUser(updated);
      setForm(updated);
      
      // Update profile completion status
      setIsProfileIncomplete(!updated.profileCompleted);

      // Dispatch event to notify Header component of profile update
      window.dispatchEvent(new CustomEvent('userProfileUpdated', { detail: updated }));
      console.log('Account.jsx: Dispatched userProfileUpdated event');

      notify("Profile updated successfully!", "success");
      
      // If profile is now complete, redirect to appropriate dashboard after a short delay
      if (updated.profileCompleted) {
        console.log('Account.jsx: Profile is complete, redirecting to dashboard...');
        setTimeout(() => {
          if (updated.role === "teacher") {
            console.log('Account.jsx: Navigating to TeacherDashboard');
            navigate("/TeacherDashboard");
          } else if (updated.role === "admin") {
            console.log('Account.jsx: Navigating to AdminDashboard');
            navigate("/AdminDashboard");
          } else {
            console.log('Account.jsx: Navigating to StudentDashboard');
            navigate("/StudentDashboard");
          }
        }, 500);
      } else {
        console.log('Account.jsx: Profile is NOT complete, not redirecting');
      }
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.message || "Could not update profile.", "error");
    } finally {
      setSaving(false);
    }
  }


  async function changePassword(e) {
    e.preventDefault();
    if (!pwd.next || pwd.next !== pwd.confirm) {
      notify("New password and confirm password do not match.", "error");
      return;
    }
    setPwdSaving(true);
    try {
      const res = await axios.put(
        `http://localhost:3001/api/users/${user.id}/password`,
        { current: pwd.current, next: pwd.next }
      );
      notify(res.data?.message || "Password changed!", "success");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.message || "Could not change password. Check current password.", "error");
      
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <main className={styles.cont}>
    <div className={styles.page}>
      {/* Show non-blocking alert if profile is incomplete */}
      {isProfileIncomplete && (
        <div style={{
          backgroundColor: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: "4px",
          padding: "1rem",
          marginBottom: "2rem",
          color: "#856404",
          textAlign: "center",
        }}>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "#d32f2f" }}>
            Complete Your Profile Required
          </h3>
          <p style={{ margin: "0.5rem 0", fontSize: "0.95rem" }}>
            Please complete all required fields below before you can proceed to the dashboard.
          </p>
        </div>
      )}

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
                <label>First Name <span style={{ color: "red" }}>*</span></label>
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={onChange}
                  required
                />
              </div>
              <div className={styles.col}>
                <label>Last Name <span style={{ color: "red" }}>*</span></label>
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
                <label>Contact <span style={{ color: "red" }}>*</span></label>
                <input
                  name="contact"
                  value={form.contact}
                  onChange={onChange}
                  placeholder="09xxxxxxxxx"
                  required
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.col}>
                <label>Timezone <span style={{ color: "red" }}>*</span></label>
                <select
                  name="timezone"
                  value={form.timezone}
                  onChange={onChange}
                  required
                >
                  <option value="">-- Select Timezone --</option>
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

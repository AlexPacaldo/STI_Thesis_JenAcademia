import { useEffect, useMemo, useState } from "react";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/register.module.css"; // keeps your look & feel

const TIMEZONES = [
  "Asia/Manila",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "America/Los_Angeles",
  "America/New_York",
];

const SLOTS = ["09:00", "13:00", "19:00"]; // simple example; server blocks already-booked

export default function Register() {
  const { notify } = useNotification() || {};
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [availability, setAvailability] = useState({}); // { 'YYYY-MM-DD': { slots: [], disabled: bool } }
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    contact: "",
    courseInterests: [], // <-- multiple
    timezone: "Asia/Manila",
    trialDate: "", // YYYY-MM-DD
    trialTime: "", // HH:mm
    privacyAgree: false,
    role: "student",
  });

  // Helpers
  const ymKey = useMemo(() => `${year}-${String(month + 1).padStart(2, "0")}`, [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);

  // Load courses
  useEffect(() => {
    fetch("http://localhost:3001/api/courses")
      .then((r) => r.json())
      .then((data) => setCourses(data.courses || []))
      .catch(() => setCourses([]));
  }, []);

  // Load availability for the current month
  useEffect(() => {
    fetch(`http://localhost:3001/api/trial/availability?year=${year}&month=${month + 1}`)
      .then((r) => r.json())
      .then((data) => setAvailability(data.days || {}))
      .catch(() => setAvailability({}));
  }, [year, month]);

  function changeMonth(delta) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function toggleInterest(courseId) {
    setForm((f) => {
      const set = new Set(f.courseInterests);
      if (set.has(courseId)) set.delete(courseId);
      else set.add(courseId);
      return { ...f, courseInterests: Array.from(set) };
    });
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  function pickDate(iso) {
    // only allow available days
    if (availability[iso]?.disabled) return;
    setForm((f) => ({ ...f, trialDate: iso }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.privacyAgree) {
      notify("Please accept the data privacy terms.", "warning");
      return;
    }

    // Build a combined ISO string for the server (local pick, no TZ conversion)
    const trialDateTime =
      form.trialDate && form.trialTime
        ? `${form.trialDate}T${form.trialTime}:00`
        : "";

    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      password: form.password,
      contact: form.contact,
      courseInterests: form.courseInterests, // array of IDs
      timezone: form.timezone,
      trialDate: trialDateTime, // server converts to MySQL DATETIME
      role: form.role, // student by default
    };

    try {
      const res = await fetch("http://localhost:3001/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Registration failed");
      notify("Registration successful!", "success");
      // redirect or clear
    } catch (err) {
      console.error(err);
      notify(err.message, "error");
    }
  }

  // Build calendar grid
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push(iso);
  }

  const selectedSlots = useMemo(() => {
    if (!form.trialDate) return [];
    const info = availability[form.trialDate];
    if (!info || info.disabled) return [];
    // keep only slots not blocked by server
    return SLOTS.filter((s) => !(info.booked || []).includes(s));
  }, [form.trialDate, availability]);

  return (
    <div className={styles.cont}>
      <section className={styles.Center}>
        <div className={styles.Title}>
          <h1><b>Book your trial class at <br /> JEN Academia</b></h1>
          <p>Experience personalized learning with our dedicated instructors</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name / Contact / Login */}
          <label htmlFor="firstName">First Name</label>
          <input id="firstName" name="firstName" required value={form.firstName} onChange={handleChange} />

          <label htmlFor="lastName">Last Name</label>
          <input id="lastName" name="lastName" required value={form.lastName} onChange={handleChange} />

          <label htmlFor="email">Email Address</label>
          <input id="email" type="email" name="email" required value={form.email} onChange={handleChange} />

          <label htmlFor="password">Password</label>
          <input id="password" type="password" name="password" required value={form.password} onChange={handleChange} />

          <label htmlFor="contact">Contact Number</label>
          <input id="contact" name="contact" value={form.contact} required onChange={handleChange} />

          {/* Multi-course interests */}
          <label>Course Interests (pick one or more)</label>
          <div className={styles.courseButtons}>
            {courses.map((c) => {
              const active = form.courseInterests.includes(c.course_id);
              return (
                <button
                  key={c.course_id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleInterest(c.course_id)}
                  style={{
                    background: active ? "#000" : undefined,
                    color: active ? "#fff" : undefined,
                  }}
                >
                  {c.course_name}
                </button>
              );
            })}
          </div>

          {/* Time zone */}
          <label htmlFor="timezone">Time zone</label>
          <select id="timezone" name="timezone" value={form.timezone} onChange={handleChange}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>

          {/* Calendar + slots */}
          <label>Preferred Trial Date & Time</label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <button type="button" onClick={() => changeMonth(-1)}>◀</button>
                <b>
                  {new Date(year, month).toLocaleString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </b>
                <button type="button" onClick={() => changeMonth(1)}>▶</button>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 8
              }}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                  <div key={d} style={{ textAlign: "center", fontWeight: 600, opacity: .7 }}>{d}</div>
                ))}
                {cells.map((iso, idx) => {
                  if (!iso) return <div key={idx} />;
                  const info = availability[iso];
                  const disabled = info?.disabled;
                  const selected = form.trialDate === iso;
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => pickDate(iso)}
                      disabled={disabled}
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid #eee",
                        background: selected ? "#000" : disabled ? "#f4f4f4" : "#fff",
                        color: selected ? "#fff" : undefined,
                        cursor: disabled ? "not-allowed" : "pointer"
                      }}
                    >
                      {iso.slice(-2)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>
                {form.trialDate || "— Select a date —"}
              </div>
              <select
                name="trialTime"
                value={form.trialTime}
                onChange={handleChange}
                disabled={!form.trialDate}
                style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
              >
                <option value="">Pick a time</option>
                {selectedSlots.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div style={{ marginTop: 8, fontSize: 12, opacity: .7 }}>
                Times shown in: <b>{form.timezone}</b>
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className={styles.DataPrivacy} style={{ marginTop: 16 }}>
            <h3>Data Privacy Terms and Conditions</h3>
            <div className={styles.checkboxRow} style={{ display: "flex", gap: 12 }}>
              <label>
                <input
                  type="checkbox"
                  name="privacyAgree"
                  checked={form.privacyAgree}
                  onChange={handleChange}
                  required
                />
              </label>
              <p>
                By creating an account or logging in, you agree to the collection and use of your personal information for account creation and communication purposes. Your data will be stored securely and will not be shared without your consent, unless required by law. By checking the box, you confirm that you accept these terms and conditions.
              </p>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn}>Create account</button>
        </form>
      </section>
    </div>
  );
}

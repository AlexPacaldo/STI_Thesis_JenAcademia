// src/pages/reschedule.jsx
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useNotification } from "../components/NotificationContainer.jsx";
import styles from "../assets/reschedule.module.css";

/* ---------------- helpers ---------------- */
function buildMonthCells(year, month) {
  const firstDay = new Date(year, month, 1);
  const firstDow = firstDay.getDay(); // 0..6
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

// Read role from navigation state or localStorage (supports "user.role" or "role")
function detectRole(navRole) {
  if (navRole) return String(navRole).toLowerCase();
  try {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && typeof parsed.role === "string") return parsed.role.toLowerCase();
    }
    const roleStr = localStorage.getItem("role");
    if (roleStr) return String(roleStr).toLowerCase();
  } catch {}
  return "student";
}

/* --------------- component --------------- */
export default function Reschedule() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification() || {};

  // Role (from state first, then localStorage)
  const role = detectRole(location.state?.role);

  // If you came from AllClasses/StudentDashboard we have the class info in state
  const stateClass = location.state?.cls;

  // Fallback datasets if user opened URL directly
  const fallbackStudent = [
    { id: 1, title: "Business English", teacher: "Teacher Jen",     time: "9:00 AM – 10:00 AM" },
    { id: 2, title: "Travel English",   teacher: "Teacher Shyla",   time: "2:00 PM – 3:00 PM" },
    { id: 3, title: "IELTS",            teacher: "Teacher Lovelyn", time: "10:00 AM – 11:00 AM" },
    { id: 4, title: "OPIc",             teacher: "Teacher Mhelai",  time: "4:00 PM – 5:00 PM" },
  ];
  const fallbackTeacher = [
    { id: 101, student: "Alexander Pacaldo", subject: "Business English", time: "9:00 AM – 10:00 AM" },
    { id: 102, student: "Sophia Santos",     subject: "Travel English",   time: "2:00 PM – 3:00 PM" },
    { id: 103, student: "Karol Tabio",       subject: "IELTS",            time: "10:00 AM – 11:00 AM" },
    { id: 104, student: "Jessie Gray",       subject: "OPIc",             time: "4:00 PM – 5:00 PM" },
  ];

  // Normalize the class for display based on role
  const cls = useMemo(() => {
    if (stateClass) return stateClass;

    // fallback lookup by id when opening directly
    if (role === "teacher") {
      return fallbackTeacher.find((c) => String(c.id) === String(id));
    }
    return fallbackStudent.find((c) => String(c.id) === String(id));
  }, [stateClass, id, role]);

  // Calendar state
  const today = new Date();
  const [visibleYear, setVisibleYear] = useState(today.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(today.getMonth()); // 0-based
  const monthCells = useMemo(
    () => buildMonthCells(visibleYear, visibleMonth),
    [visibleYear, visibleMonth]
  );

  // Fake availability map (replace with API)
  const availability = {
    [`${visibleYear}-11-12`]: "available",
    [`${visibleYear}-11-19`]: "unavailable",
  };

  // Selected date/time
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState("");

  useEffect(() => {
    // Clear selection when switching month
    setSelectedDate(null);
    setSelectedTime("");
  }, [visibleMonth, visibleYear]);

  if (!cls) {
    return (
      <main className={styles.pageOuter}>
        <div className={styles.pageInner}>
          <h2>Class not found</h2>
          <button className={styles.btnGhost} onClick={() => navigate(-1)}>
            Go back
          </button>
        </div>
      </main>
    );
  }

  const monthName = new Date(visibleYear, visibleMonth).toLocaleDateString("default", {
    month: "long",
    year: "numeric",
  });

  const isPast = (d) => {
    if (!d) return false;
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return dateOnly < todayOnly;
  };

  const avFor = (d) => {
    if (!d) return "";
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    return availability[k] || "available"; // default available
  };

  const handlePickDay = (d) => {
    if (!d) return;
    if (isPast(d)) return;
    if (avFor(d) === "unavailable") return;
    setSelectedDate(d);
  };

  const goPrevMonth = () => {
    const m = visibleMonth - 1;
    if (m < 0) {
      setVisibleMonth(11);
      setVisibleYear((y) => y - 1);
    } else {
      setVisibleMonth(m);
    }
  };

  const goNextMonth = () => {
    const m = visibleMonth + 1;
    if (m > 11) {
      setVisibleMonth(0);
      setVisibleYear((y) => y + 1);
    } else {
      setVisibleMonth(m);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) {
      notify("Please select a date and time", "warning");
      return;
    }
    // TODO: call your backend to request reschedule
    const readableDate = selectedDate.toLocaleDateString();
    const who = role === "teacher" ? (cls.student || "student") : (cls.teacher || "teacher");
    notify(
      `Requested reschedule for ${role === "teacher" ? `"${cls.subject}" with ${who}` : `"${cls.title}" with ${who}`} on ${readableDate} at ${selectedTime}`,
      "success"
    );

    // Navigate back to the appropriate schedule view
    if (role === "teacher") {
      navigate("/teacherScheduleEditor");
    } else {
      navigate("/studentSchedule");
    }
  };

  return (
    <main className={styles.pageOuter}>
      <section className={styles.container}>
        {/* Title */}
        <div className={styles.titleRow}>
          <h2>{role === "teacher" ? "Adjust a class time" : "Create your schedule"}</h2>
        </div>

        {/* Grid: calendar left, booking right */}
        <div className={styles.grid}>
          {/* Calendar */}
          <div className={styles.calendar}>
            <div className={styles.calHeader}>
              <button className={styles.monthBtn} onClick={goPrevMonth} aria-label="Previous">
                ‹
              </button>
              <div className={styles.monthLabel}>{monthName}</div>
              <button className={styles.monthBtn} onClick={goNextMonth} aria-label="Next">
                ›
              </button>
            </div>

            <div className={styles.weekHeader}>
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            <div className={styles.cells}>
              {monthCells.map((d, i) => {
                const isPastDate = isPast(d);
                const av = avFor(d);
                const isSelected =
                  d &&
                  selectedDate &&
                  d.getFullYear() === selectedDate.getFullYear() &&
                  d.getMonth() === selectedDate.getMonth() &&
                  d.getDate() === selectedDate.getDate();

                let cellClass = styles.cell;
                if (!d) cellClass += ` ${styles.cellEmpty}`;
                else if (isPastDate) cellClass += ` ${styles.cellPast}`;
                else if (av === "unavailable") cellClass += ` ${styles.cellUnavailable}`;
                else cellClass += ` ${styles.cellAvailable}`;
                if (isSelected) cellClass += ` ${styles.cellSelected}`;

                return (
                  <button
                    type="button"
                    key={i}
                    className={cellClass}
                    onClick={() => handlePickDay(d)}
                    disabled={!d || isPastDate || av === "unavailable"}
                  >
                    {d ? d.getDate() : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Booking panel */}
          <aside className={styles.bookPanel}>
            <div className={styles.classCard}>
              {role === "teacher" ? (
                <>
                  <p>
                    <strong>Student:</strong> {cls.student}
                  </p>
                  <p>
                    <strong>Subject:</strong> {cls.subject}
                  </p>
                  <p>
                    <strong>Current Time:</strong> {cls.time}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>Class:</strong> {cls.title}
                  </p>
                  <p>
                    <strong>Teacher:</strong> {cls.teacher}
                  </p>
                  <p>
                    <strong>Current Time:</strong> {cls.time}
                  </p>
                </>
              )}
            </div>

            <form onSubmit={submit} className={styles.form}>
              <label className={styles.label}>Selected date</label>
              <input
                type="text"
                value={selectedDate ? selectedDate.toLocaleDateString() : ""}
                readOnly
                placeholder="—"
                className={styles.input}
              />

              <label className={styles.label}>New time</label>
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className={styles.input}
              />

              <button className={styles.bookBtn} type="submit">
                Book this date
              </button>
            </form>

            {/* Legend */}
            <div className={styles.legend}>
              <div className={styles.legendRow}>
                <span className={`${styles.dot} ${styles.dotAvail}`} />
                <span>Available</span>
              </div>
              <div className={styles.legendRow}>
                <span className={`${styles.dot} ${styles.dotUnavail}`} />
                <span>Not Available</span>
              </div>
              <div className={styles.legendRow}>
                <span className={`${styles.dot} ${styles.dotPast}`} />
                <span>Past date</span>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

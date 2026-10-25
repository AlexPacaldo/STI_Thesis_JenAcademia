import { Fragment, useEffect, useRef, useState } from "react";
import styles from "../assets/firstStepsGuide.module.css";
import logo from "../assets/img/Navbar/LOGO.png";
import avatar from "../assets/img/Navbar/user.jpg";

/**
 * The "show me" half of the welcome guide.
 *
 * !! This is a SCALED COPY OF THE REAL APP, not a drawing of it. The sidebar,
 * !! the header, the white sheet, the cards and the buttons carry the same
 * !! colours, radii, icon set and wording as the pages they mirror, because the
 * !! whole point is that a teacher recognises the screen when they close the
 * !! guide. A friendlier-looking invention would teach the wrong picture.
 *
 * !! How the scale works: everything below is laid out at the real desktop
 * !! width (1100 x 780). `useFit` measures the column it landed in and the whole
 * !! screen is transformed to fit, so the proportions never drift. That is also
 * !! why this file may use plain rem/px values - they are the real ones.
 *
 * !! One step = one scene = ONE spotlight. Pointing at three things at once is
 * !! how help screens stop being helpful.
 *
 * !! The whole mock is aria-hidden. The sentence that explains the spotlight
 * !! lives outside it, in the annotation, where a screen reader can reach it.
 */

const DESIGN_WIDTH = 1100;
const DESIGN_HEIGHT = 780;

const TEACHER = { name: "Lebron James", first: "Lebron" };
const STUDENT = { name: "Emma Santos", first: "Emma", teacher: "Ms. Ana Reyes" };

const TEACHER_NAV = [
  { id: "home", icon: "bi-house-door-fill", label: "Home" },
  { id: "calendar", icon: "bi-calendar3", label: "Calendar" },
  { id: "students", icon: "bi-people", label: "My students" },
  { id: "history", icon: "bi-clock-history", label: "Class history" },
  { id: "reviews", icon: "bi-star-fill", label: "Contract reviews" },
  { id: "remarks", icon: "bi-chat-left-text", label: "Remarks" },
  { id: "assignments", icon: "bi-journal-text", label: "Assignments" },
  { id: "books", icon: "bi-book", label: "My books" },
];

const STUDENT_NAV = [
  { id: "home", icon: "bi-house-door-fill", label: "Home" },
  { id: "calendar", icon: "bi-calendar3", label: "Calendar" },
  { id: "history", icon: "bi-clock-history", label: "Class history" },
  { id: "reviews", icon: "bi-star-fill", label: "Contract reviews" },
  { id: "assignments", icon: "bi-journal-text", label: "Assignments" },
  { id: "remarks", icon: "bi-chat-left-text", label: "Remarks" },
  { id: "books", icon: "bi-book", label: "Books/Lessons" },
];

const TONE_CLASS = {
  old: styles.flowCardOld,
  new: styles.flowCardNew,
  neutral: styles.flowCardNeutral,
};

/** Fit the 1100px-wide replica into whatever column the guide gives it. */
function useFit(ref) {
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const apply = () => {
      const width = node.clientWidth;
      if (width > 0) setScale(width / DESIGN_WIDTH);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return scale;
}

/**
 * A ring around the one thing this step is about.
 *
 * `dim` veils the rest of the screen with the page colour, which is what makes
 * a card in the corner findable at this size. The veil is drawn with a huge
 * shadow rather than an overlay so it can never cover the ring itself.
 */
function Spotlight({ active = false, dim = true, children }) {
  if (!active) return children;
  return (
    <div className={`${styles.spot} ${dim ? styles.spotDim : styles.spotRing}`}>{children}</div>
  );
}

/** The real sidebar + top bar + white content sheet, at real desktop sizes. */
function AppFrame({ role, activeNav, screenName, children, overlay }) {
  const frameRef = useRef(null);
  const scale = useFit(frameRef);
  const nav = role === "teacher" ? TEACHER_NAV : STUDENT_NAV;
  const person = role === "teacher" ? TEACHER : STUDENT;

  return (
    <div className={styles.frame} ref={frameRef}>
      <div
        className={styles.screen}
        style={{ transform: `scale(${scale})` }}
        data-screen={screenName}
      >
        <aside className={styles.side}>
          <div className={styles.sideBrand}>
            <img src={logo} alt="" />
          </div>
          <nav className={styles.sideNav}>
            {nav.map((item) => (
              <span
                key={item.id}
                className={`${styles.sideItem} ${item.id === activeNav ? styles.sideItemActive : ""}`}
              >
                <span className={styles.sideIcon}>
                  <i className={`bi ${item.icon}`} aria-hidden="true" />
                </span>
                <span className={styles.sideLabel}>{item.label}</span>
              </span>
            ))}
          </nav>
        </aside>

        <div className={styles.appMain}>
          <header className={styles.topBar}>
            <span className={styles.topBrand}>JEN Academia</span>
            <div className={styles.topRight}>
              <span className={styles.topIcon}>
                <i className="bi bi-chat-dots-fill" aria-hidden="true" />
              </span>
              <span className={styles.topIcon}>
                <i className="bi bi-bell-fill" aria-hidden="true" />
                <i className={styles.topBadge} aria-hidden="true" />
              </span>
              <span className={styles.topSep} aria-hidden="true">|</span>
              <span className={styles.topUser}>
                <span className={styles.topName}>{person.name}</span>
                <img className={styles.topAvatar} src={avatar} alt="" />
                <i className="bi bi-chevron-down" aria-hidden="true" />
              </span>
            </div>
          </header>

          <div className={styles.contentArea}>
            <div className={styles.sheet}>{children}</div>
          </div>
        </div>

        {overlay}
      </div>
    </div>
  );
}

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OCT_START = 4; // 1 October 2026 is a Thursday
const OCT_DAYS = 31;
const TODAY = 25;
const CLASS_DAYS = [20, 22, 27, 29];
const FREE_DAYS = [26, 28, 30, 31];

/** The month card: real cell colours, real week labels, real legend. */
function MonthCard({ selected, classes = CLASS_DAYS, free = FREE_DAYS, role = "teacher" }) {
  const cells = [];
  for (let i = 0; i < OCT_START; i += 1) cells.push(null);
  for (let day = 1; day <= OCT_DAYS; day += 1) cells.push(day);

  return (
    <div className={styles.calCard}>
      <div className={styles.calHead}>
        <span className={styles.calNav} aria-hidden="true">‹</span>
        <span className={styles.calMonth}>October 2026</span>
        <span className={styles.calNav} aria-hidden="true">›</span>
      </div>
      <div className={styles.calWeek}>
        {WEEK.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className={styles.calGrid}>
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} className={styles.calBlank} />;
          const past = day < TODAY;
          const cellClass = [
            styles.calCell,
            past ? styles.calPast : "",
            !past && classes.includes(day) ? styles.calBusy : "",
            !past && !classes.includes(day) && free.includes(day) ? styles.calFree : "",
            !past && !classes.includes(day) && !free.includes(day) ? styles.calNone : "",
            day === TODAY ? styles.calToday : "",
            day === selected ? styles.calChosen : "",
          ].filter(Boolean).join(" ");
          return <span key={day} className={cellClass}>{day}</span>;
        })}
      </div>
      <div className={styles.calLegend}>
        <span className={styles.calLegendTitle}>What the colours mean</span>
        <span className={styles.calLegendRow}>
          <i className={styles.dotFree} aria-hidden="true" />
          {role === "teacher" ? "Free to book" : "Your teacher is free"}
        </span>
        <span className={styles.calLegendRow}>
          <i className={styles.dotBusy} aria-hidden="true" />
          {role === "teacher" ? "You have a class" : "You have a class"}
        </span>
        <span className={styles.calLegendRow}>
          <i className={styles.dotNone} aria-hidden="true" />
          {role === "teacher" ? "No times yet" : "No times set yet"}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Home ---- */

function HomeScene({ role, focus }) {
  const isTeacher = role === "teacher";
  return (
    <AppFrame role={role} activeNav="home" screenName="Home">
      <div className={styles.dash}>
        <div className={styles.dashShell}>
          <header className={styles.dashHero}>
            <p className={styles.dashKicker}>Hi, {isTeacher ? TEACHER.name : STUDENT.name}</p>
            <h1 className={styles.dashTitle}>{isTeacher ? "Time to teach" : "Time for class"}</h1>
          </header>

          {!isTeacher && (
            <div className={styles.counterCard}>
              <span className={styles.counterLabel}>Classes left</span>
              <span className={styles.counterNumber}>6</span>
              <span className={styles.counterReady}>Ready to book: 6</span>
            </div>
          )}

          {!isTeacher && (
            <div className={styles.bookBig}>
              <span aria-hidden="true">📅</span> Book a class
            </div>
          )}

          <div className={styles.dashSection}>
            <h2 className={styles.sectionTitle}>{isTeacher ? "Classes today" : "My classes today"}</h2>
            <Spotlight active={focus === "today"}>
              <div className={styles.classList}>
                <div className={styles.classRow}>
                  <div className={styles.classInfo}>
                    <span className={styles.className}>{isTeacher ? "Emma Santos" : "English"}</span>
                    <span className={styles.classMeta}>{isTeacher ? "English" : STUDENT.teacher}</span>
                  </div>
                  <span className={styles.classArrow} aria-hidden="true">▶</span>
                </div>
                <div className={styles.classRow}>
                  <div className={styles.classInfo}>
                    <span className={styles.className}>{isTeacher ? "Liam Cruz" : "Reading"}</span>
                    <span className={styles.classMeta}>{isTeacher ? "Reading" : STUDENT.teacher}</span>
                  </div>
                  <span className={styles.classArrow} aria-hidden="true">▶</span>
                </div>
              </div>
            </Spotlight>
          </div>

          {isTeacher ? (
            <div className={styles.actionStack}>
              <div className={styles.panelAction}>
                <span aria-hidden="true">📅</span> Open calendar
              </div>
              <div className={styles.panelAction}>
                <span aria-hidden="true">👤</span> My students
              </div>
            </div>
          ) : (
            <div className={styles.dashSection}>
              <h2 className={styles.sectionTitle}>My assignments</h2>
              <div className={styles.classRow}>
                <div className={styles.classInfo}>
                  <span className={styles.className}>Reading practice</span>
                  <span className={styles.classMeta}>English</span>
                </div>
                <span className={styles.classArrow} aria-hidden="true">▶</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppFrame>
  );
}

/* ----------------------------------------------------------- Calendar ---- */

function ViewSwitch() {
  return (
    <div className={styles.viewSwitch}>
      <span className={styles.viewOn}>📅 Month</span>
      <span className={styles.viewOff}>📋 List</span>
    </div>
  );
}

function AvailabilityModal({ spotlight }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.sceneDialog}>
        <div className={styles.dialogHead}>
          <div>
            <h2 className={styles.dialogTitle}>Set Your Schedule</h2>
            <p className={styles.dialogSub}>
              Set your available times from today up to 3 months ahead. You cannot set
              availability on dates with existing bookings or past dates.
            </p>
          </div>
          <span className={styles.dialogClose} aria-hidden="true">×</span>
        </div>
        <div className={styles.dialogBody}>
          <div className={styles.formGrid}>
            <div className={styles.formFull}>
              <span className={styles.formLabel}>Apply To *</span>
              <div className={styles.segment}>
                <span className={styles.segmentBtn}>Single Day</span>
                <span className={`${styles.segmentBtn} ${styles.segmentOn}`}>Weekly Pattern</span>
              </div>
            </div>
            <div className={styles.formFull}>
              <span className={styles.formLabel}>Weekdays *</span>
              <div className={styles.weekChips}>
                {WEEK.map((day) => (
                  <span key={day} className={day === "Tue" ? styles.weekChipOn : styles.weekChip}>
                    {day}
                  </span>
                ))}
              </div>
              <span className={styles.formHint}>Applies to 4 dates in October 2026</span>
            </div>
            <div className={styles.formFull}>
              <span className={styles.formLabel}>Availability Status *</span>
              <div className={styles.segment}>
                <span className={`${styles.segmentBtn} ${styles.segmentOn}`}>Available</span>
                <span className={`${styles.segmentBtn} ${styles.segmentBtnDanger}`}>Unavailable</span>
              </div>
            </div>
            <div className={styles.formTwo}>
              <div>
                <span className={styles.formLabel}>Start Time *</span>
                <div className={styles.input}>04:00 PM</div>
              </div>
              <div>
                <span className={styles.formLabel}>End Time *</span>
                <div className={styles.input}>07:00 PM</div>
                <span className={styles.formHint}>Duration: 3h 0m</span>
              </div>
            </div>
            <div className={styles.formFull}>
              <span className={styles.formLabel}>Break Time (Optional)</span>
              <div className={styles.formTwo}>
                <div className={styles.input}>05:30 PM</div>
                <div className={styles.input}>06:00 PM</div>
              </div>
              <span className={styles.formHint}>Break: 5:30 PM - 6:00 PM</span>
            </div>
          </div>
          <div className={styles.modalStack}>
            <span className={styles.btnWideGhost}>Close</span>
            <Spotlight active={spotlight} dim={false}>
              <span className={styles.btnWidePrimary}>Save Availability</span>
            </Spotlight>
          </div>
          <span className={styles.seeBtn}>
            <span aria-hidden="true">📅</span> See my availabilities (12)
          </span>
        </div>
      </div>
    </div>
  );
}

function AvailabilityScene({ role, focus }) {
  return (
    <AppFrame
      role={role}
      activeNav="calendar"
      screenName="Calendar"
      overlay={<AvailabilityModal spotlight={focus === "save"} />}
    >
      <div className={styles.calWrap}>
        <div className={styles.calCol}>
          {role === "teacher" && <ViewSwitch />}
          <MonthCard selected={26} classes={[27, 29]} free={[26, 28, 30, 31]} role={role} />
        </div>
        <aside className={styles.panel}>
          <span className={styles.panelTitle}>Actions</span>
          <div className={styles.panelAction}>
            <span aria-hidden="true">🗓️</span> Set Availability
          </div>
          <div className={styles.panelAction}>
            <span aria-hidden="true">📅</span> Jump to Today
          </div>
          <span className={styles.panelTitle}>Sunday, October 25, 2026</span>
          <div className={styles.dayClass}>
            <strong>No classes scheduled for this day</strong>
            <span>Set your times, then students can book.</span>
          </div>
        </aside>
      </div>
    </AppFrame>
  );
}

const BOOK_DAYS = [
  { id: 25, day: "Sun", num: 25, month: "Oct", state: "busy" },
  { id: 26, day: "Mon", num: 26, month: "Oct", state: "free" },
  { id: 27, day: "Tue", num: 27, month: "Oct", state: "free", active: true },
  { id: 28, day: "Wed", num: 28, month: "Oct", state: "free" },
  { id: 29, day: "Thu", num: 29, month: "Oct", state: "busy" },
  { id: 30, day: "Fri", num: 30, month: "Oct", state: "free" },
];

const DAY_BADGE = { free: "Free", busy: "Busy", none: "No times" };

function BookingScene({ role, focus }) {
  return (
    <AppFrame role={role} activeNav="calendar" screenName="Calendar">
      <div className={styles.kidCol}>
        <div className={styles.wizard}>
          <div className={styles.wizardHead}>
            <div>
              <h2 className={styles.wizardTitle}>Book a class</h2>
              <p className={styles.wizardIntro}>
                Choose a day and a time with {STUDENT.teacher}.
              </p>
            </div>
            <span className={styles.wizardCancel}>Cancel</span>
          </div>

          <div className={styles.steps}>
            <span className={`${styles.stepDot} ${styles.stepDotNow}`}>1</span>
            <span className={styles.stepLine} />
            <span className={styles.stepDot}>2</span>
            <span className={styles.stepLine} />
            <span className={styles.stepDot}>3</span>
          </div>
          <p className={styles.wizardStepCount}>Step 1 of 3</p>

          <div>
            <h3 className={styles.wizardQuestion}>Which day?</h3>
            <p className={styles.wizardHelp}>The green days are free. Pick one.</p>
          </div>

          <Spotlight active={focus === "book"}>
            <div className={styles.dayGrid}>
              {BOOK_DAYS.map((day) => {
                const off = day.state !== "free" && !day.active;
                const cardClass = [
                  styles.dayCard,
                  day.active ? styles.dayCardOn : "",
                  off ? styles.dayCardOff : "",
                ].filter(Boolean).join(" ");
                return (
                  <div key={day.id} className={cardClass}>
                    <span className={styles.dayName}>{day.day}</span>
                    <strong className={styles.dayNum}>{day.num}</strong>
                    <span className={styles.dayMonth}>{day.month}</span>
                    <em className={`${styles.dayBadge} ${day.state === "free" ? styles.dayBadgeFree : day.state === "busy" ? styles.dayBadgeBusy : styles.dayBadgeNone}`}>
                      {DAY_BADGE[day.state]}
                    </em>
                  </div>
                );
              })}
            </div>
          </Spotlight>

          <div className={styles.wizardFooter}>
            <span className={styles.btnGhostWide}>← Back</span>
            <span className={styles.btnPrimaryWide}>Next</span>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

function RescheduleScene({ role, focus }) {
  if (role === "student") {
    return (
      <AppFrame role={role} activeNav="calendar" screenName="Calendar">
        <div className={styles.kidCol}>
          <div className={styles.kidDetail}>
            <span className={styles.kidDetailDay}>Tuesday, October 27</span>
            <span className={styles.kidDetailTime}>4:00 PM - 4:50 PM</span>
            <span className={styles.kidDetailCourse}>English · Intermediate</span>

            <div className={styles.kidTeacherRow}>
              <img src={avatar} alt="" className={styles.pickAvatar} />
              <div>
                <em>Teacher</em>
                <strong>{STUDENT.teacher}</strong>
              </div>
            </div>
          </div>

          <Spotlight active={focus === "reschedule"}>
            <span className={styles.btnWarn}>Change the time</span>
          </Spotlight>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame role={role} activeNav="calendar" screenName="Calendar">
      <div className={styles.calWrap}>
        <div className={styles.calCol}>
          <ViewSwitch />
          <MonthCard selected={27} classes={[27]} free={[28, 29, 30]} role={role} />
        </div>
        <aside className={styles.panel}>
          <span className={styles.panelTitle}>Tuesday, October 27, 2026</span>
          <div className={styles.dayClass}>
            <strong>English with Emma</strong>
            <span>9:00 AM - 10:00 AM</span>
            <span>Student: Emma Santos</span>
          </div>
          <Spotlight active={focus === "reschedule"}>
            <span className={styles.btnWarn}>Request for Reschedule</span>
          </Spotlight>
        </aside>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------- Students -- */

const STUDENT_ROWS = [
  {
    name: "Emma Santos",
    email: "emma.santos@example.com",
    contact: "0917 555 0101",
    course: "English",
    level: "Intermediate",
    pack: "12 classes",
    duration: "50 min per class",
    expiry: "18 days left",
    expiryTone: "ok",
    left: 6,
    used: 6,
    total: 12,
    status: "Active",
    tone: "active",
  },
  {
    name: "Liam Cruz",
    email: "liam.cruz@example.com",
    contact: "0917 555 0182",
    course: "Reading",
    level: "Beginner",
    pack: "8 classes",
    duration: "50 min per class",
    expiry: "5 days left",
    expiryTone: "warn",
    left: 3,
    used: 5,
    total: 8,
    status: "Active",
    tone: "active",
  },
  {
    name: "Ava Reyes",
    email: "No email",
    contact: "No contact",
    course: "No course assigned",
    level: "No level set",
    pack: "No active package",
    duration: "Duration not set",
    expiry: "",
    left: 0,
    used: 0,
    total: 0,
    status: "No Package",
    tone: "no_package",
  },
];

const STUDENT_TABS = [
  { id: "all", label: "All", count: 3, tone: "all" },
  { id: "active", label: "Active", count: 2, tone: "active" },
  { id: "used_up", label: "Used Up", count: 0, tone: "used_up" },
  { id: "inactive", label: "Inactive", count: 0, tone: "inactive" },
  { id: "no_package", label: "No Package", count: 1, tone: "no_package" },
];

function StudentsScene({ role, focus }) {
  return (
    <AppFrame role={role} activeNav="students" screenName="My students">
      <div className={styles.rosterPage}>
        <div className={styles.rosterHead}>
          <div>
            <h2 className={styles.rosterTitle}>Students</h2>
            <p className={styles.rosterSub}>
              Track your assigned students, course details, and remaining class package balance.
            </p>
          </div>
          <span className={styles.btnGhost}>Refresh</span>
        </div>

        <div className={styles.statusTabs}>
          {STUDENT_TABS.map((tab) => (
            <span
              key={tab.id}
              className={`${styles.statusTab} ${styles[`statusTab_${tab.tone}`]} ${tab.id === "all" ? styles.statusTabOn : ""}`}
            >
              {tab.label} ({tab.count})
            </span>
          ))}
        </div>

        <div className={styles.searchInput}>
          <input
            type="search"
            readOnly
            aria-label="Search students"
            placeholder="Search by student, email, contact, course, level, or package status"
          />
        </div>

        <Spotlight active={focus === "student"}>
          <div className={styles.rosterWrap}>
            <table className={styles.rosterTable}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Package</th>
                  <th>Classes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {STUDENT_ROWS.map((student) => (
                  <tr key={student.name}>
                    <td>
                      <span className={styles.cellStrong}>{student.name}</span>
                      <span className={styles.cellLine}>{student.email}</span>
                      <span className={styles.cellLine}>{student.contact}</span>
                    </td>
                    <td>
                      <span className={styles.cellBold}>{student.course}</span>
                      <span className={styles.cellLine}>{student.level}</span>
                    </td>
                    <td>
                      <span className={styles.cellStrong}>{student.pack}</span>
                      <span className={styles.cellLine}>{student.duration}</span>
                      {student.expiry ? (
                        <span className={`${styles.expiryBadge} ${styles[`expiry_${student.expiryTone}`]}`}>
                          {student.expiry}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className={styles.classListLine}>Left: <strong>{student.left}</strong></span>
                      <span className={styles.classListLine}>Used: {student.used}</span>
                      <span className={styles.classListLine}>Total: {student.total}</span>
                      <span className={styles.rosterBar}>
                        <i
                          className={student.left === 0 ? styles.rosterBarEmpty : ""}
                          style={{ width: `${student.total ? (student.used / student.total) * 100 : 0}%` }}
                        />
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusPill} ${styles[`statusPill_${student.tone}`]}`}>
                        {student.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Spotlight>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------- Class history --- */

const HISTORY_TABS = [
  { label: "All", count: 12, tone: "all" },
  { label: "Verified", count: 9, tone: "verified" },
  { label: "Needs Review", count: 1, tone: "needs_review" },
  { label: "Incomplete", count: 2, tone: "incomplete" },
  { label: "Student Confirmed", count: 0, tone: "student_confirmed" },
  { label: "In Progress", count: 0, tone: "in_progress" },
  { label: "Pending", count: 0, tone: "pending" },
  { label: "No Log", count: 0, tone: "missing" },
];

function HistoryScene({ role, focus }) {
  if (role === "student") {
    return (
      <AppFrame role={role} activeNav="history" screenName="Class history">
        <div className={styles.page}>
          <div className={styles.pageHead}>
            <div>
              <h1 className={styles.pageTitle}>My classes</h1>
              <p className={styles.pageSub}>Every class you have had.</p>
            </div>
            <span className={styles.btnGhost}>Refresh</span>
          </div>
          <div className={styles.toolbarRow}>
            <span className={styles.pillGhost}>Filter</span>
            <span className={styles.mutedText}>Showing 3 of 12 classes.</span>
          </div>

          <Spotlight active={focus === "row"}>
            <div className={styles.kidList}>
              <div className={styles.kidHistoryCard}>
                <span className={styles.kidIcon} aria-hidden="true">📘</span>
                <div className={styles.kidHistoryBody}>
                  <strong className={styles.kidTitle}>English with {STUDENT.teacher}</strong>
                  <span className={styles.kidWhen}>Wednesday, October 21 · Morning</span>
                  <em className={`${styles.chip} ${styles.chipGreen}`}>All done! 🎉</em>
                  <div className={styles.kidFacts}>
                    <span>🧑‍🏫</span>
                    <div><em>Your teacher</em><strong>{STUDENT.teacher}</strong></div>
                    <span>⏱️</span>
                    <div><em>How long</em><strong>50 minutes</strong></div>
                    <span>📝</span>
                    <div><em>What you did</em><strong>Past tense and new animal words.</strong></div>
                  </div>
                  <div className={styles.btnPrimaryWide}>▶️ Watch the class again</div>
                </div>
              </div>
            </div>
          </Spotlight>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame role={role} activeNav="history" screenName="Class history">
      <div className={styles.rosterPage}>
        <div className={styles.rosterHead}>
          <div>
            <h2 className={styles.rosterTitle}>Class History</h2>
            <p className={styles.rosterSub}>
              Review your conducted classes, student attendance, verified duration,
              class summary, and recording proof.
            </p>
          </div>
          <span className={styles.btnGhost}>Refresh</span>
        </div>

        <div className={styles.statusTabs}>
          {HISTORY_TABS.map((tab) => (
            <span
              key={tab.label}
              className={`${styles.statusTab} ${styles[`statusTab_${tab.tone}`]} ${tab.label === "All" ? styles.statusTabOn : ""}`}
            >
              {tab.label} ({tab.count})
            </span>
          ))}
        </div>

        <div className={styles.searchInput}>
          <input
            type="search"
            readOnly
            aria-label="Search class history"
            placeholder="Search by class, student, date, or status"
          />
        </div>

        <Spotlight active={focus === "row"}>
          <div className={styles.verificationItem}>
            <div className={styles.vMain}>
              <div className={styles.vTitleRow}>
                <div>
                  <h3 className={styles.vTitle}>English with Emma</h3>
                  <p className={styles.vWhen}>Wed, Oct 21, 2026 · 9:00 AM - 10:00 AM · 50 min</p>
                </div>
                <span className={`${styles.vStatus} ${styles.statusPill_active}`}>Verified</span>
              </div>

              <div className={styles.vGrid}>
                <div>
                  <span>Student</span>
                  <strong>Emma Santos</strong>
                  <small>emma.santos@example.com</small>
                </div>
                <div>
                  <span>Class Status</span>
                  <strong>completed</strong>
                  <small>Calendar lifecycle</small>
                </div>
                <div>
                  <span>Proof</span>
                  <strong>Recording</strong>
                  <small>Expires Nov 20, 2026</small>
                </div>
                <div>
                  <span>Evidence</span>
                  <strong>Complete</strong>
                  <small>All checkpoints present</small>
                </div>
              </div>

              <div className={styles.vGrid}>
                <div><span>Start</span><strong>9:00 AM</strong></div>
                <div><span>Attendance</span><strong>9:01 AM</strong></div>
                <div><span>End</span><strong>9:50 AM</strong></div>
                <div><span>Duration</span><strong>50 min</strong></div>
              </div>

              <span className={styles.vGood}>Evidence complete</span>
              <p className={styles.vSummary}>
                Great progress on the past tense. Emma used it without help three times.
              </p>
            </div>

            <div className={styles.vActions}>
              <span className={styles.vActionsTitle}>Class proof</span>
              <span className={styles.vActionBtn}>Open Start Screenshot</span>
              <span className={styles.vActionBtn}>Watch Recording</span>
              <span className={styles.vActionBtn}>Open End Screenshot</span>
            </div>
          </div>
        </Spotlight>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------ Contract review -- */

const TEACHER_CRITERIA = [
  { label: "Speaking & Pronunciation", hint: "Judged on whether the student is understandable. An accent is fine, perfection is not required." },
  { label: "Reading & Comprehension", hint: "Can they read a passage and explain what it means?" },
  { label: "Structure", hint: "Can they organise their ideas in a logical order?" },
  { label: "Sentence / Grammar", hint: "Grammar mistakes are acceptable at Intermediate as long as the meaning gets across." },
  { label: "Vocabulary", hint: "Range and accuracy of the words they use." },
];

const STUDENT_CRITERIA = [
  { label: "Clear explanations", hint: "Could the teacher explain ideas in a way that made sense?" },
  { label: "Patient & supportive", hint: "Did the teacher give you time, encouragement and help when you needed it?" },
  { label: "Engaging classes", hint: "Were the classes interesting and easy to take part in?" },
  { label: "Helpful feedback", hint: "Did the teacher tell you what you did well and what to practise next?" },
  { label: "Professional & prepared", hint: "Was the teacher ready for class, on time and respectful?" },
];

function ScoreRow({ label, hint, value }) {
  return (
    <fieldset className={styles.criterion}>
      <legend>{label}</legend>
      <p>{hint}</p>
      <span className={styles.scoreScale}>
        {[1, 2, 3, 4, 5].map((score) => (
          <span
            key={score}
            className={`${styles.scoreOption} ${score === value ? styles.scoreOptionOn : ""}`}
          >
            {score}
          </span>
        ))}
      </span>
    </fieldset>
  );
}

function Stars({ value }) {
  return (
    <span className={styles.stars} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= value ? styles.starOn : styles.starOff}>★</span>
      ))}
    </span>
  );
}

function ReviewModal({ role, active }) {
  const isTeacher = role === "teacher";
  const criteria = isTeacher ? TEACHER_CRITERIA : STUDENT_CRITERIA;
  const scores = [4, 3, 4, 5, 4];
  return (
    <div className={styles.reviewBackdrop}>
      <section className={styles.reviewModal} role="dialog" aria-modal="true">
        <div className={styles.reviewModalHead}>
          <div>
            <p className={styles.reviewKicker}>
              {isTeacher ? "Final level evaluation" : "Teacher rating"}
            </p>
            <h2 className={styles.reviewModalTitle}>
              {isTeacher ? "How did Emma Santos finish?" : "How were your classes with Ms. Ana Reyes?"}
            </h2>
            <p className={styles.reviewModalSub}>
              {isTeacher
                ? "Score each criterion from 1 to 5. This evaluation is required before you can continue, and the student will not see it."
                : "Rate each part of the teaching from 1 to 5. This rating is required before you can continue, and your teacher will not see it."}
            </p>
          </div>
          <span className={styles.reviewClose} aria-hidden="true">×</span>
        </div>

        <div className={styles.reviewModalBody}>
          <Spotlight active={active} dim={false}>
            <div className={styles.criteriaList}>
              {criteria.map((criterion, index) => (
                <ScoreRow
                  key={criterion.label}
                  label={criterion.label}
                  hint={criterion.hint}
                  value={scores[index]}
                />
              ))}
            </div>
          </Spotlight>

          <div className={styles.commentField}>
            <span>Comments (optional)</span>
            <div className={styles.commentArea}>
              {isTeacher
                ? "What should the student practise next? What improved?"
                : "What did your teacher do well? What could be even better?"}
            </div>
          </div>

          <div className={styles.previewBox}>
            {isTeacher ? (
              <>
                <span>Computed proficiency level</span>
                <strong>Intermediate High</strong>
                <small>Average score 4.0 of 5.</small>
              </>
            ) : (
              <>
                <span>Overall rating</span>
                <strong>4.0 / 5</strong>
                <Stars value={4} />
              </>
            )}
          </div>

          <div className={styles.reviewModalActions}>
            <span className={styles.btnPrimary}>
              {isTeacher ? "Submit final evaluation" : "Submit rating"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReviewsScene({ role, focus }) {
  const isTeacher = role === "teacher";
  return (
    <AppFrame
      role={role}
      activeNav="reviews"
      screenName="Contract reviews"
      overlay={<ReviewModal role={role} active={focus === "scores"} />}
    >
      <div className={styles.reviewPage}>
        <header className={styles.reviewHero}>
          <p className={styles.reviewKicker}>{isTeacher ? "Closing evaluation" : "Your feedback"}</p>
          <h1 className={styles.reviewHeroTitle}>
            {isTeacher ? "Contract reviews" : "How were your classes?"}
          </h1>
          <p className={styles.reviewHeroText}>
            {isTeacher
              ? "When a student finishes every class in their contract, score their final level and leave feedback. This closing evaluation is required before you can continue using JEN Academia. The student will not see it; only an administrator can read both reviews."
              : "When your contract is complete, tell us how your teacher did. This closing rating is required before you can continue using JEN Academia. Your teacher will not see your answers; only an administrator can read both reviews."}
          </p>
          <div className={styles.heroStats}>
            <span className={styles.statPill}>
              {isTeacher ? "1 required review" : "1 required rating"}
            </span>
            <span className={styles.statMuted}>1 completed contract</span>
          </div>
        </header>

        <article className={styles.reviewCard}>
          <div className={styles.reviewHead}>
            <div className={styles.reviewPerson}>
              <span className={styles.reviewAvatar}>{isTeacher ? "ES" : "AR"}</span>
              <div>
                <p className={styles.reviewRole}>{isTeacher ? "Student" : "Teacher"}</p>
                <h2 className={styles.reviewName}>{isTeacher ? "Emma Santos" : "Ms. Ana Reyes"}</h2>
                <p className={styles.reviewMeta}>
                  {isTeacher ? "12 classes completed · October 21, 2026" : "12 classes completed · October 21, 2026"}
                </p>
              </div>
            </div>
            <em className={`${styles.reviewStatus} ${styles.reviewStatusPending}`}>Waiting for you</em>
          </div>
          <div className={styles.reviewProgress}><i /></div>
          <div className={styles.reviewActions}>
            <span className={styles.reviewActionBtn}>
              {isTeacher ? "Score final level" : "Rate your teacher"}
            </span>
          </div>
          <div className={styles.reviewBlock}>
            <div className={styles.reviewBlockHead}>
              <h4>{isTeacher ? "Your evaluation of the student" : "Your rating of the teacher"}</h4>
              <span className={styles.reviewNotYet}>Not submitted</span>
            </div>
            <p className={styles.reviewEmpty}>
              {isTeacher
                ? "Score the five level criteria to update the student's proficiency level."
                : "Rate the five teaching criteria and leave a comment."}
            </p>
          </div>
        </article>
      </div>
    </AppFrame>
  );
}

/* -------------------------------------------------------------- Remarks -- */

function RemarksScene({ role, focus }) {
  return (
    <AppFrame role={role} activeNav="remarks" screenName="Remarks">
      <div className={styles.page}>
        <h2 className={styles.pageTitle}>Teacher&apos;s remarks</h2>
        <Spotlight active={focus === "note"}>
          <div className={styles.remarkList}>
            <div className={styles.remarkCard}>
              <div className={styles.remarkWho}>
                <img src={avatar} alt="" className={styles.remarkAvatar} />
                <strong>{STUDENT.teacher}</strong>
                <span>Oct 21, 2026</span>
              </div>
              <p>“You used the past tense all by yourself today. Brilliant!” 🌟</p>
            </div>
            <div className={styles.remarkCard}>
              <div className={styles.remarkWho}>
                <img src={avatar} alt="" className={styles.remarkAvatar} />
                <strong>{STUDENT.teacher}</strong>
                <span>Oct 14, 2026</span>
              </div>
              <p>“Your reading is getting faster. Try the new animal words at home.”</p>
            </div>
          </div>
        </Spotlight>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------ Class note ---- */

/**
 * The teacher's class panel in Calendar. The note composer sits directly under
 * the class information and above the long verification section, which is the
 * only place a teacher can write a class remark. Sending the note is what
 * unlocks "End, Verify & Complete".
 */
function ClassNoteScene({ focus }) {
  return (
    <AppFrame role="teacher" activeNav="calendar" screenName="Calendar">
      <div className={styles.calWrap}>
        <div className={styles.calCol}>
          <ViewSwitch />
          <MonthCard selected={27} classes={[27]} free={[28, 29, 30]} role="teacher" />
        </div>

        <aside className={styles.panel}>
          <div className={styles.classPanelCard}>
            <div className={styles.classPanelHead}>
              <span className={styles.classPanelIcon} aria-hidden="true">👩‍🏫</span>
              <strong>Class info</strong>
            </div>
            <div className={styles.classPanelRow}>
              <img src={avatar} alt="" className={styles.classPanelAvatar} />
              <span>
                <em className={styles.classPanelLabel}>Student</em>
                <strong className={styles.classPanelValue}>Emma Santos</strong>
              </span>
            </div>
            <div className={styles.classPanelRow}>
              <span className={styles.classPanelIcon} aria-hidden="true">📚</span>
              <span>
                <em className={styles.classPanelLabel}>Class</em>
                <strong className={styles.classPanelValue}>English · Intermediate</strong>
              </span>
            </div>
            <div className={styles.classPanelRow}>
              <span className={styles.classPanelIcon} aria-hidden="true">🕐</span>
              <span>
                <em className={styles.classPanelLabel}>Time</em>
                <strong className={styles.classPanelValue}>4:00 PM - 4:50 PM</strong>
              </span>
            </div>
          </div>

          <Spotlight active={focus === "note"}>
            <div className={styles.classNoteCard}>
              <div className={styles.classNoteHead}>
                <span className={styles.classPanelIcon} aria-hidden="true">📝</span>
                <span>
                  <strong className={styles.classNoteTitle}>Say something about this class</strong>
                  <em className={styles.classNoteName}>Emma Santos</em>
                </span>
              </div>
              <p className={styles.classNoteRequired}>
                Required: send a note about this class before you can complete it.
              </p>
              <div className={styles.classNoteBox}>
                You used the past tense all by yourself today. Great work!
              </div>
              <span className={styles.classNoteBtn}>Send the note</span>
            </div>
          </Spotlight>
        </aside>
      </div>
    </AppFrame>
  );
}

/* ---------------------------------------------------------- Assignments -- */

function AssignmentsScene({ role, focus }) {
  if (role === "student") {
    return (
      <AppFrame role={role} activeNav="assignments" screenName="Assignments">
        <div className={styles.page}>
          <h2 className={styles.pageTitle}>Your assignments</h2>
          <Spotlight active={focus === "open"}>
            <div className={styles.assignCard}>
              <div className={styles.assignMain}>
                <strong className={styles.assignTitle}>Reading practice: chapter 4</strong>
                <span className={styles.assignGiven}>Date given: Oct 21, 2026</span>
                <span className={styles.assignDue}>Due date: Oct 28, 2026</span>
                <span className={styles.assignState}>Not done yet</span>
              </div>
              <span className={styles.openBtn}>Open ▶</span>
            </div>
          </Spotlight>
          <div className={styles.assignCard}>
            <div className={styles.assignMain}>
              <strong className={styles.assignTitle}>Past tense worksheet</strong>
              <span className={styles.assignGiven}>Date given: Oct 14, 2026</span>
              <span className={styles.assignDue}>Due date: Oct 18, 2026</span>
              <span className={styles.assignDone}>Done</span>
            </div>
            <span className={styles.openBtn}>Open ▶</span>
          </div>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame role={role} activeNav="assignments" screenName="Assignments">
      <div className={styles.assignGrid}>
        <div className={styles.remarksCol}>
          <div className={styles.assignSearch}>
            <i className="bi bi-search" aria-hidden="true" />
            <input type="text" readOnly aria-label="Search students" placeholder="Search" />
          </div>
          <div className={styles.rosterPick}>
            <img src={avatar} alt="" className={styles.pickAvatar} />
            <span>
              <strong>Emma Santos</strong>
            </span>
          </div>
          <div className={styles.rosterPick}>
            <img src={avatar} alt="" className={styles.pickAvatar} />
            <span>
              <strong>Liam Cruz</strong>
            </span>
          </div>
        </div>

        <div className={styles.remarksCol}>
          <div className={styles.assignTabs}>
            <span className={`${styles.assignTab} ${styles.assignTabOn}`}>Assign Task</span>
            <span className={styles.assignTab}>View Submissions</span>
            <span className={styles.assignTab}>Manage Assignments</span>
          </div>

          <div className={styles.pickedPerson}>
            <img src={avatar} alt="" className={styles.remarkAvatar} />
            <strong>Emma Santos</strong>
          </div>

          <div className={styles.assignInfo}>
            <div className={styles.formInline}>
              <span className={styles.formLabel}>Due Date (optional):</span>
              <div className={styles.input}>10/28/2026 05:00 PM</div>
            </div>

            <label className={styles.checkRow}>
              <span className={styles.checkBox} aria-hidden="true" />
              Limit attempts
            </label>

            <div className={styles.assignInstructions}>
              <h4 className={styles.assignSectionTitle}>Instructions:</h4>
              <div className={styles.assignTextarea}>Write your instructions here...</div>
              <div className={styles.formInline}>
                <span className={styles.formLabel}>Attach a file (optional):</span>
                <div className={styles.fileChoose}>Choose File</div>
              </div>
              <Spotlight active={focus === "assign"} dim={false}>
                <div className={styles.btnSubmitWide}>Create Assignment</div>
              </Spotlight>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* --------------------------------------------------------------- Books -- */

const GUIDE_BOOKS = [
  { title: "English Adventures 2", course: "English", lessons: 5 },
  { title: "Phonics Fun 1", course: "Reading", lessons: 4 },
];

function BookCards({ focus, role }) {
  return (
    <Spotlight active={focus === "progress"}>
      <div className={styles.bookGrid}>
        {GUIDE_BOOKS.map((book) => (
          <div key={book.title} className={styles.bookCard}>
            <div className={styles.bookImagePlaceholder}>
              <span className={styles.bookPlaceholder}>Book</span>
            </div>
            <div className={styles.bookCardBody}>
              <h3 className={styles.bookName}>{book.title}</h3>
              <span className={styles.bookMeta}>
                {role === "teacher" ? (
                  <>
                    <i className="bi bi-mortarboard" aria-hidden="true" />
                    {book.course}
                  </>
                ) : (
                  <>
                    <i className="bi bi-people" aria-hidden="true" />
                    Ms. Ana Reyes
                  </>
                )}
              </span>
              <span className={styles.bookView}>View Lessons</span>
            </div>
          </div>
        ))}
      </div>
    </Spotlight>
  );
}

/* The student's reader: a full-screen sheet over the books list, exactly as the
   real fullscreenPdf covers the whole window. */
function ReaderScreen({ focus }) {
  return (
    <div className={styles.readerScreen}>
      <div className={styles.readerHead}>
        <div className={styles.readerHeadText}>
          <h2>Past tense</h2>
          <p>lesson-3-past-tense.pdf</p>
        </div>
        <div className={styles.readerActions}>
          <span className={styles.readerStatus}>Ready to complete</span>
          <Spotlight active={focus === "complete"} dim={false}>
            <span className={styles.readerComplete}>Mark as Complete</span>
          </Spotlight>
          <span className={styles.readerClose}>Close</span>
        </div>
      </div>

      <div className={styles.readerBody}>
        <article className={styles.readerPage}>
          <p className={styles.readerKicker}>Lesson 3</p>
          <h3 className={styles.readerTitle}>Past tense</h3>
          <p>
            Yesterday I walked to school. I played with my friends and I talked to my
            teacher.
          </p>
          <p>
            When we talk about yesterday, we add <strong>-ed</strong> to the verb.
          </p>
          <p>
            <strong>walk</strong> → walked &nbsp;·&nbsp; <strong>play</strong> → played
            &nbsp;·&nbsp; <strong>talk</strong> → talked
          </p>
          <p>
            Now finish the sentence: “Yesterday, I ______ (help) my mum at home.”
          </p>
        </article>
      </div>
    </div>
  );
}

function BooksScene({ role, focus }) {
  if (role === "student") {
    return (
      <AppFrame
        role={role}
        activeNav="books"
        screenName="Books/Lessons"
        overlay={<ReaderScreen focus={focus} />}
      >
        <div className={styles.booksPage}>
          <div className={styles.booksHead}>
            <div className={styles.booksHeadMain}>
              <span className={styles.booksIcon} aria-hidden="true">
                <i className="bi bi-journal-bookmark-fill" />
              </span>
              <div className={styles.booksHeadText}>
                <h1>Books &amp; Lessons</h1>
                <p>Explore the resources uploaded by your teachers.</p>
              </div>
            </div>
            <div className={styles.countTile}>
              <strong>2</strong>
              <span>Books</span>
            </div>
          </div>
          <BookCards focus={focus} role={role} />
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame role={role} activeNav="books" screenName="My books">
      <div className={styles.booksPage}>
        <div className={styles.booksHead}>
          <div className={styles.booksHeadMain}>
            <span className={styles.booksIcon} aria-hidden="true">
              <i className="bi bi-journal-bookmark-fill" />
            </span>
            <div className={styles.booksHeadText}>
              <h1>Books &amp; Lessons</h1>
              <p>Books assigned to you by the administrator.</p>
            </div>
          </div>
          <div className={styles.countTile}>
            <strong>2</strong>
            <span>Books</span>
          </div>
        </div>
        <BookCards focus={focus} role={role} />
      </div>
    </AppFrame>
  );
}

const SCENES = {
  home: HomeScene,
  availability: AvailabilityScene,
  booking: BookingScene,
  reschedule: RescheduleScene,
  students: StudentsScene,
  history: HistoryScene,
  reviews: ReviewsScene,
  remarks: RemarksScene,
  classNote: ClassNoteScene,
  assignments: AssignmentsScene,
  books: BooksScene,
};

/** The visual column: a labelled copy of the screen, then the sentence about it. */
export default function GuidePreview({ preview, role, module }) {
  const Scene = preview ? SCENES[preview.scene] : null;
  if (!Scene) return null;

  return (
    <div className={styles.visual}>
      <div className={styles.visualHead}>
        <span className={styles.visualKicker}>What it looks like</span>
        <span className={styles.visualModule}>{module}</span>
      </div>
      <div aria-hidden="true">
        <Scene role={role} focus={preview.focus} />
      </div>
      {preview.highlight && (
        <div className={styles.annotation}>
          <span className={styles.annotationIcon} aria-hidden="true">👀</span>
          <div>
            <span className={styles.annotationKicker}>Look here</span>
            <strong>{preview.highlight.title}</strong>
            <p>{preview.highlight.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One real situation, told as a before/after story.
 *
 * A numbered list explains the app; a story explains the reason. Both are
 * needed, which is why the guide keeps them in separate boxes.
 */
export function ExampleSituation({ example }) {
  if (!example) return null;
  return (
    <section className={styles.example} aria-label="Example situation">
      <div className={styles.exampleIntro}>
        <span className={styles.exampleKicker}>Example situation</span>
        <h3>
          <span aria-hidden="true">{example.emoji}</span> {example.title}
        </h3>
        <p>{example.body}</p>
      </div>
      <div className={styles.exampleStory}>
        <div className={styles.flowRow}>
          {example.flow.map((item, index) => (
            <Fragment key={`${item.label}-${item.value}`}>
              {index > 0 && <span className={styles.flowArrow} aria-hidden="true">→</span>}
              <div className={`${styles.flowCard} ${TONE_CLASS[item.tone] || ""}`}>
                <span className={styles.flowLabel}>{item.label}</span>
                <strong className={styles.flowValue}>{item.value}</strong>
                {item.meta && <span className={styles.flowMeta}>{item.meta}</span>}
              </div>
            </Fragment>
          ))}
        </div>
        {example.outcome && (
          <p className={styles.outcome}>
            <span aria-hidden="true">✅</span> {example.outcome}
          </p>
        )}
      </div>
    </section>
  );
}

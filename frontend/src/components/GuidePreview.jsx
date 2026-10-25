import { Fragment } from "react";
import styles from "../assets/firstStepsGuide.module.css";

/**
 * The "show me" half of the welcome guide.
 *
 * !! This draws a small, honest copy of the screen instead of using a
 * !! screenshot. Screenshots go stale the moment a button moves, they cannot
 * !! be read on a phone, and they cannot be highlighted. Everything here is
 * !! built from the same tokens and shapes as the real pages, so what a teacher
 * !! or student learns here is exactly what they will find when they close the
 * !! guide.
 *
 * !! One step = one scene = ONE spotlight. Pointing at three things at once is
 * !! how help screens stop being helpful.
 *
 * !! The whole mock is aria-hidden. The sentence that explains the spotlight
 * !! lives outside it, in the annotation, where a screen reader can reach it.
 */

const TEACHER_NAV = [
  { id: "home", icon: "🏠", label: "Home" },
  { id: "calendar", icon: "🗓️", label: "Calendar" },
  { id: "students", icon: "🧒", label: "Students" },
  { id: "history", icon: "🕰️", label: "History" },
  { id: "reviews", icon: "⭐", label: "Reviews" },
  { id: "remarks", icon: "💬", label: "Remarks" },
  { id: "assignments", icon: "✏️", label: "Assignments" },
  { id: "books", icon: "📚", label: "My books" },
];

const STUDENT_NAV = [
  { id: "home", icon: "🏠", label: "Home" },
  { id: "calendar", icon: "🗓️", label: "Calendar" },
  { id: "history", icon: "🕰️", label: "History" },
  { id: "reviews", icon: "⭐", label: "Reviews" },
  { id: "remarks", icon: "💬", label: "Remarks" },
  { id: "assignments", icon: "✏️", label: "Assignments" },
  { id: "books", icon: "📚", label: "Books" },
];

const TONE_CLASS = {
  old: styles.flowCardOld,
  new: styles.flowCardNew,
  neutral: styles.flowCardNeutral,
};

// Name the bubble colours explicitly. A template string here would silently
// produce an undefined class the day a tone is renamed.
const BUBBLE_CLASS = {
  lime: styles.mockBubbleLime,
  sky: styles.mockBubbleSky,
  sand: styles.mockBubbleSand,
};

/**
 * One highlighted part of the mock.
 *
 * The label is rendered ABOVE the content rather than floating over it, so it
 * can never cover the thing it is pointing at, no matter how narrow the screen
 * gets.
 */
function Spotlight({ active = false, tag, children }) {
  return (
    <div className={`${styles.spotlight} ${active ? styles.spotlightActive : ""}`}>
      {active && tag ? <span className={styles.spotlightTag}>{tag}</span> : null}
      <div className={styles.spotlightBody}>{children}</div>
    </div>
  );
}

/** The frame every scene sits in: browser bar, app sidebar, page header. */
function MockFrame({ page, activeNav, role, children }) {
  const nav = role === "teacher" ? TEACHER_NAV : STUDENT_NAV;
  return (
    <div className={styles.mockWindow}>
      <div className={styles.mockChrome}>
        <span className={styles.mockDots} aria-hidden="true">
          <i /><i /><i />
        </span>
        <span className={styles.mockUrl}>
          jenacademia.com<span>/{page.replace(/\s+/g, "")}</span>
        </span>
        <span className={styles.mockChromeGap} />
      </div>
      <div className={styles.mockBody}>
        <aside className={styles.mockSidebar}>
          <span className={styles.mockBrand}>jen</span>
          <nav className={styles.mockNav}>
            {nav.map((item) => (
              <span
                key={item.id}
                className={`${styles.mockNavItem} ${item.id === activeNav ? styles.mockNavItemActive : ""}`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </span>
            ))}
          </nav>
        </aside>
        <div className={styles.mockCanvas}>
          <div className={styles.mockTopbar}>
            <strong>{page}</strong>
            <span className={styles.mockTopbarRight}>
              <span className={styles.mockBell} aria-hidden="true">🔔</span>
              <span className={styles.mockUser}>{role === "teacher" ? "James" : "Mia"}</span>
            </span>
          </div>
          <div className={styles.mockContent}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Three weeks is enough to show a pattern without shrinking the numbers. */
function MiniMonth({ month = "June 2026", selected, available = [], busy = [] }) {
  const days = Array.from({ length: 21 }, (_, index) => index + 1);
  return (
    <div className={styles.miniMonth}>
      <div className={styles.miniMonthHead}>
        <strong>{month}</strong>
        <span className={styles.miniMonthArrows} aria-hidden="true">‹ ›</span>
      </div>
      <div className={styles.miniWeekRow}>
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className={styles.miniDayGrid}>
        {days.map((day) => {
          const className = [
            styles.miniDay,
            available.includes(day) ? styles.miniDayAvail : "",
            busy.includes(day) ? styles.miniDayBusy : "",
            selected === day ? styles.miniDaySelected : "",
          ].filter(Boolean).join(" ");
          return <span key={day} className={className}>{day}</span>;
        })}
      </div>
    </div>
  );
}

function HomeScene({ role, focus }) {
  const isTeacher = role === "teacher";
  return (
    <MockFrame page="Home" activeNav="home" role={role}>
      <div className={styles.mockGreeting}>
        <span>Hi, {isTeacher ? "James" : "Mia"} 👋</span>
        <strong>{isTeacher ? "Time to teach" : "Time for class"}</strong>
      </div>
      {!isTeacher && (
        <div className={styles.mockCounter}>
          <span>Classes left</span>
          <strong>6</strong>
        </div>
      )}
      <Spotlight active={focus === "today"} tag="Today’s classes">
        <div className={styles.mockBlockTitle}>Classes today</div>
        <div className={styles.mockClassCard}>
          <span className={`${styles.mockBubble} ${styles.mockBubbleLime}`}>E</span>
          <span className={styles.mockClassInfo}>
            <strong>{isTeacher ? "English with Emma" : "English with Ms. Ana"}</strong>
            <span>4:00 – 5:00 PM · 50 min</span>
          </span>
          <span className={styles.mockJoin}>Join</span>
        </div>
        <div className={styles.mockClassCard}>
          <span className={`${styles.mockBubble} ${styles.mockBubbleSky}`}>L</span>
          <span className={styles.mockClassInfo}>
            <strong>{isTeacher ? "Reading with Liam" : "Reading with Mr. Lee"}</strong>
            <span>6:30 – 7:20 PM · 50 min</span>
          </span>
          <span className={styles.mockJoin}>Join</span>
        </div>
      </Spotlight>
      <div className={styles.mockQuickRow}>
        <span>🗓️ Calendar</span>
        {isTeacher ? <span>🧒 Students</span> : <span>🕰️ History</span>}
        <span>✏️ Assignments</span>
        <span>📚 Books</span>
      </div>
    </MockFrame>
  );
}

function AvailabilityScene({ role, focus }) {
  return (
    <MockFrame page="Calendar" activeNav="calendar" role={role}>
      <MiniMonth selected={2} available={[2, 9, 16]} busy={[4, 11]} />
      <Spotlight active={focus === "save"} tag="Save your hours">
        <div className={styles.mockFieldRow}>
          <div className={styles.mockMiniField}><span>Day</span><strong>Tuesday</strong></div>
          <div className={styles.mockMiniField}><span>From</span><strong>4:00 PM</strong></div>
          <div className={styles.mockMiniField}><span>To</span><strong>7:00 PM</strong></div>
        </div>
        <div className={styles.mockActionsRow}>
          <span className={styles.mockBtnPrimary}>Save Availability</span>
        </div>
      </Spotlight>
    </MockFrame>
  );
}

function BookingScene({ role, focus }) {
  return (
    <MockFrame page="Calendar" activeNav="calendar" role={role}>
      <MiniMonth selected={2} available={[2, 4, 9]} busy={[11]} />
      <div className={styles.mockBlockTitle}>Free times on Tue, 2 Jun</div>
      <div className={styles.mockSlotGrid}>
        {["4:00 PM", "4:30 PM", "5:00 PM"].map((time) => (
          <span
            key={time}
            className={`${styles.mockSlot} ${time === "4:30 PM" ? styles.mockSlotActive : ""}`}
          >
            {time}
          </span>
        ))}
      </div>
      <Spotlight active={focus === "book"} tag="Book this time">
        <span className={styles.mockBtnPrimary}>Book 4:30 PM</span>
      </Spotlight>
    </MockFrame>
  );
}

function RescheduleScene({ role, focus }) {
  const isTeacher = role === "teacher";
  return (
    <MockFrame page="Calendar" activeNav="calendar" role={role}>
      <div className={styles.mockSplit}>
        <MiniMonth selected={4} available={[4]} busy={[2]} />
        <div className={styles.mockClassPanel}>
          <span className={styles.mockKicker}>Selected class</span>
          <strong>{isTeacher ? "English with Emma" : "English with Ms. Ana"}</strong>
          <span className={styles.mockMeta}>Tue, 2 Jun · 4:00 – 5:00 PM</span>
          <span className={styles.mockTagRow}>
            <span>50 min</span>
            <span>1 class</span>
          </span>
          <Spotlight active={focus === "reschedule"} tag="Request a new time">
            <span className={styles.mockBtnWarn}>Request for Reschedule</span>
          </Spotlight>
          <span className={styles.mockHint}>Your current time stays until it is approved.</span>
        </div>
      </div>
    </MockFrame>
  );
}

function StudentsScene({ role, focus }) {
  return (
    <MockFrame page="My students" activeNav="students" role={role}>
      <div className={styles.mockSearch}>🔎 Search students…</div>
      <Spotlight active={focus === "student"} tag="Open a student">
        {[
          { initials: "ES", name: "Emma Santos", meta: "Next: Tue, 2 Jun · 4:00 PM", tone: "lime" },
          { initials: "LC", name: "Liam Cruz", meta: "Next: Tue, 2 Jun · 6:30 PM", tone: "sky" },
          { initials: "AR", name: "Ava Reyes", meta: "Next: Wed, 3 Jun · 5:00 PM", tone: "sand" },
        ].map((student) => (
          <div key={student.name} className={styles.mockStudentRow}>
            <span className={`${styles.mockBubble} ${BUBBLE_CLASS[student.tone] || ""}`}>
              {student.initials}
            </span>
            <span className={styles.mockStudentInfo}>
              <strong>{student.name}</strong>
              <span>{student.meta}</span>
            </span>
            <span className={styles.mockChevron} aria-hidden="true">›</span>
          </div>
        ))}
      </Spotlight>
    </MockFrame>
  );
}

function HistoryScene({ role, focus }) {
  return (
    <MockFrame page="Class history" activeNav="history" role={role}>
      <div className={styles.mockFilterRow}>
        <span className={styles.mockPillActive}>All classes</span>
        <span className={styles.mockPill}>Completed</span>
        <span className={styles.mockSearchSmall} aria-hidden="true">🔎</span>
      </div>
      <Spotlight active={focus === "row"} tag="Open a past class">
        {[
          { date: "27 May", title: "English with Emma", note: "Past tense practice", status: "Completed" },
          { date: "20 May", title: "English with Emma", note: "Animals and colours", status: "Completed" },
          { date: "13 May", title: "Reading with Liam", note: "Story reading", status: "Completed" },
        ].map((row) => (
          <div key={row.date} className={styles.mockHistoryRow}>
            <span className={styles.mockDateChip}>{row.date}</span>
            <span className={styles.mockHistoryInfo}>
              <strong>{row.title}</strong>
              <span>{row.note}</span>
            </span>
            <span className={styles.mockPillDone}>{row.status}</span>
          </div>
        ))}
      </Spotlight>
    </MockFrame>
  );
}

function ScoreRow({ label, score }) {
  return (
    <div className={styles.mockCriterion}>
      <span className={styles.mockCriterionLabel}>{label}</span>
      <span className={styles.mockScoreChips}>
        {[1, 2, 3, 4, 5].map((value) => (
          <span
            key={value}
            className={`${styles.mockScoreChip} ${value === score ? styles.mockScoreChipOn : ""}`}
          >
            {value}
          </span>
        ))}
      </span>
    </div>
  );
}

function ReviewsScene({ role, focus }) {
  const isTeacher = role === "teacher";
  return (
    <MockFrame
      page="Contract reviews"
      activeNav="reviews"
      role={role}
    >
      <div className={styles.mockReviewCard}>
        <div className={styles.mockReviewHead}>
          <strong>{isTeacher ? "End-of-contract review" : "How were your classes?"}</strong>
          <span>{isTeacher ? "Emma Santos" : "Ms. Ana"}</span>
        </div>
        <Spotlight active={focus === "scores"} tag={isTeacher ? "Score each skill" : "Tap the stars"}>
          {isTeacher ? (
            <>
              <ScoreRow label="Speaking & Pronunciation" score={4} />
              <ScoreRow label="Reading & Comprehension" score={3} />
              <ScoreRow label="Vocabulary" score={5} />
            </>
          ) : (
            <>
              <ScoreRow label="Clear explanations" score={5} />
              <ScoreRow label="Patient & supportive" score={5} />
              <ScoreRow label="Engaging classes" score={4} />
            </>
          )}
        </Spotlight>
        <div className={styles.mockActionsRow}>
          <span className={styles.mockLevelPill}>
            {isTeacher ? "Level: Intermediate" : "Average: 4.7"}
          </span>
          <span className={styles.mockBtnPrimary}>
            {isTeacher ? "Submit review" : "Send review"}
          </span>
        </div>
        <div className={styles.mockReviewNote}>
          {isTeacher
            ? "Add a short note: “Emma speaks with more confidence now.”"
            : "Only you and the admin team can see this review."}
        </div>
      </div>
    </MockFrame>
  );
}

function RemarksScene({ role, focus }) {
  const isTeacher = role === "teacher";
  if (!isTeacher) {
    return (
      <MockFrame page="Remarks" activeNav="remarks" role={role}>
        <Spotlight active={focus === "note"} tag="Your teacher’s note">
          <div className={styles.mockNoteCard}>
            <span className={styles.mockNoteDate}>Tue, 27 May · Ms. Ana</span>
            <p>“You used the past tense all by yourself today. Brilliant!” 🌟</p>
          </div>
          <div className={styles.mockNoteCard}>
            <span className={styles.mockNoteDate}>Tue, 20 May · Ms. Ana</span>
            <p>“Your reading is getting faster. Try the new animal words at home.”</p>
          </div>
        </Spotlight>
      </MockFrame>
    );
  }
  return (
    <MockFrame page="Remarks" activeNav="remarks" role={role}>
      <div className={styles.mockSelectRow}>
        <div className={styles.mockSelect}>Student <strong>Emma Santos</strong></div>
        <div className={styles.mockSelect}>Class <strong>Tue, 27 May</strong></div>
      </div>
      <Spotlight active={focus === "note"} tag="Write your note">
        <div className={styles.mockTextarea}>
          You used the past tense all by yourself today. Brilliant! 🌟
        </div>
      </Spotlight>
      <div className={styles.mockActionsRow}>
        <span className={styles.mockCounterText}>58 / 300</span>
        <span className={styles.mockBtnPrimary}>Send the note</span>
      </div>
    </MockFrame>
  );
}

function AssignmentsScene({ role, focus }) {
  const isTeacher = role === "teacher";
  if (!isTeacher) {
    return (
      <MockFrame page="Assignments" activeNav="assignments" role={role}>
        <div className={styles.mockTaskCard}>
          <span className={styles.mockTaskInfo}>
            <strong>Reading practice</strong>
            <span>Due Fri, 5:00 PM · Not done yet</span>
          </span>
          <Spotlight active={focus === "open"} tag="Open your task">
            <span className={styles.mockBtnSmall}>Open ›</span>
          </Spotlight>
        </div>
        <div className={styles.mockTaskCard}>
          <span className={styles.mockTaskInfo}>
            <strong>Past tense worksheet</strong>
            <span>Due Mon, 8 Jun · Done</span>
          </span>
          <span className={styles.mockPillDone}>Done</span>
        </div>
      </MockFrame>
    );
  }
  return (
    <MockFrame page="Assignments" activeNav="assignments" role={role}>
      <Spotlight active={focus === "assign"} tag="Start a new task">
        <span className={styles.mockBtnPrimary}>+ Assign Task</span>
      </Spotlight>
      <div className={styles.mockTaskCard}>
        <span className={styles.mockTaskInfo}>
          <strong>Reading practice</strong>
          <span>Emma Santos · due Fri, 5:00 PM</span>
        </span>
        <span className={styles.mockPillOutline}>View submissions</span>
      </div>
      <div className={styles.mockTaskCard}>
        <span className={styles.mockTaskInfo}>
          <strong>Past tense worksheet</strong>
          <span>Liam Cruz · 2 files</span>
        </span>
        <span className={styles.mockPillDone}>Submitted</span>
      </div>
    </MockFrame>
  );
}

function BooksScene({ role, focus }) {
  const isTeacher = role === "teacher";
  return (
    <MockFrame page={isTeacher ? "My books" : "Books/Lessons"} activeNav="books" role={role}>
      <div className={styles.mockBookCard}>
        <span className={`${styles.mockCover} ${styles.mockCoverLime}`} aria-hidden="true">📘</span>
        <div className={styles.mockBookInfo}>
          <strong>English Adventures 2</strong>
          <span className={styles.mockMeta}>5 lessons · Emma Santos</span>
          <Spotlight active={focus === "progress"} tag="Lesson progress">
            <div className={styles.mockProgress}>
              <span style={{ width: "60%" }} />
            </div>
            <span className={styles.mockProgressLabel}>3 of 5 lessons</span>
          </Spotlight>
        </div>
      </div>
      {!isTeacher && (
        <Spotlight active={focus === "complete"} tag="Tap when you finish">
          <span className={styles.mockBtnPrimary}>Mark as Complete ✓</span>
        </Spotlight>
      )}
      {isTeacher && (
        <div className={styles.mockBookCard}>
          <span className={`${styles.mockCover} ${styles.mockCoverSky}`} aria-hidden="true">📗</span>
          <div className={styles.mockBookInfo}>
            <strong>Phonics Fun 1</strong>
            <span className={styles.mockMeta}>4 lessons · Liam Cruz</span>
            <div className={styles.mockProgress}><span style={{ width: "25%" }} /></div>
            <span className={styles.mockProgressLabel}>1 of 4 lessons</span>
          </div>
        </div>
      )}
    </MockFrame>
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
  assignments: AssignmentsScene,
  books: BooksScene,
};

/** The visual column: a labelled mock, then the sentence that explains it. */
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

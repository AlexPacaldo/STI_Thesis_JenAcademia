/**
 * The demo data set, in one place.
 *
 * !! Single source of truth. !!
 * !! Both scripts/seed-demo-data.mjs (which writes it to the database) and the
 * !! reference section of SAMPLE_ACCOUNTS.txt read THIS file. A hand-copied
 * !! table in the txt would be able to disagree with what the seed actually
 * !! creates, and the demo would quietly show the wrong thing.
 *
 * No database access, no imports beyond this file's own helpers, so it can be
 * imported by the reference generator as well as the seeder.
 *
 * Courses are held by NAME and resolved to ids at seed time, so a re-seed that
 * renumbers the catalogue cannot silently point a teacher at the wrong course.
 */

export const PASSWORD = "JEN2026!";
export const COUNTRY = "Philippines";
export const TIMEZONE = "Asia/Manila";

export const ADMIN = {
  key: "admin",
  email: "admin@jenacademia.local",
  firstName: "Jennifer", lastName: "Santos",
  role: "admin",
  birthDate: "1987-04-08",
  country: COUNTRY,
  contact: "+63917 555 0001",
};

/** The course catalogue entries the demo requires; created if missing. */
export const ALL_COURSES = [
  "Business English", "Job Interview", "Online English", "News", "TOEIC",
  "IELTS", "OPIc", "Conversational English", "Travel English",
];

export const CONTRACT_CLASS_OPTIONS = [10, 15, 20];

/** The student you create live during the demo. Never seeded - creating her IS the demo. */
export const DEMO_STUDENT = {
  firstName: "Ava", lastName: "Reyes",
  // 11 at the time of writing. This is the value that makes her a child, and
  // therefore what makes the age constraint fire.
  birthDate: "2015-03-12",
  course: "Conversational English",
  // Verified against computeProficiencyLevel: this exact rubric computes to
  // intermediate-low. Shy on the surface, competent underneath, which is also
  // what the trial notes say.
  levelScores: {
    speakingPronunciation: 1,
    readingComprehension: 3,
    structure: 2,
    sentenceGrammar: 3,
    vocabulary: 2,
  },
  computedLevel: "Intermediate Low",
  criteria: {
    learningGoal: ["conversation"],
    focusArea: ["speaking"],
    learningStyle: ["conversational"],
    pace: ["balanced"],
  },
  // The free-text "Others" entry. Worth demonstrating because it is the one
  // criterion the rules scorer can only match weakly, and the advisor reads it
  // properly.
  criteriaOthers: { focusArea: "public speaking nerves" },
  trialNotes:
    "Very shy. Froze when asked to describe her weekend. Understands grammar " +
    "well but will not speak unless she is asked directly by name.",
  preferredSchedule: { days: ["Saturday"], start: "09:00", end: "11:00" },
};

/**
 * The "AI matching profile" block written into a teacher's bio.
 *
 * The teacher form builds this via buildTeacherAiBio and parseTeacherProfileTags
 * reads it back, so writing it here by hand is what lets the rules scorer see
 * these teachers properly rather than treating them as thin profiles.
 */
export function aiBio({ experience, style = [], pace = [], plain = "" }) {
  const lines = [`${experience} years of teaching experience.`];
  if (plain) lines.push(plain);
  lines.push("AI matching profile:");
  if (style.length) lines.push(`Teaching style: ${style.join(", ")}`);
  if (pace.length) lines.push(`Best student pace: ${pace.join(", ")}`);
  return lines.join("\n");
}

// Six teachers, shaped so every behaviour the matcher has has something to bite
// on. `key` is what the students reference.
export const TEACHERS = [
  {
    key: "cruz",
    email: "maia.cruz@jenacademia.local",
    firstName: "Maia", lastName: "Cruz",
    birthDate: "1988-03-22",
    contact: "+63917 555 0100",
    // The strongest conversational fit in the school, and the one the age rule
    // must overrule. The single most persuasive thing in the data set.
    teachesChildren: false,
    courses: ["Conversational English", "Travel English"],
    specialization: "speaking and conversation",
    teachingStyle: ["conversational", "interactive"],
    idealStudentPace: ["balanced"],
    experienceYears: 9,
    notes:
      "I specialise in speaking and conversation. My students are usually quiet " +
      "adults who freeze when put on the spot, so I build sessions around " +
      "public speaking confidence and warm-up drills before any real conversation. " +
      "I do not take children - I work best with students old enough to hold a " +
      "real discussion.",
  },
  {
    key: "santos",
    email: "rafael.santos@jenacademia.local",
    firstName: "Rafael", lastName: "Santos",
    birthDate: "1993-07-09",
    contact: "+63917 555 0100",
    // The correct answer for a shy child, and he wins on the rule alone.
    teachesChildren: true,
    courses: ["Conversational English", "Online English"],
    specialization: "kids and novice english",
    teachingStyle: ["structured", "visual"],
    idealStudentPace: ["slow"],
    experienceYears: 6,
    notes:
      "Teaching kids and novice English for six years. I work with shy young " +
      "learners and build speaking confidence gradually through games, pictures " +
      "and lots of encouragement. Patient with beginners.",
  },
  {
    key: "delacruz",
    email: "gina.delacruz@jenacademia.local",
    firstName: "Gina", lastName: "Dela Cruz",
    birthDate: "1985-11-18",
    contact: "+63917 555 0100",
    // The clean strong match for the IELTS student.
    teachesChildren: true,
    courses: ["IELTS", "TOEIC"],
    specialization: "exam preparation, grammar and writing",
    teachingStyle: ["structured"],
    idealStudentPace: ["review-heavy"],
    experienceYears: 12,
    notes:
      "Twelve years preparing students for IELTS and TOEIC. Heavy focus on " +
      "exam preparation, reading and vocabulary drills, and a very structured " +
      "review-heavy approach to each band score.",
  },
  {
    key: "martin",
    email: "ben.martin@jenacademia.local",
    firstName: "Ben", lastName: "Martin",
    birthDate: "1990-05-30",
    contact: "+63917 555 0100",
    // Loaded to exactly the 2-student limit, so the workload rule has to act.
    teachesChildren: true,
    courses: ["Conversational English", "IELTS"],
    specialization: "speaking and conversation, listening and pronunciation",
    teachingStyle: ["interactive"],
    idealStudentPace: ["fast"],
    experienceYears: 8,
    notes:
      "Fast-paced and interactive. I teach speaking and conversation, and " +
      "listening and pronunciation through live drills rather than worksheets.",
  },
  {
    key: "reyes",
    email: "clara.reyes@jenacademia.local",
    firstName: "Clara", lastName: "Reyes",
    birthDate: "2001-09-14",
    contact: "+63917 555 0100",
    // Deliberately thin profile. Ranks last in every pool, which is what makes
    // "Closest available, not a strong match" reachable at all.
    teachesChildren: true,
    courses: ["Online English"],
    specialization: "",
    teachingStyle: [],
    idealStudentPace: [],
    experienceYears: 1,
    notes: "",
  },
  {
    key: "lim",
    email: "dario.lim@jenacademia.local",
    firstName: "Dario", lastName: "Lim",
    birthDate: "1996-01-25",
    contact: "+63917 555 0100",
    // The generalist: always in the pool, always a credible second answer.
    teachesChildren: true,
    courses: ALL_COURSES,
    specialization:
      "speaking and conversation, business english, job interview coaching, " +
      "news discussion, reading and vocabulary",
    teachingStyle: ["conversational", "structured"],
    idealStudentPace: ["balanced"],
    experienceYears: 5,
    notes:
      "Generalist across every course. I cover business English, job interview " +
      "preparation, news and travel English as well as conversation.",
  },
];

// Pre-existing students, so the Contracts page, a teacher's Students page and
// the expiry badges have something in them.
//
// createdDaysAgo is the ONLY expiry control: the server derives expires_at from
// created_at as +3 months on the next boot, so seeding the age seeds the
// deadline and the demo cannot drift out of sync with the rule it demonstrates.
// The seed never writes status or expires_at.
export const STUDENTS = [
  {
    key: "alvarez",
    email: "beatrice.alvarez@student.jenacademia.local",
    firstName: "Beatrice", lastName: "Alvarez",
    birthDate: "1998-02-14",
    contact: "+63917 555 0200",
    course: "IELTS",
    level: "intermediate-mid",
    teacher: "delacruz",
    totalClasses: 15,
    classesUsed: 1,
    classDuration: 50,
    createdDaysAgo: 10,
    notes: "Needs a band 6.5. Understands grammar well but freezes under exam conditions.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["listening"], learningStyle: ["structured"], pace: ["review-heavy"] },
  },
  {
    key: "mendoza",
    email: "carlos.mendoza@student.jenacademia.local",
    firstName: "Carlos", lastName: "Mendoza",
    birthDate: "1992-07-30",
    contact: "+63917 555 0200",
    course: "Conversational English",
    level: "intermediate-low",
    teacher: "martin",
    totalClasses: 10,
    classesUsed: 0,
    classDuration: 50,
    // 81 days old -> 9 days left. The amber badge, and the notification this
    // student would already have received.
    createdDaysAgo: 81,
    notes: "Very little free time between work. Wants to sound more natural in meetings.",
    criteria: { learningGoal: ["business"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["fast"] },
  },
  {
    key: "pope",
    email: "danica.pope@student.jenacademia.local",
    firstName: "Danica", lastName: "Pope",
    birthDate: "2004-05-19",
    contact: "+63917 555 0200",
    course: "TOEIC",
    level: "advanced",
    teacher: "delacruz",
    totalClasses: 10,
    classesUsed: 0,
    classDuration: 50,
    // Past the 90-day term. The server flips this to expired on its next sweep,
    // which is the honest demonstration rather than a hand-edited status.
    createdDaysAgo: 100,
    notes: "Scored 875. Wants a structured review before the next sitting.",
    criteria: { learningGoal: ["exam-prep"], focusArea: ["reading"], learningStyle: ["structured"], pace: ["review-heavy"] },
  },
  {
    key: "torres",
    email: "evan.torres@student.jenacademia.local",
    firstName: "Evan", lastName: "Torres",
    birthDate: "1996-11-02",
    contact: "+63917 555 0200",
    course: "Conversational English",
    level: "intermediate-mid",
    teacher: "martin",
    totalClasses: 10,
    classesUsed: 0,
    classDuration: 50,
    // Martin's second student: he sits exactly on the 2-student limit.
    createdDaysAgo: 4,
    notes: "Preparing to move abroad and wants to sound natural in an interview.",
    criteria: { learningGoal: ["interview-readiness"], focusArea: ["speaking"], learningStyle: ["interactive"], pace: ["fast"] },
  },
  {
    key: "garcia",
    email: "noah.garcia@student.jenacademia.local",
    firstName: "Noah", lastName: "Garcia",
    // Deliberately none. Creates the "no birthday on file, so teachers who
    // decline children could not be ruled out" disclosure.
    birthDate: null,
    contact: "+63917 555 0200",
    course: "Travel English",
    level: "intermediate-low",
    teacher: "cruz",
    totalClasses: 10,
    classesUsed: 0,
    classDuration: 50,
    createdDaysAgo: 5,
    notes: "Travelling next month. Wants to handle airport and hotel situations confidently.",
    criteria: { learningGoal: ["confidence"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["balanced"] },
  },
];

/**
 * Teacher availability, as a weekly pattern the seeder materialises onto real
 * dates.
 *
 * !! Availability is per DATE in the database, not a repeating weekly rule. !!
 * !! The matcher looks ahead 21 days and asks, for each future date whose
 * !! weekday is one the admin asked for, whether the teacher has marked THAT
 * !! date available, whether their hours cover the window, whether it clashes
 * !! with a break, and whether they already have a class booked then.
 * !! Declaring it as a weekly pattern here and expanding it in the seeder keeps
 * !! that per-date reality out of this file, and means the pattern stays
 * !! correct whenever the demo is run on a different day.
 *
 * The four Conversational English candidates are shaped so that every reason the
 * matcher can give is reachable during demo step 2/3:
 *
 *   santos  available 08:00-12:00           -> AVAILABLE, and he wins
 *   cruz    available 08:00-12:00           -> available too. She is NOT
 *                                             recommended because she declined
 *                                             children, not because of her
 *                                             calendar - which is the point.
 *   martin  available 13:00-18:00           -> "their available hours do not
 *                                              cover that time"
 *   lim     available 09:00-11:00, but has a class booked on every one of those
 *           Saturdays                      -> "they already have a class booked
 *                                              then"
 *
 * A teacher with no rows at all reports "they have not marked that day
 * available", which is what gina and clara are there to show.
 */
export const WEEKLY_AVAILABILITY = [
  // ---- the four Conversational English candidates, for Ava's Saturday slot ----
  { key: "santos", days: ["Saturday"], start: "08:00", end: "12:00", weeks: 4,
    note: "Wide Saturday morning window - the one candidate who can take Ava's slot." },
  { key: "cruz", days: ["Saturday"], start: "08:00", end: "12:00", weeks: 4,
    note: "Also free on Saturday mornings. The AGE rule is what stops her, not her calendar." },
  { key: "martin", days: ["Saturday"], start: "13:00", end: "18:00", weeks: 4,
    note: "Saturday marked, but afternoons only - so the 09:00-11:00 slot does not fit." },
  { key: "lim", days: ["Saturday"], start: "09:00", end: "11:00", weeks: 4,
    note: "Exact fit on paper, but every one of those Saturdays is already booked." },

  // ---- a weekday slot each, so the teacher calendars are not empty ----
  { key: "santos", days: ["Tuesday", "Thursday"], start: "15:00", end: "17:00", weeks: 3 },
  { key: "cruz", days: ["Monday", "Wednesday"], start: "18:00", end: "20:00", weeks: 3 },
  { key: "martin", days: ["Monday"], start: "17:00", end: "19:00", weeks: 3 },
  { key: "delacruz", days: ["Saturday", "Sunday"], start: "09:00", end: "12:00", weeks: 3,
    note: "Teaches IELTS and TOEIC, so she is not in Ava's pool at all - course eligibility, not availability." },
  { key: "lim", days: ["Wednesday"], start: "16:00", end: "18:00", weeks: 3 },

  // reyes is absent on purpose: no rows means "they have not marked that day
  // available", and her thin profile should be thin everywhere.
];

/**
 * Classes already booked, so the "already have a class booked then" path is
 * reachable.
 *
 * Dario is booked on EVERY Saturday he has marked available, which is why his
 * calendar looks perfect and his availability still reports unavailable.
 */
export const BOOKED_CLASSES = [
  {
    teacher: "lim",
    student: "alvarez",
    days: ["Saturday"],
    start: "09:30", end: "10:20",
    weeks: 4,
    className: "Business English - Weekend Group",
  },
];

export const DEMO_BOOKS = [
  {
    key: "conversation",
    title: "Confident Conversations",
    description: "Practical speaking lessons for everyday conversations.",
    author: "JEN Academia",
    course: "Conversational English",
    teachers: ["santos", "martin"],
    lessons: [
      {
        number: 1,
        title: "Starting a Conversation",
        content: "Practice greetings, introductions, and friendly follow-up questions.",
      },
      {
        number: 2,
        title: "Talking About Your Day",
        content: "Use past-tense verbs and sequencing words to tell a clear short story.",
      },
      {
        number: 3,
        title: "Sharing an Opinion",
        content: "State an opinion, give a reason, and invite another person to respond.",
      },
    ],
  },
  {
    key: "ielts",
    title: "IELTS Speaking Practice",
    description: "Structured prompts and strategies for confident IELTS speaking.",
    author: "JEN Academia",
    course: "IELTS",
    teachers: ["delacruz"],
    lessons: [
      {
        number: 1,
        title: "Part 1: Clear, Complete Answers",
        content: "Answer familiar questions directly, then add a specific supporting detail.",
      },
      {
        number: 2,
        title: "Part 2: Organizing a Long Turn",
        content: "Plan a short response with a clear beginning, supporting details, and conclusion.",
      },
    ],
  },
];

export const DEMO_BOOK_PROGRESS = {
  student: "mendoza",
  book: "conversation",
  lessonProgress: [
    { lessonNumber: 1, percentage: 100, completed: true, minutes: 18 },
    { lessonNumber: 2, percentage: 45, completed: false, minutes: 9 },
  ],
};

export const DEMO_ASSIGNMENTS = [
  {
    key: "pending",
    teacher: "martin",
    student: "mendoza",
    course: "Conversational English",
    title: "Meeting Introductions",
    instructions: "Write a short introduction you could use in a work meeting.",
    dueDaysFromNow: 5,
    status: "pending",
  },
  {
    key: "submitted",
    teacher: "delacruz",
    student: "alvarez",
    course: "IELTS",
    title: "Listening Reflection",
    instructions: "Describe one strategy you used to follow the listening passage.",
    dueDaysFromNow: -1,
    status: "submitted",
    submission: "I focused on key words and checked the speaker's opinion before choosing my answer.",
  },
  {
    key: "graded",
    teacher: "delacruz",
    student: "pope",
    course: "TOEIC",
    title: "Reading Practice Review",
    instructions: "Summarize your approach to the reading practice questions.",
    dueDaysFromNow: -3,
    status: "graded",
    submission: "I skimmed each passage first, then returned to the questions for specific details.",
    grade: 88,
    feedback: "Good use of skimming. Review the inference questions and support each answer with evidence.",
  },
];

export const DEMO_CLASS_WORKFLOWS = {
  completed: {
    teacher: "delacruz",
    student: "alvarez",
    className: "IELTS Progress Review",
    daysFromNow: -7,
    start: "10:00",
    end: "10:50",
    remark: "Beatrice organized her answers clearly and supported them with relevant examples.",
    rating: 5,
  },
  attendanceReview: {
    teacher: "martin",
    student: "mendoza",
    className: "Conversation Attendance Review",
    daysFromNow: -2,
    start: "14:00",
    end: "14:50",
    studentJoined: "14:03",
    summary: "The class ended and is waiting for admin review; no evidence files were seeded.",
  },
  reschedule: {
    teacher: "martin",
    student: "mendoza",
    className: "Conversation Reschedule Demo",
    daysFromNow: 7,
    start: "15:00",
    end: "15:50",
    requestedDaysFromNow: 10,
    requestedTime: "16:00",
    reason: "I have a work meeting at the original time. Could we move this class?",
  },
};

/** Days left remaining on the 90-day term for a package of a given age. */
export const daysLeftFrom = (createdDaysAgo) => 90 - createdDaysAgo;

/**
 * Check every cross-reference in this file, and report ALL of them at once.
 *
 * !! This exists because a dangling reference used to surface hundreds of
 * !! database writes later. BOOKED_CLASSES named a student, only teachers were in
 * !! the seeder's lookup map, and the mismatch threw from inside the booked
 * !! classes loop - by which time twelve accounts and two hundred availability
 * !! rows were already committed. The seed had to be re-run to find out whether
 * !! anything else was broken too.
 * !!
 * !! These are plain data in a plain file, so a wrong key is a typo and not a
 * !! runtime condition. It is checkable in microseconds against nothing at all,
 * !! and should be, rather than discovered halfway through writing to a live
 * !! database.
 *
 * Returns a list of problem strings; empty means the data is self-consistent.
 * The caller decides whether that is fatal.
 */
export function validateDemoAccounts() {
  const problems = [];
  const teacherKeys = new Set(TEACHERS.map((t) => t.key));
  const studentKeys = new Set(STUDENTS.map((s) => s.key));

  const checkDuplicates = (list, label) => {
    const seen = new Set();
    for (const entry of list) {
      if (seen.has(entry.key)) problems.push(`duplicate ${label} key "${entry.key}"`);
      seen.add(entry.key);
    }
  };
  checkDuplicates(TEACHERS, "teacher");
  checkDuplicates(STUDENTS, "student");

  // A student assigned to a teacher they name must exist as a teacher.
  for (const s of STUDENTS) {
    if (s.teacher && !teacherKeys.has(s.teacher)) {
      problems.push(`student "${s.key}" is assigned to unknown teacher "${s.teacher}"`);
    }
    if (
      !Number.isInteger(s.classesUsed ?? 0) ||
      (s.classesUsed ?? 0) < 0 ||
      (s.classesUsed ?? 0) > s.totalClasses
    ) {
      problems.push(`student "${s.key}" has an invalid used-class count`);
    }
    if (!CONTRACT_CLASS_OPTIONS.includes(s.totalClasses)) {
      problems.push(
        `student "${s.key}" has unsupported contract size ${s.totalClasses}; ` +
          `allowed: ${CONTRACT_CLASS_OPTIONS.join(", ")}`
      );
    }
  }

  for (const slot of WEEKLY_AVAILABILITY) {
    if (!teacherKeys.has(slot.key)) {
      problems.push(`availability for unknown teacher "${slot.key}"`);
    }
  }

  for (const booked of BOOKED_CLASSES) {
    if (!teacherKeys.has(booked.teacher)) {
      problems.push(`booked class has unknown teacher "${booked.teacher}"`);
    }
    // Students have to be looked up here too. They are a separate namespace from
    // teachers, so a teacher key must not satisfy this and vice versa - that
    // confusion is exactly how the original bug stayed invisible for so long.
    if (!studentKeys.has(booked.student)) {
      problems.push(`booked class has unknown student "${booked.student}"`);
    }
  }

  for (const book of DEMO_BOOKS) {
    if (!ALL_COURSES.includes(book.course)) {
      problems.push(`demo book "${book.key}" references unknown course "${book.course}"`);
    }
    for (const key of book.teachers) {
      if (!teacherKeys.has(key)) problems.push(`demo book "${book.key}" has unknown teacher "${key}"`);
    }
    if (!book.lessons.length) problems.push(`demo book "${book.key}" has no lessons`);
  }

  if (!studentKeys.has(DEMO_BOOK_PROGRESS.student)) {
    problems.push(`book progress references unknown student "${DEMO_BOOK_PROGRESS.student}"`);
  }
  if (!DEMO_BOOKS.some((book) => book.key === DEMO_BOOK_PROGRESS.book)) {
    problems.push(`book progress references unknown book "${DEMO_BOOK_PROGRESS.book}"`);
  }

  for (const assignment of DEMO_ASSIGNMENTS) {
    if (!teacherKeys.has(assignment.teacher)) {
      problems.push(`assignment "${assignment.key}" has unknown teacher "${assignment.teacher}"`);
    }
    if (!studentKeys.has(assignment.student)) {
      problems.push(`assignment "${assignment.key}" has unknown student "${assignment.student}"`);
    }
    if (!ALL_COURSES.includes(assignment.course)) {
      problems.push(`assignment "${assignment.key}" references unknown course "${assignment.course}"`);
    }
  }

  for (const workflow of Object.values(DEMO_CLASS_WORKFLOWS)) {
    if (!teacherKeys.has(workflow.teacher)) {
      problems.push(`class workflow "${workflow.className}" has unknown teacher "${workflow.teacher}"`);
    }
    if (!studentKeys.has(workflow.student)) {
      problems.push(`class workflow "${workflow.className}" has unknown student "${workflow.student}"`);
    }
  }

  return problems;
}

/** A readable age on the date the seed runs, for the reference table. */
export function ageOn(birthDate, on = new Date()) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = on.getFullYear() - y;
  const hadBirthday =
    on.getMonth() + 1 > m || (on.getMonth() + 1 === m && on.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

/** The "AI matching criteria" block the app appends to a student's trial notes. */
export function criteriaNotes(criteria) {
  const labels = {
    learningGoal: "Learning goal",
    learningStyle: "Learning style",
    focusArea: "Focus area",
    pace: "Learning pace",
  };
  const lines = Object.entries(criteria)
    .filter(([, values]) => Array.isArray(values) && values.length)
    .map(([key, values]) => `${labels[key] || key}: ${values.join(", ")}`);
  return lines.length ? `AI matching criteria:\n${lines.join("\n")}` : "";
}
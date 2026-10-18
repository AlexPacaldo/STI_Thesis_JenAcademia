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

/** Every course the catalogue must contain. Looked up, never inserted. */
export const ALL_COURSES = [
  "Business English", "Job Interview", "Online English", "News", "TOEIC",
  "IELTS", "OPIc", "Conversational English", "Travel English",
];

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
    totalClasses: 12,
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
    totalClasses: 8,
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
    totalClasses: 6,
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
    classDuration: 50,
    createdDaysAgo: 5,
    notes: "Travelling next month. Wants to handle airport and hotel situations confidently.",
    criteria: { learningGoal: ["confidence"], focusArea: ["speaking"], learningStyle: ["conversational"], pace: ["balanced"] },
  },
];

/** Days remaining on the 90-day term for a package of a given age. */
export const daysLeftFrom = (createdDaysAgo) => 90 - createdDaysAgo;

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
/**
 * The words the student sees.
 *
 * !! The Calendar is used by students, and a lot of them are children, and a
 * !! lot of them are not strong readers of English. So the words on this
 * !! screen are not a copywriter's choice - they are the difference between
 * !! a student understanding what to press and a student guessing.
 * !!
 * !! Three rules, applied everywhere below:
 * !!
 * !!   1. Say the thing, not the system. The database has "contracts",
 * !!      "packages", "extensions" and "requests". A student has a class plan,
 * !!      needs more time, and asks the admin. The words on screen are the
 * !!      student's words, not the system's.
 * !!
 * !!   2. One idea per sentence. A student who is not confident in English
 * !!      reads one sentence at a time. Sentences that need a comma and a
 * !!      "but" to survive are sentences that lose the meaning.
 * !!
 * !!   3. Ask one question at a time. The new-plan form used to ask eight
 * !!      questions at once, four of them multi-select. That is a form for
 * !!      somebody filling in a survey, not for a student on a phone.
 * !!
 * !! Everything a student reads lives here, so the language can be reviewed in
 * !! one place and checked by a test. scripts/test-student-copy.mjs fails if a
 * !! word that a student may not know appears here.
 */

/** Words a student may not know, or that mean something else to them. */
export const BANNED_STUDENT_WORDS = [
  "contract",
  "extension",
  "package",
  "reschedule",
  "criteria",
  "availability",
  "duration",
  "pending",
  "approved",
  "declined",
  "slot",
  "session",
  "utilise",
  "utilize",
  "proceed",
  "inquire",
  "enquire",
  "regarding",
  "assistance",
  "purchase",
  "subscription",
];

/** The student's class plan. */
export const PLAN = {
  title: "Your classes",
  classesLeft: "Classes left",
  readyToBook: "Ready to book",
  bookAClass: "Book a class",
  today: "Today",
  tip: "Tip: message your teacher to add or change a class.",
};

/** The plain sentences that say what state the student is in. */
export const PLAN_STATUS = {
  endedWithClasses: "Your plan ended, but your unused classes are still yours.",
  noPlan: "You do not have a class plan yet.",
  allUsed: "You have used all your classes.",
  allBooked: "All your classes are already booked. Change one to free a day.",
  normal: PLAN.tip,
};

/** The amber card: the plan ended, but the classes are paid for. */
export const MORE_TIME_CARD = {
  heading: "Your plan has ended",
  body: (count) =>
    `You still have ${count} class${count === 1 ? "" : "es"} that you paid for. Ask the admin for more time and you can use them.`,
  askForMoreTime: "Ask for more time",
  changeMyAsk: "Change my ask",
  cancelMyAsk: "Cancel my ask",
  askAgain: "Ask again",
  getNewPlan: "Get a new plan",
  getNewPlanInstead: "Get a new plan instead",
  bookedPlan: "Get a new plan",
};

/** The window that asks the admin for more time. */
export const MORE_TIME_WINDOW = {
  title: "Ask for more time",
  titleEditing: "Change your ask for more time",
  question: "Why do you need more time?",
  placeholder: "e.g. I was sick for two weeks",
  sending: "Sending...",
  send: "Send",
  update: "Send again",
  cancel: "Cancel",
  note: "You do not pay here. Talk to the admin and agree how much more time you need.",
  replacing:
    "You already asked the admin. If you send this, it replaces your last ask. The admin will see this one.",
  keeping:
    "Your classes are saved. Asking for more time keeps them, and nothing you have used is reset.",
};

/** The window that asks the admin for a new class plan. */
export const NEW_PLAN_WINDOW = {
  title: "Get a new plan",
  titleEditing: "Change your ask for a new plan",
  course: "Which course?",
  coursePlaceholder: "Pick a course",
  classLength: "How long is one class?",
  classCount: "How many classes?",
  moreOptions: "More options (you can skip these)",
  lessOptions: "Hide the extra options",
  learningGoal: "What do you want to learn?",
  focusArea: "What should we work on?",
  learningStyle: "How do you like to learn?",
  learningPace: "How fast do you want to go?",
  freeTime: "When are you free?",
  freeTimeOptional: "optional",
  freeTimeHelp: "Pick the days and times you are free. Leave it empty if you are free any time.",
  from: "From",
  to: "Until",
  fromToHelp: "Pick a start and an end time as well.",
  seeMyTeacher: "See my teacher",
  findingTeacher: "Finding your teacher...",
  checkAgain: "Check again",
  sending: "Sending...",
  send: "Send",
  update: "Send again",
  cancel: "Cancel",
  lastAsk: "Last ask",
  replacing:
    "You already asked the admin. If you send this, it replaces your last ask. The admin will see this one.",
  losesClasses: (count) =>
    `A new plan replaces your old one, so your ${count} unused class${count === 1 ? "" : "es"} will not carry over. If you want to keep them, close this and ask for more time instead.`,
};

/** The booking form. */
export const BOOKING = {
  title: "Book a class",
  intro: (teacher) => `Pick a day and a time for ${teacher}. You can book up to 3 months ahead.`,
  noTeacher: "You do not have a teacher yet. Please contact support.",
  howToBook: "How do you want to book?",
  singleTimes: "Pick single times",
  sameTimeEachWeek: "Same time each week",
  whichDay: "Which day?",
  day: "Day",
  dayPlaceholder: "Pick a day on the calendar",
  tapDay: "Tap a day on the calendar",
  times: "Times",
  timesHelp: "Pick one or more times.",
  whatToLookFor: "What to look for",
  whichDays: "Which days?",
  whatTime: "What time?",
  findTimes: "Find times",
  findTimesHelp: "We will look from today up to 3 months ahead.",
  timesThatWork: (count) => `Times that work (${count})`,
  addAll: "Add all",
  added: "Added",
  add: "Add",
  yourPicks: (count, limit) => `Your picks (${count}/${limit})`,
  clear: "Clear",
  remove: "Remove",
  course: "Course",
  classLength: "Class length",
  pickTimeFirst: "Pick a time first.",
  booking: "Booking...",
  bookOne: "Book class",
  bookMany: (count) => `Book ${count} classes`,
  noClassesLeft: "You have no classes left. Please contact the admin for a new plan.",
  sameTime: "Same time",
};

/** The class the student tapped. */
export const CLASS_INFO = {
  title: "Class info",
  teacher: "Teacher",
  email: "Email",
  teacherNote: "Teacher's note",
  noNoteYet: "No note yet",
  dateMissing: "No date",
  waitingForTeacher: "Waiting for teacher",
  joinAndHere: "Join & I'm here",
  joinClass: "Join class",
  changeTime: "Change the time",
  changeTimeTitle: "Change the time",
  changeTimeHelp: "Pick a new day and time, and tell your teacher why.",
  newDay: "New day",
  newTime: "New time",
  why: "Why?",
  whyPlaceholder: "Tell your teacher why (at least 5 letters)",
  backToClasses: "Back to classes",
  classesOn: (day) => `Classes on ${day}`,
  noClassesThatDay: "No classes on this day",
  close: "Close",
};

/** The colour key under the calendar. */
export const LEGEND = {
  title: "What the colours mean",
  available: "Free to book",
  hasClasses: "You have a class",
  unavailable: "Teacher is busy",
  notSet: "No times yet",
  past: "Already past",
  hint: "Tap a day to see what is on it",
};

/** The little windows that ask "are you sure?". */
export const CONFIRM = {
  bookingTitle: "Check your booking",
  bookingHelp: "Check the details, then book.",
  classes: (count) => `${count} class${count === 1 ? "" : "es"}`,
  minutesEach: (count) => `${count} minutes each`,
  teacher: "Teacher",
  yesBook: "Yes, book it",
  rescheduleTitle: "Ask to change the time?",
  rescheduleHelp: "Your teacher will say yes or no.",
  now: "Now",
  new: "New",
  why: "Why",
  send: "Send",
  sending: "Sending...",
  cancel: "Cancel",
  recordingTitle: "This class is recorded",
  recordingBody:
    "This class may be recorded so the admin can check it. Only the admin, your teacher and you can watch it.",
  yesJoin: "Yes, join",
};

/** The loading screen. */
export const LOADING = {
  title: "Loading your calendar",
  body: "One moment...",
};

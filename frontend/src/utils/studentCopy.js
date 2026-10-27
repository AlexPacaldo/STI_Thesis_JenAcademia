/**
 * The words the student sees.
 *
 * !! Student-facing language should be clear, professional, and familiar
 * !! across educational settings. Use standard learning terminology, explain
 * !! actions directly, and avoid both internal system terms and childish
 * !! wording.
 * !!
 * !! Three rules, applied everywhere below:
 * !!
 * !!   1. Use established educational terminology, such as "learning
 * !!      objectives", "skill focus", and "learning preferences".
 * !!
 * !!   2. Keep instructions direct and accessible without oversimplifying
 * !!      professional concepts.
 * !!
 * !!   3. Ask one question at a time. The new-plan form used to ask eight
 * !!      questions at once, four of them multi-select. That is a form for
 * !!      somebody filling in a survey, not for a student on a phone.
 * !!
 * !! Keep reusable student-facing copy here so wording remains consistent
 * !! and can be reviewed and tested in one place.
 */

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
    `You have ${count} unused class${count === 1 ? "" : "es"} remaining. Submit a request for additional time to use them.`,
  askForMoreTime: "Request more time",
  changeMyAsk: "Edit request",
  cancelMyAsk: "Withdraw request",
  askAgain: "Submit another request",
  getNewPlan: "Request a new plan",
  getNewPlanInstead: "Request a new plan instead",
  bookedPlan: "Request a new plan",
};

/** The window for requesting additional time. */
export const MORE_TIME_WINDOW = {
  title: "Request more time",
  titleEditing: "Edit your request for more time",
  question: "Please explain why you need additional time.",
  placeholder: "For example: I was unable to attend classes for two weeks.",
  sending: "Sending...",
  send: "Submit request",
  update: "Update request",
  cancel: "Cancel",
  note: "No payment is made here. Please contact the administrator to agree on the additional time.",
  replacing:
    "You already have a request under review. Updating it will replace the version currently on file.",
  keeping:
    "Your unused classes remain on your current plan while your request is being reviewed. Classes already used will not be reset.",
};

/** The window for requesting a new class plan. */
export const NEW_PLAN_WINDOW = {
  title: "Request a new plan",
  titleEditing: "Edit your new plan request",
  course: "Course",
  coursePlaceholder: "Select a course",
  classLength: "Class duration",
  classCount: "Number of classes",
  moreOptions: "Your learning choices",
  learningGoal: "Learning objectives",
  focusArea: "Skill focus",
  learningStyle: "Learning preferences",
  learningPace: "Learning pace",
  freeTime: "Availability",
  freeTimeOptional: "optional",
  freeTimeHelp: "Select the days and times that work for you. This information is optional.",
  from: "From",
  to: "Until",
  fromToHelp: "Choose an end time later than the start time.",
  seeMyTeacher: "Preview teacher match",
  findingTeacher: "Finding a teacher match...",
  checkAgain: "Refresh teacher match",
  checkTeacherRequired: "Preview a teacher match before submitting your request.",
  sending: "Sending...",
  send: "Submit request",
  update: "Update request",
  cancel: "Cancel",
  lastAsk: "Most recent request",
  replacing:
    "You already have a request under review. Updating it will replace the version currently on file.",
  losesClasses: (count) =>
    `A new plan replaces your current plan, so your ${count} unused class${count === 1 ? "" : "es"} will not carry over. To keep them, close this window and submit a request for additional time instead.`,
};

/** The student's own page: their classes, and what they have left. */
export const HOME = {
  title: "My classes",
  subtitle: (teacher) => (teacher ? `Your classes with ${teacher}.` : "Your classes."),
  classesLeft: "Classes left",
  of: (total) => `of ${total}`,
  readyToBook: (count) => `Ready to book: ${count}`,
  yourClasses: "Your classes",
  details: "Details",
  loadingClasses: "Loading your classes...",
  loadingPlan: "Loading your plan...",
  noClassesYet: "You have no classes booked yet.",
  noClassesYetHelp: "Press the green button to book one.",
  noClassesLeft: "You have no classes left. Please ask the admin for a new plan.",
  backToMyClasses: "Back to my classes",
  timeToBeDecided: "Time to be decided",
  yourClass: "Your class",
  myClasses: "My classes",
  allClasses: "All classes",
  monthClasses: (month) => `Your classes for ${month}.`,
  allMonthClasses: (month) => `Every class for ${month}.`,
  noClassesThisMonth: "No classes this month.",
};

/** The two ways of looking at a calendar. */
export const VIEW = {
  month: "Month",
  list: "List",
  monthHelp: "The calendar, a month at a time.",
  listHelp: "Your classes, one after another.",
};

/** The booking form. */
export const BOOKING = {
  title: "Book a class",
  intro: (teacher) => `Choose a day and a time with ${teacher}.`,
  noTeacher: "You do not have a teacher yet. Please contact support.",

  /* ---------------------------------------------------------- the wizard */

  // The first question. Two big cards, one word each.
  howToBook: "How do you want to book?",
  oneTime: "One time",
  oneTimeHelp: "Pick one day and one time.",
  everyWeek: "Every week",
  everyWeekHelp: "Pick the same day and time every week.",

  // Where the student is. "Step 2 of 3" tells a child the screen is not the
  // end of it, and that there is something after this one.
  stepOf: (n, total = 3) => `Step ${n} of ${total}`,

  /* ---------------------------------------------------------- pick a day */

  whichDay: "Which day?",
  dayHelp: "The green days are free. Pick one.",
  dayLabel: "Day",
  timeLabel: "Time",
  free: "Free",
  busy: "Busy",
  noTimes: "No times",
  noFreeDays: "Your teacher has no free days yet. Please talk to your teacher.",
  noDaysInThisMonth: "There are no days to pick in this month.",
  noFreeDaysThisMonth: "Your teacher has no free days in this month. Try another month.",
  // The student picked a day their plan does not reach.
  pickBeforePlanEnds: (pretty) => `Please pick a date before your plan ends on ${pretty}.`,

  /* --------------------------------------------------------- pick a time */

  whichTime: "Which time?",
  timeHelp: "Pick one time.",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  taken: "Taken",
  teacherBusyDay: "Your teacher is busy on this day.",
  noFreeTimes: "No free times on this day. Please pick another day.",
  noTimesThatDay: "Your teacher has no classes on this day. Please pick another day.",

  /* ------------------------------------------------------- every week */

  whichDays: "Which days of the week?",
  daysHelp: "Tap every day you want a class.",
  whatTime: "What time?",
  timeOfDayHelp: "Pick a time. We will show every free time then.",
  anotherTime: "Another time",
  findTimes: "Find my times",
  findingTimes: "Looking...",
  foundTimes: (count) => `We found ${count} time${count === 1 ? "" : "s"}.`,
  foundTimesHelp: "Tap the times you want. Then press Next.",
  moreTimes: (total) => `There are ${total} times in all. These are the first ones.`,
  preferred: "You asked for",
  noTimesFound: "We could not find a free time on those days. Please try other days.",
  noDaysPicked: "Tap at least one day.",
  noTimePicked: "Tap a time first.",
  cannotLookUp: "We could not look up free times. Please try again.",
  addAll: "Add all",
  add: "Add",
  remove: "Remove",

  /* ------------------------------------------------------- the last look */

  course: "Class",

  /* ---------------------------------------------------------- the buttons */

  next: "Next",
  back: "Back",
  change: "Change",
  bookOne: "Book it",
  bookMany: (count) => `Book ${count} classes`,
  booking: "Booking...",
  cancel: "Cancel",
  pickTimeFirst: "Pick a time first.",
  noClassesLeft: "You have no classes left. Please contact the admin for a new plan.",
};

/** The class the student tapped. */
export const CLASS_INFO = {
  title: "Class info",
  teacher: "Teacher",
  email: "Email",
  teacherNote: "Latest teacher remark",
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

/**
 * The student's own past classes.
 *
 * !! This is the one screen a child opens to look back at what they have
 * !! done. It used to be the teacher's review screen with the teacher's
 * !! words on it - "verification status", "evidence", "missing items" - which
 * !! is a screen for the adult who has to check the paperwork.
 * !!
 * !! So the words here are the child's: who taught the class, how long it
 * !! was, what they did, and one friendly word for how it went. The proof,
 * !! the recording and the review are the teacher's business.
 */
export const HISTORY = {
  title: "My classes",
  subtitle: "Every class you have had.",
  refresh: "Refresh",
  looking: "Looking for your classes...",
  emptyTitle: "You have not had a class yet.",
  emptyHelp: "Your classes will show up here.",
  yourTeacher: "Your teacher",
  howLong: "How long",
  whatYouDid: "What you did",
  watchAgain: "Watch the class again",
  showMore: (count) => `Show ${count} more class${count === 1 ? "" : "es"}`,
  minutes: (count) => `${count} minute${count === 1 ? "" : "s"}`,
  noMinutes: "We do not know yet",
  today: "Today",
  yesterday: "Yesterday",

  /* The filter. Three small questions, in one window. */
  noneInThisClass: "You have not had a class in this one yet.",
  filter: "Filter",
  filterTitle: "Filter your classes",
  filterSub: "Choose which classes you want to see.",
  filterByClass: "Class",
  filterByOutcome: "How it went",
  filterByWhen: "When",
  all: "All",
  allTimes: "All times",
  thisWeek: "This week",
  thisMonth: "This month",
  earlier: "Earlier",
  showClasses: (count) => `Show ${count} class${count === 1 ? "" : "es"}`,
  showing: (shown, total) =>
    `Showing ${shown} of ${total} class${total === 1 ? "" : "es"}.`,
  closeFilter: "Close",

  /* The one word that says how the class went. */
  done: "All done!",
  checking: "Your teacher is checking",
  joined: "You joined!",
  goingOn: "Still going on",
  waiting: "Waiting to start",
  almost: "Almost done",
  notFinished: "Not finished yet",
};

/**
 * The student's own account page, and the menu that opens from the name in
 * the header.
 *
 * !! The account page was the admin's screen with the admin's words on it -
 * "Profile Information", "Locked", "Security", "Contract" - shown to a child
 * !! who wants to change their picture.
 */
export const ACCOUNT = {
  /* The menu in the header. */
  menuLabel: "Your account menu",
  menuMyAccount: "My account",
  menuLogOut: "Log out",
  menuFooter: "JEN Academia",

  /* The page. */
  title: "My account",
  hello: (name) => `Hi, ${name}`,
  changePicture: "Change my picture",
  classesLeft: "Classes left",
  of: (total) => `of ${total}`,
  planEnds: (when) => `Your plan ends on ${when}`,
  yourClass: "Your class",
  yourTeacher: "Your teacher",
  aboutYou: "About you",
  changeDetails: "Change my details",
  saveDetails: "Save my details",
  savingDetails: "Saving...",
  cancel: "Cancel",
  yourPassword: "Your password",
  changePassword: "Change my password",
  savePassword: "Save my password",
  savingPassword: "Saving...",
  firstName: "First name",
  lastName: "Last name",
  yourName: "Your name",
  birthday: "Birthday",
  country: "Country",
  phone: "Phone number",
  phoneCodeNote: "Changing this sends a six-digit code to the new number. Text verification is available for Philippine numbers only.",
  phoneCodeTitle: "Check your phone",
  phoneCodeBody: (phone) =>
    `We sent a six-digit code to ${phone}. Type it below to save your new number.`,
  phoneCodeExpires: "The code lasts 10 minutes. It can be used once.",
  phoneCodeVerify: "Verify and save",
  phoneCodeChecking: "Checking...",
  phoneCodeResend: "Send a new code",
  phoneCodeSending: "Sending...",
  phoneCodeCancel: "Cancel",
  timeZone: "Time zone",
  email: "Email",
  emailLocked: "Your email is how you sign in, so it can't be changed here. Ask JEN Academia if it needs to change.",
  currentPassword: "Your old password",
  passwordLabel: "Your password",
  passwordToSave: "We ask for this so nobody can change your details from a browser you left open.",
  newPassword: "New password",
  confirmPassword: "Type the new password again",
  notSet: "Not set yet",
  finishProfile: "Finish your profile",
  finishProfileHelp: "Add your picture and your phone number to see your classes.",
  needPicture: "Your picture",
  needPhone: "Your phone number",
  done: "Done",
};

/** The little windows that ask "are you sure?". */
export const CONFIRM = {
  bookingTitle: "Is this right?",
  bookingHelp: "Look at your class. Then press the button.",
  classes: (count) => `${count} class${count === 1 ? "" : "es"}`,
  minutesEach: (count) => `${count} minutes each`,
  teacher: "Teacher",
  rescheduleTitle: "Ask to change the time?",
  rescheduleHelp: "Your teacher will say yes or no.",
  now: "Now",
  new: "New",
  why: "Why",
  send: "Send",
  sending: "Sending...",
  cancel: "Cancel",
  recordingTitle: "Class recording notice",
  recordingBody:
    "This class may be recorded for attendance verification. The recording is accessible only to you, your assigned teacher, and the administrator.",
  yesJoin: "Join class",
};

/** The loading screen. */
export const LOADING = {
  title: "Loading your calendar",
  body: "One moment...",
};

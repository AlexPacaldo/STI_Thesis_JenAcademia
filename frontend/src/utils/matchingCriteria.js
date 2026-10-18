/**
 * Option catalogues for the teacher <-> student matching criteria.
 *
 * Every group is multi-select: the admin picks as many as apply, on both the
 * Create Student and Create Teacher forms. That symmetry matters for matching -
 * backend/teacherMatching.js compares the student and teacher vocabularies
 * directly, so the values here are the contract.
 *
 * !! The option VALUES must match the keys used by
 * !! backend/teacherMatching.js (FOCUS_AREA_TO_SPECIALIZATION,
 * !! LEARNING_GOAL_TO_SPECIALIZATION, and the exact vocabularies shared by
 * !! learningStyle/teachingStyle and pace/pace).
 * !! scripts/test-teacher-matching.mjs asserts they line up.
 *
 * An option is `[value, label]` or `[value, label, allowedCourseNames]`. The
 * third element scopes an option to specific courses; omit it to offer the
 * option for every course.
 */

export const STUDENT_CRITERIA_OPTIONS = {
  learningGoal: [
    ["school-support", "School Support", ["Online English", "OPIc"]],
    ["conversation", "Conversation", ["Conversational English", "Travel English", "Online English", "OPIc"]],
    ["exam-prep", "Exam Preparation", ["IELTS", "TOEIC", "OPIc"]],
    ["business", "Business English", ["Business English", "Job Interview", "TOEIC"]],
    ["confidence", "Confidence Building", ["Conversational English", "Travel English", "Online English"]],
    ["interview-readiness", "Interview Readiness", ["Job Interview", "Business English"]],
    ["news-discussion", "News Discussion", ["News", "Conversational English"]],
  ],
  learningStyle: [
    ["structured", "Structured Lessons"],
    ["conversational", "Conversational Practice"],
    ["visual", "Visual Activities"],
    ["interactive", "Interactive Activities"],
    ["independent", "Independent Practice"],
  ],
  focusArea: [
    ["speaking", "Speaking", ["Conversational English", "Travel English", "Online English", "OPIc", "Job Interview"]],
    ["grammar", "Grammar", ["Online English", "IELTS", "TOEIC", "Business English"]],
    ["reading", "Reading", ["IELTS", "TOEIC", "News", "Online English"]],
    ["writing", "Writing", ["IELTS", "Business English", "Online English", "Job Interview"]],
    ["listening", "Listening", ["IELTS", "TOEIC", "Conversational English", "OPIc", "News"]],
    ["vocabulary", "Vocabulary", ["Business English", "Travel English", "News", "TOEIC", "IELTS"]],
    ["pronunciation", "Pronunciation", ["Conversational English", "OPIc", "Travel English", "Online English"]],
    ["interview-answers", "Interview Answers", ["Job Interview", "Business English"]],
  ],
  pace: [
    ["slow", "Slow and Guided"],
    ["balanced", "Balanced"],
    ["fast", "Fast-paced"],
    ["review-heavy", "Review-heavy"],
  ],
};

export const TEACHER_CRITERIA_OPTIONS = {
  specialization: [
    ["speaking and conversation", "Speaking and Conversation", ["Conversational English", "Travel English", "Online English", "OPIc"]],
    ["grammar and writing", "Grammar and Writing", ["Online English", "IELTS", "TOEIC", "Business English"]],
    ["reading and vocabulary", "Reading and Vocabulary", ["IELTS", "TOEIC", "News", "Online English"]],
    ["listening and pronunciation", "Listening and Pronunciation", ["IELTS", "TOEIC", "Conversational English", "OPIc", "Travel English"]],
    ["exam preparation", "Exam Preparation", ["IELTS", "TOEIC", "OPIc"]],
    ["business english", "Business English", ["Business English", "Job Interview", "TOEIC"]],
    ["job interview coaching", "Job Interview Coaching", ["Job Interview", "Business English"]],
    ["news discussion", "News Discussion", ["News", "Conversational English"]],
    ["kids and novice english", "Kids and Novice English", ["Online English"]],
  ],
  // Identical vocabulary to the student's learningStyle, so the matcher can
  // compare them exactly.
  teachingStyle: [
    ["structured", "Structured"],
    ["conversational", "Conversational"],
    ["visual", "Visual"],
    ["interactive", "Interactive"],
    ["independent", "Independent Practice"],
  ],
  // Identical vocabulary to the student's pace.
  idealStudentPace: [
    ["slow", "Slow and Guided"],
    ["balanced", "Balanced"],
    ["fast", "Fast-paced"],
    ["review-heavy", "Review-heavy"],
  ],
};

// Short helper text shown under each field, matching the Level Evaluation style.
export const STUDENT_CRITERIA_HINTS = {
  learningGoal: "What the student is working towards. Scored against the teacher's specialisations.",
  learningStyle: "How the student learns best. Compared directly with the teacher's teaching style.",
  focusArea: "The skills to work on. Matched against the teacher's specialisations.",
  pace: "How fast the student progresses. Compared with the teacher's best student pace.",
};

export const TEACHER_CRITERIA_HINTS = {
  specialization: "Which subjects and skills this teacher covers. Matched against each student's focus areas and goals.",
  teachingStyle: "How this teacher runs a lesson. Compared with the student's learning style.",
  idealStudentPace: "The student pace this teacher works best with. Compared with the student's pace.",
};

export const CRITERIA_EMPTY_MESSAGES = {
  noCourse: "Select at least one course to show the options that apply.",
  none: "Nothing to choose here yet.",
};

/**
 * An option applies when it has no course allowlist, or when one of the
 * allowlisted course names is among the selected ones. With no course selected
 * nothing applies, which is why course-scoped groups show a prompt instead.
 */
const optionAppliesToCourses = (option, selectedCourseNames) => {
  const allowedCourses = option[2] || [];
  if (!selectedCourseNames.length) return false;
  if (!allowedCourses.length) return true;
  return allowedCourses.some((courseName) => selectedCourseNames.includes(courseName));
};

/** Filter an option group down to the ones that apply to the selected courses. */
export const filterOptionsForCourses = (options, selectedCourseNames) =>
  (options || []).filter((option) => optionAppliesToCourses(option, selectedCourseNames));

/** Keep only the currently selected values that still apply to the new course. */
export const pruneSelectionToCourses = (selected, options, selectedCourseNames) =>
  (Array.isArray(selected) ? selected : []).filter((value) => {
    const option = (options || []).find(([optionValue]) => optionValue === value);
    return option ? optionAppliesToCourses(option, selectedCourseNames) : false;
  });

/**
 * Is `value` in `selected`? Compares as strings on both sides: DB ids arrive as
 * numbers while the forms store them as strings, and a plain `includes()` would
 * silently report "3" and 3 as different, leaving no chip highlighted.
 */
export const isSelectedValue = (selected, value) =>
  (Array.isArray(selected) ? selected : []).some((item) => String(item) === String(value));

/**
 * Normalise free text typed into an "Others" box into the same slug shape the
 * fixed vocabulary uses ("Patient and supportive" -> "patient-and-supportive"),
 * so a custom value is stored and compared consistently.
 */
export const toCriteriaSlug = (text) =>
  String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * The value stored for the "Others" chip while its text box is open.
 *
 * Lives here rather than only in CriteriaChipField because both the component
 * and the forms need it, and importing a component module into a util - or a
 * util into a component - to get one constant is how the two drift apart.
 * CriteriaChipField re-exports it, so existing imports keep working.
 */
export const CUSTOM_OPTION_VALUE = "__custom__";

/**
 * Weekday choices for a preferred-schedule picker, and the helpers around them.
 *
 * !! Shared rather than declared inside AdminDashboard. The student's contract
 * !! request needs the identical control, and a second copy of this list would be
 * !! free to order the days differently - which reads as two different meanings
 * !! for the same feature.
 *
 * Days are JS getDay indices, 0 = Sunday, which is what backend weekdayOf() and
 * normalizePreferredSchedule() already expect. Stored as strings because that is
 * how the column and the existing form both hold them.
 */
export const WEEKDAY_CHOICES = [
  ["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"],
  ["5", "Fri"], ["6", "Sat"], ["0", "Sun"],
];

export const createEmptyPreferredSchedule = () => ({ days: [], start: "", end: "" });

/**
 * Is this a complete preference?
 *
 * All three parts or nothing. A preference with days but no end time would filter
 * candidates against an open-ended window, which is not a narrower set of
 * teachers - it is a different and meaningless one.
 */
export const hasPreferredSchedule = (schedule) =>
  Boolean(schedule && schedule.days?.length && schedule.start && schedule.end);

/** "Mon, Sat 18:00-20:00", or "" when incomplete. */
export const describePreferredSchedule = (schedule) => {
  if (!hasPreferredSchedule(schedule)) return "";
  const days = (schedule.days || [])
    .map((day) => WEEKDAY_CHOICES.find((choice) => choice[0] === String(day))?.[1] || day)
    .join(", ");
  return `${days} ${schedule.start}-${schedule.end}`;
};

/**
 * The payload shape recommendTeacher reads, or null when incomplete.
 *
 * Trimmed and filtered here rather than at each call site, so "the student did
 * not say" is decided in exactly one place.
 */
export const toPreferredSchedulePayload = (schedule) => {
  if (!hasPreferredSchedule(schedule)) return null;
  return {
    days: schedule.days.map((day) => String(day)),
    start: String(schedule.start).trim(),
    end: String(schedule.end).trim(),
  };
};

/**
 * Merge one criteria field's chips with whatever was typed in its "Others" box.
 *
 * The sentinel and the raw text become one clean array: the sentinel is UI state
 * and must not reach the scorer, and the text is slugified so it is stored and
 * compared in the same shape as the fixed vocabulary. An empty box contributes
 * nothing at all, so ticking Others and leaving it blank is a no-op rather than
 * a criterion that can never be matched.
 *
 * !! Shared rather than written per form. It was a local function inside the
 * !! admin's Create Student, which meant the student's own Request New Contract
 * !! form could not have the same behaviour without copying it - and the copy
 * !! never happened, so the two forms silently diverged while sharing a
 * !! component that documents them as identical.
 */
export const criteriaWithCustom = (values, otherText) => {
  const chosen = (Array.isArray(values) ? values : []).filter((v) => v !== CUSTOM_OPTION_VALUE);
  const custom = toCriteriaSlug(otherText);
  return custom ? [...chosen, custom] : chosen;
};

/** Toggle one value in a multi-select array. */
export const toggleValue = (selected, value) => {
  const current = Array.isArray(selected) ? selected : [];
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
};

export const createEmptyCriteria = () => ({
  learningGoal: [],
  learningStyle: [],
  focusArea: [],
  pace: [],
});

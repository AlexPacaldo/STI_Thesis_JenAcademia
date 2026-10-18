/**
 * Tests for the demo data's internal consistency.
 *
 *   node scripts/test-demo-data.mjs
 *
 * !! These are all tests for a bug that already happened once. BOOKED_CLASSES
 * !! named a student, the seeder's lookup map held only teachers, and the
 * !! mismatch threw from inside the booked-classes loop - after twelve accounts
 * !! and two hundred availability rows were already committed to Railway. The
 * !! seed had to be re-run to find out whether anything else was broken too.
 * !!
 * !! A wrong key in a plain data file is a typo, not a runtime condition. It is
 * !! checkable in microseconds against nothing at all, so these assert that
 * !! validateDemoAccounts() reports every dangling reference and every duplicate,
 * !! all at once, BEFORE the seeder connects to anything.
 *
 * The mutation scenarios below deliberately break the real exported arrays. Each
 * one restores what it changed, so they cannot leak into a later scenario.
 */
import {
  BOOKED_CLASSES,
  STUDENTS,
  TEACHERS,
  WEEKLY_AVAILABILITY,
  aiBio,
  criteriaNotes,
  daysLeftFrom,
  validateDemoAccounts,
} from "./demo-accounts.mjs";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected: ${e}\n    actual:   ${a}`);
}

/* ------------------------------------------------------- the data as committed */

// If this fails, a typo was committed and the seeder would now refuse to run.
// That refusal is the intended behaviour, not a failure of the seeder.
check("the committed demo data is self-consistent", validateDemoAccounts(), []);

check("teachers exist", TEACHERS.length > 0, true);
check("students exist", STUDENTS.length > 0, true);
check("every teacher has a key", TEACHERS.every((t) => Boolean(t.key)), true);
check("every student has a key", STUDENTS.every((s) => Boolean(s.key)), true);
check(
  "teacher and student keys do not collide",
  TEACHERS.some((t) => STUDENTS.some((s) => s.key === t.key)),
  false
);

/* ------------------------------------------------- breaking it, one fault at a time */

/**
 * Run `mutate` against a restored copy of the real data, then put everything back.
 *
 * The restore matters: these suites run in one process, and a scenario that left
 * a dangling key behind would make every later assertion meaningless.
 */
function withBroken(mutate) {
  const saved = {
    booked: BOOKED_CLASSES.map((b) => ({ ...b })),
    students: STUDENTS.map((s) => ({ ...s })),
    teachers: TEACHERS.map((t) => ({ ...t })),
    availability: WEEKLY_AVAILABILITY.map((w) => ({ ...w })),
  };

  try {
    mutate();
    return validateDemoAccounts();
  } finally {
    BOOKED_CLASSES.length = 0;
    BOOKED_CLASSES.push(...saved.booked);
    STUDENTS.length = 0;
    STUDENTS.push(...saved.students);
    TEACHERS.length = 0;
    TEACHERS.push(...saved.teachers);
    WEEKLY_AVAILABILITY.length = 0;
    WEEKLY_AVAILABILITY.push(...saved.availability);
  }
}

// The exact original fault: a student's key that nothing registers.
check(
  "a booked class naming an unknown student is caught",
  withBroken(() => {
    BOOKED_CLASSES[0].student = "alvarezz";
  }),
  ['booked class has unknown student "alvarezz"']
);

// A teacher key does not satisfy a student reference. Teachers and students are
// separate namespaces, and conflating them is what hid the original bug.
check(
  "a teacher key in a student slot is caught",
  withBroken(() => {
    BOOKED_CLASSES[0].student = TEACHERS[0].key;
  }),
  [`booked class has unknown student "${TEACHERS[0].key}"`]
);

check(
  "a student key in a teacher slot is caught",
  withBroken(() => {
    BOOKED_CLASSES[0].teacher = STUDENTS[0].key;
  }),
  [`booked class has unknown teacher "${STUDENTS[0].key}"`]
);

check(
  "availability for an unknown teacher is caught",
  withBroken(() => {
    WEEKLY_AVAILABILITY[0].key = "stranger";
  }),
  ['availability for unknown teacher "stranger"']
);

check(
  "a student assigned to an unknown teacher is caught",
  withBroken(() => {
    STUDENTS[0].teacher = "stranger";
  }),
  // Names the offending student, not just the bad teacher: with five students
  // in this file, "assigned to unknown teacher" alone would not say which row
  // to go and fix.
  [`student "${STUDENTS[0].key}" is assigned to unknown teacher "stranger"`]
);

check(
  "a duplicate teacher key is caught",
  withBroken(() => {
    TEACHERS.push({ ...TEACHERS[0] });
  }),
  [`duplicate teacher key "${TEACHERS[0].key}"`]
);

// One run should surface every fault, not just the first. Otherwise a seeder run
// is a round trip per typo, against a live database.
const twoFaults = withBroken(() => {
  STUDENTS[0].teacher = "stranger";
  BOOKED_CLASSES[0].student = "nobody";
});
check("two independent faults are both reported", twoFaults.length, 2);
check(
  "the student fault is among them",
  twoFaults.some((p) => p.includes("assigned to unknown teacher")),
  true
);
check(
  "the booked-class fault is among them",
  twoFaults.some((p) => p.includes('unknown student "nobody"')),
  true
);

/* ---------------------------------------------------------- the derived helpers */

// A student with no teacher assigned is legitimate, so an absent `teacher` is
// not a fault. Only a teacher that is named and wrong should be reported.
check(
  "an unassigned student is not a fault",
  withBroken(() => {
    delete STUDENTS[0].teacher;
  }),
  []
);

check("days left on a fresh 90-day package", daysLeftFrom(0), 90);
check("days left on Danica's expired package", daysLeftFrom(100), -10);
check("a package expiring in 14 days", daysLeftFrom(76), 14);

check("criteria notes for a full set", criteriaNotes({
  learningGoal: ["exam-prep"],
  focusArea: ["reading", "listening"],
}), "AI matching criteria:\nLearning goal: exam-prep\nFocus area: reading, listening");

check("criteria notes are empty when nothing is chosen", criteriaNotes({
  learningGoal: [], focusArea: [],
}), "");

check("bio text mentions the experience", aiBio({ experience: 8 }).includes("8"), true);

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("All good.");
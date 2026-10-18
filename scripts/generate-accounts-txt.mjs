#!/usr/bin/env node
/**
 * Regenerate the reference sections of SAMPLE_ACCOUNTS.txt from
 * scripts/demo-accounts.mjs.
 *
 *   node scripts/generate-accounts-txt.mjs
 *
 * !! Why generate rather than hand-write. !!
 * !! The account list is what someone acts on minutes before a defense. If it is
 * !! typed by hand it can drift from what the seed actually creates, and the demo
 * !! will show a birthday or a pace value that does not exist in the database -
 * !! with no way to tell until it is on screen. Generating both from one module
 * !! makes that impossible.
 *
 * The prose sections (the demo script, troubleshooting) are left alone; only the
 * parts that restate data are replaced.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  ADMIN, COUNTRY, DEMO_STUDENT, PASSWORD, STUDENTS, TEACHERS, TIMEZONE,
  ageOn, daysLeftFrom,
} from "./demo-accounts.mjs";

const TXT = "SAMPLE_ACCOUNTS.txt";
const teacherByKey = Object.fromEntries(TEACHERS.map((t) => [t.key, t]));
const pad = (s, n) => String(s).padEnd(n);
const wrap = (text, width, indent) => {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > width) {
      lines.push(indent + line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(indent + line);
  return lines;
};
const OR = (v) => (Array.isArray(v) && v.length ? v.join(", ") : "(none)");

/* ------------------------------------------------------------ the table */

const all = [
  { role: "Admin", ...ADMIN },
  ...TEACHERS.map((t) => ({ role: "Teacher", ...t })),
  ...STUDENTS.map((s) => ({ role: "Student", ...s })),
];

const rows = [
  ["ROLE", "BIRTHDAY", "AGE", "COUNTRY", "CONTACT", "EMAIL"],
  ...all.map((a) => [
    a.role,
    a.birthDate || "(none)",
    ageOn(a.birthDate) == null ? "-" : String(ageOn(a.birthDate)),
    a.country || COUNTRY,
    a.contact || "-",
    a.email,
  ]),
];

const colW = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
const table = rows
  .map((r, i) => r.map((c, j) => pad(c, colW[j])).join("  ").trimEnd())
  .map((line, i) => (i === 1 ? `${line}\n${colW.map((w) => "-".repeat(w)).join("  ")}` : line))
  .join("\n");

/* ---------------------------------------------------------- teachers */

const teacherSections = TEACHERS.map((t) => {
  const flag = t.teachesChildren
    ? "teaches any age"
    : "!! DECLINES CHILDREN - see section 2, step 2d";
  const courses = t.courses.length === 9 ? "ALL NINE COURSES" : t.courses.join(", ");
  return [
    `  ${t.email}`,
    `      Name                 ${t.firstName} ${t.lastName}`,
    `      Birthday            ${t.birthDate}   (age ${ageOn(t.birthDate)})`,
    `      Country             ${COUNTRY}`,
    `      Contact             ${t.contact}`,
    `      Courses             ${courses}`,
    `      Specialization      ${OR(t.specialization.split(", ").filter(Boolean))}`,
    `      Teaching style      ${OR(t.teachingStyle)}`,
    `      Best student pace   ${OR(t.idealStudentPace)}`,
    `      Experience years    ${t.experienceYears}`,
    `      Teaches children    ${t.teachesChildren ? "yes" : "NO"}   -> ${flag}`,
    `      Notes`,
    ...wrap(t.notes || "(deliberately none - a thin profile on purpose)", 66, "        "),
  ].join("\n");
}).join("\n\n");

/* ---------------------------------------------------------- students */

const studentSections = STUDENTS.map((s) => {
  const t = teacherByKey[s.teacher];
  const left = daysLeftFrom(s.createdDaysAgo);
  const badge = left <= 0 ? "EXPIRED" : left <= 14 ? "AMBER" : "green";
  return [
    `  ${s.email}`,
    `      Name                 ${s.firstName} ${s.lastName}`,
    `      Birthday            ${s.birthDate ? `${s.birthDate}   (age ${ageOn(s.birthDate)})` : "(none on file - deliberate)"}`,
    `      Country             ${COUNTRY}`,
    `      Course              ${s.course}`,
    `      Level evaluation    scored at creation -> ${s.level}`,
    `                           (the 5-criterion rubric is only entered when a student is`,
    `                            created, so seeded students carry the level alone)`,
    `      Learning goal       ${OR(s.criteria.learningGoal)}`,
    `      Focus area          ${OR(s.criteria.focusArea)}`,
    `      Learning style      ${OR(s.criteria.learningStyle)}`,
    `      Learning pace       ${OR(s.criteria.pace)}`,
    `      Preferred schedule  (none - it is a creation-time input, not stored per student)`,
    `      Class package       ${s.totalClasses} classes, ${s.classDuration} min each, bought ${s.createdDaysAgo} days ago`,
    `                           -> ${left > 0 ? `${left} days left` : "PAST its 90-day term"} (${badge})`,
    `      Assigned teacher    ${t ? `${t.firstName} ${t.lastName} (${t.email})` : "unassigned"}`,
    `      Notes`,
    ...wrap(s.notes, 66, "        "),
  ].join("\n");
}).join("\n\n");

/* ------------------------------------------------------- the live student */

const d = DEMO_STUDENT;
const lvl = [
  ["Speaking & Pronunciation", d.levelScores.speakingPronunciation],
  ["Reading & Comprehension", d.levelScores.readingComprehension],
  ["Structure", d.levelScores.structure],
  ["Sentence / Grammar", d.levelScores.sentenceGrammar],
  ["Vocabulary", d.levelScores.vocabulary],
];
const live = [
  `  ${d.firstName} ${d.lastName}   (you type this one in - she is NOT seeded)`,
  `      Birthday            ${d.birthDate}   (age ${ageOn(d.birthDate)})   <- this is what makes her a child`,
  `      Country             ${COUNTRY}`,
  `      Course              ${d.course}`,
  `      Level evaluation    ${d.computedLevel}  - enter exactly these five:`,
  ...lvl.map(([label, score]) => `          ${pad(label, 28)} ${score}/5`),
  `      Learning goal       ${OR(d.criteria.learningGoal)}`,
  `      Focus area          ${OR(d.criteria.focusArea)}`,
  `      Focus area [x] Others  "${d.criteriaOthers.focusArea}"`,
  `      Learning style      ${OR(d.criteria.learningStyle)}`,
  `      Learning pace       ${OR(d.criteria.pace)}`,
  `      Preferred schedule  ${d.preferredSchedule.days.join(", ")} ${d.preferredSchedule.start} - ${d.preferredSchedule.end}`,
  `      Notes`,
  ...wrap(d.trialNotes, 66, "        "),
].join("\n");

/* ------------------------------------------------- the hand-written prose */

// Declared before PROSE, which interpolates them. const is in the temporal dead
// zone until its own declaration runs, so putting these after the template
// literal that uses them is a ReferenceError.
const bar = "=".repeat(80);
const rule = "-".repeat(80);
const section = (title, body) =>
  `${rule}\n ${title}\n${rule}\n\n${body}\n`;

// Everything from the demo script onward. This lives in the generator rather
// than in the txt so that regenerating the file cannot delete it.
//
// The first version of this script wrote the whole file from generated data
// only, and silently destroyed these five sections. Data is generated; the
// argument being made is written by hand, and the generator has to keep both.

const PROSE = `
${rule}
 6. THE DEMO - 8 STEPS, IN THIS ORDER
${rule}

STEP 1 - Sign in as admin. Open Create Student.
    This is the centrepiece. Fill it in using section 4 above, which has the
    exact birthday, level scores and criteria.

    Then: Preferred Class Schedule  Saturday, 09:00 - 11:00

STEP 2 - Click ANALYZE. Let it load.

    Point out, in order:
      a) The AI read the trial notes and EXTRACTED criteria you did not type -
         it turns "froze when asked to describe her weekend" into a speaking
         focus area.
      b) It ranked the candidates and gave a one-sentence reason for each.
      c) Maia Cruz is ranked FIRST. She is the best conversational fit in the
         school.
      d) BUT the student is 11, and Maia has declined children. She is not
         recommended.
         >>> THIS IS THE POINT OF THE WHOLE SYSTEM. <<<
         The AI's opinion is advisory. Eligibility is not. The computer decides
         who is allowed; the AI only decides the order.
      e) Rafael Santos is recommended instead - and he won on the RULE, not on
         the AI's preference.

STEP 3 - Look at the availability line. Ben Martin cannot do Saturday mornings
    and has moved down. Availability is applied AFTER the AI too, so a model
    that put him first does not get to keep him there.

STEP 4 - Point at the match strength. Ava should read STRONG or PARTIAL with a
    green or amber badge. Say plainly: "the computer tells the admin how good
    this actually is, not just who it picked."

STEP 5 - Contracts tab. Point at the Expires column and its three colours:
      Beatrice   ~80 days   green    comfortable
      Carlos       ~9 days  AMBER    warned already
      Danica      expired    red      the rule ran by itself

STEP 6 - Sign in as ben.martin@jenacademia.local and open the Students page.
    Two students, and the expiry badge is on THEIR view too. The teacher can see
    whether those classes are still bookable.

STEP 7 - Create Kyla Bautista, 16, Conversational English, Learning Goal set to
    "School Support" - only Rafael's profile touches that at all. Analyze.
    >>> THE CARD SHOULD READ, IN RED:
        "Closest available, not a strong match. 1 of the 4 criteria you set are
         covered by this teacher. Nobody here fits better."
    This is the system being honest rather than pretending. Clara Reyes exists
    in the data precisely so this case is demonstrable.

STEP 8 - THE FALLBACK. This is the one that wins the argument.

    Set the Gemini key to anything invalid (e.g. GOOGLE_GEMINI_API_KEY=not-a-real-key)
    and redeploy. Then analyze Ava again.

    >>> The recommendation STILL APPEARS - the old rule-based ranking, unchanged.
        The card says plainly:
        "The AI ranking was unavailable, so these are the rule-based scores
         instead."

    Then click ANALYZE three more times in a row.
    >>> It now answers INSTANTLY. Three failures in a row trip a circuit breaker,
        so it stops calling for five minutes instead of making you wait 25 seconds
        per click to be handed the old answer.

    Say: "The AI is an enhancement. It is never the only path to a result, and a
    degraded result is never dressed up as a considered one."

    RESET: put the real key back and redeploy.

${rule}
 7. WHAT EACH PIECE DEMONSTRATES, IN ONE LINE EACH
${rule}

  AI reorders, never decides ....... Step 2d - Maia ranked first, not chosen
  Hard constraint beats the AI .... Steps 2d, 3 - age rule, availability
  Rules as the fallback ............. Step 8 - identical answer, no AI
  Fast fallback, not a 25s hang ..... Step 8 - circuit breaker after 3 failures
  AI reads what the admin did not type  Step 2a - notes become criteria
  Free text ("Others") is honoured .. Step 2 - "public speaking nerves"
  Honest when nothing fits well ..... Step 7 - "Closest available"
  Unknown data is disclosed ......... Noah Garcia - no birthday on file
  Workload is respected ............. Ben Martin - 2 students, rule acts
  Contracts expire on time .......... Step 5 - 3 badge states
  Explainable, every time ........... Rule scores shown beside the AI's reasons

${rule}
 8. HOW TO RUN
${rule}

  1. Wipe the database.

  2. Seed the accounts:

         cd backend
         node ../scripts/seed-demo-data.mjs

     It reads backend/.env, so it uses the same credentials as the server.
     It is safe to re-run - it updates the same rows rather than duplicating.

  3. START THE SERVER ONCE, then stop it.

     This matters. The first boot is what:
       - derives each contract's expires_at from created_at (3 months)
       - encrypts the seeded notes and birth dates
       - flips Danica's package to 'expired', because the rule says so

     Without that boot you will see no expiry dates.

  4. Sign in as ${ADMIN.email} / ${PASSWORD}

  5. Work through section 6 in order.

${rule}
 9. IF SOMETHING LOOKS WRONG
${rule}

  "No teachers matched" on Ava
      Check Rafael and Maia are assigned to Conversational English
      (Teacher Courses, admin side). The candidate pool is by COURSE.

  No expiry dates anywhere
      The server has not booted since you seeded. Do step 3.

  "No active students found" on Contracts
      The seed inserts students directly with profile_completed = TRUE. If you
      created your own students through the form they are still FALSE until they
      finish their setup invite, and this screen will not list them.

  The AI section says nothing
      GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY is not set in production. The
      rules-only path is working correctly - that is Step 8's fallback.

  Clara Reyes looks like a bug
      She is deliberate. A thin profile is the honest way to make the
      "closest available, not a strong match" state reachable.

  The birthday in the profile page does not match section 1
      Birthdays are stored encrypted, so they cannot be read from SQL. Check the
      UI, and re-run the seed if the profile page really disagrees.

${rule}
 10. A NOTE ON HONESTY
${rule}

  Every number in this demo is real, and every "state" is produced by the real
  rule rather than typed into a field.

  Danica's expired package was not marked expired by the seed. The seed gave her
  a purchase date 100 days ago and the server worked out the rest. If you can
  show that, the defense is stronger than if you had set the status by hand.

  The same is true of Carlos's amber badge and the fact that a real notification
  is sitting in his bell.

${bar}
`;

/* ---------------------------------------------------------- assemble */

const generated =
  `${bar}\n JEN ACADEMIA - DEMO ACCOUNTS FOR THE THESIS DEFENSE\n${bar}\n\n` +
  ` Every account: country ${COUNTRY}, timezone ${TIMEZONE}, password ${PASSWORD}\n\n` +
  ` Regenerated by scripts/generate-accounts-txt.mjs from scripts/demo-accounts.mjs,\n` +
  ` which is the same module the seeder writes. The two cannot disagree.\n\n` +
  section(
    "1. THE ACCOUNTS AT A GLANCE",
    `Birthdays are stored ENCRYPTED. After the first server boot they will not be\n` +
    `readable in SQL, only in the UI - that is the field working as intended, but it\n` +
    `means a wrong-looking date has to be checked on the profile page.\n\n` +
    `Noah Garcia deliberately has no birthday. That is demo step 7, not an oversight.\n\n` +
    table
  ) +
  "\n" +
  section("2. TEACHER PROFILES - full field values", teacherSections) +
  "\n" +
  section("3. STUDENT PROFILES - full field values", studentSections) +
  "\n" +
  section("4. THE STUDENT YOU CREATE DURING THE DEMO", live) +
  "\n" +
  section("5. CLASS PACKAGES", [
    `  Contract term: 3 months from purchase, whichever limit runs out first.`,
    ``,
    `  The seed never writes expires_at or status. It writes created_at, and the`,
    `  server derives the deadline as created_at + 3 months on the next boot. So the`,
    `  states below are produced BY THE RULE, not typed into a column.`,
    ``,
    `  STUDENT              CLASSES  MIN  BOUGHT     TERM ENDS       BADGE`,
    `  -------------------  -------  ---  ---------  --------------  --------`,
    ...STUDENTS.map((s) => {
      const left = daysLeftFrom(s.createdDaysAgo);
      const badge = left <= 0 ? "EXPIRED (red)" : left <= 14 ? "AMBER" : "green";
      return `  ${pad(s.firstName + " " + s.lastName, 19)}  ${pad(s.totalClasses, 7)} ${pad(s.classDuration, 3)}  ` +
        `${pad(s.createdDaysAgo + " days ago", 9)}  ${pad(left <= 0 ? "already passed" : `in ${left} days`, 14)}  ${badge}`;
    }),
    ``,
    `  Danica's package is the important one: seeded 100 days ago, and the SERVER`,
    `  decides it is expired on the next sweep. Nothing in the seed marks it.`,
  ].join("\n")) +
  PROSE;

writeFileSync(TXT, generated, "utf8");
console.log(`Wrote ${TXT}`);
console.log(`  ${all.length} accounts, ${TEACHERS.length} teachers, ${STUDENTS.length} students, 1 live demo student`);
console.log(`  ${generated.split("\n").length} lines, ${generated.split(/\n (?=\d\. )/).length} sections`);
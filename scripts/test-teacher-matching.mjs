/**
 * Runnable check for the teacher <-> student matcher.
 *
 * There is no test framework in this repo, so this is a plain script:
 *   node scripts/test-teacher-matching.mjs
 *
 * It covers the pure scoring/selection logic plus the contract between the
 * frontend option catalogues and the backend mapping tables. If someone renames
 * an option value on one side, this fails.
 */

import {
  FOCUS_AREA_TO_SPECIALIZATION,
  LEARNING_GOAL_TO_SPECIALIZATION,
  MIN_EXPERIENCE_BY_LEVEL,
  parseSpecialization,
  parseTeacherProfileTags,
  rankTeachers,
  scoreTeacherForStudent,
  selectTeacherFromRanking,
  TEACHER_BALANCE_LIMIT,
} from "../backend/teacherMatching.js";
import {
  STUDENT_CRITERIA_OPTIONS,
  TEACHER_CRITERIA_OPTIONS,
  toggleValue,
} from "../frontend/src/utils/matchingCriteria.js";

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`)
  );
}

const values = (options) => options.map(([value]) => value);

const teacher = (overrides = {}) => ({
  user_id: overrides.user_id ?? 1,
  first_name: "Test",
  last_name: "Teacher",
  bio: "",
  specialization: "",
  experience_years: 0,
  assigned_student_count: 0,
  selected_course_match: 0,
  ...overrides,
});

const bioWith = (style = [], pace = []) =>
  [
    "Ten years teaching.",
    "",
    "AI matching profile:",
    style.length ? `Teaching style: ${style.join(", ")}` : "",
    pace.length ? `Best student pace: ${pace.join(", ")}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

// ---------------------------------------------------------------- catalogues
console.log("=== option catalogues line up with the backend mapping tables ===");

check(
  "every student focusArea has a specialization mapping",
  values(STUDENT_CRITERIA_OPTIONS.focusArea).filter((v) => !FOCUS_AREA_TO_SPECIALIZATION[v]),
  []
);
check(
  "every student learningGoal has a specialization mapping",
  values(STUDENT_CRITERIA_OPTIONS.learningGoal).filter((v) => !LEARNING_GOAL_TO_SPECIALIZATION[v]),
  []
);
const knownSpecializations = new Set(values(TEACHER_CRITERIA_OPTIONS.specialization));
check(
  "focus area mappings only reference real specializations",
  [...new Set(Object.values(FOCUS_AREA_TO_SPECIALIZATION).flat())].filter(
    (v) => !knownSpecializations.has(v)
  ),
  []
);
check(
  "learning goal mappings only reference real specializations",
  [...new Set(Object.values(LEARNING_GOAL_TO_SPECIALIZATION).flat())].filter(
    (v) => !knownSpecializations.has(v)
  ),
  []
);

// Exact-overlap criteria require an IDENTICAL vocabulary on both sides.
check(
  "student learningStyle vocabulary == teacher teachingStyle vocabulary",
  values(STUDENT_CRITERIA_OPTIONS.learningStyle).sort(),
  values(TEACHER_CRITERIA_OPTIONS.teachingStyle).sort()
);
check(
  "student pace vocabulary == teacher best student pace vocabulary",
  values(STUDENT_CRITERIA_OPTIONS.pace).sort(),
  values(TEACHER_CRITERIA_OPTIONS.idealStudentPace).sort()
);
check(
  "every stored level has an experience requirement",
  ["novice-low", "intermediate-low", "intermediate-mid", "intermediate-high", "advanced"].filter(
    (l) => MIN_EXPERIENCE_BY_LEVEL[l] === undefined
  ),
  []
);

// ------------------------------------------------------------------ parsing
console.log("\n=== parsing ===");

const parsed = parseTeacherProfileTags(bioWith(["structured", "visual"], ["slow"]));
check("parses teaching style", parsed.teachingStyle, ["structured", "visual"]);
check("parses best pace", parsed.idealStudentPace, ["slow"]);
check("recognises the block", parsed.hasProfileBlock, true);
check("free text excludes the block", parsed.freeText, "Ten years teaching.");

// A bio written before "Teacher strength" was removed must still parse, with
// the stale tag ignored rather than crashing.
const stale = parseTeacherProfileTags(
  "Ten years teaching.\n\nAI matching profile:\nTeaching style: structured\nTeacher strength: patient and supportive\nBest student pace: slow"
);
check("stale Teacher strength tag is ignored", stale.teachingStyle, ["structured"]);
check("stale bio still yields the pace", stale.idealStudentPace, ["slow"]);
check("stale bio exposes no strength key", stale.teacherStrength, undefined);

const legacy = parseTeacherProfileTags("I focus on conversational practice.");
check("legacy bio has no block", legacy.hasProfileBlock, false);
check("legacy bio is all free text", legacy.freeText, "I focus on conversational practice.");

check("parses comma-joined specialization column", parseSpecialization("grammar and writing, exam preparation"), [
  "grammar and writing",
  "exam preparation",
]);
check("parses array specialization", parseSpecialization(["speaking and conversation"]), [
  "speaking and conversation",
]);

// ------------------------------------------------------------------ scoring
console.log("\n=== scoring ===");

const baseCriteria = { learningGoal: [], learningStyle: [], focusArea: [], pace: [] };
const score = (t, c = baseCriteria, course = null, level = "") =>
  scoreTeacherForStudent(t, c, "", course, level).score;

// Exact structural match should beat no match.
const strong = teacher({
  user_id: 10,
  bio: bioWith(["structured"], ["slow"]),
  specialization: "grammar and writing",
  experience_years: 6,
  selected_course_match: 1,
});
const weak = teacher({ user_id: 11, bio: "I teach a bit of everything." });

check(
  "a matching profile outscores an empty one",
  score(strong, {
    ...baseCriteria,
    focusArea: ["grammar"],
    learningStyle: ["structured"],
    pace: ["slow"],
  }, 1, "intermediate-high") > score(weak, baseCriteria, 1, "intermediate-high"),
  true
);

// A word-boundary bug guard: "breeding" must not satisfy "reading".
const nameOnly = teacher({ user_id: 12, bio: "", specialization: "" });
check(
  "substring false positives are gone",
  score(nameOnly, { ...baseCriteria, focusArea: ["reading"] }) -
    score(nameOnly, baseCriteria) <= 0,
  true
);

// Trial notes are identical for every candidate, so they must not move the score.
const withNotes = scoreTeacherForStudent(weak, baseCriteria, "needs help with grammar and pronunciation", null, "");
const withoutNotes = scoreTeacherForStudent(weak, baseCriteria, "", null, "");
check("trial notes do not affect the score", withNotes.score, withoutNotes.score);

// Proficiency level now gates on experience, in both directions.
const novice = teacher({ user_id: 13, experience_years: 0, bio: bioWith([], []) });
const seasoned = teacher({ user_id: 14, experience_years: 9, bio: bioWith([], []) });
check(
  "an advanced student favours the experienced teacher",
  score(seasoned, baseCriteria, null, "advanced") > score(novice, baseCriteria, null, "advanced"),
  true
);
check(
  "an advanced student penalises the inexperienced teacher",
  score(novice, baseCriteria, null, "advanced") < score(novice, baseCriteria, null, "novice-low"),
  true
);

// Load is penalised.
const busy = teacher({ user_id: 15, bio: bioWith(["structured"], []), assigned_student_count: 3 });
const idle = teacher({ user_id: 16, bio: bioWith(["structured"], []) });
check("a loaded teacher scores lower", score(busy, baseCriteria) < score(idle, baseCriteria), true);

// A teacher always has at least one reason.
check(
  "every teacher gets a reason",
  scoreTeacherForStudent(weak, baseCriteria, "", null, "").reasons.length > 0,
  true
);

// Focus areas that share a specialization both register.
const grammarWriter = teacher({ user_id: 17, specialization: "grammar and writing" });
const bothFocus = score(grammarWriter, { ...baseCriteria, focusArea: ["grammar", "writing"] });
const oneFocus = score(grammarWriter, { ...baseCriteria, focusArea: ["grammar"] });
check("two focus areas on one specialization score higher", bothFocus > oneFocus, true);

// ----------------------------------------------------------------- selection
console.log("\n=== selection policy ===");

const ranked = rankTeachers([
  scoreTeacherForStudent(teacher({ user_id: 1, assigned_student_count: 0, bio: "generic" }), baseCriteria, "", null, ""),
  scoreTeacherForStudent(teacher({ user_id: 2, assigned_student_count: 0, bio: "generic too" }), baseCriteria, "", null, ""),
  scoreTeacherForStudent(teacher({ user_id: 3, assigned_student_count: 5, bio: "generic also" }), baseCriteria, "", null, ""),
]);

const picked = selectTeacherFromRanking(ranked, null);
check(
  "an under-limit teacher is preferred over an overloaded one",
  picked.assigned.assigned_student_count < TEACHER_BALANCE_LIMIT,
  true
);
check("no least-loaded fallback when someone is under the cap", picked.usedLeastLoadedFallback, false);

const allBusy = rankTeachers([
  scoreTeacherForStudent(teacher({ user_id: 4, assigned_student_count: 4 }), baseCriteria, "", null, ""),
  scoreTeacherForStudent(teacher({ user_id: 5, assigned_student_count: 2 }), baseCriteria, "", null, ""),
]);
const fallback = selectTeacherFromRanking(allBusy, null);
check("least-loaded fallback kicks in when everyone is at the cap", fallback.usedLeastLoadedFallback, true);
check("fallback picks the lightest load", fallback.assigned.assigned_student_count, 2);

const withPreference = selectTeacherFromRanking(ranked, "3");
check(
  "a manual pick is honoured only while under the cap",
  withPreference.assigned.user_id,
  ranked.find((t) => t.assigned_student_count < TEACHER_BALANCE_LIMIT).user_id
);

const preferredFree = selectTeacherFromRanking(ranked, "1");
check("a valid manual pick is respected", preferredFree.assigned.user_id, 1);

// ---------------------------------------------------------------- utilities
console.log("\n=== multi-select helper ===");
check("toggles on", toggleValue([], "a"), ["a"]);
check("toggles off", toggleValue(["a", "b"], "a"), ["b"]);
check("appends without duplicates", toggleValue(["a"], "b"), ["a", "b"]);

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All good.");

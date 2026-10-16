/**
 * Runnable check for the level-evaluation rubric.
 *
 * There is no test framework in this repo, so this is a plain script:
 *   node scripts/test-proficiency-evaluation.mjs
 *
 * It runs the same suite against the frontend and backend copies of the logic
 * and fails if they ever disagree, which is the guard for the "must stay in
 * sync" comment in those two files.
 */

import {
  buildLevelEvaluationNotes as buildNotesFrontend,
  computeProficiencyLevel as computeFrontend,
  LEVEL_EVALUATION_CRITERIA as CRITERIA_FRONTEND,
} from "../frontend/src/utils/proficiencyEvaluation.js";
import {
  buildLevelEvaluationNotes as buildNotesBackend,
  computeProficiencyLevel as computeBackend,
  LEVEL_EVALUATION_CRITERIA as CRITERIA_BACKEND,
  parseLevelScores,
} from "../backend/proficiencyEvaluation.js";

// [speaking, reading, structure, sentence/grammar, vocabulary]
const s = (speakingPronunciation, readingComprehension, structure, sentenceGrammar, vocabulary) => ({
  speakingPronunciation,
  readingComprehension,
  structure,
  sentenceGrammar,
  vocabulary,
});

const CASES = [
  { name: "all ones", scores: s(1, 1, 1, 1, 1), expected: "novice-low" },
  { name: "good speaking, all core 1", scores: s(3, 1, 1, 1, 1), expected: "novice-low" },
  { name: "all twos", scores: s(2, 2, 2, 2, 2), expected: "intermediate-low" },
  { name: "all threes", scores: s(3, 3, 3, 3, 3), expected: "intermediate-mid" },
  { name: "avg 3.2", scores: s(4, 3, 3, 3, 3), expected: "intermediate-mid" },
  { name: "avg 3.6", scores: s(4, 4, 3, 3, 4), expected: "intermediate-high" },
  { name: "all fours, avg 4.0 below 4.5", scores: s(4, 4, 4, 4, 4), expected: "intermediate-high" },
  { name: "advanced", scores: s(5, 5, 4, 5, 5), expected: "advanced" },
  { name: "avg 2.8", scores: s(3, 3, 3, 3, 2), expected: "intermediate-mid" },
  { name: "avg 2.4", scores: s(3, 3, 2, 2, 2), expected: "intermediate-low" },
];

const MISSING_CASES = [
  { name: "all missing", scores: {} },
  { name: "one missing", scores: { ...s(3, 3, 3, 3, 3), vocabulary: null } },
  { name: "undefined value", scores: { ...s(3, 3, 3, 3, 3), structure: undefined } },
];

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        expected: ${expected}\n        actual:   ${actual}`}`);
}

const implementations = [
  { name: "frontend", compute: computeFrontend, notes: buildNotesFrontend, criteria: CRITERIA_FRONTEND },
  { name: "backend", compute: computeBackend, notes: buildNotesBackend, criteria: CRITERIA_BACKEND },
];

for (const impl of implementations) {
  console.log(`\n=== ${impl.name} (${impl.compute === computeFrontend ? "frontend/src/utils/proficiencyEvaluation.js" : "backend/proficiencyEvaluation.js"}) ===`);

  check(
    "criteria are the 5 expected keys in order",
    impl.criteria.map((c) => c.key).join(","),
    "speakingPronunciation,readingComprehension,structure,sentenceGrammar,vocabulary"
  );

  for (const { name, scores, expected } of CASES) {
    const computed = impl.compute(scores);
    check(`${name} ${JSON.stringify(scores)} -> ${expected}`, computed?.level, expected);
    if (computed && !computed.reason) {
      failures += 1;
      console.log(`FAIL  ${name} produced no human-readable reason`);
    }
  }

  for (const { name, scores } of MISSING_CASES) {
    check(`${name} -> null`, impl.compute(scores), null);
  }

  // Notes block, so the persisted record is auditable.
  const notes = impl.notes(s(5, 5, 4, 5, 5), impl.compute(s(5, 5, 4, 5, 5)));
  console.log("\n--- sample Level evaluation notes block ---");
  console.log(notes);
  console.log("-----------------------------------------\n");
  check("notes start with the heading", notes.startsWith("Level evaluation:"), true);
  check("notes list all 5 scores", (notes.match(/\d\/5/g) || []).length, 5);
  check("notes record the computed label", notes.includes("Computed level: Advanced"), true);
}

// The duplication guard: both copies must agree on every case.
console.log("=== sync check ===");
for (const { name, scores } of [...CASES, ...MISSING_CASES]) {
  const front = computeFrontend(scores);
  const back = computeBackend(scores);
  check(
    `in sync: ${name}`,
    JSON.stringify(front),
    JSON.stringify(back)
  );
}

// Wire-format hardening used by POST /api/admin/users.
console.log("\n=== parseLevelScores (backend input validation) ===");
check("rejects empty", parseLevelScores({}), null);
check("rejects missing key", parseLevelScores(s(3, 3, 3, 3, null)), null);
check("rejects 0", parseLevelScores(s(0, 3, 3, 3, 3)), null);
check("rejects 6", parseLevelScores(s(3, 3, 3, 3, 6)), null);
check("rejects 3.5", parseLevelScores(s(3, 3, 3, 3, 3.5)), null);
check("rejects null", parseLevelScores(null), null);
check(
  "accepts integers",
  JSON.stringify(parseLevelScores(s(1, 2, 3, 4, 5))),
  JSON.stringify(s(1, 2, 3, 4, 5))
);

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All good.");

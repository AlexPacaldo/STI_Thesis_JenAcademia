/**
 * Level evaluation rubric -> computed proficiency level.
 *
 * The admin scores a trial student on five criteria (1-5) instead of picking a
 * level by hand; the level is derived from those scores.
 *
 * !! MUST STAY IN SYNC WITH backend/proficiencyEvaluation.js !!
 * The backend recomputes the level from the submitted scores and does NOT trust
 * a client-sent level, so this logic is deliberately duplicated rather than
 * shared (frontend and backend are separate packages and never import from each
 * other). Any threshold, ordering or wording change must be applied to both
 * copies. scripts/test-proficiency-evaluation.mjs runs the same suite against
 * both and fails if they disagree.
 */

export const LEVEL_SCORE_MIN = 1;
export const LEVEL_SCORE_MAX = 5;

// The 1-5 values offered by the selector, in order.
export const LEVEL_SCORE_SCALE = [1, 2, 3, 4, 5];

// The five scored criteria, in display order. `hint` is the short plain-language
// note shown under each label so the admin knows what to judge.
export const LEVEL_EVALUATION_CRITERIA = [
  {
    key: "speakingPronunciation",
    label: "Speaking & Pronunciation",
    hint: "Judged on whether the student is understandable. An accent is fine, perfection is not required.",
  },
  {
    key: "readingComprehension",
    label: "Reading & Comprehension",
    hint: "Can they read a passage and explain what it means?",
  },
  {
    key: "structure",
    label: "Structure",
    hint: "Can they organise their ideas in a logical order?",
  },
  {
    key: "sentenceGrammar",
    label: "Sentence / Grammar",
    hint: "Grammar mistakes are acceptable at Intermediate as long as the meaning gets across.",
  },
  {
    key: "vocabulary",
    label: "Vocabulary",
    hint: "Range and accuracy of the words they use.",
  },
];

// A 1 in any of these drops the student straight to Novice regardless of how
// good their pronunciation is, so they are evaluated before anything else.
export const CORE_LEVEL_CRITERIA = [
  "readingComprehension",
  "structure",
  "sentenceGrammar",
  "vocabulary",
];

// Scoring thresholds. Tuned from the company's rubric; kept here as named
// constants so the cutoffs can be retuned in one place instead of being
// scattered as magic numbers.
export const NOVICE_TRIGGER_SCORE = 1;
export const ADVANCED_MIN_EVERY_SCORE = 4;
export const ADVANCED_MIN_AVERAGE = 4.5;
export const HIGH_MIN_EVERY_SCORE = 3;
export const HIGH_MIN_AVERAGE = 3.5;
export const FALLBACK_MID_MIN_AVERAGE = 2.8;

// The company uses 5 levels. Novice is NOT split into low/mid/high any more,
// but the DB still holds the original 7 slugs and we must not add a migration,
// so Novice reuses the `novice-low` slug and is displayed as plain "Novice".
// `novice-mid` / `novice-high` stay valid for records that already hold them.
export const COMPUTED_LEVELS = {
  novice: "novice-low",
  intermediateLow: "intermediate-low",
  intermediateMid: "intermediate-mid",
  intermediateHigh: "intermediate-high",
  advanced: "advanced",
};

export const COMPUTED_LEVEL_LABELS = {
  "novice-low": "Novice",
  "intermediate-low": "Intermediate Low",
  "intermediate-mid": "Intermediate Mid",
  "intermediate-high": "Intermediate High",
  advanced: "Advanced",
};

export const LEVEL_SCORE_LABEL_MAX = `${LEVEL_SCORE_MAX} (highest)`;

export function createEmptyLevelScores() {
  return Object.fromEntries(LEVEL_EVALUATION_CRITERIA.map(({ key }) => [key, null]));
}

export function formatComputedLevel(level) {
  if (!level) return "";
  return COMPUTED_LEVEL_LABELS[level] || String(level);
}

export function getLevelCriterion(key) {
  return LEVEL_EVALUATION_CRITERIA.find((criterion) => criterion.key === key) || null;
}

export function isValidLevelScore(value) {
  return (
    Number.isInteger(value) && value >= LEVEL_SCORE_MIN && value <= LEVEL_SCORE_MAX
  );
}

export function isCompleteLevelScores(scores) {
  return LEVEL_EVALUATION_CRITERIA.every(({ key }) => isValidLevelScore(scores?.[key]));
}

function averageOf(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Compute the proficiency level from the five criterion scores.
 *
 * Rules, evaluated in order, first match wins:
 *   1. any CORE criterion === 1                      -> Novice
 *   2. all five >= 4 and avg >= 4.5                  -> Advanced
 *   3. all five >= 3 and avg >= 3.5                  -> Intermediate High
 *   4. all five >= 3                                 -> Intermediate Mid
 *   5. otherwise (>= one 2): avg >= 2.8              -> Intermediate Mid
 *                                                 else Intermediate Low
 *
 * @returns {{ level: string, avg: number, reason: string } | null} null when any
 *   of the five scores is missing or not an integer 1-5.
 */
export function computeProficiencyLevel(scores) {
  if (!isCompleteLevelScores(scores)) return null;

  const values = LEVEL_EVALUATION_CRITERIA.map(({ key }) => scores[key]);
  const avg = averageOf(values);
  const avgText = avg.toFixed(1);
  const everyScore = (threshold) => values.every((value) => value >= threshold);
  const result = (level, reason) => ({ level, avg, reason });

  // 1. A 1 in a core criterion is Novice, even with excellent pronunciation.
  const weakestCore = CORE_LEVEL_CRITERIA
    .map((key) => ({ key, value: scores[key] }))
    .find(({ value }) => value === NOVICE_TRIGGER_SCORE);
  if (weakestCore) {
    const label = getLevelCriterion(weakestCore.key)?.label || weakestCore.key;
    return result(
      COMPUTED_LEVELS.novice,
      `Novice: ${label} is ${weakestCore.value}`
    );
  }

  // 2. Strong and consistent across every criterion.
  if (everyScore(ADVANCED_MIN_EVERY_SCORE) && avg >= ADVANCED_MIN_AVERAGE) {
    return result(
      COMPUTED_LEVELS.advanced,
      `Advanced: all five criteria are ${ADVANCED_MIN_EVERY_SCORE} or higher, average ${avgText}`
    );
  }

  // 3. Solid and consistent - no 2s allowed.
  if (everyScore(HIGH_MIN_EVERY_SCORE) && avg >= HIGH_MIN_AVERAGE) {
    return result(
      COMPUTED_LEVELS.intermediateHigh,
      `Intermediate High: all five criteria are ${HIGH_MIN_EVERY_SCORE} or higher, average ${avgText}`
    );
  }

  // 4. No 2s, but the average has not reached the High threshold yet.
  if (everyScore(HIGH_MIN_EVERY_SCORE)) {
    return result(
      COMPUTED_LEVELS.intermediateMid,
      `Intermediate Mid: all five criteria are ${HIGH_MIN_EVERY_SCORE} or higher, average ${avgText}`
    );
  }

  // 5. At least one 2 (or a speaking 1 with the core criteria at 2+).
  if (avg >= FALLBACK_MID_MIN_AVERAGE) {
    return result(
      COMPUTED_LEVELS.intermediateMid,
      `Intermediate Mid: average ${avgText} with at least one criterion at 2`
    );
  }

  return result(
    COMPUTED_LEVELS.intermediateLow,
    `Intermediate Low: average ${avgText}`
  );
}

/**
 * Human-readable block appended to the stored trial notes so the scores survive
 * without a schema change. Mirrors how buildCriteriaNotes persists the AI
 * matching criteria.
 */
export function buildLevelEvaluationNotes(scores, computed) {
  if (!isCompleteLevelScores(scores)) return "";

  const lines = LEVEL_EVALUATION_CRITERIA.map(
    ({ key, label }) => `${label}: ${scores[key]}/${LEVEL_SCORE_MAX}`
  );

  return [
    "Level evaluation:",
    ...lines,
    `Computed level: ${formatComputedLevel(computed?.level)}`,
  ].join("\n");
}

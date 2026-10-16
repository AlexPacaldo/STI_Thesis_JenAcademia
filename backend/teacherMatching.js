/**
 * Teacher <-> student matching.
 *
 * This is deliberately NOT an LLM. It is deterministic, explainable scoring so
 * that the same student always produces the same teacher and every point in the
 * score can be traced back to a matched field.
 *
 * Design notes:
 *  - The AI-matching attributes (teaching style, teacher strength, best student
 *    pace) are written into the teacher bio by buildTeacherAiBio as a fixed
 *    template. We parse that block back out and compare the vocabularies
 *    EXACTLY, instead of substring-matching a flattened string.
 *  - Free-text bio is only a weak tiebreaker, and it is matched on whole words
 *    against the prose only (never the teacher's name).
 *  - The student's trial notes are NOT scored. `notes` is identical for every
 *    candidate of a given student, so including it added the same constant to
 *    all of them and contributed nothing to the ranking. Notes are still stored
 *    on the profile for the record.
 *
 * !! The vocabulary keys below must match the option values offered in
 * !! frontend/src/utils/matchingCriteria.js. scripts/test-teacher-matching.mjs
 * !! asserts that they line up.
 */

export const TEACHER_BALANCE_LIMIT = 2;

// Tunable scoring weights. Kept in one object so the model can be retuned
// without hunting through the scoring function.
export const SCORE_WEIGHTS = {
  courseMatch: 14,
  experiencePerYear: 2,
  experienceYearCap: 10,
  learningGoalMatch: 12,
  focusAreaMatch: 10,
  learningStyleMatch: 10,
  personalityMatch: 8,
  paceMatch: 8,
  proficiencyFit: 6,
  proficiencyGapPenaltyPerYear: 2,
  freeTextSignal: 3,
  loadPenaltyPerStudent: 2,
  maxMatchesPerCriterion: 2,
  maxReasons: 4,
};

// Student "focus area" -> teacher specialization slugs. A focus area on one side
// can map to several specializations (e.g. speaking -> speaking and
// conversation), and one specialization can serve several focus areas.
export const FOCUS_AREA_TO_SPECIALIZATION = {
  speaking: ["speaking and conversation"],
  grammar: ["grammar and writing"],
  reading: ["reading and vocabulary"],
  writing: ["grammar and writing"],
  listening: ["listening and pronunciation"],
  vocabulary: ["reading and vocabulary"],
  pronunciation: ["listening and pronunciation"],
  "interview-answers": ["job interview coaching"],
};

// Student "learning goal" -> teacher specialization slugs.
export const LEARNING_GOAL_TO_SPECIALIZATION = {
  "school-support": ["kids and novice english"],
  conversation: ["speaking and conversation"],
  "exam-prep": ["exam preparation"],
  business: ["business english"],
  confidence: ["speaking and conversation"],
  "interview-readiness": ["job interview coaching"],
  "news-discussion": ["news discussion"],
};

// Student personality -> teacher strengths that suit it. Judgement call, kept
// here so it is easy to review and change.
export const PERSONALITY_TO_TEACHER_STRENGTH = {
  shy: ["patient and supportive", "calm and encouraging", "friendly and confidence-building"],
  anxious: ["patient and supportive", "calm and encouraging"],
  outgoing: ["energetic and engaging", "friendly and confidence-building"],
  energetic: ["energetic and engaging"],
  focused: ["strict and focused", "patient and supportive"],
};

// Minimum years of experience that suits each stored level. Handles the 7 slugs
// still present in the database, not just the 5 the app now computes.
export const MIN_EXPERIENCE_BY_LEVEL = {
  "novice-low": 0,
  "novice-mid": 0,
  "novice-high": 0,
  "intermediate-low": 1,
  "intermediate-mid": 2,
  "intermediate-high": 3,
  advanced: 5,
};

export const LEVEL_LABELS = {
  "novice-low": "Novice",
  "novice-mid": "Novice",
  "novice-high": "Novice",
  "intermediate-low": "Intermediate Low",
  "intermediate-mid": "Intermediate Mid",
  "intermediate-high": "Intermediate High",
  advanced: "Advanced",
};

// The marker buildTeacherAiBio writes before the structured attributes.
export const TEACHER_PROFILE_BLOCK = "AI matching profile:";

const PROFILE_TAG_KEYS = {
  "Teaching style": "teachingStyle",
  "Teacher strength": "teacherStrength",
  "Best student pace": "idealStudentPace",
};

function toSlugList(value) {
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => String(item == null ? "" : item).trim().toLowerCase())
    .filter(Boolean);
}

function asArray(value) {
  return Array.isArray(value) ? value : [value].filter((v) => v != null && v !== "");
}

/**
 * Pull the structured attributes back out of a teacher bio.
 * Returns the parsed tags plus the remaining free-text prose.
 */
export function parseTeacherProfileTags(bio) {
  const text = String(bio || "");
  const tags = { teachingStyle: [], teacherStrength: [], idealStudentPace: [] };

  const blockStart = text.indexOf(TEACHER_PROFILE_BLOCK);
  if (blockStart === -1) {
    return { ...tags, hasProfileBlock: false, freeText: text.trim() };
  }

  const freeText = text.slice(0, blockStart).trim();

  // One attribute per line, several values per line (comma-joined).
  for (const rawPart of text.slice(blockStart + TEACHER_PROFILE_BLOCK.length).split("\n")) {
    const line = rawPart.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = PROFILE_TAG_KEYS[line.slice(0, separator).trim()];
    if (!key) continue;
    // Split on commas so "structured, visual" becomes two values.
    for (const item of line.slice(separator + 1).split(",")) {
      const value = item.trim().toLowerCase();
      if (value && !tags[key].includes(value)) tags[key].push(value);
    }
  }

  return { ...tags, hasProfileBlock: true, freeText };
}

/** Specialization lives in its own column as a comma-joined list. */
export function parseSpecialization(value) {
  if (Array.isArray(value)) return toSlugList(value);
  return toSlugList(String(value || "").split(","));
}

/**
 * Whole-word matcher. Guards against the substring class of bug where a
 * teacher named "Breeding" scores a "reading" match.
 */
export function buildWordMatcher(text) {
  const words = new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
  return (term) => {
    const parts = String(term == null ? "" : term)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (!parts.length) return false;
    return parts.every((part) => words.has(part));
  };
}

function intersectCount(studentValues, mapping, teacherValues) {
  if (!teacherValues.length) return 0;
  const teacherSet = new Set(teacherValues);
  return asArray(studentValues).reduce((count, value) => {
    const slug = String(value == null ? "" : value).trim().toLowerCase();
    const targets = mapping[slug];
    if (!targets) return count;
    return targets.some((target) => teacherSet.has(target)) ? count + 1 : count;
  }, 0);
}

function exactOverlapCount(studentValues, teacherValues) {
  if (!teacherValues.length) return 0;
  const teacherSet = new Set(teacherValues);
  return asArray(studentValues).reduce(
    (count, value) => (teacherSet.has(String(value == null ? "" : value).trim().toLowerCase())
      ? count + 1
      : count),
    0
  );
}

/**
 * Score one teacher against one student's criteria.
 *
 * @param {object} teacher  row from the candidate query (bio, specialization,
 *                          experience_years, assigned_student_count,
 *                          selected_course_match)
 * @param {object} criteria normalised student criteria; every value may be a
 *                          string or an array of strings
 * @param {string} _trialNotes accepted for call-site compatibility but
 *   deliberately ignored - see the note at the top of this file
 * @returns {object} the teacher with `score` and `reasons` added
 */
export function scoreTeacherForStudent(
  teacher,
  criteria = {},
  _trialNotes = "",
  courseId = null,
  proficiencyLevel = ""
) {
  const profile = parseTeacherProfileTags(teacher.bio);
  const specialization = parseSpecialization(teacher.specialization);
  // Names are deliberately excluded from the free-text signal.
  const freeTextHas = buildWordMatcher(profile.freeText);

  const experience = Math.max(0, Number(teacher.experience_years || 0));
  const load = Math.max(0, Number(teacher.assigned_student_count || 0));
  const reasons = [];

  let score =
    Math.min(experience, SCORE_WEIGHTS.experienceYearCap) * SCORE_WEIGHTS.experiencePerYear;
  if (experience > 0) {
    reasons.push(`${experience} ${experience === 1 ? "year" : "years"} experience`);
  }

  if (courseId && Number(teacher.selected_course_match || 0) > 0) {
    score += SCORE_WEIGHTS.courseMatch;
    reasons.push("teaches the selected course");
  }

  // --- structured matches -------------------------------------------------
  const goalHits = intersectCount(
    criteria.learningGoal,
    LEARNING_GOAL_TO_SPECIALIZATION,
    specialization
  );
  if (goalHits) {
    score += Math.min(goalHits, SCORE_WEIGHTS.maxMatchesPerCriterion) * SCORE_WEIGHTS.learningGoalMatch;
    reasons.push("specialisation matches the learning goal");
  }

  const focusHits = intersectCount(
    criteria.focusArea,
    FOCUS_AREA_TO_SPECIALIZATION,
    specialization
  );
  if (focusHits) {
    score += Math.min(focusHits, SCORE_WEIGHTS.maxMatchesPerCriterion) * SCORE_WEIGHTS.focusAreaMatch;
    reasons.push("specialisation matches the focus areas");
  }

  const styleHits = exactOverlapCount(criteria.learningStyle, profile.teachingStyle);
  if (styleHits) {
    score += Math.min(styleHits, SCORE_WEIGHTS.maxMatchesPerCriterion) * SCORE_WEIGHTS.learningStyleMatch;
    reasons.push("teaching style matches");
  }

  const personalityHits = intersectCount(
    criteria.personality,
    PERSONALITY_TO_TEACHER_STRENGTH,
    profile.teacherStrength
  );
  if (personalityHits) {
    score += Math.min(personalityHits, SCORE_WEIGHTS.maxMatchesPerCriterion) * SCORE_WEIGHTS.personalityMatch;
    reasons.push("teacher strength suits the student's personality");
  }

  const paceHits = exactOverlapCount(criteria.pace, profile.idealStudentPace);
  if (paceHits) {
    score += Math.min(paceHits, SCORE_WEIGHTS.maxMatchesPerCriterion) * SCORE_WEIGHTS.paceMatch;
    reasons.push("best student pace matches");
  }

  // --- proficiency level --------------------------------------------------
  const level = String(proficiencyLevel || "").trim().toLowerCase();
  if (level && Object.prototype.hasOwnProperty.call(MIN_EXPERIENCE_BY_LEVEL, level)) {
    const required = MIN_EXPERIENCE_BY_LEVEL[level];
    if (required > 0) {
      const label = LEVEL_LABELS[level] || level;
      if (experience >= required) {
        score += SCORE_WEIGHTS.proficiencyFit;
        reasons.push(`experience suits ${label} students`);
      } else {
        score -= (required - experience) * SCORE_WEIGHTS.proficiencyGapPenaltyPerYear;
        reasons.push(`limited experience for ${label} students`);
      }
    }
  }

  // --- weak free-text signal ---------------------------------------------
  // Reflects real descriptive prose, but weighted low so structured matches
  // always dominate. This is the main signal for profiles written before the
  // AI matching block existed.
  let freeTextHits = 0;
  for (const key of ["learningGoal", "focusArea", "learningStyle", "personality", "pace"]) {
    const values = asArray(criteria[key]);
    if (!values.length) continue;
    if (values.some((value) => freeTextHas(value))) {
      freeTextHits += 1;
      if (freeTextHits >= SCORE_WEIGHTS.maxMatchesPerCriterion) break;
    }
  }
  if (freeTextHits) {
    score += freeTextHits * SCORE_WEIGHTS.freeTextSignal;
    if (!profile.hasProfileBlock) {
      reasons.push("bio mentions the student's needs");
    }
  }

  // --- load ---------------------------------------------------------------
  score -= load * SCORE_WEIGHTS.loadPenaltyPerStudent;

  return {
    ...teacher,
    score,
    reasons: reasons.length ? reasons.slice(0, SCORE_WEIGHTS.maxReasons) : [
      "balanced match based on teacher profile and current load",
    ],
  };
}

/** Sort by score, then by lighter load. */
export function rankTeachers(scored) {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Number(a.assigned_student_count || 0) - Number(b.assigned_student_count || 0);
  });
}

/**
 * Apply the workload policy: prefer a manual pick if it is still under the
 * limit, otherwise the best-scoring teacher who is, otherwise the least loaded.
 */
export function selectTeacherFromRanking(ranked, preferredTeacherId = null) {
  const loadOf = (teacher) => Number(teacher.assigned_student_count || 0);

  const underBalanceLimit = ranked.filter((t) => loadOf(t) < TEACHER_BALANCE_LIMIT);
  const leastLoaded =
    [...ranked].sort((a, b) => loadOf(a) - loadOf(b) || b.score - a.score)[0] || null;
  const preferred = preferredTeacherId
    ? ranked.find((t) => String(t.user_id) === String(preferredTeacherId))
    : null;

  const assigned =
    preferred && loadOf(preferred) < TEACHER_BALANCE_LIMIT
      ? preferred
      : underBalanceLimit[0] || leastLoaded || null;

  return {
    assigned,
    leastLoaded,
    underBalanceLimit,
    usedLeastLoadedFallback: underBalanceLimit.length === 0 && Boolean(leastLoaded),
  };
}

export function overBalanceTeachers(ranked) {
  return ranked.filter((t) => Number(t.assigned_student_count || 0) >= TEACHER_BALANCE_LIMIT);
}

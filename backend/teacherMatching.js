/**
 * Teacher <-> student matching.
 *
 * This is deliberately NOT an LLM. It is deterministic, explainable scoring so
 * that the same student always produces the same teacher and every point in the
 * score can be traced back to a matched field.
 *
 * Design notes:
 *  - The AI-matching attributes (teaching style, best student pace) are written
 *    into the teacher bio by buildTeacherAiBio as a fixed template. We parse
 *    that block back out and compare the vocabularies EXACTLY, instead of
 *    substring-matching a flattened string.
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

// Lines whose label is not listed here are ignored, so bios written before a
// tag was removed still parse cleanly.
const PROFILE_TAG_KEYS = {
  "Teaching style": "teachingStyle",
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
  const tags = { teachingStyle: [], idealStudentPace: [] };

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
  //
  // Alongside the score, record WHICH of the admin's stated criteria this teacher
  // actually satisfied. The score alone cannot answer "is this a good match",
  // because it is also made up of experience and workload and the load penalty -
  // a teacher can score well on those while matching none of what was asked for.
  //
  // Only criteria the admin actually set are counted. An unstated criterion is
  // not a miss; scoring against it would make every thin form look like a bad
  // match.
  //
  // Only ever upgraded, never overwritten. A criterion can be satisfied two
  // ways - by a structured tag or by the teacher's own prose - and a criterion
  // matched on the second must not be marked as a miss by a later call. That
  // matters most for free text: an "Others" value matches no catalogue entry by
  // construction, so without this every custom criterion the admin wrote would
  // be reported as uncovered, and the "closest available, not a strong match"
  // warning would fire on matches the advisor had got exactly right.
  const criterionMatches = {};
  const markCriterion = (key, hit) => {
    if (!asArray(criteria[key]).length) return;
    criterionMatches[key] = Boolean(criterionMatches[key] || hit);
  };

  const goalHits = intersectCount(
    criteria.learningGoal,
    LEARNING_GOAL_TO_SPECIALIZATION,
    specialization
  );
  markCriterion("learningGoal", goalHits);
  if (goalHits) {
    score += Math.min(goalHits, SCORE_WEIGHTS.maxMatchesPerCriterion) * SCORE_WEIGHTS.learningGoalMatch;
    reasons.push("specialisation matches the learning goal");
  }

  const focusHits = intersectCount(
    criteria.focusArea,
    FOCUS_AREA_TO_SPECIALIZATION,
    specialization
  );
  markCriterion("focusArea", focusHits);
  if (focusHits) {
    score += Math.min(focusHits, SCORE_WEIGHTS.maxMatchesPerCriterion) * SCORE_WEIGHTS.focusAreaMatch;
    reasons.push("specialisation matches the focus areas");
  }

  const styleHits = exactOverlapCount(criteria.learningStyle, profile.teachingStyle);
  markCriterion("learningStyle", styleHits);
  if (styleHits) {
    score += Math.min(styleHits, SCORE_WEIGHTS.maxMatchesPerCriterion) * SCORE_WEIGHTS.learningStyleMatch;
    reasons.push("teaching style matches");
  }

  const paceHits = exactOverlapCount(criteria.pace, profile.idealStudentPace);
  markCriterion("pace", paceHits);
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
  for (const key of ["learningGoal", "focusArea", "learningStyle", "pace"]) {
    const values = asArray(criteria[key]);
    if (!values.length) continue;
    if (values.some((value) => freeTextHas(value))) {
      freeTextHits += 1;
      // Counts as covering the criterion. This is the ONLY signal a free-text
      // "Others" value can produce against the rules, so refusing to count it
      // would make every custom criterion look like a miss.
      markCriterion(key, true);
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
    // Coverage of what the admin actually asked for, so "closest available" can
    // be told apart from "good match". See assessMatchStrength.
    criterionTotal: Object.keys(criterionMatches).length,
    criterionMatched: Object.values(criterionMatches).filter(Boolean).length,
    criterionMatches,
    reasons: reasons.length ? reasons.slice(0, SCORE_WEIGHTS.maxReasons) : [
      // Honest rather than reassuring. Nothing matched, and saying "balanced
      // match" here made a teacher who satisfied none of the stated criteria
      // read like a well-rounded one.
      "none of the stated criteria matched — ranked on profile and workload",
    ],
  };
}

/**
 * How good a match this is, for the card.
 *
 * The rule being implemented: if there is no perfect teacher, find the closest
 * possible one - and SAY that is what happened, rather than presenting the
 * closest available as though it were the right one.
 *
 * Judged on coverage of the criteria the admin actually set, not on the raw
 * score. The score also carries experience and a load penalty, so a heavily
 * loaded teacher who matches nothing can outscore one who matches most of it,
 * and a percentage of the score would report that as a good match.
 *
 * @returns {{level: string, matched: number, total: number, ratio: number}}
 *   level is "strong", "partial", "weak" or "unknown".
 */
export function assessMatchStrength({ criterionMatched = 0, criterionTotal = 0 } = {}) {
  const total = Math.max(0, Number(criterionTotal) || 0);
  const matched = Math.max(0, Number(criterionMatched) || 0);

  // Nothing was asked, so there is nothing to have missed. Saying "weak" here
  // would be inventing a judgement out of an empty form.
  if (!total) return { level: "unknown", matched: 0, total: 0, ratio: 0 };

  const ratio = matched / total;
  const level = matched === total ? "strong" : ratio >= 0.5 ? "partial" : "weak";
  return { level, matched, total, ratio };
}

/** Sort by score, then by lighter load. The rules-only ordering. */
export function rankTeachers(scored) {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Number(a.assigned_student_count || 0) - Number(b.assigned_student_count || 0);
  });
}

/**
 * Stable partition: teachers who can take the preferred slot first.
 *
 * A scheduling constraint, not a teaching-quality signal, so it is applied after
 * whatever produced the order rather than folded into it. Stable, so teachers
 * keep their existing relative order inside each group.
 *
 * Availability is per DATE, so this partitions by "has at least one workable
 * date", not by a single verdict. Passing null (no preferred schedule) is a no-op.
 */
export function preferAvailable(ranked, availability = null) {
  if (!availability) return [...ranked];
  const free = [];
  const blocked = [];
  for (const teacher of ranked) {
    const entry = availability.get(String(teacher.user_id));
    if (entry?.available) free.push(teacher);
    else blocked.push(teacher);
  }
  return [...free, ...blocked];
}

/**
 * Reorder by an external advisor's ranking, keeping our order for anything it
 * did not mention.
 *
 * The advisor is only ever trusted with reordering a list we already decided is
 * valid - the candidate pool is fixed beforehand, so it cannot introduce a
 * teacher, and course/availability/load are applied by us either side of this.
 */
export function applyAdvisorOrder(ranked, advisorOrder = []) {
  const position = new Map();
  (Array.isArray(advisorOrder) ? advisorOrder : []).forEach((id, index) => {
    const key = String(id);
    // First mention wins, so a duplicate cannot reorder the list twice.
    if (!position.has(key)) position.set(key, index);
  });
  if (!position.size) return [...ranked];

  const mentioned = [];
  const unmentioned = [];
  for (const teacher of ranked) {
    const key = String(teacher.user_id);
    if (position.has(key)) mentioned.push(teacher);
    else unmentioned.push(teacher);
  }
  mentioned.sort((a, b) => position.get(String(a.user_id)) - position.get(String(b.user_id)));
  return [...mentioned, ...unmentioned];
}

/**
 * Apply the workload policy: prefer a manual pick if it is still under the
 * limit, otherwise the best-scoring teacher who is, otherwise the least loaded.
 */
export function selectTeacherFromRanking(ranked, preferredTeacherId = null, { honourPreferred = false } = {}) {
  const loadOf = (teacher) => Number(teacher.assigned_student_count || 0);

  const underBalanceLimit = ranked.filter((t) => loadOf(t) < TEACHER_BALANCE_LIMIT);
  const leastLoaded =
    [...ranked].sort((a, b) => loadOf(a) - loadOf(b) || b.score - a.score)[0] || null;
  const preferred = preferredTeacherId
    ? ranked.find((t) => String(t.user_id) === String(preferredTeacherId))
    : null;

  // The admin assigns teachers personally because they know their teachers. When
  // honourPreferred is set, an explicit pick wins outright - even at or over the
  // balance limit - and the caller surfaces a warning instead of blocking.
  //
  // The flag defaults to false on purpose. The contract-request approval flow also
  // passes a preferredTeacherId, but that one is the student's CURRENTLY assigned
  // teacher, not a fresh human choice; honouring it there would silently pin the
  // old teacher and ignore the new contract criteria. Automatic recommendations -
  // this one and the least-loaded fallback - still respect the limit.
  const assigned =
    honourPreferred && preferred
      ? preferred
      : preferred && loadOf(preferred) < TEACHER_BALANCE_LIMIT
        ? preferred
        : underBalanceLimit[0] || leastLoaded || null;

  return {
    assigned,
    leastLoaded,
    underBalanceLimit,
    usedLeastLoadedFallback: underBalanceLimit.length === 0 && Boolean(leastLoaded),
    // Reported so the caller can warn without re-querying the count.
    preferredHonouredOverLimit: Boolean(
      honourPreferred && preferred && loadOf(preferred) >= TEACHER_BALANCE_LIMIT
    ),
  };
}

export function overBalanceTeachers(ranked) {
  return ranked.filter((t) => Number(t.assigned_student_count || 0) >= TEACHER_BALANCE_LIMIT);
}

/* ------------------------------------------------------- teaching children */

// A teacher may declare they will not teach children. That is a constraint on who
// they can be assigned, not a preference to weigh against other criteria: it sits
// alongside course eligibility and availability, and is applied outside the AI
// for the same reason.
//
// The cutoff is 12: a 13-year-old is a teenager, not a child. Conflating the two
// would quietly stop teenagers being taught by the teachers best placed for them,
// which is a different and much worse failure than the one this prevents.
export const CHILD_MAX_AGE = 12;

/**
 * Age in whole years from a birth date, or null if it cannot be read.
 *
 * Deliberately tolerant: the column is free text and encrypted at rest, so it can
 * hold whatever a staff member typed into a form. Anything unreadable is null
 * rather than a guess.
 */
export function ageFromBirthDate(birthDate, today = new Date()) {
  const text = String(birthDate || "").trim();
  if (!text) return null;

  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Reject a date that cannot exist rather than letting Date roll it into a
  // plausible wrong answer - 31 February would silently become 3 March.
  const born = new Date(Date.UTC(year, month - 1, day));
  if (born.getUTCMonth() !== month - 1 || born.getUTCDate() !== day) return null;

  const now = today instanceof Date ? today : new Date(today);
  if (Number.isNaN(now.getTime())) return null;

  let age = now.getUTCFullYear() - year;
  const hadBirthday =
    now.getUTCMonth() > month - 1 ||
    (now.getUTCMonth() === month - 1 && now.getUTCDate() >= day);
  if (!hadBirthday) age -= 1;

  // A birth date in the future is bad data, not a negative age.
  return age >= 0 ? age : null;
}

/**
 * Is this student a child?
 *
 * An unreadable or absent birth date is NOT treated as a child. A gap in the data
 * is not evidence about the student, and inferring one would exclude teachers on
 * the strength of a field nobody filled in - the one mistake here that later data
 * cannot undo. The gap is reported instead, so the admin knows the rule did not
 * apply.
 */
export function isChildAge(birthDate, today = new Date()) {
  const age = ageFromBirthDate(birthDate, today);
  return age !== null && age <= CHILD_MAX_AGE;
}

/** Did the teacher explicitly opt out? Anything else - including absent - means in. */
function optedOutOfChildren(teacher) {
  const value = teacher?.teaches_children;
  // MySQL hands back a TINYINT as a number, but a driver configured to return
  // strings would say "0", and a hand-built test row might say false.
  return value === 0 || value === "0" || value === false;
}

/**
 * Will this teacher teach children?
 *
 * Exported because the caller needs to answer the same question about the teacher
 * it actually picked, in order to report a conflict. Deriving it twice from the
 * same definition is how the check and the ordering drift apart.
 */
export function teacherWillTeachChildren(teacher) {
  return !optedOutOfChildren(teacher);
}

/**
 * Stable partition: teachers who will teach children first.
 *
 * Applied like the availability constraint - after whatever produced the order,
 * never inside the score, so the weights still mean what they say.
 *
 * If everyone has opted out, the order is simply preserved and the caller is
 * expected to report the conflict rather than pretend the rule was satisfied.
 *
 * @param {Array} ranked  ordered teachers
 * @param {boolean} studentIsChild  when false this is a no-op
 */
export function preferTeachesChildren(ranked, studentIsChild = false) {
  if (!studentIsChild) return [...ranked];

  const willTeach = [];
  const willNot = [];
  for (const teacher of ranked) {
    (optedOutOfChildren(teacher) ? willNot : willTeach).push(teacher);
  }
  return [...willTeach, ...willNot];
}

/* ------------------------------------------------------------- availability */

/**
 * Can this teacher take the student's preferred slot?
 *
 * Availability is stored per DATE in teacher_availability (available_date,
 * status, start_time/end_time, break_start/break_end), not as a repeating
 * weekly pattern - the same shape the Calendar already reads. So a preference of
 * "Tuesdays and Thursdays, morning" is resolved by looking ahead over real
 * dates that fall on those weekdays and asking whether any of them works. No
 * second availability system, and no migration.
 *
 * Pure on purpose: the caller supplies the rows and the dates, so this is
 * testable without a database.
 */
export const AVAILABILITY_HORIZON_DAYS = 21;

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "1", "mon", "Monday" -> 1 (JS getDay, Sunday = 0). Unknown values dropped. */
export function normalizePreferredDays(days) {
  const wanted = new Set();
  for (const raw of Array.isArray(days) ? days : [days]) {
    const text = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!text) continue;
    if (/^[0-6]$/.test(text)) {
      wanted.add(Number(text));
      continue;
    }
    const exact = WEEKDAY_NAMES.indexOf(text);
    if (exact >= 0) {
      wanted.add(exact);
      continue;
    }
    // Abbreviations, because "thu" is what people type and what a chip label
    // often is. Only unambiguous prefixes of 3+ characters are accepted.
    if (text.length >= 3) {
      const byPrefix = WEEKDAY_NAMES
        .map((name, index) => (name.startsWith(text) ? index : -1))
        .filter((index) => index >= 0);
      if (byPrefix.length === 1) wanted.add(byPrefix[0]);
    }
  }
  return wanted;
}

/** "18:30", "18:30:00" -> minutes since midnight. Unparseable -> null. */
export function toMinutes(value) {
  if (value == null || value === "") return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Day of week for "YYYY-MM-DD", via UTC so the timezone cannot shift it. */
export function weekdayOf(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

/** Half-open overlap: touching endpoints do not count as overlapping. */
function overlaps(aStart, aEnd, bStart, bEnd) {
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && aEnd > bStart;
}

/**
 * @param {object} input
 * @param {Array} input.rows       this teacher's teacher_availability rows
 * @param {Array} input.bookings   this teacher's scheduled classes, { date, start_time, end_time }
 * @param {string[]} input.dates   candidate "YYYY-MM-DD" dates in the look-ahead window
 * @param {Array} input.days       preferred weekdays (0-6, or names)
 * @param {string} input.start     preferred window start
 * @param {string} input.end       preferred window end
 * @returns {{evaluated: boolean, available: boolean|null, matchingDates: string[], reason: string}}
 */
export function evaluateAvailability({
  rows = [],
  bookings = [],
  dates = [],
  days = [],
  start = null,
  end = null,
  duration = null,
}) {
  const wanted = normalizePreferredDays(days);
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  const classDuration = Number(duration);
  const hasDuration = Number.isInteger(classDuration) && classDuration > 0;

  // No preference, or an incomplete one: nothing to check, and the caller must
  // behave exactly as it did before this feature existed.
  if (!wanted.size || startMin === null || endMin === null || endMin <= startMin) {
    return { evaluated: false, available: null, matchingDates: [], reason: "" };
  }

  const rowsByDate = new Map();
  for (const row of rows) {
    const date = String(row.available_date || "").slice(0, 10);
    if (!date) continue;
    rowsByDate.set(date, row);
  }

  const matchingDates = [];
  const reasons = new Set();

  for (const date of dates) {
    const weekday = weekdayOf(date);
    if (weekday === null || !wanted.has(weekday)) continue;

    const row = rowsByDate.get(date);
    if (!row) {
      reasons.add("they have not marked that day available");
      continue;
    }
    if (row.status !== "available") {
      reasons.add("they marked that day unavailable");
      continue;
    }

    const slotStart = toMinutes(row.start_time);
    const slotEnd = toMinutes(row.end_time);
    // Unset times mean the whole day, which is how the Calendar treats them.
    if (hasDuration) {
      const earliestStart = Math.max(startMin, slotStart ?? 0);
      const latestStart = Math.min(endMin - classDuration, (slotEnd ?? 24 * 60) - classDuration);
      if (latestStart < earliestStart) {
        reasons.add("their available hours do not fit a class of that duration");
        continue;
      }

      const busyIntervals = [
        [toMinutes(row.break_start), toMinutes(row.break_end)],
        ...bookings
          .filter((booking) => String(booking.date || "").slice(0, 10) === date)
          .map((booking) => [toMinutes(booking.start_time), toMinutes(booking.end_time)]),
      ].filter(([busyStart, busyEnd]) => busyStart !== null && busyEnd !== null);
      let candidateStart = earliestStart;
      while (candidateStart <= latestStart) {
        const conflict = busyIntervals.find(([busyStart, busyEnd]) =>
          overlaps(candidateStart, candidateStart + classDuration, busyStart, busyEnd)
        );
        if (!conflict) break;
        candidateStart = Math.max(candidateStart + 1, conflict[1]);
      }
      if (candidateStart <= latestStart) {
        matchingDates.push(date);
        continue;
      }
      reasons.add("they have no unbooked class slot during that time of day");
      continue;
    }

    const coversWindow =
      (slotStart === null && slotEnd === null) ||
      (slotStart !== null && slotEnd !== null && startMin >= slotStart && endMin <= slotEnd);
    if (!coversWindow) {
      reasons.add("their available hours do not cover that time");
      continue;
    }

    if (
      overlaps(startMin, endMin, toMinutes(row.break_start), toMinutes(row.break_end))
    ) {
      reasons.add("that time falls in their break");
      continue;
    }

    const booked = bookings.some((booking) => {
      if (String(booking.date || "").slice(0, 10) !== date) return false;
      return overlaps(startMin, endMin, toMinutes(booking.start_time), toMinutes(booking.end_time));
    });
    if (booked) {
      reasons.add("they already have a class booked then");
      continue;
    }

    matchingDates.push(date);
  }

  return {
    evaluated: true,
    available: matchingDates.length > 0,
    matchingDates,
    // First reason only: the admin needs one sentence, not a set of every way it
    // could have worked.
    reason: matchingDates.length ? "" : [...reasons][0] || "they have no availability set for those days",
  };
}

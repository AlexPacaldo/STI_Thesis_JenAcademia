/**
 * Contract-completion feedback rubric (server-side copy).
 *
 * A finished contract is reviewed from both sides:
 *   - the teacher scores the student on the existing five level criteria, which
 *     computes the student's new proficiency level;
 *   - the student rates the teacher on five teaching criteria.
 *
 * !! MUST STAY IN SYNC WITH frontend/src/utils/contractReview.js !!
 * The backend validates the student's scores, so a client cannot submit an
 * unknown criterion or a score outside 1-5.
 */

import { isValidLevelScore } from "./proficiencyEvaluation.js";

export const STUDENT_REVIEW_CRITERIA = [
  {
    key: "clearExplanations",
    label: "Clear explanations",
    hint: "Could the teacher explain ideas in a way that made sense?",
  },
  {
    key: "patientSupport",
    label: "Patient & supportive",
    hint: "Did the teacher give you time, encouragement and help when you needed it?",
  },
  {
    key: "engagingClasses",
    label: "Engaging classes",
    hint: "Were the classes interesting and easy to take part in?",
  },
  {
    key: "helpfulFeedback",
    label: "Helpful feedback",
    hint: "Did the teacher tell you what you did well and what to practise next?",
  },
  {
    key: "professionalism",
    label: "Professional & prepared",
    hint: "Was the teacher ready for class, on time and respectful?",
  },
];

function normalizeScore(value) {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}

/**
 * Accept whatever arrived over the wire and turn it into a strict score map.
 * Every criterion must be an integer 1-5, otherwise the whole submission is
 * rejected rather than silently coerced.
 */
export function parseReviewScores(input, criteria = STUDENT_REVIEW_CRITERIA) {
  if (!input || typeof input !== "object") return null;

  const parsed = {};
  for (const { key } of criteria) {
    const value = normalizeScore(input[key]);
    if (!isValidLevelScore(value)) return null;
    parsed[key] = value;
  }
  return parsed;
}

export function averageReviewScores(scores, criteria = STUDENT_REVIEW_CRITERIA) {
  if (!scores || typeof scores !== "object") return null;

  const values = [];
  for (const { key } of criteria) {
    const value = normalizeScore(scores[key]);
    if (!isValidLevelScore(value)) return null;
    values.push(value);
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

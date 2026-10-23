/**
 * Contract-completion feedback rubric (frontend copy).
 *
 * The teacher scores the student on the existing five level criteria in
 * utils/proficiencyEvaluation.js. These are the five criteria the student uses
 * to rate their teacher after a contract is complete.
 *
 * !! MUST STAY IN SYNC WITH backend/contractReview.js !!
 * The backend validates every criterion and every score, so the keys here have
 * to match the server exactly.
 */

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

export const REVIEW_SCORE_SCALE = [1, 2, 3, 4, 5];
export const REVIEW_SCORE_MIN = 1;
export const REVIEW_SCORE_MAX = 5;

export function createEmptyReviewScores(criteria = STUDENT_REVIEW_CRITERIA) {
  return Object.fromEntries(criteria.map(({ key }) => [key, null]));
}

export function averageReviewScores(scores, criteria = STUDENT_REVIEW_CRITERIA) {
  if (!scores || typeof scores !== "object") return null;

  const values = criteria.map(({ key }) => scores[key]);
  if (!values.every((value) => Number.isInteger(value) && value >= REVIEW_SCORE_MIN && value <= REVIEW_SCORE_MAX)) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

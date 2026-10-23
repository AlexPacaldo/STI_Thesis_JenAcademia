/**
 * Contract-review rubric checks.
 *
 * The teacher side is the existing level rubric and is covered by
 * test-proficiency-evaluation.mjs. This file covers the student's teacher rating
 * and, importantly, that the frontend and backend copies of the criteria agree.
 */

import {
  STUDENT_REVIEW_CRITERIA as BACKEND_CRITERIA,
  averageReviewScores as backendAverage,
  parseReviewScores as backendParse,
} from "../backend/contractReview.js";
import {
  STUDENT_REVIEW_CRITERIA as FRONTEND_CRITERIA,
  averageReviewScores as frontendAverage,
} from "../frontend/src/utils/contractReview.js";

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}`);
  }
}

check("criteria keys match between frontend and backend", (() => {
  const backendKeys = BACKEND_CRITERIA.map(({ key }) => key);
  const frontendKeys = FRONTEND_CRITERIA.map(({ key }) => key);
  return JSON.stringify(backendKeys) === JSON.stringify(frontendKeys);
})());

check("criteria labels match between frontend and backend", (() => {
  const backendLabels = BACKEND_CRITERIA.map(({ label }) => label);
  const frontendLabels = FRONTEND_CRITERIA.map(({ label }) => label);
  return JSON.stringify(backendLabels) === JSON.stringify(frontendLabels);
})());

const goodScores = Object.fromEntries(BACKEND_CRITERIA.map(({ key }, index) => [key, index + 1]));
const parsed = backendParse(goodScores);
check("parse accepts all five integers 1-5", parsed && Object.keys(parsed).length === 5);
check("average of 1,2,3,4,5 is 3", backendAverage(parsed) === 3);
check("frontend average agrees with backend", frontendAverage(parsed) === 3);

check("parse accepts numeric strings", Boolean(backendParse(Object.fromEntries(
  BACKEND_CRITERIA.map(({ key }) => [key, "4"])
))));

for (const [name, value] of [
  ["empty input", null],
  ["missing criterion", { ...goodScores, [BACKEND_CRITERIA[0].key]: undefined }],
  ["score 0", { ...goodScores, [BACKEND_CRITERIA[0].key]: 0 }],
  ["score 6", { ...goodScores, [BACKEND_CRITERIA[0].key]: 6 }],
  ["score 3.5", { ...goodScores, [BACKEND_CRITERIA[0].key]: 3.5 }],
]) {
  check(`parse rejects ${name}`, backendParse(value) === null);
  check(`average rejects ${name}`, backendAverage(value) === null);
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed) {
  process.exitCode = 1;
  console.error(`${failed} check(s) failed.`);
} else {
  console.log("All good.");
}

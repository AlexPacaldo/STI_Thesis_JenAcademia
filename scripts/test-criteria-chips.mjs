/**
 * Checks for the shared criteria chip field.
 *
 *   node scripts/test-criteria-chips.mjs
 *
 * Regression guard for the "selected chips never highlight" bug: course ids
 * come back from MySQL as numbers while the form stores them as strings, and a
 * plain `includes()` compared them as unequal, so no chip ever showed as picked.
 */

import {
  isSelectedValue,
  toCriteriaSlug,
  toggleValue,
} from "../frontend/src/utils/matchingCriteria.js";

const CUSTOM_OPTION_VALUE = "__custom__";

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

console.log("=== selected-state comparison (string/number mismatch) ===");

// The exact bug: form holds strings, API supplies numbers.
check("number id matches its string form", isSelectedValue(["3", "7"], 3), true);
check("string id matches", isSelectedValue(["3", "7"], "3"), true);
check("number id does not match a different one", isSelectedValue(["3", "7"], 5), false);
check("unselected numeric id is not selected", isSelectedValue(["3"], 9), false);

// Reverse direction: numeric selection against string options.
check("string option matches numeric selection", isSelectedValue([3, 7], "3"), true);
check("string option misses other numeric selection", isSelectedValue([3, 7], "5"), false);

// Edge cases.
check("empty selection never matches", isSelectedValue([], 3), false);
check("empty selection never matches empty string", isSelectedValue([], ""), false);
check("null/undefined in selection does not throw", isSelectedValue([null, undefined], 3), false);
check("null option is not selected", isSelectedValue(["3"], null), false);

// ---------------------------------------------------------------- "Others"
console.log("\n=== free-text 'Others' option ===");

check("slugifies typed text", toCriteriaSlug("Montessori Method"), "montessori-method");
check("slug collapses punctuation", toCriteriaSlug("Drama / Role-play!"), "drama-role-play");
check("slug strips edges", toCriteriaSlug("  spaced out  "), "spaced-out");
check("slug of blank is empty", toCriteriaSlug("   "), "");
check("slug of null is empty", toCriteriaSlug(null), "");
check("slug matches existing vocabulary shape", toCriteriaSlug("Structured"), "structured");

// The payload merge: sentinel removed, custom text appended only when present.
const merge = (values, other) => {
  const base = (Array.isArray(values) ? values : []).filter((v) => v !== CUSTOM_OPTION_VALUE);
  const custom = toCriteriaSlug(other);
  return custom ? [...base, custom] : base;
};

check(
  "custom text is appended to the selection",
  merge([CUSTOM_OPTION_VALUE, "structured"], "Montessori Method"),
  ["structured", "montessori-method"]
);
check("blank custom text adds nothing", merge([CUSTOM_OPTION_VALUE, "visual"], ""), ["visual"]);
check("sentinel is never sent", merge([CUSTOM_OPTION_VALUE], "Drama"), ["drama"]);
check("untouched selections pass through", merge(["structured", "visual"], ""), [
  "structured",
  "visual",
]);

// Unchecking "Others" must discard the text, or it lingers invisibly.
const uncheck = (prev) => {
  const next = toggleValue(prev.teachingStyle, CUSTOM_OPTION_VALUE);
  return { ...prev, teachingStyle: next, teachingStyleOther: "" };
};
check(
  "unchecking Others clears the typed text",
  uncheck({ teachingStyle: ["structured", CUSTOM_OPTION_VALUE], teachingStyleOther: "Montessori" }),
  { teachingStyle: ["structured"], teachingStyleOther: "" }
);

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All good.");

/**
 * Tests for the trial-notes insights.
 *
 * The point of this feature is that the model only ever widens what the rules
 * can see - it never picks a teacher. So these tests are mostly about what the
 * suggestions are NOT allowed to do: invent a value outside the vocabulary,
 * repeat something the admin already chose, or come back with more than the
 * per-field cap.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  INSIGHT_FIELDS,
  describeInsightField,
  deriveMatchInsights,
  mergeInsights,
  normalizeInsights,
} from "../backend/matchInsights.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected: ${e}\n    actual:   ${a}`);
}

/* ------------------------------------------------ vocabulary must be the app's */

// The scorer counts exact string overlap, so a value that is not byte-identical
// to a chip value scores zero. The insights vocabulary has to be the chip
// vocabulary, read from the same catalogue rather than restated here.
const criteriaSource = readFileSync(join(root, "frontend/src/utils/matchingCriteria.js"), "utf8");
for (const field of ["learningGoal", "focusArea", "learningStyle", "pace"]) {
  const match = criteriaSource.match(new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\n  \\],`));
  check(`${field} catalogue found`, Boolean(match), true);
  if (match) {
    // Anchored to the start of a line: an option is `["value", "Label", ...]`,
    // and the course list inside it is also an array of strings, so matching
    // every `["` picks up course names as if they were criteria values.
    const values = [...match[1].matchAll(/^\s{4}\["([^"]+)"/gm)].map((m) => m[1]);
    check(`${field} matches INSIGHT_FIELDS`, [...INSIGHT_FIELDS[field]].sort(), [...values].sort());
  }
}

/* ------------------------------------------------------------ normalise inputs */

check("valid tags kept", normalizeInsights({ focusArea: ["speaking", "grammar"] }), { focusArea: ["speaking", "grammar"] });
check("value outside vocabulary dropped", normalizeInsights({ pace: ["advanced"] }), {});
check("invented field ignored", normalizeInsights({ favouriteColour: ["blue"] }), {});
check("case normalised", normalizeInsights({ pace: ["FAST"] }), { pace: ["fast"] });
check("duplicates removed", normalizeInsights({ focusArea: ["speaking", "speaking"] }), { focusArea: ["speaking"] });

// Re-suggesting what the admin just ticked is noise, not signal.
check(
  "already chosen skipped",
  normalizeInsights({ focusArea: ["speaking", "grammar"] }, { focusArea: ["speaking"] }),
  { focusArea: ["grammar"] }
);
check("all already chosen yields nothing", normalizeInsights({ pace: ["fast"] }, { pace: ["fast"] }), {});

// Bounded so one long note cannot flood the criteria.
check("capped at three per field", normalizeInsights({ focusArea: ["speaking", "grammar", "reading", "writing", "listening"] }), {
  focusArea: ["speaking", "grammar", "reading"],
});

check("string instead of array tolerated", normalizeInsights({ pace: "fast, slow" }), { pace: ["fast", "slow"] });
check("null tolerated", normalizeInsights(null), {});
check("empty object", normalizeInsights({}), {});
check("null values in array dropped", normalizeInsights({ pace: [null, "fast", ""] }), { pace: ["fast"] });

/* -------------------------------------------------------------------- merging */

check(
  "merge unions into criteria",
  mergeInsights({ focusArea: ["speaking"], pace: [] }, { focusArea: ["grammar"], pace: ["fast"] }),
  { focusArea: ["speaking", "grammar"], pace: ["fast"] }
);
check("merge with nothing adds nothing", mergeInsights({ focusArea: ["speaking"] }, {}), { focusArea: ["speaking"] });
check("merge handles missing criteria", mergeInsights(undefined, { pace: ["fast"] }), { pace: ["fast"] });
check("merge does not duplicate", mergeInsights({ pace: ["fast"] }, { pace: ["fast"] }), { pace: ["fast"] });

// The admin's criteria object must not be mutated, or the form's state and the
// rendered chips could diverge.
const original = { focusArea: ["speaking"] };
mergeInsights(original, { focusArea: ["grammar"] });
check("original criteria untouched", original, { focusArea: ["speaking"] });

/* ------------------------------------------------------- behaviour without AI */

check("field labels", describeInsightField("focusArea"), "focus area");
check("unknown field label falls through", describeInsightField("nope"), "nope");

// No notes means nothing to read, and crucially no Gemini call.
const noNotes = await deriveMatchInsights({ trialNotes: "   ", criteria: {} });
check("no notes adds nothing", noNotes.added, {});
check("no notes is not an error", noNotes.unavailable, false);
check("no notes reports the skip", noNotes.skipped, "no-notes");

// With notes but no key, it must degrade rather than throw. The route relies on
// this to still return a rules-only recommendation.
const previousKey = process.env.GOOGLE_GEMINI_API_KEY;
const previousAlt = process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GEMINI_API_KEY;
delete process.env.GEMINI_API_KEY;
try {
  const unconfigured = await deriveMatchInsights({
    trialNotes: "Shy student, needs to speak up in meetings.",
    criteria: {},
  });
  check("unconfigured adds nothing", unconfigured.added, {});
  check("unconfigured is flagged unavailable", unconfigured.unavailable, true);
  check("unconfigured reason", unconfigured.reason, "not-configured");
} finally {
  if (previousKey !== undefined) process.env.GOOGLE_GEMINI_API_KEY = previousKey;
  if (previousAlt !== undefined) process.env.GEMINI_API_KEY = previousAlt;
}

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("All good.");
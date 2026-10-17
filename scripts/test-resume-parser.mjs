/**
 * Tests for the Gemini model id that gets interpolated into the request path.
 *
 * Exists because this failure is invisible from the outside: a bad GEMINI_MODEL
 * produces a 404 from Gemini and a generic "could not read this resume" in the
 * admin's face, with the real cause only in Railway logs.
 */
import { normaliseModelId } from "../backend/teacherResumeParser.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  if (actual === expected) {
    passed += 1;
  } else {
    failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

// Already a bare id: must pass through untouched.
check("bare id", normaliseModelId("gemini-2.5-flash"), "gemini-2.5-flash");
check("bare alias", normaliseModelId("gemini-flash-latest"), "gemini-flash-latest");

// The forms Google's docs also show, which produced models/models%2F... -> 404.
check("models/ prefix", normaliseModelId("models/gemini-2.5-flash"), "gemini-2.5-flash");
check("Models/ prefix, mixed case", normaliseModelId("Models/gemini-2.5-flash"), "gemini-2.5-flash");
check("MODELS/ prefix", normaliseModelId("MODELS/gemini-2.5-pro"), "gemini-2.5-pro");
check("surrounding whitespace", normaliseModelId("   gemini-2.5-flash   "), "gemini-2.5-flash");
check("whitespace + prefix", normaliseModelId("  models/gemini-2.5-flash  "), "gemini-2.5-flash");

// Someone pasting the whole request path.
check(
  "full method suffix",
  normaliseModelId("models/gemini-2.5-flash:generateContent"),
  "gemini-2.5-flash"
);
check(
  "suffix only",
  normaliseModelId("gemini-2.5-flash:generateContent"),
  "gemini-2.5-flash"
);

// Empty and missing values, so geminiModel() falls through to its default
// instead of building a request path with an empty model.
check("empty string", normaliseModelId(""), "");
check("whitespace only", normaliseModelId("   "), "");
check("undefined", normaliseModelId(undefined), "");
check("null", normaliseModelId(null), "");

// Must not mangle an id that legitimately contains a dot or a hyphen.
check("dotted id kept", normaliseModelId("models/my.custom-model_v2"), "my.custom-model_v2");

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("All good.");
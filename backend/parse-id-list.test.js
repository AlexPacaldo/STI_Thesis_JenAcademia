/**
 * Regression tests for parseIdList.
 *
 * Run with: node parse-id-list.test.js
 *
 * parseIdList is pure and has no dependencies, so the implementation is copied
 * here verbatim. If the copy drifts from server.js this test stops being
 * meaningful - update both together.
 */
import assert from "node:assert/strict";

function parseIdList(value) {
  const collect = (input) => {
    if (input === undefined || input === null) return [];
    if (Array.isArray(input)) return input.flatMap(collect);

    const trimmed = String(input).trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[")) {
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return [];
      }
      return Array.isArray(parsed) ? parsed.flatMap(collect) : [];
    }

    if (!trimmed.includes(",")) return [trimmed];

    return trimmed.split(",").flatMap(collect);
  };

  const ids = collect(value).map((part) => Number(part));
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

const cases = [
  // Shape actually sent by the Add Book modal (multipart -> JSON string).
  ['["86"]', [86], "JSON array string from FormData"],
  ['["5","6"]', [5, 6], "JSON array of string ids"],
  ['[5,6]', [5, 6], "JSON array of numeric ids"],
  ["[5, 6, 7]", [5, 6, 7], "JSON array with spaces"],

  // Shape actually sent by the Distribute modal (JSON body -> real array).
  [[86], [86], "real array from a JSON body"],
  [[5, 6], [5, 6], "real array, multiple ids"],

  // Comma separated strings.
  ["5,6", [5, 6], "comma separated string"],
  ["5, 6, 7", [5, 6, 7], "comma separated with spaces"],
  [" 5 , 6 ", [5, 6], "whitespace around values"],

  // Bare values - these are what used to blow the stack.
  ["86", [86], "bare numeric string"],
  [86, [86], "bare number"],
  ["5,6,7", [5, 6, 7], "three comma separated"],

  // Degenerate input.
  [undefined, [], "undefined"],
  [null, [], "null"],
  ["", [], "empty string"],
  ["   ", [], "whitespace only"],
  [[], [], "empty array"],
  ["not json", [], "garbage string"],
  ["[broken", [], "unterminated JSON"],

  // Filtering and de-duplication.
  ["0,-3,7", [7], "non-positive ids dropped"],
  ["5,5,6", [5, 6], "duplicates collapsed"],
  ["1.5,abc,9", [9], "non-integers dropped"],
];

let failures = 0;

for (const [input, expected, label] of cases) {
  try {
    const actual = parseIdList(input);
    assert.deepEqual(actual, expected);
    console.log(`  ok    ${label}`);
  } catch (error) {
    failures += 1;
    const rendered =
      error instanceof RangeError || error?.constructor?.name === "RangeError"
        ? "THREW: Maximum call stack size exceeded"
        : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(error?.actual ?? error)}`;
    console.log(`  FAIL  ${label} -> ${rendered}`);
  }
}

// Explicit guard: the original bug was a stack overflow, so assert termination
// directly rather than relying on the caller's timeout.
try {
  parseIdList(["86"]);
  console.log("  ok    terminates on a bare value");
} catch (error) {
  failures += 1;
  console.log(`  FAIL  terminates on a bare value -> ${error.message}`);
}

console.log(
  failures === 0
    ? `\nAll ${cases.length + 1} parseIdList checks passed.`
    : `\n${failures} check(s) failed.`
);

process.exit(failures === 0 ? 0 : 1);
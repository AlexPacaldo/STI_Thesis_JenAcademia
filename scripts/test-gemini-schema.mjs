/**
 * Every responseSchema we send to Gemini must use only fields its Schema type
 * actually has.
 *
 * This exists because of a failure that looked like everything else.
 * `additionalProperties: { type: "STRING" }` is how OpenAPI says "an object with
 * arbitrary string keys". Gemini's Schema type has no such field, so it answered:
 *
 *   Invalid JSON payload received. Unknown name "additionalProperties" at
 *   'generation_config.response_schema.properties[1].value'
 *
 * A 400 from Gemini means the key was accepted and the models were reached, so
 * that reads exactly like a retired model, a rejected key or an unreachable API
 * - three other causes, three other fixes. It is also unfixable by retrying: the
 * whole fallback chain rejects the same payload, three failed calls later the
 * circuit breaker opens, and the UI reports a paused AI with no cause at all.
 *
 * Nothing about that failure is catchable from the outside. The request builds
 * fine, parses fine, and every test passes. So the schema is checked here
 * instead, against the fields Google documents.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let passed = 0;
const failures = [];

function ok(label, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? `\n    ${detail}` : ""}`);
}

// Google's Schema message. Anything outside this list is either a typo or a
// field from another spec's vocabulary, and Gemini rejects the whole request.
const SCHEMA_FIELDS = new Set([
  "type",
  "format",
  "title",
  "description",
  "nullable",
  "enum",
  "maxItems",
  "minItems",
  "properties",
  "required",
  "propertyOrdering",
  "minProperties",
  "maxProperties",
  "items",
  "anyOf",
  "default",
  "example",
]);

const SCHEMA_TYPES = new Set([
  "STRING",
  "NUMBER",
  "INTEGER",
  "BOOLEAN",
  "ARRAY",
  "OBJECT",
]);

/** Walk a schema-shaped object and report every key that is not a Schema field. */
function collectBadFields(node, path = "schema") {
  const bad = [];
  if (Array.isArray(node)) {
    node.forEach((item, i) => bad.push(...collectBadFields(item, `${path}[${i}]`)));
    return bad;
  }
  if (!node || typeof node !== "object") return bad;

  for (const [key, value] of Object.entries(node)) {
    // `properties` is a map of user-chosen names to schemas; its keys are the
    // JSON fields, not Schema fields, so they are not checked against the list.
    if (key === "properties") {
      if (!value || typeof value !== "object") {
        bad.push(`${path}.properties is not an object`);
        continue;
      }
      for (const [name, sub] of Object.entries(value)) {
        bad.push(...collectBadFields(sub, `${path}.properties[${name}]`));
      }
      continue;
    }

    if (!SCHEMA_FIELDS.has(key)) {
      bad.push(`${path}.${key} is not a Gemini Schema field`);
      continue;
    }
    // Recurse only into the fields that hold schemas. Others hold strings,
    // numbers or arrays of strings (enum) and would only produce noise.
    if (key === "items" || key === "anyOf") {
      bad.push(...collectBadFields(value, `${path}.${key}`));
    }
  }
  return bad;
}

/** Index of the `}` that closes the `{` at `start`. */
function matchingBrace(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Replace the interior of every `properties: { ... }` with blanks.
 *
 * Those keys are the JSON field names the model is asked to produce - "reasons",
 * "firstName", "experienceYears" - not Schema fields, so they must not be checked
 * against the Schema vocabulary. Everything outside them is a real Schema keyword
 * and anything else there is a bug of exactly the kind this file exists for.
 */
function blankPropertiesMaps(region) {
  let out = region;
  const pattern = /properties\s*:\s*\{/g;
  let match;
  while ((match = pattern.exec(region)) !== null) {
    const braceAt = region.indexOf("{", match.index);
    const close = matchingBrace(region, braceAt);
    if (close === -1) continue;
    out =
      out.slice(0, braceAt + 1) +
      " ".repeat(close - braceAt - 1) +
      out.slice(close);
    pattern.lastIndex = braceAt + 1;
  }
  return out;
}

/**
 * The source region of every schema literal: the object returned by each
 * buildSchema / buildResponseSchema style function.
 */
function schemaRegions(source) {
  const regions = [];
  const decl = /function\s+(\w*[Ss]chema\w*)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = decl.exec(source)) !== null) {
    const bodyStart = source.indexOf("{", match.index + match[0].length - 1);
    const bodyEnd = matchingBrace(source, bodyStart);
    if (bodyEnd === -1) continue;

    const body = source.slice(bodyStart, bodyEnd + 1);
    // The schema is the object the builder returns, not the function body, which
    // also holds helper locals.
    const ret = body.lastIndexOf("return {");
    if (ret === -1) continue;
    const objStart = bodyStart + ret + "return ".length;
    const objEnd = matchingBrace(source, objStart);
    if (objEnd === -1) continue;

    regions.push({ name: match[1], text: blankPropertiesMaps(source.slice(objStart, objEnd + 1)) });
  }
  return regions;
}

const GEMINI_CALLERS = [
  { file: "backend/teacherAdvisor.js", who: "teacher advisor ranking" },
  { file: "backend/matchInsights.js", who: "match insights from trial notes" },
  { file: "backend/teacherResumeParser.js", who: "resume auto-fill" },
];

for (const { file, who } of GEMINI_CALLERS) {
  const source = await readFile(join(root, file), "utf8");

  ok(`${who}: sends a responseSchema`, /responseSchema\s*:/.test(source));

  const regions = schemaRegions(source);
  ok(`${who}: found its schema builder`, regions.length > 0);

  for (const region of regions) {
    const keys = new Set([...region.text.matchAll(/(^|[{,\s])([a-zA-Z][a-zA-Z0-9]*)\s*:/g)].map((m) => m[2]));
    const bad = [...keys].filter((k) => !SCHEMA_FIELDS.has(k));
    ok(
      `${who}: ${region.name} uses only Gemini Schema fields`,
      bad.length === 0,
      bad.length ? `not Schema fields: ${bad.join(", ")}` : ""
    );
  }

  // And the explicit one that bit us, so the regression cannot return in a
  // different file under a different name.
  ok(
    `${who}: does not use additionalProperties`,
    !/\badditionalProperties\s*:/.test(source),
    "additionalProperties is OpenAPI vocabulary; Gemini's Schema has no such field"
  );

  // Every enumerated type must be one Gemini knows.
  const types = [...new Set([...source.matchAll(/type:\s*"([A-Za-z]+)"/g)].map((m) => m[1]))];
  const badTypes = types.filter((t) => !SCHEMA_TYPES.has(t));
  ok(
    `${who}: uses only known schema types`,
    badTypes.length === 0,
    badTypes.length ? `unknown types: ${badTypes.join(", ")}` : ""
  );
}

// Spot-check the real schema we changed, so a future edit that reintroduces the
// map shape is caught here rather than in production.
const advisorSource = await readFile(join(root, "backend/teacherAdvisor.js"), "utf8");
const reasonsBlock = advisorSource.match(/reasons:\s*\{[\s\S]*?required:\s*\["teacherId",\s*"reason"\][\s\S]*?\n      \},/);
ok("advisor reasons is a list of {teacherId, reason}", Boolean(reasonsBlock));
ok("advisor reasons is declared as an ARRAY", /reasons:\s*\{\s*\n\s*type:\s*"ARRAY"/.test(advisorSource));
ok("advisor constrains teacherId to the candidates offered", /teacherId:\s*\{[\s\S]*?enum:\s*candidateIds/.test(advisorSource));

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("\nFAILED:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log(`\nAll ${passed} Gemini schema checks passed.`);
}

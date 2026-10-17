/**
 * Tests for the resume parser: the Gemini model id in the request path, and the
 * identity fields (name, email, country, birthday) it now returns.
 *
 * The identity work exists because this failure is invisible from outside: a
 * wrong model produces a 404 and a generic message, and a malformed country or
 * birthday produces a form that silently refuses to save.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  COUNTRY_OPTIONS,
  normalizeBirthDate,
  normalizeCountry,
  normalizeParsedProfile,
} from "../backend/teacherResumeParser.js";
// normalizeModelId now lives in the shared Gemini client, with the resume
// parser and the trial-notes insights feature as its two callers.
import { normalizeModelId } from "../backend/geminiClient.js";

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

/* --------------------------------------------------------- model id in path */

check("bare id", normalizeModelId("gemini-2.5-flash"), "gemini-2.5-flash");
check("bare alias", normalizeModelId("gemini-flash-latest"), "gemini-flash-latest");
check("models/ prefix", normalizeModelId("models/gemini-2.5-flash"), "gemini-2.5-flash");
check("Models/ prefix, mixed case", normalizeModelId("Models/gemini-2.5-flash"), "gemini-2.5-flash");
check("MODELS/ prefix", normalizeModelId("MODELS/gemini-2.5-pro"), "gemini-2.5-pro");
check("surrounding whitespace", normalizeModelId("   gemini-2.5-flash   "), "gemini-2.5-flash");
check("whitespace + prefix", normalizeModelId("  models/gemini-2.5-flash  "), "gemini-2.5-flash");
check("full method suffix", normalizeModelId("models/gemini-2.5-flash:generateContent"), "gemini-2.5-flash");
check("suffix only", normalizeModelId("gemini-2.5-flash:generateContent"), "gemini-2.5-flash");
check("empty string", normalizeModelId(""), "");
check("whitespace only", normalizeModelId("   "), "");
check("undefined", normalizeModelId(undefined), "");
check("null", normalizeModelId(null), "");
check("dotted id kept", normalizeModelId("models/my.custom-model_v2"), "my.custom-model_v2");

/* --------------------------------- country must match the form's own options */

check("exact country", normalizeCountry("Japan"), "Japan");
check("country case-insensitive", normalizeCountry("philippines"), "Philippines");
check("country whitespace", normalizeCountry("  Canada  "), "Canada");
check("multi-word country", normalizeCountry("united states"), "United States");
// The select is required and accepts only these strings, so anything else has
// to be dropped rather than passed through.
check("country not on the list", normalizeCountry("Brazil"), null);
check("country near-miss", normalizeCountry("United States of America"), null);
check("empty country", normalizeCountry(""), null);
check("undefined country", normalizeCountry(undefined), null);

// The backend list and the form's list are a contract. Editing one without the
// other silently breaks the select, so the test compares them directly.
const adminSource = readFileSync(join(root, "frontend/src/pages/AdminDashboard.jsx"), "utf8");
const listMatch = adminSource.match(/const COUNTRY_OPTIONS = \[([\s\S]*?)\];/);
check("COUNTRY_OPTIONS found in AdminDashboard", Boolean(listMatch), true);
if (listMatch) {
  const frontendCountries = [...listMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  check("country list matches the form", COUNTRY_OPTIONS, frontendCountries);
}

/* ---------------------------------------------------------- birthday shape */

// PUT /api/users/:id stores String(birthDate).slice(0, 10) and rejects anything
// that is not /^\d{4}-\d{2}-\d{2}$/, so this has to arrive in exactly that shape.
check("valid birthday", normalizeBirthDate("1990-04-17"), "1990-04-17");
check("leap day", normalizeBirthDate("1996-02-29"), "1996-02-29");
check("with time suffix", normalizeBirthDate("1990-04-17T00:00:00Z"), "1990-04-17");

// A real date, but not one the form or the route should be handed.
check("future date", normalizeBirthDate("2099-01-01"), null);
check("child", normalizeBirthDate("2015-01-01"), null);
check("implausibly old", normalizeBirthDate("1893-01-01"), null);

// Not a date at all, in the shapes a model actually returns.
check("month name", normalizeBirthDate("March 1990"), null);
check("day-first", normalizeBirthDate("17/04/1990"), null);
check("year only", normalizeBirthDate("1990"), null);
check("month overflow", normalizeBirthDate("1990-13-01"), null);
// Date.UTC rolls this over into March rather than rejecting it.
check("day overflow", normalizeBirthDate("1990-02-31"), null);
check("non-leap feb 29", normalizeBirthDate("1991-02-29"), null);
check("empty birthday", normalizeBirthDate(""), null);
check("undefined birthday", normalizeBirthDate(undefined), null);

/* ------------------------------------------- identity through the real entry */

const good = normalizeParsedProfile({
  firstName: "Maria",
  lastName: "Santos",
  email: "Maria.Santos@Example.COM",
  country: "philippines",
  birthday: "1990-04-17",
});
check("clean name kept", good.firstName, "Maria");
check("clean surname kept", good.lastName, "Santos");
check("email lowercased", good.email, "maria.santos@example.com");
check("country canonicalised", good.country, "Philippines");
check("birthday kept", good.birthday, "1990-04-17");

// A CV header line is the common failure: a model asked for a first name
// returns "MARIA SANTOS | TEACHER", which would then be saved as a name.
check("header line rejected as firstName", normalizeParsedProfile({ firstName: "MARIA SANTOS | TEACHER" }).firstName, "");
// A bare word like "Teacher" is indistinguishable from a real surname, so it is
// kept. The prompt asks for no titles; the character rules cannot catch this.
check("plain word kept as lastName", normalizeParsedProfile({ lastName: "Teacher" }).lastName, "Teacher");
check("digits rejected in name", normalizeParsedProfile({ firstName: "Maria2" }).firstName, "");
check("email-like text rejected", normalizeParsedProfile({ firstName: "maria@example.com" }).firstName, "");
check("name with apostrophe kept", normalizeParsedProfile({ firstName: "O'Brien" }).firstName, "O'Brien");
check("hyphenated surname kept", normalizeParsedProfile({ lastName: "Santos-Diaz" }).lastName, "Santos-Diaz");
check("accented name kept", normalizeParsedProfile({ firstName: "José" }).firstName, "José");
check("non-latin name kept", normalizeParsedProfile({ firstName: "李" }).firstName, "李");

check("email without domain rejected", normalizeParsedProfile({ email: "maria@" }).email, "");
check("email without tld rejected", normalizeParsedProfile({ email: "maria@example" }).email, "");
check("email with spaces rejected", normalizeParsedProfile({ email: "maria santos@example.com" }).email, "");
// A well-formed address the resume never mentioned is accepted: there is no way
// to tell an invented one from a real one, only the prompt asks for honesty.
// This is recorded as a known limit rather than a guarantee.
check("plausible but unsourced email accepted", normalizeParsedProfile({ email: "teacher@school.edu" }).email, "teacher@school.edu");

// Missing identity fields must not invent anything.
const empty = normalizeParsedProfile({});
check("no firstName", empty.firstName, "");
check("no lastName", empty.lastName, "");
check("no email", empty.email, "");
check("no country", empty.country, null);
check("no birthday", empty.birthday, null);

// The matching profile must be unaffected by the new fields.
check("bio still normalised", normalizeParsedProfile({ bio: "Teaches adults.  " }).bio, "Teaches adults.");
check("profile fields still there", normalizeParsedProfile({ experienceYears: 7 }).experienceYears, 7);

/* ------------------------------------------------------------------ courses */

// Courses live in the database, so the parser is told the list rather than
// holding a copy. Anything outside it cannot be shown on a chip.
const CATALOGUE = ["Business English", "Conversational English", "IELTS", "News", "OPIc"];

check(
  "valid courses kept",
  normalizeParsedProfile({ courses: ["IELTS", "News"] }, { availableCourseNames: CATALOGUE }).courses,
  ["IELTS", "News"]
);
check(
  "course case-insensitive",
  normalizeParsedProfile({ courses: ["ielts"] }, { availableCourseNames: CATALOGUE }).courses,
  ["IELTS"]
);
check(
  "course whitespace tolerated",
  normalizeParsedProfile({ courses: ["  News  "] }, { availableCourseNames: CATALOGUE }).courses,
  ["News"]
);
check(
  "invented course dropped",
  normalizeParsedProfile({ courses: ["IELTS", "Underwater Basket Weaving"] }, { availableCourseNames: CATALOGUE }).courses,
  ["IELTS"]
);
check(
  "no catalogue means no courses",
  normalizeParsedProfile({ courses: ["IELTS"] }).courses,
  []
);
check(
  "missing courses field",
  normalizeParsedProfile({}, { availableCourseNames: CATALOGUE }).courses,
  []
);
check(
  "comma string accepted",
  normalizeParsedProfile({ courses: "IELTS, News" }, { availableCourseNames: CATALOGUE }).courses,
  ["IELTS", "News"]
);

// The specialisation filter used to depend only on courses the admin had
// already ticked. With the resume card at the top of the form, nothing is
// ticked yet - so the parsed courses have to count, or every suggestion is
// filtered away and the admin gets nothing.
const parsedOnlyCourses = normalizeParsedProfile(
  { specialization: ["exam preparation", "business english"] },
  { courseNames: [], availableCourseNames: CATALOGUE }
);
check(
  "specialization kept from parsed courses alone",
  parsedOnlyCourses.specialization,
  ["exam preparation", "business english"]
);

// Once courses ARE known, a specialization that fits none of them is dropped.
check(
  "mismatched specialization dropped",
  normalizeParsedProfile(
    { courses: ["Business English"], specialization: ["news discussion", "exam preparation", "business english"] },
    { availableCourseNames: CATALOGUE }
  ).specialization,
  ["business english"]
);

// Deliberate fallback, and the reason the case above needed a course to lean on:
// with nothing known about the courses at all, every specialization stays
// available rather than the admin getting an empty chip list to start from.
check(
  "no courses known keeps every specialization",
  normalizeParsedProfile(
    { specialization: ["news discussion", "exam preparation"] },
    { availableCourseNames: CATALOGUE }
  ).specialization,
  ["news discussion", "exam preparation"]
);

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("All good.");
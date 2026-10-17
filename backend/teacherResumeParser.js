// teacherResumeParser.js
/**
 * Reads an uploaded teacher resume and fills in the AI Matching Profile that
 * the Create Teacher form shows.
 *
 * This is the only language-model call in the backend, and it is deliberately
 * scoped to extraction plus validation:
 *
 *  - The model NEVER writes the text we store. It returns structured JSON that
 *    the Create Teacher form sends back through /api/admin/users, where
 *    buildTeacherAiBio composes the "AI matching profile:" block. Letting the
 *    model emit that block itself would break parseTeacherProfileTags.
 *  - Every value is re-validated against the same fixed vocabulary the chips
 *    use. teacherMatching.js scores a teacher by counting EXACT string overlap,
 *    so a plausible synonym ("conversational" vs "conversation") scores
 *    nothing at all.
 *  - The admin still confirms every value before the teacher is saved.
 */

import mammoth from "mammoth";
import { isGeminiConfigured, requestGeminiJson } from "./geminiClient.js";

// Inline request data (base64 PDF included) is capped by the Gemini API, so the
// upload limit has to stay well under it: 8 MB becomes roughly 11 MB base64.
export const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const MAX_BIO_CHARS = 1800;
const MAX_EXPERIENCE_YEARS = 50;

export const RESUME_MIME_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

/* ------------------------------------------------------------------ config */

// The key, the model id and the retry-on-404 behaviour all live in
// geminiClient.js, shared with the trial-notes insights feature. They used to be
// here alone and were copied verbatim when that second feature arrived.
export function isResumeParserConfigured() {
  return isGeminiConfigured();
}

/* -------------------------------------------------------------- vocabulary */

/**
 * The fixed option values the teacher matching profile is built from.
 *
 * !! These are a contract, not labels. teacherMatching.js compares a teacher
 * !! and a student by exact string overlap, so "conversation" and
 * !! "conversational" score differently. Keep them byte-identical to
 * !! frontend/src/utils/matchingCriteria.js; scripts/test-teacher-matching.mjs
 * !! asserts that they line up.
 *
 * The course lists mirror the third tuple element of each frontend option, so
 * the parser only ever suggests a specialization whose chip is actually visible
 * for the courses the admin picked. Suggesting a hidden one would silently drop
 * it on save.
 */
export const SPECIALIZATION_OPTIONS = [
  { value: "speaking and conversation", label: "Speaking and Conversation", courses: ["Conversational English", "Travel English", "Online English", "OPIc"] },
  { value: "grammar and writing", label: "Grammar and Writing", courses: ["Online English", "IELTS", "TOEIC", "Business English"] },
  { value: "reading and vocabulary", label: "Reading and Vocabulary", courses: ["IELTS", "TOEIC", "News", "Online English"] },
  { value: "listening and pronunciation", label: "Listening and Pronunciation", courses: ["IELTS", "TOEIC", "Conversational English", "OPIc", "Travel English"] },
  { value: "exam preparation", label: "Exam Preparation", courses: ["IELTS", "TOEIC", "OPIc"] },
  { value: "business english", label: "Business English", courses: ["Business English", "Job Interview", "TOEIC"] },
  { value: "job interview coaching", label: "Job Interview Coaching", courses: ["Job Interview", "Business English"] },
  { value: "news discussion", label: "News Discussion", courses: ["News", "Conversational English"] },
  { value: "kids and novice english", label: "Kids and Novice English", courses: ["Online English"] },
];

export const TEACHING_STYLE_OPTIONS = [
  { value: "structured", label: "Structured" },
  { value: "conversational", label: "Conversational" },
  { value: "visual", label: "Visual" },
  { value: "interactive", label: "Interactive" },
  { value: "independent", label: "Independent Practice" },
];

export const IDEAL_STUDENT_PACE_OPTIONS = [
  { value: "slow", label: "Slow and Guided" },
  { value: "balanced", label: "Balanced" },
  { value: "fast", label: "Fast-paced" },
  { value: "review-heavy", label: "Review-heavy" },
];

export const SPECIALIZATION_VALUES = SPECIALIZATION_OPTIONS.map((option) => option.value);
export const TEACHING_STYLE_VALUES = TEACHING_STYLE_OPTIONS.map((option) => option.value);
export const IDEAL_STUDENT_PACE_VALUES = IDEAL_STUDENT_PACE_OPTIONS.map((option) => option.value);

/**
 * The country values the create-teacher form offers.
 *
 * !! A contract again: the form's <select> is required and only accepts these
 * !! exact strings, so a parsed country outside this list would leave the select
 * !! on "Select Country" and block the save. Mirrored from COUNTRY_OPTIONS in
 * !! frontend/src/pages/AdminDashboard.jsx; scripts/test-resume-parser.mjs
 * !! asserts the two line up, so editing one without the other fails a test.
 */
export const COUNTRY_OPTIONS = [
  "Australia",
  "Canada",
  "China",
  "India",
  "Indonesia",
  "Japan",
  "Malaysia",
  "Philippines",
  "Singapore",
  "South Korea",
  "Thailand",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Vietnam",
];

/**
 * The specializations that apply to the chosen courses. With nothing chosen
 * yet, everything is allowed so the admin can still get a head start before
 * ticking the course chips (the form prunes hidden chips anyway).
 */
export function specializationValuesForCourses(courseNames = []) {
  const selected = courseNames.map((name) => String(name || "").trim()).filter(Boolean);
  if (!selected.length) return [...SPECIALIZATION_VALUES];
  return SPECIALIZATION_OPTIONS
    .filter((option) => option.courses.some((course) => selected.includes(course)))
    .map((option) => option.value);
}

/* --------------------------------------------------------------- normalise */

/**
 * Keep only values from `options`, deduped and in the model's original order.
 *
 * Labels are accepted as aliases of their values, because a model that answers
 * "Fast-paced" instead of "fast" should not cost the admin a chip. Anything
 * outside the option list is dropped rather than passed through: the matcher
 * scores exact string overlap, so an invented tag scores nothing and only
 * misleads the admin.
 */
function normalizeValues(raw, options) {
  const alias = new Map();
  for (const option of options) {
    alias.set(option.value, option.value);
    alias.set(option.label.toLowerCase(), option.value);
  }

  const items = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const seen = new Set();
  for (const item of items) {
    const value = alias.get(String(item == null ? "" : item).trim().toLowerCase());
    if (value && !seen.has(value)) seen.add(value);
  }
  return [...seen];
}

function normalizeBio(raw) {
  const text = String(raw == null ? "" : raw)
    // The model is told not to write the marker, but if it does, the block it
    // produced has to go: buildTeacherAiBio appends the real one, and
    // parseTeacherProfileTags reads from the FIRST marker it finds. A leftover
    // block would therefore make the genuine tag lines look like free text and
    // silently zero out teaching-style and pace matching. Everything from the
    // marker onwards is profile markup, never prose, so it is dropped whole.
    .replace(/AI matching profile:[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, MAX_BIO_CHARS);
}

function normalizeExperienceYears(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const years = Number(raw);
  if (!Number.isFinite(years) || years < 0) return null;
  return Math.min(Math.round(years), MAX_EXPERIENCE_YEARS);
}

/* ------------------------------------------------------- identity fields */

// A CV header is often a whole line ("MARIA SANTOS | ENGLISH TEACHER"), and a
// model asked for a first name sometimes returns it. Letters from any script
// plus the separators real names use, so a line containing a digit, pipe, @ or
// slash is rejected rather than pasted into a text input.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’. -]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const MAX_NAME_CHARS = 60;
const MAX_EMAIL_CHARS = 254;
// A date of birth outside this band is a typo, and one that the resume does not
// actually state is not something to guess at, so neither is filled in.
const MIN_TEACHER_AGE = 18;
const MAX_TEACHER_AGE = 100;

function normalizeName(raw) {
  const text = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim().slice(0, MAX_NAME_CHARS);
  if (!text) return "";
  if (!NAME_PATTERN.test(text)) return "";
  // Four words is already a stretch for one name field; beyond that it is a
  // heading that happened to pass the character check.
  if (text.split(" ").length > 4) return "";
  return text;
}

function normalizeEmail(raw) {
  const text = String(raw == null ? "" : raw).trim().toLowerCase().slice(0, MAX_EMAIL_CHARS);
  if (!text || !EMAIL_PATTERN.test(text)) return "";
  return text;
}

/** Only ever returns a value the create-teacher <select> will actually accept. */
export function normalizeCountry(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return null;
  const match = COUNTRY_OPTIONS.find((option) => option.toLowerCase() === text.toLowerCase());
  return match || null;
}

/**
 * A full ISO date, or nothing.
 *
 * PUT /api/users/:id rejects anything that is not /^\d{4}-\d{2}-\d{2}$/, and it
 * stores the first ten characters, so the parser emits exactly that shape and
 * never a partial or a locale-formatted date.
 */
export function normalizeBirthDate(raw) {
  const text = String(raw == null ? "" : raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const [year, month, day] = text.split("-").map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  // Round-trip: Date.UTC happily rolls 2025-02-31 over into March, so compare
  // the parts back instead of trusting the constructor.
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    return null;
  }
  if (asDate > new Date()) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const birthdayNotYet = now.getUTCMonth() + 1 < month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (birthdayNotYet) age -= 1;
  if (age < MIN_TEACHER_AGE || age > MAX_TEACHER_AGE) return null;

  return text;
}

/**
 * Turn whatever came back from the model into values that are safe to store.
 * Anything outside the vocabulary is dropped rather than passed through, so a
 * hallucinated tag can never reach the matcher.
 */
/**
 * Keep only courses the form can actually show, matched case-insensitively.
 *
 * The valid names come from the caller's own course list rather than a copy
 * held here, because courses live in the database and change. Anything the
 * parser invents, or that has since been renamed, is dropped instead of
 * reaching a chip the admin never sees.
 */
function normalizeCourseNames(raw, availableCourseNames) {
  const byLowerName = new Map();
  for (const name of availableCourseNames || []) {
    const cleaned = String(name || "").trim();
    if (cleaned) byLowerName.set(cleaned.toLowerCase(), cleaned);
  }
  if (!byLowerName.size) return [];

  const items = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const seen = new Set();
  for (const item of items) {
    const hit = byLowerName.get(String(item == null ? "" : item).trim().toLowerCase());
    if (hit) seen.add(hit);
  }
  return [...seen];
}

export function normalizeParsedProfile(raw, { courseNames = [], availableCourseNames = [] } = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const courses = normalizeCourseNames(source.courses, availableCourseNames);

  // A specialisation has to fit a course this teacher can actually teach, and
  // the parsed courses count towards that. With the resume card at the top of
  // the form the admin has usually not ticked anything yet, so filtering on the
  // ticked courses alone would drop every suggestion.
  const effectiveCourses = [...new Set([...(courseNames || []), ...courses])];

  return {
    // Identity first, then the matching profile. All of these are optional:
    // a resume often gives a name and nothing else, and every one of them is
    // dropped rather than guessed at.
    firstName: normalizeName(source.firstName),
    lastName: normalizeName(source.lastName),
    email: normalizeEmail(source.email),
    country: normalizeCountry(source.country),
    birthday: normalizeBirthDate(source.birthday),
    courses,
    bio: normalizeBio(source.bio),
    specialization: normalizeValues(
      source.specialization,
      SPECIALIZATION_OPTIONS.filter((option) => specializationValuesForCourses(effectiveCourses).includes(option.value))
    ),
    teachingStyle: normalizeValues(source.teachingStyle, TEACHING_STYLE_OPTIONS),
    idealStudentPace: normalizeValues(source.idealStudentPace, IDEAL_STUDENT_PACE_OPTIONS),
    experienceYears: normalizeExperienceYears(source.experienceYears),
  };
}

/** Multipart bodies arrive as strings, so accept JSON or a comma list. */
export function parseResumeCourseNames(value) {
  let items = value;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = items.split(",");
    }
  }
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ prompt */

function buildResponseSchema(courseNames, availableCourseNames = []) {
  const specialization = specializationValuesForCourses(courseNames);
  const enumOf = (values) => (values.length ? values : SPECIALIZATION_VALUES);
  const teachable = (availableCourseNames || []).map((name) => String(name || "").trim()).filter(Boolean);
  return {
    type: "OBJECT",
    properties: {
      bio: {
        type: "STRING",
        description:
          "A short plain-prose summary (3-5 sentences) of the teacher's teaching strengths, the student types and levels they work best with, and their overall approach.",
      },
      specialization: {
        type: "ARRAY",
        description: "Subject areas this teacher can teach. Empty if the resume does not show any.",
        items: { type: "STRING", enum: enumOf(specialization) },
      },
      teachingStyle: {
        type: "ARRAY",
        description: "How this teacher runs a lesson.",
        items: { type: "STRING", enum: TEACHING_STYLE_VALUES },
      },
      idealStudentPace: {
        type: "ARRAY",
        description: "The student pace this teacher works best with.",
        items: { type: "STRING", enum: IDEAL_STUDENT_PACE_VALUES },
      },
      experienceYears: {
        type: "NUMBER",
        nullable: true,
        description:
          "Total years of English-teaching experience as a whole number. Null when the resume does not state it - never estimate.",
      },
      firstName: {
        type: "STRING",
        nullable: true,
        description: "The teacher's given name only, not a full name line. Null when absent.",
      },
      lastName: {
        type: "STRING",
        nullable: true,
        description: "The teacher's family name only. Null when absent.",
      },
      email: {
        type: "STRING",
        nullable: true,
        description:
          "A contact email address exactly as written on the resume. Null when the resume shows none - never construct one.",
      },
      country: {
        type: "STRING",
        nullable: true,
        description: `Where the teacher is based, as one of: ${COUNTRY_OPTIONS.join(", ")}. Null when the resume does not say.`,
      },
      birthday: {
        type: "STRING",
        nullable: true,
        description:
          "Date of birth as YYYY-MM-DD, only when the resume states a full date. Null when absent or partial.",
      },
      courses: {
        type: "ARRAY",
        description: teachable.length
          ? `Which of these courses this teacher is qualified to teach: ${teachable.join(", ")}. Empty if the resume supports none of them.`
          : "Which courses this teacher can teach. Empty if the resume supports none.",
        // Only constrained when the caller told us what exists. Courses live in
        // the database, so an enum built from a hardcoded copy here would drift.
        items: teachable.length ? { type: "STRING", enum: teachable } : { type: "STRING" },
      },
    },
    required: [
      "bio",
      "specialization",
      "teachingStyle",
      "idealStudentPace",
      "experienceYears",
      "firstName",
      "lastName",
      "email",
      "country",
      "birthday",
      "courses",
    ],
  };
}

function buildTaskPrompt(courseNames, availableCourseNames = []) {
  const courses = courseNames.length
    ? courseNames.join(", ")
    : "none selected yet, so any specialization may be suggested";
  const teachable = (availableCourseNames || []).map((name) => String(name || "").trim()).filter(Boolean);
  return [
    "Extract the English-teaching profile from the attached resume.",
    "",
    `Courses this teacher will be allowed to teach: ${courses}.`,
    "Only suggest a specialization that fits one of those courses.",
    ...(teachable.length
      ? [
          "",
          `Courses this academy offers: ${teachable.join(", ")}.`,
          "Choose from that list for the `courses` field - never invent a course, and never leave out one the resume clearly supports.",
        ]
      : []),
    "",
    "Rules:",
    "- Use only the exact option strings listed in the response schema. Do not invent new ones.",
    "- Leave an array empty rather than guessing when the resume is silent.",
    "- experienceYears counts completed years teaching English, not years studying it or age. Null if unstated.",
    "- bio must be plain prose: no bullet points, no headings, no contact details, no mention of this task or of AI.",
    "- Describe the teacher, do not copy sentences out of the resume.",
    "- firstName and lastName are the teacher's own names. Return only the given name and only the family name - never a full header line, never a title like 'Teacher'.",
    "- email is only an address that appears on the resume. Never build, guess or complete one. Null when there is none.",
    `- country must be one of: ${COUNTRY_OPTIONS.join(", ")}. Pick the closest match for where the teacher lives or works; null when the resume does not say.`,
    "- birthday is YYYY-MM-DD and only when a full date of birth is written. Null for 'circa', an age, or a partial date.",
    "- If the document is unreadable or is not a teaching resume, return empty arrays, null for every optional field, and a bio saying so in one sentence.",
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You are an assistant that fills in a teacher profile for an online English academy.",
  "You read a resume and return structured data, never prose commentary.",
  "You are careful not to invent credentials: an attribute the resume does not support stays empty or null.",
].join(" ");

/* -------------------------------------------------------------- extraction */

/**
 * Turn the upload into parts Gemini can read.
 *
 * PDFs go through as inline binary because Gemini reads PDFs natively, which
 * also keeps multi-column and table layouts intact. DOCX and TXT are turned
 * into plain text here, since Gemini accepts neither DOCX nor a raw buffer it
 * can read without a declared type.
 */
async function buildDocumentParts(file) {
  const kind = RESUME_MIME_TYPES[file.mimetype];

  if (kind === "pdf") {
    return [
      {
        inlineData: {
          mimeType: "application/pdf",
          data: Buffer.from(file.buffer).toString("base64"),
        },
      },
    ];
  }

  const text =
    kind === "docx"
      ? (await mammoth.extractRawText({ buffer: file.buffer })).value
      : Buffer.from(file.buffer).toString("utf8");

  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("That file has no readable text. If it is a scanned image, upload a text-based PDF instead.");
  }
  return [{ text: trimmed.slice(0, 60_000) }];
}

/* ---------------------------------------------------------------- gemini */

function extractResponseText(payload) {
  const blockReason = payload?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini declined to read this file (${blockReason}). Try a different resume.`);
  }

  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part?.text || "").join("").trim();
  if (!text) {
    throw new Error("Gemini returned no result for this resume. Try a different file.");
  }
  return text;
}

function parseResponseJson(text) {
  // responseMimeType already asks for bare JSON, but strip a stray fence rather
  // than fail the whole parse over formatting.
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new Error("Gemini returned a result we could not read. Try a different resume.");
  }
}

async function callGemini({ documentParts, courseNames, availableCourseNames = [] }) {
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [...documentParts, { text: buildTaskPrompt(courseNames, availableCourseNames) }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: buildResponseSchema(courseNames, availableCourseNames),
    },
  };

  const response = await requestGeminiJson({
    payload,
    timeoutMs: 60_000,
    timeoutMessage: "Reading the resume took too long. Try again with a smaller file.",
    label: "Gemini resume parse",
  });

  return parseResponseJson(extractResponseText(response));
}

/**
 * Read a resume and return a validated teacher profile. The caller is
 * responsible for having checked isResumeParserConfigured().
 */
export async function parseTeacherResume({ file, courseNames = [], availableCourseNames = [] }) {
  if (!file || !file.buffer) {
    throw new Error("Please choose a resume to upload");
  }
  if (!RESUME_MIME_TYPES[file.mimetype]) {
    throw new Error("Resume must be a PDF, DOCX, or TXT file");
  }

  const selectedCourses = courseNames.map((name) => String(name || "").trim()).filter(Boolean);
  // What the academy actually offers. Courses live in the database, so the
  // parser is told rather than holding its own copy that would go stale.
  const teachableCourses = availableCourseNames.map((name) => String(name || "").trim()).filter(Boolean);
  const documentParts = await buildDocumentParts(file);
  const parsed = await callGemini({
    documentParts,
    courseNames: selectedCourses,
    availableCourseNames: teachableCourses,
  });

  return normalizeParsedProfile(parsed, {
    courseNames: selectedCourses,
    availableCourseNames: teachableCourses,
  });
}
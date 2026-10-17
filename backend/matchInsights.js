// matchInsights.js
/**
 * Read a student's trial notes and suggest extra matching criteria for them.
 *
 * !! Why this exists, and why it is deliberately not the ranker.
 * !!
 * !! teacherMatching.js scores by counting EXACT string overlap between a
 * !! student's criteria and a teacher's profile. It is deterministic,
 * !! explainable, and every point traces to a matched field - all of which are
 * !! worth keeping. Its own header also records that trial notes are NOT scored:
 * !! notes are identical for every candidate of a given student, so including
 * !! them adds a constant and changes nothing.
 * !!
 * !! That reasoning is right about ranking and wrong about reading. "Needs to
 * !! sound more confident in meetings" cannot be turned into `interview-answers`
 * !! or `fast` by counting words. So the model is asked only to READ, and its
 * !! answer is merged into the criteria that the existing scorer already
 * !! understands.
 * !!
 * !! The model never picks a teacher. Two consequences worth the extra call:
 * !! a Gemini failure costs a few tags rather than the whole recommendation, and
 * !! the admin sees exactly which tags were inferred so they can reject them.
 * !! Every suggested value is validated against the same vocabulary the chips
 * !! use, because a plausible synonym scores zero against an exact match.
 *
 * Vocabulary is taken from teacherMatching.js and teacherResumeParser.js rather
 * than restated here: those values are already asserted against the frontend
 * catalogue by scripts/test-teacher-matching.mjs, and a third copy would be a
 * third thing to keep in step.
 */

import {
  FOCUS_AREA_TO_SPECIALIZATION,
  LEARNING_GOAL_TO_SPECIALIZATION,
} from "./teacherMatching.js";
import { IDEAL_STUDENT_PACE_VALUES, TEACHING_STYLE_VALUES } from "./teacherResumeParser.js";
import { isGeminiConfigured, requestGeminiJson } from "./geminiClient.js";

/**
 * What the model may suggest, per criteria field.
 *
 * focusArea and learningGoal come from the keys of the maps teacherMatching.js
 * already uses to translate student intent into teacher specializations - so a
 * suggested value is guaranteed to reach the scorer as a specialisation.
 */
export const INSIGHT_FIELDS = {
  learningGoal: Object.keys(LEARNING_GOAL_TO_SPECIALIZATION),
  focusArea: Object.keys(FOCUS_AREA_TO_SPECIALIZATION),
  learningStyle: TEACHING_STYLE_VALUES,
  pace: IDEAL_STUDENT_PACE_VALUES,
};

const MAX_INSIGHT_TAGS_PER_FIELD = 3;
const MAX_NOTES_CHARS = 2000;
const REQUEST_TIMEOUT_MS = 20_000;

/** Labels for the toast and the panel, so the admin sees words not slugs. */
const FIELD_LABELS = {
  learningGoal: "learning goal",
  focusArea: "focus area",
  learningStyle: "learning style",
  pace: "pace",
};

export function isMatchInsightsConfigured() {
  return isGeminiConfigured();
}

export function describeInsightField(field) {
  return FIELD_LABELS[field] || field;
}

/** What the model picked, minus anything unusable or already chosen. */
export function normalizeInsights(raw, existingCriteria = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const added = {};

  for (const [field, allowed] of Object.entries(INSIGHT_FIELDS)) {
    const already = new Set(
      (Array.isArray(existingCriteria?.[field]) ? existingCriteria[field] : []).map((v) =>
        String(v || "").trim().toLowerCase()
      )
    );
    // The schema asks for arrays, but a comma-separated string costs nothing to
    // accept and matches how the resume parser reads the same model output.
    const raw = source[field];
    const items = Array.isArray(raw) ? raw : String(raw == null ? "" : raw).split(",");
    const picked = [];
    for (const item of items) {
      const value = String(item == null ? "" : item).trim().toLowerCase();
      // Not in the vocabulary: scoring it is worth exactly zero, and showing it
      // would imply it was considered. Not already chosen: re-suggesting what
      // the admin just ticked is noise.
      if (!allowed.includes(value) || already.has(value) || picked.includes(value)) continue;
      picked.push(value);
      if (picked.length >= MAX_INSIGHT_TAGS_PER_FIELD) break;
    }
    if (picked.length) added[field] = picked;
  }

  return added;
}

/** Merge inferred tags into the criteria the admin filled in by hand. */
export function mergeInsights(criteria = {}, added = {}) {
  const merged = { ...criteria };
  for (const [field, values] of Object.entries(added || {})) {
    merged[field] = [...new Set([...(criteria?.[field] || []), ...(values || [])])];
  }
  return merged;
}

function buildResponseSchema() {
  const properties = {};
  for (const [field, allowed] of Object.entries(INSIGHT_FIELDS)) {
    properties[field] = {
      type: "ARRAY",
      description: `Extra ${FIELD_LABELS[field]} values implied by the notes. Empty if the notes say nothing about it.`,
      items: { type: "STRING", enum: allowed },
    };
  }
  return { type: "OBJECT", properties, required: Object.keys(INSIGHT_FIELDS) };
}

function buildPrompt(trialNotes, criteria) {
  const alreadyPicked = Object.entries(INSIGHT_FIELDS)
    .map(([field, allowed]) => {
      const chosen = (Array.isArray(criteria?.[field]) ? criteria[field] : []).filter((v) =>
        allowed.includes(String(v || "").trim().toLowerCase())
      );
      return chosen.length ? `${field}: ${chosen.join(", ")}` : null;
    })
    .filter(Boolean);

  return [
    "You are advising which teacher criteria a student's trial notes imply.",
    "",
    "Trial notes:",
    trialNotes.slice(0, MAX_NOTES_CHARS),
    "",
    ...(alreadyPicked.length
      ? ["The administrator has ALREADY selected these. Do not repeat them:", ...alreadyPicked, ""]
      : []),
    "Rules:",
    "- Only suggest a value the notes clearly support. An empty array is the correct answer far more often than a guess.",
    "- Use only the exact values listed in the response schema.",
    "- Do not restate the notes. Decide which of the listed values they point at.",
    "- Never suggest a value already chosen by the administrator.",
    "- These are additions to a hand-filled form, not a judgement about the student.",
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You map free-form notes onto a fixed vocabulary of teacher-matching criteria.",
  "You are conservative: an unsupported value stays out rather than being guessed.",
].join(" ");

/**
 * Suggest extra criteria. Never throws - a failure here must not cost the admin
 * the recommendation, only the suggestions.
 *
 * @returns {Promise<{added: object, unavailable: boolean, reason: string, skipped?: string}>}
 */
export async function deriveMatchInsights({ trialNotes = "", criteria = {} }) {
  const notes = String(trialNotes || "").trim();
  if (!notes) {
    return { added: {}, unavailable: false, reason: "", skipped: "no-notes" };
  }
  if (!isMatchInsightsConfigured()) {
    return { added: {}, unavailable: true, reason: "not-configured" };
  }

  try {
    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildPrompt(notes, criteria) }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: buildResponseSchema(),
      },
    };

    const response = await requestGeminiJson({
      payload,
      timeoutMs: REQUEST_TIMEOUT_MS,
      timeoutMessage: "The AI took too long to read the notes.",
      label: "Gemini match insights",
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) return { added: {}, unavailable: false, reason: "" };

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Unparseable output is treated as "nothing suggested", not as an error:
      // the recommendation still proceeds.
      return { added: {}, unavailable: false, reason: "", skipped: "unreadable" };
    }

    return { added: normalizeInsights(parsed, criteria), unavailable: false, reason: "" };
  } catch (err) {
    // Short, presentable reason. The full error is already logged by the client.
    const reason = /not configured/i.test(err.message)
      ? "not-configured"
      : /api key/i.test(err.message)
        ? "bad-key"
        : /rate limit/i.test(err.message)
          ? "rate-limited"
          : /too long/i.test(err.message)
            ? "timed-out"
            : "unavailable";
    return { added: {}, unavailable: true, reason };
  }
}
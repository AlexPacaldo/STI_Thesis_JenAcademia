// geminiClient.js
/**
 * The one place the backend talks to Gemini.
 *
 * Both language-model features - reading a resume, and reading a student's trial
 * notes - need the same things: an API key read late, a model id that survives
 * being written as `models/gemini-...`, one free retry on the rolling alias when
 * the configured model 404s, and error messages an admin can act on. That logic
 * was duplicated the moment there was a second caller, and duplicated model
 * handling is exactly how the two drift apart.
 *
 * Nothing here decides anything. Callers pass a full request payload with a
 * responseSchema and get back parsed JSON, or an Error with a message fit to
 * show a user.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const MATCH_REQUEST_TIMEOUT_MS = 120_000;

// Google's docs write the model both bare (gemini-2.5-flash) and prefixed
// (models/gemini-2.5-flash), and this value is interpolated straight into the
// request path. A GEMINI_MODEL of models/gemini-2.5-flash therefore produced
// models/models%2Fgemini-2.5-flash:generateContent, which Gemini answers with
// 404 - a failure indistinguishable from a retired model name unless you
// already suspect the prefix.
export function normalizeModelId(value) {
  return String(value || "")
    .trim()
    .replace(/^models\//i, "")
    .replace(/:generateContent$/i, "")
    .trim();
}

// Tried in order until one answers. The configured model goes first, because
// an explicit GEMINI_MODEL is the operator's decision and should win whenever it
// works; the rest are there so a name that has gone stale heals itself instead of
// failing every request until someone edits a setting in production.
//
// A 404 costs nothing - no generation happens - so each extra candidate is free
// on the happy path and only paid on the path that was already broken.
//
// Ordered by what is most likely to be reachable for any given key rather than
// by capability. gemini-3.8-flash is the current flagship Flash; 3.5-flash-lite
// is the cheapest and has the most generous rate limits, which makes it the one
// most likely to still answer on a free key; gemini-flash-latest is the rolling
// alias and is last only because it is the least specific - if it resolves, it
// resolves to whatever is newest, which is not necessarily what was tested here.
const MODEL_FALLBACKS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];

// 2.5 was the default while it was current. Google now limits access to the 2.5
// family to keys that have already used those models, so a key created for this
// project gets a 404 on it and the advisor is dead until someone notices. Moving
// to the 3.x family is what keeps it alive; the fallbacks cover the key being
// older than the newest model instead.
const DEFAULT_MODEL = "gemini-3.8-flash";

// Read lazily rather than at module scope: server.js imports modules before it
// calls dotenv.config(), so a top-level read would miss anything that only
// exists in the .env file.
const geminiApiKey = () =>
  String(process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();

const geminiModel = () => normalizeModelId(process.env.GEMINI_MODEL) || DEFAULT_MODEL;

export function isGeminiConfigured() {
  return Boolean(geminiApiKey());
}

/**
 * Which models to try, in order, for one request.
 *
 * Exported rather than inlined so it can be tested. The behaviour that matters -
 * configured model first, fallbacks after it, nothing asked for twice - is
 * invisible from outside and would otherwise only be observable as "the AI
 * stopped working one day when a model was renamed", which is not a symptom
 * anyone can debug from a screenshot.
 *
 * @param {string} configured Already normalised, from GEMINI_MODEL or DEFAULT_MODEL.
 */
export function modelCandidates(configured) {
  return [configured, ...MODEL_FALLBACKS].filter(
    (model, index, all) => model && all.indexOf(model) === index
  );
}

/**
 * POST a payload that asks for JSON, and return the parsed response body.
 *
 * @param {object} payload Full request body, including generationConfig with a
 *   responseSchema. Structured output is enforced by the schema, not by asking
 *   nicely in the prompt.
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.timeoutMessage] Shown when the call times out, so the
 *   two features can word it for their own context.
 * @param {string} [options.label] Prefix for the failure log line.
 */
export async function requestGeminiJson({ payload, timeoutMs = 60_000, timeoutMessage, label = "gemini" }) {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new Error("AI features are not configured. Set GOOGLE_GEMINI_API_KEY on the backend.");
  }

  const configured = geminiModel();
  // De-duplicated, configured first. If GEMINI_MODEL is already one of the
  // fallbacks it is not tried twice, and a second identical attempt would spend
  // a round trip to learn exactly what the first one already proved.
  const candidates = modelCandidates(configured);

  let lastStatus = 0;
  let lastDetail = "";

  for (const model of candidates) {
    const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (err?.name === "TimeoutError") {
        throw new Error(timeoutMessage || "The AI took too long to respond. Try again.");
      }
      throw new Error(`Could not reach Gemini: ${err.message}`);
    }

    if (response.ok) {
      return response.json();
    }

    try {
      lastDetail = (await response.json())?.error?.message || "";
    } catch {
      lastDetail = "";
    }
    lastStatus = response.status;
    // The model name is in this line deliberately. A 404 on the configured
    // model is the failure most easily misread from the status alone.
    console.error(`${label} failed:`, response.status, model, lastDetail);

    if (response.status === 400 && /api key/i.test(lastDetail)) {
      throw new Error("Gemini rejected the API key. Check GOOGLE_GEMINI_API_KEY on the backend.");
    }
    if (response.status === 429) {
      throw new Error("Gemini rate limit reached. Try again in a moment.");
    }
    // Anything else - a 404 above all - is worth one more try on the next model.
  }

  // Gemini's own wording is appended, because the bare status is ambiguous: a
  // 404 covers both "no such model" and "not available to this key", and only the
  // detail tells them apart. The model list is appended for the same reason from
  // the other direction: if every candidate failed, knowing which ones were tried
  // is the difference between "retired, pick a newer name" and "your key cannot
  // reach this family at all".
  throw new Error(
    `Gemini could not complete the request (${lastStatus}) after trying ` +
      `${candidates.join(", ")}${lastDetail ? `: ${lastDetail}` : ""}`
  );
}
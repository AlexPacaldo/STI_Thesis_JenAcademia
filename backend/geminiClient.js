// geminiClient.js
/**
 * The one place the backend talks to Gemini.
 *
 * Both language-model features - reading a resume, and reading a student's trial
 * notes - need the same things: an API key read late, a model id that survives
 * being written as `models/gemini-...`, fallback models when
 * the configured model 404s, and error messages an admin can act on. That logic
 * was duplicated the moment there was a second caller, and duplicated model
 * handling is exactly how the two drift apart.
 *
 * Nothing here decides anything. Callers pass a full request payload with a
 * responseSchema and get back parsed JSON, or an Error with a message fit to
 * show a user.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const MATCH_REQUEST_TIMEOUT_MS = 18_000;

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
// A 404 means the model was not found; the next candidate may still work.
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
// Remember a working fallback for this process, so a retired configured model
// does not add a failed network round trip to every request. Changes to either
// configuration value invalidate the cache.
let workingModel = null;
let workingConfig = null;

export async function requestGeminiJson({ payload, timeoutMs = 60_000, timeoutMessage, label = "gemini" }) {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new Error("AI features are not configured. Set GOOGLE_GEMINI_API_KEY on the backend.");
  }

  const configured = geminiModel();
  const config = `${apiKey}\0${configured}`;
  const candidates = modelCandidates(configured);
  if (workingConfig === config && workingModel && candidates.includes(workingModel)) {
    candidates.splice(candidates.indexOf(workingModel), 1);
    candidates.unshift(workingModel);
  }
  const deadline = Date.now() + timeoutMs;
  const timeoutError = () => new Error(timeoutMessage || "The AI took too long to respond. Try again.");
  let lastStatus = 0;
  let lastDetail = "";
  const attempted = [];

  for (const model of candidates) {
    attempted.push(model);
    const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
    // One short retry for a transient server error, within the overall deadline.
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timeoutError();
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(remaining),
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const body = await response.json();
          workingConfig = config;
          workingModel = model;
          return body;
        }
        try {
          lastDetail = (await response.json())?.error?.message || "";
        } catch {
          lastDetail = "";
        }
      } catch (err) {
        if (err?.name === "TimeoutError" || err?.name === "AbortError") throw timeoutError();
        throw new Error(`Could not reach Gemini: ${err.message}`);
      }
      lastStatus = response.status;
      console.error(`${label} failed:`, response.status, model, lastDetail);
      if ((response.status === 400 && /api key/i.test(lastDetail)) || response.status === 401 || response.status === 403) {
        throw new Error("Gemini rejected the API key or its permissions. Check GOOGLE_GEMINI_API_KEY on the backend.");
      }
      if (response.status === 429) {
        throw new Error("Gemini rate limit reached. Check the project quota and try again later.");
      }
      if (response.status === 404) {
        if (workingConfig === config && workingModel === model) workingModel = null;
        break;
      }
      if ((response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) && attempt === 0 && deadline - Date.now() > 500) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      throw new Error(`Gemini could not complete the request (${lastStatus})${lastDetail ? `: ${lastDetail}` : ""}`);
    }
  }
  throw new Error(
    `Gemini could not complete the request (${lastStatus}) after trying ` +
      `${attempted.join(", ")}${lastDetail ? `: ${lastDetail}` : ""}`
  );
}

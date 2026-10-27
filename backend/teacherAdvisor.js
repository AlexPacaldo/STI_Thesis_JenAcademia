// teacherAdvisor.js
/**
 * Rank the candidate teachers with a language model.
 *
 * The deterministic scorer in teacherMatching.js matches closed vocabularies by
 * exact string overlap. That is precise and repeatable, and it is also blind: it
 * cannot tell that a teacher who lists "exam preparation" is the right person for
 * a student who wants to sound more confident in an interview. So the model is
 * asked to do the judgement the rules cannot, while the rules keep everything
 * they are good at.
 *
 * !! What the model is NOT trusted with. It never chooses from outside the
 * !! candidate list - the ids are constrained by an enum built from that list, and
 * !! anything unrecognised is dropped. It does not decide course eligibility,
 * !! availability or workload; those are applied to its answer by us, on both
 * !! sides. It is a reordering of a list we already decided was valid.
 * !!
 * !! And it is never the only path. If it is unconfigured, times out, rate
 * !! limits, errors, or returns something unreadable, the rules rank on their own
 * !! and the caller is told, so a degraded result is never presented as a
 * !! considered one.
 *
 * Cost is bounded by the request rate limiter on the route and by the candidate
 * cap below, which exists so a large academy cannot turn one click into an
 * enormous prompt.
 */

import {
  isGeminiConfigured,
  MATCH_REQUEST_TIMEOUT_MS,
  requestGeminiJson,
} from "./geminiClient.js";

// Long enough that a realistic school never truncates, short enough that one
// click cannot send an unbounded prompt. When it does truncate the shortlist is
// the rules' strongest candidates, and the model is told that is what happened.
export const MAX_ADVISOR_CANDIDATES = 60;
const MAX_BIO_CHARS = 400;

// The fallback has to be usable, not merely correct. While Gemini is healthy the
// admin waits for the advisor's ranking. While it is DOWN, waiting up to two
// minutes per click to be handed the old rule-based answer anyway -
// on every click, with nothing learned in between - is not a fallback, it is a
// slower way of getting yesterday's result.
//
// So transport failures trip a breaker. A few in a row and we stop calling for a
// cooldown, returning the rules answer immediately. The old way, at the old
// speed, which is the whole point of having one.
//
// !! Only transport failures count. A response we could not parse, or an id list
// !! we could not use, is not evidence that the service is down: opening on
// !! those would let one malformed reply disable the advisor for everyone for
// !! minutes. Those cases fall back individually, and still count as "used: false".
//
// Per process. Every container keeps its own counter, so a multi-container deploy
// has each one trip independently rather than sharing state, and a restarted
// container simply starts over. Both are acceptable; there is no correctness
// dependency on it.
const CIRCUIT_FAILURES_TO_OPEN = 3;
const CIRCUIT_COOLDOWN_MS = 5 * 60_000;

let consecutiveFailures = 0;
let lastFailureAt = 0;

// Why the last real failure happened, kept so the breaker can report it.
//
// The breaker used to record only the time. That made the one failure worth
// reading - the first one, with Gemini's own status, model name and message -
// disappear behind "temporarily unavailable" for the whole cooldown. The
// diagnosis then existed only in the log, so the UI could say the AI was paused
// but never why it was paused, and those two facts point at completely
// different fixes: a rejected key is an operator action, a rate limit is a
// wait, a model 404 is a config change.
//
// lastFailureDetail is Gemini's own error text, which is why it is surfaced on
// the admin card only. It names the status, the models tried and what Google
// objected to; it does not contain the key, but it is more than a student needs
// and more than a student should be shown.
let lastFailureReason = "";
let lastFailureDetail = "";

/** True while Gemini is considered down and the rules answer should be served directly. */
export function advisorCircuitOpen(now = Date.now()) {
  if (consecutiveFailures < CIRCUIT_FAILURES_TO_OPEN) return false;
  return now - lastFailureAt < CIRCUIT_COOLDOWN_MS;
}

/**
 * Everything the breaker knows, for diagnosis.
 *
 * Exported because "is the AI down, and if so why" is a question with one true
 * answer that lives in this module's memory, and nothing outside could answer
 * it. Worth stating plainly: the state is per process, so this describes the
 * container that served the request.
 */
export function advisorCircuitStatus(now = Date.now()) {
  const open = advisorCircuitOpen(now);
  const remaining = open ? Math.max(0, CIRCUIT_COOLDOWN_MS - (now - lastFailureAt)) : 0;
  return {
    open,
    consecutiveFailures,
    lastFailureReason,
    lastFailureDetail,
    retryInMs: remaining,
    failuresToOpen: CIRCUIT_FAILURES_TO_OPEN,
  };
}

function recordAdvisorSuccess() {
  consecutiveFailures = 0;
  lastFailureAt = 0;
  // Cleared on success so a healthy advisor cannot keep reporting a failure that
  // no longer applies. Left behind, it would outlive the thing it describes.
  lastFailureReason = "";
  lastFailureDetail = "";
}

// Exported so the tests can drive the breaker without a network or a bad key.
// The state machine is the unit under test, and a module that owns hidden state
// is only testable by breaking it for real.
export function recordAdvisorFailure(reason = "", detail = "", now = Date.now()) {
  consecutiveFailures += 1;
  lastFailureAt = now;
  lastFailureReason = reason || lastFailureReason;
  lastFailureDetail = detail || lastFailureDetail;
}

/** Clear the breaker. Exported for the tests, and for an operator who has fixed the key. */
export function resetAdvisorCircuit() {
  recordAdvisorSuccess();
}

export function isTeacherAdvisorConfigured() {
  return isGeminiConfigured();
}

/**
 * Turn scored rows into the compact shape the model sees.
 *
 * Only what affects a judgement. Notably NOT sent: email, birth date, contact
 * details, the raw availability rows, or anything personal about the student
 * beyond what the admin already typed as criteria and notes.
 */
function describeCandidates(scored, availability) {
  return scored.map((teacher) => {
    const profile = teacher.profile || {};
    const free = availability?.get(String(teacher.user_id)) || null;
    return {
      id: teacher.user_id,
      name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || `Teacher ${teacher.user_id}`,
      specialization: profile.specialization || [],
      teachingStyle: profile.teachingStyle || [],
      bestStudentPace: profile.idealStudentPace || [],
      experienceYears: profile.experienceYears ?? null,
      // A short excerpt only: the full bio can be long and the matcher already
      // uses it, so there is no reason to send a whole CV's worth of prose.
      bioExcerpt: String(profile.bio || "").slice(0, MAX_BIO_CHARS),
      activeStudents: Number(teacher.assigned_student_count || 0),
      availableAtPreferredTime: free ? Boolean(free.available) : null,
    };
  });
}

function buildSchema(candidateIds) {
  return {
    type: "OBJECT",
    properties: {
      rankedTeacherIds: {
        type: "ARRAY",
        description:
          "Every candidate id, best match first. Must contain each id exactly once and nothing else.",
        items: { type: "STRING", enum: candidateIds },
      },
      reasons: {
        type: "ARRAY",
        description:
          "One entry per teacher worth explaining, best match first. Empty is allowed when the ranking speaks for itself.",
        // A list of {id, text} pairs rather than an object keyed by teacher id.
        //
        // The natural spelling is an object with additionalProperties, which is
        // how OpenAPI says "arbitrary string keys" - and Gemini's Schema type has
        // no such field. It answers a 400 that names the offending path:
        //   Unknown name "additionalProperties" at
        //   'generation_config.response_schema.properties[1].value'
        // and because a 400 means the key was fine and the models answered, that
        // failure looks exactly like a bad model, a bad key or an unreachable
        // API. It is also unrecoverable by retrying: every model in the fallback
        // chain rejects the same payload.
        //
        // This shape is unambiguously supported, and it is stricter - the id is
        // an enum on every item, where a free-form object had no way to say which
        // keys were allowed.
        items: {
          type: "OBJECT",
          properties: {
            teacherId: {
              type: "STRING",
              enum: candidateIds,
              description: "The candidate this explanation is about.",
            },
            reason: {
              type: "STRING",
              description: "One short sentence on why this teacher sits where they do.",
            },
          },
          required: ["teacherId", "reason"],
        },
      },
      summary: {
        type: "STRING",
        description: "One or two sentences describing who best fits this student and why.",
      },
    },
    required: ["rankedTeacherIds", "reasons", "summary"],
  };
}

function buildPrompt({ criteria, trialNotes, courseName, shortlisted, preferredLabel }) {
  const lines = [];
  if (courseName) lines.push(`Course: ${courseName}`);
  if (criteria?.learningGoal?.length) lines.push(`Student's learning goals: ${criteria.learningGoal.join(", ")}`);
  if (criteria?.focusArea?.length) lines.push(`Focus areas: ${criteria.focusArea.join(", ")}`);
  if (criteria?.learningStyle?.length) lines.push(`Preferred learning style: ${criteria.learningStyle.join(", ")}`);
  if (criteria?.pace?.length) lines.push(`Preferred pace: ${criteria.pace.join(", ")}`);
  if (trialNotes) lines.push(`Trial notes: ${String(trialNotes).slice(0, 2000)}`);
  if (preferredLabel) lines.push(`Preferred class time: ${preferredLabel}`);

  return [
    "You are advising which teacher is the best fit for an English student.",
    "",
    "Student:",
    ...lines,
    "",
    "Candidate teachers:",
    ...shortlisted.map((c) =>
      [
        `- id ${c.id} (${c.name})`,
        c.specialization.length ? `  teaches: ${c.specialization.join(", ")}` : "  teaches: (no subjects listed)",
        c.teachingStyle.length ? `  style: ${c.teachingStyle.join(", ")}` : "",
        c.bestStudentPace.length ? `  pace: ${c.bestStudentPace.join(", ")}` : "",
        c.experienceYears != null ? `  experience: ${c.experienceYears} years` : "",
        c.activeStudents ? `  current load: ${c.activeStudents} students` : "  current load: 0 students",
        c.availableAtPreferredTime === true ? "  available at the preferred time" : "",
        c.availableAtPreferredTime === false ? "  NOT available at the preferred time" : "",
        c.bioExcerpt ? `  about: ${c.bioExcerpt}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    ),
    "",
    "Rules:",
    "- Return EVERY id exactly once. Do not add, drop, merge or rename any.",
    "- Judge fit for THIS student: their goals, focus areas, pace and the trial notes.",
    "- A teacher with no listed subjects can still be the best match if the notes suggest it. Say so in your reason.",
    "- Weigh teaching fit above raw experience. A slightly less experienced teacher who specialises in what this student needs beats a generalist.",
    "- Reason about what suits the student, not about workload; workload is handled separately and is not a reason to rank someone low.",
    "- Reasons are one short sentence each, specific to that teacher and student.",
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You rank teachers for an English student based on teaching fit.",
  "You are given a fixed list and must return that same list, reordered.",
].join(" ");

/**
 * Ask the model to rank the candidates.
 *
 * Never throws. Every failure mode resolves to `{ ok: false, reason }` so the
 * caller can fall back to the rules and say so.
 *
 * @returns {Promise<{ok: boolean, order?: string[], reasons?: object, summary?: string, reason?: string, shortlistSize?: number, candidateCount?: number}>}
 */
export async function adviseTeacherRanking({
  criteria = {},
  trialNotes = "",
  courseName = "",
  scored = [],
  availability = null,
  preferredLabel = "",
} = {}) {
  if (!isTeacherAdvisorConfigured()) {
    return { ok: false, reason: "not-configured" };
  }
  if (!scored.length) {
    // Deliberately before the breaker: an academy with no candidates for this
    // course has no call to make, and counting that as a Gemini failure would let
    // an empty teacher list disable the advisor for everyone.
    return { ok: false, reason: "no-candidates" };
  }
  if (advisorCircuitOpen()) {
    // Carries the cause of the failures that opened it. "Paused" on its own is
    // the least actionable sentence in the system: it is equally true of a bad
    // key, an exhausted quota and a model this key cannot reach, and it tells
    // whoever is trying to fix it nothing about which one it is.
    const status = advisorCircuitStatus();
    return {
      ok: false,
      reason: "temporarily-unavailable",
      lastFailureReason: status.lastFailureReason,
      lastFailureDetail: status.lastFailureDetail,
      retryInMs: status.retryInMs,
    };
  }

  const candidateCount = scored.length;
  const shortlisted = describeCandidates(scored.slice(0, MAX_ADVISOR_CANDIDATES), availability);

  try {
    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildPrompt({
                criteria,
                trialNotes,
                courseName,
                shortlisted,
                preferredLabel,
              }),
            },
          ],
        },
      ],
      generationConfig: {
        // Low on purpose: this is a ranking judgement, and consistency between
        // identical requests is worth more than creative phrasing.
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: buildSchema(shortlisted.map((c) => String(c.id))),
      },
    };

    const response = await requestGeminiJson({
      payload,
      timeoutMs: MATCH_REQUEST_TIMEOUT_MS,
      timeoutMessage: "The advisor took too long to rank the teachers.",
      label: "Gemini teacher advisor",
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) return { ok: false, reason: "unreadable", shortlistSize: shortlisted.length, candidateCount };

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "unreadable", shortlistSize: shortlisted.length, candidateCount };
    }

    const allowed = new Set(shortlisted.map((c) => String(c.id)));
    const seen = new Set();
    const order = [];
    for (const raw of Array.isArray(parsed?.rankedTeacherIds) ? parsed.rankedTeacherIds : []) {
      const id = String(raw);
      // Belt and braces: the schema's enum should prevent this, but an id we did
      // not offer is dropped rather than trusted.
      if (!allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }

    // An order that covers none of the list is worse than no order at all.
    if (!order.length) {
      return { ok: false, reason: "unusable-order", shortlistSize: shortlisted.length, candidateCount };
    }

    // Reasons are the admin's only account of WHY, so keep only ones we can
    // attribute to a real candidate.
    //
    // Read as a list of {teacherId, reason} pairs and flattened back into a map
    // keyed by id, because that is the shape every caller already reads. The
    // enum is enforced per item by the schema; this drops anything that slipped
    // past it rather than trusting it.
    const reasons = {};
    for (const item of Array.isArray(parsed?.reasons) ? parsed.reasons : []) {
      const id = String(item?.teacherId ?? "");
      const text2 = String(item?.reason || "").trim();
      if (allowed.has(id) && text2) {
        reasons[id] = text2.slice(0, 240);
      }
    }

    recordAdvisorSuccess();
    return {
      ok: true,
      order,
      reasons,
      summary: String(parsed?.summary || "").trim().slice(0, 400),
      shortlistSize: shortlisted.length,
      candidateCount,
      // True when the academy is bigger than the cap, so the admin can be told the
      // model only saw a shortlist rather than everyone.
      shortlisted: candidateCount > shortlisted.length,
    };
  } catch (err) {
    // The only place that trips the breaker. Reaching here means the call itself
    // did not work, as opposed to the call working and us not liking the answer.
    const reason = /not configured/i.test(err.message)
      ? "not-configured"
      : /api key/i.test(err.message)
        ? "bad-key"
        : /rate limit/i.test(err.message)
          ? "rate-limited"
          : /too long/i.test(err.message)
            ? "timed-out"
            : "unavailable";
    // Gemini's own message goes to the breaker as well as the log, so the next
    // request that arrives while the breaker is open can still say why.
    recordAdvisorFailure(reason, err.message);
    return { ok: false, reason, detail: err.message, candidateCount };
  }
}
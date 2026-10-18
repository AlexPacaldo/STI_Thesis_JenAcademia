/**
 * Who a student's contract request would match, before they send it.
 *
 * The same wording rules as the admin's card, because they describe the same run
 * of the same matcher - "5 of the 8 criteria covered" means the same thing in both
 * places and must not read as two different numbers.
 *
 * What is deliberately absent: workload fallbacks, profile-completion state and
 * balance-limit warnings. Those are things an admin weighs to make a decision and a
 * student has no use for, and two of them are about other students' loads.
 *
 * Read-only by construction: it renders whatever /api/student/contract-match-preview
 * returns, and that endpoint assigns nothing. Saying so on the card matters - a
 * preview that reads like a booking would send the request expecting something
 * that has not happened.
 */
/**
 * Why the AI did not contribute, in words a student can act on.
 *
 * The backend already distinguishes these (teacherAdvisor.js), but until now the
 * card collapsed all of them into "could not be reached", which is the least
 * useful sentence in the file: it is true of a bad API key, a rate limit, a
 * timeout, a retired model and an open circuit breaker, and each needs a
 * different response. The one thing a student can do about all of them is send
 * the request anyway, so the wording says that first and explains second.
 *
 * Unknown reasons fall through to the general line rather than being dropped -
 * a new reason from the backend must not leave the card claiming the AI worked.
 */
const ADVISOR_UNAVAILABLE = {
  "not-configured": "The AI is not set up on this server, so this is the rule-based match only.",
  "bad-key": "The AI could not be reached because its API key was rejected. This is a rule-based match.",
  "rate-limited": "The AI is being rate limited right now, so this is the rule-based match. Try again in a moment for the full one.",
  "timed-out": "The AI took too long to answer, so this is the rule-based match. Try again in a moment.",
  "temporarily-unavailable":
    "The AI paused itself after repeated failures, so this is the rule-based match. It will come back on its own shortly.",
  "no-candidates": "There were no teachers to compare, so this is a rule-based match.",
  unreadable: "The AI answered in a form this could not read, so this is the rule-based match.",
  "unusable-order": "The AI did not return a usable ranking, so this is the rule-based match.",
};

function describeAdvisorUnavailable(advisor) {
  if (!advisor) return "The AI did not contribute to this match, so it is rule-based only.";
  if (!advisor.configured) return "The AI is not set up on this server, so this is the rule-based match only.";

  const specific = ADVISOR_UNAVAILABLE[advisor.reason];
  return (
    specific ||
    "The AI could not be reached for this request, so this is the rule-based match only."
  );
}

export default function MatchPreviewCard({ preview }) {
  if (!preview) return null;

  if (!preview.teacher) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "11px 13px",
          border: "1px solid #e0b4b4",
          borderRadius: 10,
          background: "#fdf6f6",
          color: "#8c2020",
          fontSize: "0.88em",
          lineHeight: 1.5,
        }}
      >
        <strong>Nobody matches this course yet.</strong>{" "}
        {preview.noTeacherReason === "no-teachers"
          ? "There are no active teachers to match against."
          : "No active teacher currently teaches this course."}{" "}
        You can still send the request - the admin will arrange a teacher.
      </div>
    );
  }

  const { teacher, matchStrength, advisor, availabilityConflict, availabilityReason, preferredScheduleEvaluated } = preview;

  const strength = {
    strong: { bg: "#eef5f0", border: "#a9c9b4", text: "#2f5a43", label: "Strong match" },
    partial: { bg: "#fdf6e8", border: "#e0c98a", text: "#7a5a10", label: "Partial match" },
    weak: { bg: "#fdf1f1", border: "#e0b0b0", text: "#8c2020", label: "Closest available, not a strong match" },
    unknown: { bg: "#f4f6f5", border: "#d0d7d3", text: "#4a5a52", label: "No criteria set yet" },
  }[matchStrength?.level] || { bg: "#f4f6f5", border: "#d0d7d3", text: "#4a5a52", label: "Match" };

  return (
    <div
      style={{
        marginTop: 10,
        padding: 13,
        border: `1px solid ${strength.border}`,
        borderRadius: 10,
        background: strength.bg,
        display: "grid",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ color: strength.text, fontSize: "1.02em" }}>
          {teacher.first_name} {teacher.last_name}
        </strong>
        <span style={{ fontSize: "0.85em", color: strength.text }}>{strength.label}</span>
      </div>

      {matchStrength?.total > 0 && matchStrength.level !== "strong" && (
        <p style={{ margin: 0, fontSize: "0.86em", color: strength.text, lineHeight: 1.5 }}>
          {matchStrength.matched} of the {matchStrength.total} criteria you set are covered by
          this teacher.
        </p>
      )}

      {advisor?.used && advisor.summary && (
        <p style={{ margin: 0, fontSize: "0.86em", color: strength.text, lineHeight: 1.5 }}>
          {advisor.summary}
        </p>
      )}

      {advisor?.used && advisor.reasons?.[String(teacher.user_id)] && (
        <p style={{ margin: 0, fontSize: "0.86em", color: strength.text, lineHeight: 1.5 }}>
          {advisor.reasons[String(teacher.user_id)]}
        </p>
      )}

      {/* Said whether or not the AI ran, and why not when it didn't. A quiet
          model, a rejected key and an open circuit breaker all look the same
          from the outside, and the student cannot tell whether to try again or
          whether anyone needs to fix something. Neither can the admin from the
          same message - which is why this says the specific thing. */}
      {!advisor?.used && (
        <p style={{ margin: 0, fontSize: "0.84em", color: "#6b7d73", lineHeight: 1.5 }}>
          {describeAdvisorUnavailable(advisor)}
        </p>
      )}

      {teacher.reasons?.length > 0 && (
        <p style={{ margin: 0, fontSize: "0.82em", color: "#6b7d73" }}>
          Rule scores: {teacher.reasons.join(", ")}
        </p>
      )}

      {preferredScheduleEvaluated && (
        <p style={{ margin: 0, fontSize: "0.84em", color: availabilityConflict ? "#8c2020" : "#2f5a43", lineHeight: 1.5 }}>
          {availabilityConflict
            ? `Not free then - ${availabilityReason || "their availability does not cover it"}.`
            : "Free at the times you chose."}
        </p>
      )}

      <p style={{ margin: "2px 0 0", fontSize: "0.8em", color: "#6b7d73", lineHeight: 1.45 }}>
        This is who would most likely be matched. Nothing is assigned yet - the
        admin reviews your request and decides.
      </p>
    </div>
  );
}

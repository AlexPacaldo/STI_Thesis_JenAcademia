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

      {/* Said whether or not the AI ran. A quiet model and a broken one look
          identical from the outside, and the student should not have to guess
          which produced the answer they are looking at. */}
      {!advisor?.used && (
        <p style={{ margin: 0, fontSize: "0.84em", color: "#6b7d73", lineHeight: 1.5 }}>
          {advisor?.configured
            ? "The AI could not be reached, so this is the rule-based match only."
            : "No AI key is configured, so this is the rule-based match only."}
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

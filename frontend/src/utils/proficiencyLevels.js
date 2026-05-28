export const PROFICIENCY_LEVEL_OPTIONS = [
  ["novice-low", "Novice Low"],
  ["novice-mid", "Novice Mid"],
  ["novice-high", "Novice High"],
  ["intermediate-low", "Intermediate Low"],
  ["intermediate-mid", "Intermediate Mid"],
  ["intermediate-high", "Intermediate High"],
  ["advanced", "Advanced (Fluent)"],
];

export function formatProficiencyLevel(value) {
  return PROFICIENCY_LEVEL_OPTIONS.find(([level]) => level === value)?.[1] || value || "No level";
}

// Collapse only presentation rows. Keep every student's booking in the cache
// for attendance, permissions, contract balances, and conflict checks.
export function groupClassesForDisplay(classes) {
  const result = [];
  const groups = new Map();
  for (const entry of classes) {
    if (entry.is_group_hold) continue;
    if (!entry.group_session_id) { result.push(entry); continue; }
    const key = `${entry.group_session_id}|${entry.scheduled_date}`;
    let group = groups.get(key);
    if (!group) {
      group = { ...entry, groupParticipants: [], groupNames: [] };
      groups.set(key, group); result.push(group);
    }
    group.groupParticipants.push(entry);
    group.groupNames.push(entry.studentFullName || entry.studentName || entry.student_name || "Student");
    group.studentName = group.groupNames.join(" + ");
    group.studentFullName = group.studentName;
    group.className = `Group class - ${entry.class_name || entry.className || "Lesson"}`;
  }
  return result;
}

import assert from "node:assert/strict";
import { groupClassesForDisplay } from "../frontend/src/utils/groupClasses.js";

const classes = [
  { id: 1, group_session_id: 10, scheduled_date: "2026-11-15", studentName: "Grace", class_name: "English" },
  { id: 2, group_session_id: 10, scheduled_date: "2026-11-15", studentName: "Shannon", class_name: "English" },
  { id: 3, scheduled_date: "2026-11-15", studentName: "Another student" },
  { id: "group-hold-5", is_group_hold: true },
];
const before = structuredClone(classes);
const display = groupClassesForDisplay(classes);
assert.equal(display.length, 2);
assert.equal(display[0].studentName, "Grace + Shannon");
assert.equal(display[0].groupParticipants.length, 2);
assert.equal(display[1].id, 3);
assert.deepEqual(classes, before);
console.log("Teacher calendar groups shared sessions once while preserving all participant records and hiding temporary holds.");

import assert from "node:assert/strict";
import {
  STUDENTS,
  TEACHERS,
  validateDemoAccounts,
} from "./beta-accounts.mjs";
import {
  STUDENTS as DEMO_STUDENTS,
  TEACHERS as DEMO_TEACHERS,
} from "./demo-accounts.mjs";

assert.equal(TEACHERS.length - DEMO_TEACHERS.length, 5);
assert.equal(STUDENTS.length - DEMO_STUDENTS.length, 20);
assert.deepEqual(validateDemoAccounts(), []);
assert.equal(new Set(TEACHERS.map((teacher) => teacher.email)).size, TEACHERS.length);
assert.equal(new Set(STUDENTS.map((student) => student.email)).size, STUDENTS.length);

console.log("Beta seed data is valid: 5 additional teachers and 20 additional students.");

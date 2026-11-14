import test from "node:test";
import assert from "node:assert/strict";
import {
  getAssignmentUploadError,
  MAX_ASSIGNMENT_FILES,
  MAX_ASSIGNMENT_FILE_BYTES,
  MAX_ASSIGNMENT_TOTAL_BYTES,
} from "./assignmentUploadLimits.js";

test("assignment uploads accept files at the individual and total size limits", () => {
  assert.equal(getAssignmentUploadError([
    { size: MAX_ASSIGNMENT_FILE_BYTES },
    { size: MAX_ASSIGNMENT_FILE_BYTES },
    { size: MAX_ASSIGNMENT_TOTAL_BYTES - 2 * MAX_ASSIGNMENT_FILE_BYTES },
  ]), "");
});

test("assignment uploads reject too many files, an oversized file, and an oversized total", () => {
  assert.match(
    getAssignmentUploadError(Array.from({ length: MAX_ASSIGNMENT_FILES + 1 }, () => ({ size: 1 }))),
    /no more than 5 files/
  );
  assert.match(getAssignmentUploadError([{ size: MAX_ASSIGNMENT_FILE_BYTES + 1 }]), /10 MiB/);
  assert.match(
    getAssignmentUploadError(Array.from({ length: 3 }, () => ({ size: 9 * 1024 * 1024 }))),
    /25 MiB/
  );
});

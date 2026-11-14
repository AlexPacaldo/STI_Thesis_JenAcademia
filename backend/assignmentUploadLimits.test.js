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
    { name: "work.pdf", size: MAX_ASSIGNMENT_FILE_BYTES },
    { name: "slides.pptx", size: MAX_ASSIGNMENT_FILE_BYTES },
    { name: "notes.txt", size: MAX_ASSIGNMENT_TOTAL_BYTES - 2 * MAX_ASSIGNMENT_FILE_BYTES },
  ]), "");
});

test("assignment uploads accept approved types and reject unapproved extensions", () => {
  for (const name of [
    "work.pdf",
    "essay.docx",
    "notes.rtf",
    "spreadsheet.xlsx",
    "slides.ppt",
    "photo.png",
    "voice.m4a",
    "lesson.webm",
  ]) {
    assert.equal(getAssignmentUploadError([{ name, size: 1 }]), "");
  }

  assert.match(
    getAssignmentUploadError([{ name: "program.exe", size: 1 }]),
    /Unsupported file type/
  );
});

test("assignment uploads reject too many files, an oversized file, and an oversized total", () => {
  assert.match(
    getAssignmentUploadError(
      Array.from({ length: MAX_ASSIGNMENT_FILES + 1 }, () => ({ name: "file.pdf", size: 1 }))
    ),
    /no more than 5 files/
  );
  assert.match(
    getAssignmentUploadError([{ name: "file.pdf", size: MAX_ASSIGNMENT_FILE_BYTES + 1 }]),
    /10 MiB/
  );
  assert.match(
    getAssignmentUploadError(
      Array.from({ length: 3 }, () => ({ name: "file.pdf", size: 9 * 1024 * 1024 }))
    ),
    /25 MiB/
  );
});

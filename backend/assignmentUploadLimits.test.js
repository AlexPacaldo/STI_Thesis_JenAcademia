import test from "node:test";
import assert from "node:assert/strict";
import {
  getAssignmentUploadError,
  MAX_ASSIGNMENT_TOTAL_BYTES,
} from "./assignmentUploadLimits.js";

test("assignment uploads accept files at the individual and total size limits", () => {
  assert.equal(getAssignmentUploadError([
    { name: "work.pdf", size: 40 * 1024 * 1024 },
    { name: "slides.pptx", size: 30 * 1024 * 1024 },
    { name: "notes.txt", size: 30 * 1024 * 1024 },
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

test("assignment uploads enforce only the 100 MB total size limit", () => {
  assert.equal(MAX_ASSIGNMENT_TOTAL_BYTES, 100 * 1024 * 1024);
  assert.equal(getAssignmentUploadError(Array.from(
    { length: 12 },
    (_, index) => ({ name: `file-${index}.pdf`, size: 1024 * 1024 })
  )), "");
  assert.match(
    getAssignmentUploadError([{ name: "large.pdf", size: MAX_ASSIGNMENT_TOTAL_BYTES + 1 }]),
    /100 MB/
  );
});

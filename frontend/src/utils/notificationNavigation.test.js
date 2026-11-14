import test from "node:test";
import assert from "node:assert/strict";
import { getNotificationTargetUrl } from "./notificationNavigation.js";

test("assignment notifications route to the page for the recipient role", () => {
  assert.equal(
    getNotificationTargetUrl(
      { type: "assignment", related_id: 93 },
      "student",
      "http://localhost:5173"
    ),
    "/assignmentsDropbox?assignmentId=93"
  );
  assert.equal(
    getNotificationTargetUrl(
      { type: "assignment", related_id: 93 },
      "teacher",
      "http://localhost:5173"
    ),
    "/teacherAssignment"
  );
});

test("saved absolute action URLs resolve to the current app origin", () => {
  assert.equal(
    getNotificationTargetUrl(
      { action_url: "https://old.example/Calendar?classId=12" },
      "student",
      "http://localhost:5173"
    ),
    "/Calendar?classId=12"
  );
});

test("notifications without a usable action use their related entity route", () => {
  assert.equal(
    getNotificationTargetUrl(
      { related_type: "book", related_id: 27 },
      "teacher",
      "http://localhost:5173"
    ),
    "/teacherBooksLessons/27"
  );
  assert.equal(
    getNotificationTargetUrl(
      { action_url: "javascript:alert(1)", related_type: "class", related_id: 8 },
      "student",
      "http://localhost:5173"
    ),
    "/Calendar?classId=8"
  );
});

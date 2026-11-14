import test from "node:test";
import assert from "node:assert/strict";
import { getNotificationTargetUrl } from "./notificationNavigation.js";

test("legacy teacher availability notices open availability rather than an empty class list", () => {
  assert.equal(getNotificationTargetUrl({ related_type: "teacher_availability", related_id: 8, action_url: "/Calendar" }, "student", "http://localhost:5173"),
    "/Calendar?view=availability&availabilityId=8");
  assert.equal(getNotificationTargetUrl({ related_type: "teacher_availability" }, "student", "http://localhost:5173"),
    "/Calendar?view=availability");
});

test("new availability notices preserve the saved schedule destination", () => {
  const path = "/Calendar?view=availability&availabilityDate=2026-12-01";
  assert.equal(getNotificationTargetUrl({ related_type: "teacher_availability", action_url: path }, "student", "http://localhost:5173"), path);
});

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

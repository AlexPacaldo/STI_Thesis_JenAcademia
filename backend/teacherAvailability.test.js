import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAvailability } from "./teacherMatching.js";

const monday = "2026-10-26";
const morningAvailability = {
  available_date: monday,
  status: "available",
  start_time: "08:00",
  end_time: "09:00",
};

test("a class fits when teacher availability overlaps a preferred period", () => {
  const result = evaluateAvailability({
    dates: [monday],
    days: ["1"],
    start: "06:00",
    end: "12:00",
    duration: 50,
    rows: [morningAvailability],
  });

  assert.equal(result.evaluated, true);
  assert.equal(result.available, true);
});

test("preferred-period matching accounts for duration and existing classes", () => {
  const input = {
    dates: [monday],
    days: ["1"],
    start: "06:00",
    end: "12:00",
    rows: [morningAvailability],
    bookings: [{ date: monday, start_time: "08:00", end_time: "08:30" }],
  };

  assert.equal(evaluateAvailability({ ...input, duration: 50 }).available, false);
  assert.equal(evaluateAvailability({ ...input, duration: 25 }).available, true);
});

test("preferred-period matching does not schedule a class over a teacher break", () => {
  const result = evaluateAvailability({
    dates: [monday],
    days: ["1"],
    start: "06:00",
    end: "12:00",
    duration: 50,
    rows: [{ ...morningAvailability, break_start: "08:30", break_end: "08:45" }],
  });

  assert.equal(result.available, false);
});

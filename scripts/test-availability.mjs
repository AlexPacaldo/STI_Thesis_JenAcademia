/**
 * Tests for the availability preference and the manual-teacher override.
 *
 *   node scripts/test-availability.mjs
 *
 * Availability is resolved against teacher_availability, which is per DATE
 * rather than a repeating weekly pattern, so these use real upcoming dates and
 * assert on which of them work.
 */
import {
  AVAILABILITY_HORIZON_DAYS,
  evaluateAvailability,
  normalizePreferredDays,
  rankTeachers,
  selectTeacherFromRanking,
  preferAvailable,
  applyAdvisorOrder,
  TEACHER_BALANCE_LIMIT,
  toMinutes,
  weekdayOf,
} from "../backend/teacherMatching.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected: ${e}\n    actual:   ${a}`);
}

/* ------------------------------------------------------------- date helpers */

// 2026-01-05 is a Monday, so the week's weekdays are known exactly.
check("weekday of a known Monday", weekdayOf("2026-01-05"), 1);
check("weekday of a known Sunday", weekdayOf("2026-01-04"), 0);
check("weekday of a malformed date", weekdayOf("nope"), null);

check("toMinutes parses HH:MM", toMinutes("18:30"), 1110);
check("toMinutes tolerates seconds", toMinutes("18:30:00"), 1110);
check("toMinutes of empty", toMinutes(""), null);
check("toMinutes of null", toMinutes(null), null);
check("toMinutes of junk", toMinutes("half past six"), null);

check("days from numbers", [...normalizePreferredDays([1, 3])], [1, 3]);
check("days from names", [...normalizePreferredDays(["Monday", "thu"])], [1, 4]);
check("days deduplicated", [...normalizePreferredDays([1, "mon", "Monday"])], [1]);
check("unknown days dropped", [...normalizePreferredDays(["someday", 9, 2])], [2]);

/* ------------------------------------- no preference means no behaviour change */

const noPreference = evaluateAvailability({ rows: [], bookings: [], dates: [], days: [], start: null, end: null });
check("no days is not evaluated", noPreference.evaluated, false);
check("no days leaves availability unknown", noPreference.available, null);

const partial = evaluateAvailability({ days: [1], start: "18:00", end: "", dates: ["2026-01-05"] });
check("a half-specified slot is not evaluated", partial.evaluated, false);

/* ------------------------------------------------ available vs unavailable */

// The teacher's availability covers Monday 09:00-17:00 with a 12:00-13:00 break.
const openSlot = {
  available_date: "2026-01-05",
  status: "available",
  start_time: "09:00:00",
  end_time: "17:00:00",
  break_start: "12:00:00",
  break_end: "13:00:00",
};

const available = evaluateAvailability({
  rows: [openSlot],
  bookings: [],
  dates: ["2026-01-05"],
  days: ["monday"],
  start: "14:00",
  end: "15:00",
});
check("an in-hours slot is available", available.available, true);
check("and the working date is reported", available.matchingDates, ["2026-01-05"]);
check("no reason when it works", available.reason, "");

// Same teacher, 18:00-19:00, which is past their end_time.
const outOfHours = evaluateAvailability({
  rows: [openSlot],
  bookings: [],
  dates: ["2026-01-05"],
  days: ["monday"],
  start: "18:00",
  end: "19:00",
});
check("outside their hours is unavailable", outOfHours.available, false);
check("and says so", outOfHours.reason, "their available hours do not cover that time");

// Inside the break.
const duringBreak = evaluateAvailability({
  rows: [openSlot],
  bookings: [],
  dates: ["2026-01-05"],
  days: ["monday"],
  start: "12:15",
  end: "12:45",
});
check("a slot inside the break is unavailable", duringBreak.available, false);
check("and names the break", duringBreak.reason, "that time falls in their break");

// Marked unavailable that day.
const markedOff = evaluateAvailability({
  rows: [{ ...openSlot, status: "unavailable" }],
  bookings: [],
  dates: ["2026-01-05"],
  days: ["monday"],
  start: "14:00",
  end: "15:00",
});
check("a day marked unavailable is unavailable", markedOff.available, false);
check("and says they marked it", markedOff.reason, "they marked that day unavailable");

// No row for that date at all.
const noRow = evaluateAvailability({
  rows: [],
  bookings: [],
  dates: ["2026-01-05"],
  days: ["monday"],
  start: "14:00",
  end: "15:00",
});
check("an unmarked day is unavailable", noRow.available, false);
check("and says it is unmarked", noRow.reason, "they have not marked that day available");

// Already booked.
const booked = evaluateAvailability({
  rows: [openSlot],
  bookings: [{ date: "2026-01-05", start_time: "14:00:00", end_time: "15:00:00" }],
  dates: ["2026-01-05"],
  days: ["monday"],
  start: "14:00",
  end: "15:00",
});
check("a booked collision is unavailable", booked.available, false);
check("and says they are booked", booked.reason, "they already have a class booked then");

// A class that ends exactly when the preferred slot starts is not a collision.
const touching = evaluateAvailability({
  rows: [openSlot],
  bookings: [{ date: "2026-01-05", start_time: "13:00:00", end_time: "14:00:00" }],
  dates: ["2026-01-05"],
  days: ["monday"],
  start: "14:00",
  end: "15:00",
});
check("a back-to-back class is not a collision", touching.available, true);

// The preference is for Tuesday but they only marked Monday.
const wrongDay = evaluateAvailability({
  rows: [openSlot],
  bookings: [],
  dates: ["2026-01-05"],
  days: ["tuesday"],
  start: "14:00",
  end: "15:00",
});
check("availability on another weekday does not count", wrongDay.available, false);

// Three Mondays marked available, the middle one already booked: one free
// occurrence in the window is enough, and only the free dates are listed.
const oneOfSeveral = evaluateAvailability({
  rows: [
    { ...openSlot, available_date: "2026-01-05" },
    { ...openSlot, available_date: "2026-01-12" },
    { ...openSlot, available_date: "2026-01-19" },
  ],
  bookings: [{ date: "2026-01-12", start_time: "14:00:00", end_time: "15:00:00" }],
  dates: ["2026-01-05", "2026-01-12", "2026-01-19"],
  days: ["monday"],
  start: "14:00",
  end: "15:00",
});
check("one free occurrence in the window is enough", oneOfSeveral.available, true);
check("and only the free dates are listed", oneOfSeveral.matchingDates, ["2026-01-05", "2026-01-19"]);

// Availability is per DATE: marking one Monday does not make every Monday work.
const oneDateOnly = evaluateAvailability({
  rows: [openSlot],
  bookings: [],
  dates: ["2026-01-05", "2026-01-12", "2026-01-19"],
  days: ["monday"],
  start: "14:00",
  end: "15:00",
});
check("a date that was never marked is not assumed free", oneDateOnly.matchingDates, ["2026-01-05"]);

// A whole-day slot (no times recorded) covers anything.
const wholeDay = evaluateAvailability({
  rows: [{ available_date: "2026-01-05", status: "available", start_time: null, end_time: null }],
  bookings: [],
  dates: ["2026-01-05"],
  days: ["monday"],
  start: "22:00",
  end: "23:00",
});
check("an untimed slot covers the whole day", wholeDay.available, true);

check("horizon spans three weeks", AVAILABILITY_HORIZON_DAYS >= 14, true);

/* ------------------------------------------------- availability in ranking */

const free = { user_id: 1, first_name: "Free", last_name: "Tutor", score: 10, assigned_student_count: 5 };
const busy = { user_id: 2, first_name: "Busy", last_name: "Tutor", score: 40, assigned_student_count: 0 };
const availabilityMap = new Map([
  ["1", { evaluated: true, available: true, matchingDates: [], reason: "" }],
  ["2", { evaluated: true, available: false, matchingDates: [], reason: "they have a class then" }],
]);

// Availability is a constraint applied AFTER whatever produced the order, so the
// two steps are deliberately separate: rankTeachers scores, preferAvailable
// partitions. Folding availability into the sort would make it look like a
// teaching-quality signal, which it is not.
const scoredOrder = rankTeachers([busy, free]);
check("the rules order by score", scoredOrder[0].user_id, 2);

const availabilityRanked = preferAvailable(scoredOrder, availabilityMap);
check("an available teacher is moved ahead of a better-scored unavailable one", availabilityRanked[0].user_id, 1);
check("the partition is stable", availabilityRanked.map((t) => t.user_id), [1, 2]);

// Inside the available group the rules order still decides.
const twoFree = preferAvailable(rankTeachers([
  { user_id: 1, score: 5, assigned_student_count: 0 },
  { user_id: 2, score: 50, assigned_student_count: 0 },
]), new Map([["1", { available: true }], ["2", { available: true }]]));
check("scores still order within the available group", twoFree[0].user_id, 2);

// No map, or an unevaluated entry: identical to before.
check("no availability map leaves the order alone", preferAvailable(scoredOrder, null).map((t) => t.user_id), [2, 1]);
check("omitting the map returns the same order", preferAvailable(scoredOrder).map((t) => t.user_id), [2, 1]);
const unevaluated = preferAvailable(scoredOrder, new Map([
  ["1", { evaluated: false, available: null }],
  ["2", { evaluated: false, available: null }],
]));
check("an unevaluated teacher is not treated as unavailable", unevaluated[0].user_id, 2);

/* ------------------------------------------------- advisor ordering the rules */

// The advisor may reorder the list we gave it, and only that list.
const advisorList = [
  { user_id: 30, score: 90 },
  { user_id: 31, score: 80 },
  { user_id: 32, score: 70 },
];
check("the advisor's order is applied", applyAdvisorOrder(advisorList, ["32", "30", "31"]).map((t) => t.user_id), [32, 30, 31]);
check("unmentioned teachers keep our order, after the mentioned ones", applyAdvisorOrder(advisorList, ["31"]).map((t) => t.user_id), [31, 30, 32]);
check("an id we never offered is ignored", applyAdvisorOrder(advisorList, ["999", "31"]).map((t) => t.user_id), [31, 30, 32]);
check("an empty order is a no-op", applyAdvisorOrder(advisorList, []).map((t) => t.user_id), [30, 31, 32]);
check("an absent order is a no-op", applyAdvisorOrder(advisorList).map((t) => t.user_id), [30, 31, 32]);
check("a duplicate id does not reorder twice", applyAdvisorOrder(advisorList, ["32", "32", "31"]).map((t) => t.user_id), [32, 31, 30]);

// Availability still wins over the advisor: a model that puts an unavailable
// teacher first does not get to keep them there.
const advisorPickedBusy = applyAdvisorOrder(rankTeachers([
  { user_id: 1, score: 5, assigned_student_count: 0 },
  { user_id: 2, score: 90, assigned_student_count: 0 },
]), ["2", "1"]);
check("the advisor can put an unavailable teacher first", advisorPickedBusy[0].user_id, 2);
check("but availability still moves them back", preferAvailable(advisorPickedBusy, availabilityMap).map((t) => t.user_id), [1, 2]);

/* -------------------------------------------- manual pick vs the balance limit */

const atTwo = { user_id: 10, score: 30, assigned_student_count: 2 };
const atOne = { user_id: 11, score: 90, assigned_student_count: 1 };
const rankedForOverride = rankTeachers([atTwo, atOne]);

// Today's behaviour, kept for the automatic paths and the contract flow.
const autoPick = selectTeacherFromRanking(rankedForOverride, "10");
check("by default an over-limit manual pick is discarded", autoPick.assigned.user_id, 11);
check("and it is not flagged as honoured", autoPick.preferredHonouredOverLimit, false);

// The admin's explicit choice wins.
const manualPick = selectTeacherFromRanking(rankedForOverride, "10", { honourPreferred: true });
check("an explicit pick is honoured over the limit", manualPick.assigned.user_id, 10);
check("and the override is reported for a warning", manualPick.preferredHonouredOverLimit, true);

// A manual pick under the limit behaves the same either way.
check("a pick under the limit is honoured by default", selectTeacherFromRanking(rankedForOverride, "11").assigned.user_id, 11);
check("and is not flagged", selectTeacherFromRanking(rankedForOverride, "11", { honourPreferred: true }).preferredHonouredOverLimit, false);

// The limit still governs the automatic match.
const allFull = rankTeachers([
  { user_id: 20, score: 10, assigned_student_count: TEACHER_BALANCE_LIMIT },
  { user_id: 21, score: 5, assigned_student_count: TEACHER_BALANCE_LIMIT + 3 },
]);
check("the automatic pick still avoids an at-limit teacher", selectTeacherFromRanking(allFull, null).assigned.user_id, 20);
check("but still returns one", selectTeacherFromRanking(allFull, null).assigned !== null, true);

// An unknown preferred id cannot be honoured - it is not in the pool.
const unknownPick = selectTeacherFromRanking(rankedForOverride, "999", { honourPreferred: true });
check("an unknown teacher id falls back to the automatic pick", unknownPick.assigned.user_id, 11);

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("All good.");
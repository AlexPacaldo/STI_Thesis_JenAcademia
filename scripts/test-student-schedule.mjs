/**
 * Tests for the dates on the student's simple page.
 *
 *   node scripts/test-student-schedule.mjs
 *
 * !! A student reads "TODAY" and "3:00 PM" and nothing else. If the day
 * !! label is wrong, every date on the page is wrong, and it is wrong
 * !! quietly - a student reads "Tuesday" for yesterday and books a class for
 * !! a day that has already happened.
 */

import {
  SIMPLE_DAY_CHOICES,
  addDaysToDateKey,
  bookingWindowEndKey,
  buildDayChoices,
  buildMonthDayChoices,
  canStepMonth,
  dateKeyToLocalDate,
  daysBetween,
  describeClassDay,
  expiryToDateKey,
  monthBoundsForRange,
  monthKey,
} from "../frontend/src/utils/studentSchedule.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

/* -------------------------------------------------------------- the keys */

check("adding days moves forward", addDaysToDateKey("2026-10-20", 1), "2026-10-21");
check("adding days moves back", addDaysToDateKey("2026-10-20", -1), "2026-10-19");
check("adding a month crosses the boundary", addDaysToDateKey("2026-10-31", 1), "2026-11-01");
check("adding a year crosses the boundary", addDaysToDateKey("2026-12-31", 1), "2027-01-01");
check("adding nothing changes nothing", addDaysToDateKey("2026-10-20", 0), "2026-10-20");
check("rubbish in is rubbish out", addDaysToDateKey("nonsense", 1), "");
check("empty in is empty out", addDaysToDateKey("", 1), "");

check("a key is a date", dateKeyToLocalDate("2026-10-20") instanceof Date, true);
check("on the right day", dateKeyToLocalDate("2026-10-20").getDate(), 20);
check("in the right month", dateKeyToLocalDate("2026-10-20").getMonth(), 9);
check("rubbish is not a date", dateKeyToLocalDate("nonsense"), null);

/* --------------------------------------------------------- the day strip */

const days = buildDayChoices({ todayKey: "2026-10-20" });

check("the strip has fourteen days", days.length, SIMPLE_DAY_CHOICES);
check("the first day is today", days[0].key, "2026-10-20");
check("and it says so", days[0].weekday, "Today");
check("the second day is tomorrow", days[1].key, "2026-10-21");
check("and it says so", days[1].weekday, "Tomorrow");
// The third day is a weekday, and it is the right one. Checked against the
// date rather than a hard-coded word, so the test still means something in a
// month whose weekdays are different.
const third = dateKeyToLocalDate(days[2].key);
check(
  "the third day is the weekday it should be",
  days[2].weekday,
  third.toLocaleDateString("en-US", { weekday: "short" })
);
check("every day has a number", days.every((day) => Number.isFinite(day.dayNumber)), true);
check("every day has a month", days.every((day) => typeof day.month === "string" && day.month.length > 0), true);
check("the days are in order", days.map((d) => d.key), [...days.map((d) => d.key)].sort());

// The strip stops at the end of the booking window. A student must not be
// able to pick a day their teacher cannot teach in.
const limited = buildDayChoices({ todayKey: "2026-10-20", endKey: "2026-10-25" });
check("the strip stops at the window", limited.length, 6);
check("and the last day is the last one allowed", limited[limited.length - 1].key, "2026-10-25");

check("no today means no days", buildDayChoices({}), []);
check("a broken today means no days", buildDayChoices({ todayKey: "nonsense" }).length, 0);

/* -------------------------------------------------------- the class label */

check("today is TODAY", describeClassDay({ viewerDate: "2026-10-20", todayKey: "2026-10-20", tomorrowKey: "2026-10-21" }), "TODAY");
check("tomorrow is TOMORROW", describeClassDay({ viewerDate: "2026-10-21", todayKey: "2026-10-20", tomorrowKey: "2026-10-21" }), "TOMORROW");
check("no date is YOUR CLASS", describeClassDay({}), "YOUR CLASS");

const later = describeClassDay({ viewerDate: "2026-10-25", todayKey: "2026-10-20", tomorrowKey: "2026-10-21" });
check("a later day is spelled out", later.includes("25"), true);
check("and it is in capitals", later, later.toUpperCase());

/* -------------------------------------------------- the days of a month */

// !! The teacher's availability manager is a window now, so the days it
// !! offers have to come with it - the month grid it used to be clicked
// !! against is behind the window. These are the days it offers, and a day
// !! the teacher cannot set availability on must not be in the list.

const monthDays = buildMonthDayChoices({
  year: 2026,
  month: 9, // October
  todayKey: "2026-10-20",
  endKey: "2026-10-31",
});

check("the month offers the days left in it", monthDays.length, 12);
check("starting with today", monthDays[0].key, "2026-10-20");
check("and it says so", monthDays[0].weekday, "Today");
check("the day after is tomorrow", monthDays[1].weekday, "Tomorrow");
check("the days are in order", monthDays.map((d) => d.key), [...monthDays.map((d) => d.key)].sort());
check("every day has a number", monthDays.every((day) => Number.isFinite(day.dayNumber)), true);
check("every day has a month", monthDays.every((day) => typeof day.month === "string" && day.month.length > 0), true);

// The days before today are left out - the teacher cannot set availability
// in the past.
const wholeMonth = buildMonthDayChoices({ year: 2026, month: 9 });
check("the past is left out", wholeMonth[0].key, "2026-10-01");

// And so are the days past the end of the three-month window.
const cutShort = buildMonthDayChoices({
  year: 2026,
  month: 9,
  todayKey: "2026-10-20",
  endKey: "2026-10-25",
});
check("the window is respected", cutShort.length, 6);
check("and it stops on the right day", cutShort[cutShort.length - 1].key, "2026-10-25");

check("no year means no days", buildMonthDayChoices({ month: 9 }).length, 0);
check("a broken today means no days", buildMonthDayChoices({ year: 2026, month: 9, todayKey: "nonsense" }).length, 0);

/* ------------------------------------------------------- counting the days */

check("a day is zero days away", daysBetween("2026-10-20", "2026-10-20"), 0);
check("tomorrow is one day away", daysBetween("2026-10-20", "2026-10-21"), 1);
check("yesterday is minus one day", daysBetween("2026-10-20", "2026-10-19"), -1);
check("a month is not thirty days", daysBetween("2026-10-01", "2026-11-01"), 31);
check("a leap day is counted", daysBetween("2026-02-28", "2026-03-01"), 1);
check("rubbish is zero days", daysBetween("nonsense", "2026-10-20"), 0);

/* -------------------------------------------------- moving between months */

// !! The availability manager picks a date, and it picks it a month at a
// !! time. The window is the three months from today, and it is INCLUSIVE at
// !! both ends - the month the picker starts on is in the window, so stepping
// !! back to it has to be allowed.
// !!
// !! It was ">" and not ">=", so the back arrow was dead on the way from the
// !! second month to the first. A teacher who looked at November could not
// !! come back to October without reloading the page.
const window = { minKey: "2026-10", maxKey: "2027-01" };

check("the month key is a year and a month", monthKey(2026, 9), "2026-10");
check("January is month zero", monthKey(2026, 0), "2026-01");
check("December is month eleven", monthKey(2026, 11), "2026-12");

check("you can step forward from the first month", canStepMonth({ year: 2026, month: 9, delta: 1, ...window }), true);
check("you can step back from the second month", canStepMonth({ year: 2026, month: 10, delta: -1, ...window }), true);
check("you cannot step back from the first month", canStepMonth({ year: 2026, month: 9, delta: -1, ...window }), false);
check("you cannot step forward from the last month", canStepMonth({ year: 2027, month: 0, delta: 1, ...window }), false);
check("you can step back from the last month", canStepMonth({ year: 2027, month: 0, delta: -1, ...window }), true);
check("stepping back over a year works", canStepMonth({ year: 2027, month: 0, delta: -1, ...window }), true);

/* ----------------------------------------------- when the student's plan ends */

// !! The deadline is a plain local datetime in the database and it arrives in
// !! the browser as an ISO string in UTC, so the same instant can land on a
// !! different calendar day depending on where the browser is. A plan that
// !! ends on the 19th has to end on the 19th for the student whose plan it is.
check("the day a plan ends is the day the database wrote", expiryToDateKey("2027-01-19T11:43:08.000Z"), "2027-01-19");
check("a plain date is the day it is", expiryToDateKey("2027-01-19"), "2027-01-19");
check("no deadline is no day", expiryToDateKey(null), "");
check("rubbish is no day", expiryToDateKey("rubbish"), "");

// !! The contract decides, and the booking window is the ceiling. A student
// !! whose plan runs out on the 19th cannot book a class on the 20th,
// !! however free the teacher is - and a plan that runs out later than the
// !! window does not stretch the window, because there is nothing to book
// !! past it.
const plan = { contractExpiresAt: "2027-01-19T11:43:08.000Z", fallbackEndKey: "2027-01-21" };

check("a plan that ends first ends the window", bookingWindowEndKey(plan), "2027-01-19");
check("a plan that ends later does not stretch the window", bookingWindowEndKey({ contractExpiresAt: "2027-03-01T00:00:00.000Z", fallbackEndKey: "2027-01-21" }), "2027-01-21");
check("no plan means the window stands", bookingWindowEndKey({ contractExpiresAt: null, fallbackEndKey: "2027-01-21" }), "2027-01-21");
check("no window means the plan stands", bookingWindowEndKey({ contractExpiresAt: "2027-01-19T00:00:00.000Z", fallbackEndKey: "" }), "2027-01-19");
check("neither means nothing to book", bookingWindowEndKey({}), "");

// !! The last month is the month the range ENDS in, not the month before it.
// !! A plan that ends on the 3rd of a month is still that month, and hiding
// !! it would take a day the student is allowed to book away.
const bounds = monthBoundsForRange({ startKey: "2026-10-21", endKey: "2027-01-19" });

check("the first month is this month", bounds.minKey, "2026-10");
check("the last month is the month the plan ends in", bounds.maxKey, "2027-01");
check("a one-month range is one month", monthBoundsForRange({ startKey: "2026-10-21", endKey: "2026-10-31" }).maxKey, "2026-10");
check("a range that ends on the first of a month is that month", monthBoundsForRange({ startKey: "2026-10-21", endKey: "2026-11-01" }).maxKey, "2026-11");
check("no range has no months", monthBoundsForRange({}), { minKey: "", maxKey: "" });

// The picker can walk the whole plan and stop at both ends.
check("the picker can go forward into the plan", canStepMonth({ year: 2026, month: 9, delta: 1, minKey: bounds.minKey, maxKey: bounds.maxKey }), true);
check("the picker cannot go back before today", canStepMonth({ year: 2026, month: 9, delta: -1, minKey: bounds.minKey, maxKey: bounds.maxKey }), false);
check("the picker can go back to the first month", canStepMonth({ year: 2026, month: 10, delta: -1, minKey: bounds.minKey, maxKey: bounds.maxKey }), true);
check("the picker cannot go past the end of the plan", canStepMonth({ year: 2027, month: 0, delta: 1, minKey: bounds.minKey, maxKey: bounds.maxKey }), false);

// The days offered are the days of the month, and never past the plan.
const october = buildMonthDayChoices({
  year: 2026,
  month: 9,
  todayKey: "2026-10-21",
  endKey: "2027-01-19",
});
check("the month starts today", october[0].key, "2026-10-21");
check("the month ends on the last day", october[october.length - 1].key, "2026-10-31");
check("the first day is called Today", october[0].weekday, "Today");
check("the second day is called Tomorrow", october[1].weekday, "Tomorrow");

const january = buildMonthDayChoices({
  year: 2027,
  month: 0,
  todayKey: "2026-10-21",
  endKey: "2027-01-19",
});
check("the last month stops at the end of the plan", january[january.length - 1].key, "2027-01-19");
check("and does not go past it", january.filter((day) => day.key > "2027-01-19").length, 0);

/* ------------------------------------------------------------------ done */

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

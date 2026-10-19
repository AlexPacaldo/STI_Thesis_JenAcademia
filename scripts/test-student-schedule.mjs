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
  buildDayChoices,
  dateKeyToLocalDate,
  describeClassDay,
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

/* ------------------------------------------------------------------ done */

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

/**
 * Tests for the words a time is written in.
 *
 *   node scripts/test-class-time.mjs
 *
 * !! A time is read by a student, so it has to be right every time it is
 * !! shown. There are two bugs this file exists to keep from coming back:
 * !!
 * !!   - "7:50 AM" turned into "7:50 AM AM" when a time that was already
 * !!     in words was put through the formatter again. It was only visible
 * !!     in the one place a class shows its own end time, which is the
 * !!     student's list of classes.
 * !!
 * !!   - and the formatting is used on values that arrive in every shape
 * !!     the database has: "08:03", "08:03:00", a full date-time, and
 * !!     "8:03 AM" once something has already read it.
 */

import {
  describeTimeOfDay,
  humanTime,
  isPartOfDay,
  isTimeInPart,
  minutesToTime,
  normalizeTime,
  timeToMinutes,
} from "../frontend/src/utils/classTime.js";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

/* ------------------------------------------------------------ the words */

check("a 24-hour time becomes words", humanTime("08:03:00"), "8:03 AM");
check("an afternoon time says PM", humanTime("14:30"), "2:30 PM");
check("midnight is 12 AM", humanTime("00:00"), "12:00 AM");
check("noon is 12 PM", humanTime("12:00"), "12:00 PM");
check("nothing is nothing", humanTime(""), "");
check("nothing at all is nothing", humanTime(null), "");

/* The bug. A time that is ALREADY in words has to come back as it was. */
check("a time in words stays in words", humanTime("7:50 AM"), "7:50 AM");
check("an afternoon time in words stays in words", humanTime("4:30 PM"), "4:30 PM");
check("midnight in words stays 12 AM", humanTime("12:00 AM"), "12:00 AM");
check("noon in words stays 12 PM", humanTime("12:00 PM"), "12:00 PM");
check("putting it through twice changes nothing", humanTime(humanTime("7:50 AM")), "7:50 AM");

/* ------------------------------------------------------------ the maths */

check("minutes to a time", minutesToTime(483), "08:03");
check("a time to minutes", timeToMinutes("08:03"), 483);
check("an afternoon time to minutes", timeToMinutes("14:30"), 870);
check("rubbish is not a time", timeToMinutes("nonsense"), null);

check("a 24-hour time is normalised", normalizeTime("8:03 PM"), "20:03");
check("a time in words is normalised", normalizeTime("7:50 AM"), "07:50");
check("midnight in words is normalised", normalizeTime("12:00 AM"), "00:00");
check("noon in words is normalised", normalizeTime("12:00 PM"), "12:00");

/* ------------------------------------------------------- the parts of a day */

check("seven in the morning is the morning", describeTimeOfDay("07:00"), "Morning");
check("half eleven is still the morning", describeTimeOfDay("11:30"), "Morning");
check("noon is the afternoon", describeTimeOfDay("12:00"), "Afternoon");
check("half four is still the afternoon", describeTimeOfDay("16:30"), "Afternoon");
check("five in the evening is the evening", describeTimeOfDay("17:00"), "Evening");
check("nine at night is the evening", describeTimeOfDay("21:00"), "Evening");
check("rubbish is not a part of a day", describeTimeOfDay("nonsense"), "");

check("morning is a part of a day", isPartOfDay("morning"), true);
check("evening is a part of a day", isPartOfDay("evening"), true);
check("a time is not a part of a day", isPartOfDay("08:00"), false);
check("nothing is not a part of a day", isPartOfDay(""), false);

check("seven is in the morning", isTimeInPart("07:00", "morning"), true);
check("noon is not in the morning", isTimeInPart("12:00", "morning"), false);
check("noon is in the afternoon", isTimeInPart("12:00", "afternoon"), true);
check("five is in the evening", isTimeInPart("17:00", "evening"), true);
check("nine at night is in the evening", isTimeInPart("21:00", "evening"), true);
check("half eleven is not in the evening", isTimeInPart("11:30", "evening"), false);
check("rubbish is in nothing", isTimeInPart("nonsense", "morning"), false);

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

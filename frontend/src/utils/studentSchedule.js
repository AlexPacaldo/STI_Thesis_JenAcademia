/**
 * The dates and days on the student's simple page.
 *
 * !! These were written inside the Calendar component, where they were
 * !! readable but not checkable - a day label that said "Tuesday" for
 * !! yesterday would have passed every test in the repo, because no test
 * !! could reach it.
 *
 * !! The student page leans on these more than the old one did. A child
 * !! reads "TODAY" and "3:00 PM", not a weekday index and a "HH:MM:SS"
 * !! string, so the words are decided here and tested here.
 */

/** How many days the student is offered at a time. */
export const SIMPLE_DAY_CHOICES = 14;

/**
 * Add days to a "YYYY-MM-DD" key.
 *
 * The key is a local calendar day, not an instant, so this walks the calendar
 * rather than adding 24 hours - otherwise a day either side of a daylight
 * saving change lands on the wrong date.
 */
export function addDaysToDateKey(dateKey, days) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A "YYYY-MM-DD" key as a local Date, at midnight.
 */
export function dateKeyToLocalDate(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * The days a student is offered, as a strip.
 *
 * Each one says what it is - "Today", "Tomorrow", "Wed 22" - because the
 * thing a student is choosing is a day, and a number on a square is not a
 * day until they have worked out which square it is.
 */
export function buildDayChoices({ todayKey, endKey = null, limit = SIMPLE_DAY_CHOICES } = {}) {
  if (!todayKey) return [];

  const choices = [];
  for (let offset = 0; offset < limit; offset += 1) {
    const key = addDaysToDateKey(todayKey, offset);
    if (!key) continue;
    if (endKey && key > endKey) break;

    const date = dateKeyToLocalDate(key);
    if (!date) continue;

    choices.push({
      key,
      weekday: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : date.toLocaleDateString("en-US", { weekday: "short" }),
      dayNumber: date.getDate(),
      month: date.toLocaleDateString("en-US", { month: "short" }),
    });
  }

  return choices;
}

/**
 * What a class's day is called, in the words a student would use.
 *
 * "TODAY" and "TOMORROW" first, because those are the words a student
 * actually uses, and the date only when it is neither.
 */
export function describeClassDay({ viewerDate, todayKey, tomorrowKey } = {}) {
  if (!viewerDate) return "YOUR CLASS";
  if (viewerDate === todayKey) return "TODAY";
  if (viewerDate === tomorrowKey) return "TOMORROW";

  const date = dateKeyToLocalDate(viewerDate);
  if (!date) return "YOUR CLASS";

  return date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
}

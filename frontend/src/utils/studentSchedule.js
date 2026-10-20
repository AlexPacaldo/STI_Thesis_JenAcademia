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
 * The days of one month, for a teacher to pick a date from.
 *
 * !! The teacher sets their availability one date at a time, and they used to
 * !! do it by clicking a day on the month grid behind the form. Now the form
 * !! opens in a window, and the grid is behind that, so the days have to
 * !! come with the form.
 *
 * !! Days in the past are left out, and so are days past the end of the
 * !! three-month window - the teacher cannot set availability there, so
 * !! showing them would be showing them a dead end.
 */
export function buildMonthDayChoices({ year, month, todayKey = "", endKey = "" } = {}) {
  if (year === undefined || month === undefined) return [];

  const days = [];
  const lastDay = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month, day);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    if (todayKey && key < todayKey) continue;
    if (endKey && key > endKey) break;

    days.push({
      key,
      weekday: dayLabelForOffset({ key, todayKey }),
      dayNumber: date.getDate(),
      month: date.toLocaleDateString("en-US", { month: "short" }),
    });
  }

  return days;
}

/**
 * The name of a day, in the words a student would use.
 *
 * "Today" and "Tomorrow" first, because those are the words they actually
 * use, and the short weekday for anything else.
 */
function dayLabelForOffset({ key, todayKey }) {
  if (!todayKey) {
    const date = new Date(`${key}T00:00:00`);
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  const offset = daysBetween(todayKey, key);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";

  const date = new Date(`${key}T00:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

/**
 * Whole days from one date key to another.
 *
 * !! Counted in UTC, not by subtracting two Dates. Subtracting two local
 * !! dates gives 23 hours across a daylight-saving change, and 23 hours
 * !! rounds to 0 - so "Tomorrow" comes out as "Today" twice a year.
 */
export function daysBetween(fromKey, toKey) {
  const from = dateKeyToUtc(fromKey);
  const to = dateKeyToUtc(toKey);
  if (from === null || to === null) return 0;
  return Math.round((to - from) / 86400000);
}

function dateKeyToUtc(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * The key for a month - "2026-10".
 */
export function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Can a month picker step a month forwards or backwards?
 *
 * !! The window is INCLUSIVE at both ends. The first month of the window can
 * !! be stepped back to, and the last month can be stepped forward to.
 * !!
 * !! It was ">" and not ">=", so the back arrow was dead on the way from the
 * !! second month to the first: a teacher who looked at November could not
 * !! come back to October without reloading the page. The month the picker
 * !! starts on IS in the window, so stepping back to it has to be allowed.
 *
 * !! "month" is zero-based, the way Date's is.
 */
export function canStepMonth({ year, month, delta, minKey, maxKey }) {
  const current = new Date(year, month + delta, 1);
  const key = monthKey(current.getFullYear(), current.getMonth());
  if (delta < 0) return key >= minKey;
  return key <= maxKey;
}

/**
 * The day a contract ends, as a "YYYY-MM-DD" key.
 *
 * !! The deadline is a plain local datetime in the database, and it arrives in
 * !! the browser as an ISO string in UTC - so the same instant can land on a
 * !! different calendar day depending on where the browser is. A plan that
 * !! ends on the 19th has to end on the 19th for the student whose plan it
 * !! is, so this reads the day the database wrote rather than converting an
 * !! instant. The first ten characters ARE the day.
 */
export function expiryToDateKey(expiresAt) {
  if (!expiresAt) return "";
  const match = String(expiresAt).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

/**
 * The last day a student may book.
 *
 * The contract decides, and the booking window is the ceiling.
 *
 * !! A contract that ends before the window ends the window: a student whose
 * !! plan runs out on the 19th cannot book a class on the 20th, however free
 * !! the teacher is. A contract that ends LATER does not stretch the window -
 * !! a teacher only sets availability three months ahead, so there is nothing
 * !! to book past that, and offering a day with no classes on it would be
 * !! offering a dead end.
 *
 * !! No contract at all means no deadline, so the window stands on its own.
 */
export function bookingWindowEndKey({ contractExpiresAt = null, fallbackEndKey = "" } = {}) {
  const expiry = expiryToDateKey(contractExpiresAt);
  if (!expiry) return fallbackEndKey || "";
  if (!fallbackEndKey) return expiry;
  return expiry < fallbackEndKey ? expiry : fallbackEndKey;
}

/**
 * The months a range of days covers, as the first and the last month key.
 *
 * !! A picker that can move between months needs to know where it may stop.
 * !! The last month is the month the range ENDS in, not the month before it
 * !! - a range that ends on the 3rd of a month is still that month, and
 * !! hiding it would take a day the student is allowed to book away.
 */
export function monthBoundsForRange({ startKey = "", endKey = "" } = {}) {
  const start = dateKeyToLocalDate(startKey);
  if (!start) return { minKey: "", maxKey: "" };

  const end = dateKeyToLocalDate(endKey);
  const first = monthKey(start.getFullYear(), start.getMonth());
  const last = end ? monthKey(end.getFullYear(), end.getMonth()) : first;

  return {
    minKey: first < last ? first : last,
    maxKey: first < last ? last : first,
  };
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

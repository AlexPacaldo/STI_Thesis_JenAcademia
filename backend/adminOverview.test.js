import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAttentionList,
  buildTrendSeries,
  countByStatus,
  emptyDayCounts,
  toIsoDay,
  OVERVIEW_LOW_BALANCE_THRESHOLD,
} from "./adminOverview.js";

test("a day with no classes is still a zeroed day in the trend", () => {
  // The trend query is a recursive CTE LEFT JOINed to `classes`, so a day nobody
  // taught on comes back as one row with a NULL status and a zero count. That row
  // is what keeps the window the full seven days instead of collapsing to the days
  // that happened to have classes.
  const series = buildTrendSeries([
    { day: "2026-10-16", status: "completed", class_count: 3 },
    { day: "2026-10-17", status: null, class_count: 0 },
    { day: "2026-10-18", status: "no-show", class_count: 1 },
  ]);

  assert.deepEqual(series, [
    { date: "2026-10-16", ...emptyDayCounts(), completed: 3, total: 3 },
    { date: "2026-10-17", ...emptyDayCounts() },
    { date: "2026-10-18", ...emptyDayCounts(), noShow: 1, total: 1 },
  ]);
});

test("a day split across several statuses adds up to one total", () => {
  const [day] = buildTrendSeries([
    { day: "2026-10-16", status: "completed", class_count: 3 },
    { day: "2026-10-16", status: "no-show", class_count: 2 },
    { day: "2026-10-16", status: "cancelled", class_count: 1 },
  ]);
  assert.equal(day.total, 6);
  assert.deepEqual(day, { date: "2026-10-16", scheduled: 0, completed: 3, cancelled: 1, noShow: 2, total: 6 });
});

test("mysql2 returns a DATE column as a Date, not as \"YYYY-MM-DD\"", () => {
  // This is the regression that actually shipped. String()ing the driver's Date
  // gives "Fri Oct 16 2026 00:00:00 GMT+0800", so slicing ten characters off it
  // yields "Fri Oct 16" - which sorts wrong, is not a date, and put three future
  // days on the chart while the array still looked perfectly well-formed.
  const driverDay = new Date(2026, 9, 16); // 16 Oct 2026, local

  assert.equal(toIsoDay(driverDay), "2026-10-16");
  assert.notEqual(toIsoDay(driverDay).slice(0, 10), "Fri Oct 16");

  const series = buildTrendSeries([
    { day: driverDay, status: "completed", class_count: 2 },
    { day: new Date(2026, 9, 15), status: "completed", class_count: 1 },
  ]);
  assert.deepEqual(series.map((day) => day.date), ["2026-10-15", "2026-10-16"]);
  assert.equal(series[0].completed, 1);
  assert.equal(series[1].completed, 2);
});

test("toIsoDay is total - rubbish in yields an empty day, never a fake one", () => {
  for (const value of [null, undefined, "", "not-a-date", 42, new Date("nope")]) {
    const iso = toIsoDay(value);
    assert.ok(iso === "" || /^\d{4}-\d{2}-\d{2}$/.test(iso), `unexpected: ${iso}`);
  }
});

test("trend days are ordered and gap-free however the rows arrive", () => {
  const series = buildTrendSeries([
    { day: "2026-10-18T00:00:00.000Z", status: "scheduled", class_count: 2 },
    { day: "2026-10-16", status: "completed", class_count: 1 },
    { day: "2026-10-17", status: "cancelled", class_count: 1 },
  ]);

  assert.deepEqual(series.map((day) => day.date), ["2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.equal(series.every((day) => day.total === day.scheduled + day.completed + day.cancelled + day.noShow), true);
});

test("mysql2 hands COUNT(*) back as a string, so trend counts are coerced", () => {
  const [day] = buildTrendSeries([{ day: "2026-10-16", status: "completed", class_count: "12" }]);
  assert.equal(day.completed, 12);
  assert.equal(day.total, 12);
});

test("an unknown status cannot invent a key on the day", () => {
  const [day] = buildTrendSeries([{ day: "2026-10-16", status: "postponed", class_count: 5 }]);
  assert.deepEqual(day, { date: "2026-10-16", ...emptyDayCounts() });
});

test("missing statuses count as zero rather than undefined", () => {
  assert.deepEqual(
    countByStatus([{ status: "completed", total: 4 }, { status: "cancelled", total: "1" }]),
    { scheduled: 0, completed: 4, cancelled: 1, "no-show": 0 }
  );
});

test("the attention list is worst first and hides anything at zero", () => {
  const list = buildAttentionList({
    rescheduleRequests: 2,
    contractRequests: 5,
    classVerifications: 5,
    studentsWithoutTeacher: 0,
    expiringContracts: 1,
    studentsWithoutActiveContract: 0,
    incompleteProfiles: 0,
    lowBalanceStudents: 0,
  });

  assert.deepEqual(list.map((item) => item.count), [5, 5, 2, 1]);
  assert.ok(!list.some((item) => item.key === "studentsWithoutTeacher"), "zero counts are not news");
  assert.ok(
    list.every((item) => item.tab && item.label && item.hint),
    "every item points somewhere the admin can act"
  );
});

test("the low-balance threshold in the copy is the threshold in the query", () => {
  const [item] = buildAttentionList({
    lowBalanceStudents: 1,
    expiringContracts: 0,
    rescheduleRequests: 0,
    contractRequests: 0,
    classVerifications: 0,
    studentsWithoutTeacher: 0,
    studentsWithoutActiveContract: 0,
    incompleteProfiles: 0,
  });
  assert.match(item.hint, new RegExp(String(OVERVIEW_LOW_BALANCE_THRESHOLD)));
});
import assert from "node:assert/strict";
import { availableRanges, candidateSlotMinutes, rankBookingTimes } from "../frontend/src/utils/bookingTimes.js";

assert.deepEqual(rankBookingTimes(["11:15", "10:50", "11:00"], "11:00"), ["11:00", "10:50", "11:15"]);
assert.deepEqual(rankBookingTimes(["11:10", "10:50"], "11:00"), ["10:50", "11:10"]);
assert.deepEqual(rankBookingTimes(["12:00", "08:00", "12:00"], ""), ["08:00", "12:00"]);
assert.deepEqual(availableRanges(480, 720, 480, 510), [{ start: 510, end: 720 }]);
assert.deepEqual(availableRanges(480, 720, 690, 720), [{ start: 480, end: 690 }]);
assert.deepEqual(availableRanges(480, 720, 450, 750), []);
assert.deepEqual(availableRanges(480, 720, 750, 780), [{ start: 480, end: 720 }]);

// A free start is insufficient: the whole lesson must fit before the break.
const beforeBreak = availableRanges(480, 780, 675, 690)
  .flatMap(range => candidateSlotMinutes(range.start, range.end, 25));
assert(!beforeBreak.includes(660)); // 11:00–11:25 overlaps the 11:15 break.
assert(beforeBreak.includes(650)); // 10:50–11:15 fits exactly.
assert(beforeBreak.includes(690)); // 11:30 starts after the break.

for (const duration of [25, 50]) {
  const occupied = [{ start: 660, end: 685 }, { start: 780, end: 830 }];
  const slots = candidateSlotMinutes(480, 1020, duration, occupied);
  assert(slots.length > 0);
  for (const start of slots) {
    assert(start >= 480 && start + duration <= 1020);
    for (const busy of occupied) {
      assert(start >= busy.end || start + duration <= busy.start);
    }
  }
  assert(slots.includes(685)); // A new class may start as soon as the prior one ends.
}
assert(candidateSlotMinutes(480, 900, 25).includes(660)); // 11 AM is independent of duration.
assert(!candidateSlotMinutes(480, 500, 25).length);
const afterEightOClockClass = candidateSlotMinutes(480, 1380, 25, [{ start: 1200, end: 1225 }]);
assert(afterEightOClockClass.includes(1230)); // 8:30 PM is now allowed after an 8:00-8:25 PM class.
console.log("Booking time ranking, break boundaries, full duration, and back-to-back class checks passed.");

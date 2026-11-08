import { timeToMinutes } from "./classTime.js";

export function candidateSlotMinutes(start, end, duration, occupiedRanges = []) {
  const candidates = new Set();
  for (let minute = Math.ceil(start / 5) * 5; minute + duration <= end; minute += 5) {
    candidates.add(minute);
  }
  for (const range of occupiedRanges) {
    candidates.add(range.end);
    candidates.add(range.start - duration);
  }
  return [...candidates].filter(minute => minute >= start && minute + duration <= end
    && !occupiedRanges.some(range => minute < range.end && minute + duration > range.start))
    .sort((a, b) => a - b);
}

// Remove the break even when it touches or spans an availability boundary.
export function availableRanges(start, end, breakStart, breakEnd) {
  if (start == null || end == null || end <= start) return [];
  if (breakStart == null || breakEnd == null || breakEnd <= breakStart) return [{ start, end }];
  return [
    { start, end: Math.min(end, breakStart) },
    { start: Math.max(start, breakEnd), end },
  ].filter(range => range.end > range.start);
}

export function rankBookingTimes(times, preferredTime) {
  const preferred = timeToMinutes(preferredTime);
  return [...new Set(times)].sort((a, b) => {
    const left = timeToMinutes(a);
    const right = timeToMinutes(b);
    return (preferred == null ? 0 : Math.abs(left - preferred) - Math.abs(right - preferred)) || left - right;
  });
}

export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_LOCKOUT_ESCALATION_EVERY = 3;
export const LOGIN_LOCKOUT_DURATIONS_SECONDS = [30, 45, 60, 180, 300];

export function getLoginLockoutSeconds(failedAttempts) {
  const attempts = Number(failedAttempts);
  if (!Number.isInteger(attempts) || attempts < LOGIN_FAILURE_LIMIT) return null;

  const attemptsAfterFirstLock = attempts - LOGIN_FAILURE_LIMIT;
  if (attemptsAfterFirstLock % LOGIN_LOCKOUT_ESCALATION_EVERY !== 0) return null;

  const level = Math.floor(attemptsAfterFirstLock / LOGIN_LOCKOUT_ESCALATION_EVERY);
  return LOGIN_LOCKOUT_DURATIONS_SECONDS[
    Math.min(level, LOGIN_LOCKOUT_DURATIONS_SECONDS.length - 1)
  ];
}

export function formatLoginLockoutDuration(seconds) {
  const duration = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (duration < 60) return `${duration} second${duration === 1 ? "" : "s"}`;

  const minutes = Math.ceil(duration / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

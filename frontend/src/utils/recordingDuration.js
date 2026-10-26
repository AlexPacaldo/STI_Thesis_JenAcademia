/**
 * How long a class recording actually is, in words.
 *
 * !! A recording is not the class. The "Class length" on the admin's
 * !! verifications page is the wall-clock time from Start class to End class;
 * !! this is the length of the video file, which can be a couple of seconds if
 * !! screen sharing ended early.
 * !!
 * !! Whole minutes were wrong for that case: a 2-second video rounded down to
 * !! "0 min", which reads like a broken counter rather than the real problem.
 * !! Seconds are shown until the recording is a minute long, so a short
 * !! capture looks short instead of looking like zero.
 */
export function formatRecordingDuration(secondsValue) {
  const seconds = Math.max(0, Math.round(Number(secondsValue || 0)));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return `${remainingSeconds} sec`;
  return `${minutes} min ${String(remainingSeconds).padStart(2, "0")} sec`;
}

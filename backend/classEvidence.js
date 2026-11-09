import { isStartScreenshotTimely } from "./classSession.js";

export function assessClassEvidence(log, requiredMinutes) {
  if (log.evidence_mode === "screenshots") {
    if (!log.start_proof_url || !log.proof_url || !log.student_joined_at || !log.start_proof_uploaded_at || log.start_proof_url === log.proof_url) return false;
    return isStartScreenshotTimely(log);
  }
  return Boolean(log.recording_url) && Number(log.recording_duration_seconds || 0) >= requiredMinutes * 60;
}

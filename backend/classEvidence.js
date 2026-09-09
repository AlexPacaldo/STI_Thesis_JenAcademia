export function assessClassEvidence(log, requiredMinutes) {
  if (log.evidence_mode === "screenshots") {
    if (!log.start_proof_url || !log.proof_url || !log.student_joined_at || !log.start_proof_uploaded_at || log.start_proof_url === log.proof_url) return false;
    const joined = new Date(log.student_joined_at).getTime();
    const uploaded = new Date(log.start_proof_uploaded_at).getTime();
    return Number.isFinite(joined) && Number.isFinite(uploaded) && uploaded >= joined && uploaded - joined <= 5 * 60_000;
  }
  return Boolean(log.recording_url) && Number(log.recording_duration_seconds || 0) >= requiredMinutes * 60;
}

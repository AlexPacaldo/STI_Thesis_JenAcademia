import { groupClassPeers } from "./groupClasses.js";
import { assessClassEvidence } from "./classEvidence.js";

export async function startGroupParticipants(db, classId, evidenceMode) {
  const peers = await groupClassPeers(db, classId);
  for (const peer of peers) {
    await db.query(`INSERT INTO class_attendance_logs
      (class_id, teacher_id, student_id, evidence_mode, teacher_started_at, teacher_recording_consent_at, verification_status)
      SELECT ?, ?, ?, ?, teacher_started_at, teacher_recording_consent_at, 'in_progress'
      FROM class_attendance_logs WHERE class_id = ?
      ON DUPLICATE KEY UPDATE teacher_started_at = COALESCE(teacher_started_at, VALUES(teacher_started_at)),
        teacher_recording_consent_at = COALESCE(teacher_recording_consent_at, VALUES(teacher_recording_consent_at)),
        evidence_mode = COALESCE(evidence_mode, VALUES(evidence_mode))`,
    [peer.class_id, peer.teacher_id, peer.student_id, evidenceMode, classId]);
  }
  return peers;
}

const sharedFields = new Set([
  "recording_started_at", "recording_url", "recording_mime_type", "recording_size_bytes",
  "recording_uploaded_at", "recording_expires_at", "recording_duration_seconds",
  "start_proof_url", "start_proof_uploaded_at",
]);
export async function shareGroupEvidence(db, classId, fields) {
  if (fields.some(field => !sharedFields.has(field))) throw new Error("Unsupported shared group evidence field");
  const peers = await groupClassPeers(db, classId);
  if (!peers.length) return;
  await db.query(`UPDATE class_attendance_logs target JOIN class_attendance_logs source ON source.class_id = ?
    SET ${fields.map(field => `target.${field} = source.${field}`).join(", ")}
    WHERE target.class_id IN (?) AND target.teacher_ended_at IS NULL`, [classId, peers.map(peer => peer.class_id)]);
}

export async function groupRecordingConsentReady(db, classId) {
  const peers = await groupClassPeers(db, classId);
  if (!peers.length) return true;
  const [rows] = await db.query(`SELECT class_id FROM class_attendance_logs WHERE class_id IN (?)
    AND teacher_started_at IS NOT NULL AND student_joined_at IS NOT NULL
    AND student_recording_consent_at IS NOT NULL AND teacher_ended_at IS NULL`,
  [[Number(classId), ...peers.map(peer => peer.class_id)]]);
  return rows.length === peers.length + 1;
}

export async function endGroupParticipants(db, classId, { getVerification, requiredMinutes, encrypt, evidenceAccepted }) {
  const peers = await groupClassPeers(db, classId);
  const source = await getVerification(db, classId);
  if (!peers.length || !source?.teacher_ended_at) return peers;
  for (const peer of peers) {
    const log = await getVerification(db, peer.class_id);
    if (!log || log.teacher_ended_at) continue;
    const minutes = Math.max(0, Math.floor((new Date(source.teacher_ended_at) - new Date(log.teacher_started_at)) / 60_000));
    const evidence = { ...log, proof_url: source.proof_url };
    const valid = evidenceAccepted && assessClassEvidence(evidence, requiredMinutes(peer.duration));
    const status = log.student_joined_at && minutes >= requiredMinutes(peer.duration) && valid && !source.review_reason ? "verified" : "needs_review";
    await db.query(`UPDATE class_attendance_logs SET teacher_ended_at = ?, duration_minutes = ?,
      proof_url = ?, end_proof_uploaded_at = ?, summary = ?, review_reason = ?, verification_status = ?
      WHERE class_id = ? AND teacher_ended_at IS NULL`,
    [source.teacher_ended_at, minutes, source.proof_url || null, source.end_proof_uploaded_at || null,
      encrypt(source.summary || null), source.review_reason || null, status, peer.class_id]);
  }
  return peers;
}

import test from "node:test";
import assert from "node:assert/strict";
import { assessClassEvidence } from "./classEvidence.js";

const screenshots = {
  evidence_mode: "screenshots", start_proof_url: "/start.png", proof_url: "/end.png",
  teacher_started_at: "2026-09-05T10:00:00Z", student_joined_at: "2026-09-05T10:00:00Z", start_proof_uploaded_at: "2026-09-05T10:05:00Z",
};
test("both timely screenshots qualify; a single or late screenshot does not", () => {
  assert.equal(assessClassEvidence(screenshots, 30), true);
  for (const changes of [{ start_proof_url: null }, { proof_url: null }, { start_proof_uploaded_at: "2026-09-05T10:05:01Z" }, { start_proof_uploaded_at: "2026-09-05T09:59:59Z" }]) {
    assert.equal(assessClassEvidence({ ...screenshots, ...changes }, 30), false);
  }
});
test("recording requires successful upload and sufficient captured duration", () => {
  const log = { evidence_mode: "recording", recording_url: "/video.webm", recording_duration_seconds: 1800 };
  assert.equal(assessClassEvidence(log, 30), true);
  assert.equal(assessClassEvidence({ ...log, recording_duration_seconds: 1799 }, 30), false);
  assert.equal(assessClassEvidence({ ...log, recording_url: null }, 30), false);
  assert.equal(assessClassEvidence({ ...screenshots, evidence_mode: "recording" }, 30), false);
});


test("the screenshot window starts when both participants are present, in either joining order", () => {
  for (const timestamps of [
    { teacher_started_at: "2026-09-05T10:10:00Z", student_joined_at: "2026-09-05T10:00:00Z" },
    { teacher_started_at: "2026-09-05T10:00:00Z", student_joined_at: "2026-09-05T10:10:00Z" },
  ]) {
    const log = { ...screenshots, ...timestamps };
    assert.equal(assessClassEvidence({ ...log, start_proof_uploaded_at: "2026-09-05T10:11:00Z" }, 25), true);
    assert.equal(assessClassEvidence({ ...log, start_proof_uploaded_at: "2026-09-05T10:15:00Z" }, 25), true);
    assert.equal(assessClassEvidence({ ...log, start_proof_uploaded_at: "2026-09-05T10:15:01Z" }, 25), false);
    assert.equal(assessClassEvidence({ ...log, start_proof_uploaded_at: "2026-09-05T10:09:59Z" }, 25), false);
  }
  for (const invalid of [null, "", "invalid"]) {
    assert.equal(assessClassEvidence({ ...screenshots, teacher_started_at: invalid }, 25), false);
    assert.equal(assessClassEvidence({ ...screenshots, student_joined_at: invalid }, 25), false);
  }
});

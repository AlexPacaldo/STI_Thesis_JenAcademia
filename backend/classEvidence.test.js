import test from "node:test";
import assert from "node:assert/strict";
import { assessClassEvidence } from "./classEvidence.js";

const screenshots = {
  evidence_mode: "screenshots", start_proof_url: "/start.png", proof_url: "/end.png",
  student_joined_at: "2026-09-05T10:00:00Z", start_proof_uploaded_at: "2026-09-05T10:05:00Z",
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

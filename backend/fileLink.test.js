import test from "node:test";
import assert from "node:assert/strict";
import { signFileLink, verifyFileLink } from "./fileLink.js";

test("signed links support multi-file and historical assignment uploads", () => {
  for (const kind of ["assignment-upload", "submission-history"]) {
    const token = signFileLink(
      { kind, id: 42, filename: "submitted-work.pdf" },
      { secret: "test-secret", now: 1_000 }
    );

    assert.deepEqual(
      verifyFileLink(token, { secret: "test-secret", now: 1_001 }),
      { kind, id: 42, fn: "submitted-work.pdf", exp: 301_000 }
    );
  }
});

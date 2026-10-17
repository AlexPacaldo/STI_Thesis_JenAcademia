/**
 * Runnable check for the SSE frame parser.
 *
 * There is no test framework in this repo, so this is a plain script:
 *   node scripts/test-sse-parser.mjs
 *
 * Live chat and the calendar both depend on this, and neither can be checked by
 * an anonymous probe - the interesting failures are a frame split across two
 * network reads, or an event silently arriving under the wrong name. Those are
 * exactly what these cases cover.
 */

import { createFrameParser } from "../frontend/src/utils/sseParser.js";

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`)
  );
}

/** Feed chunks through a fresh parser and collect everything it emitted. */
function collect(...chunks) {
  const seen = [];
  const parser = createFrameParser((name, data) => seen.push([name, data]));
  for (const chunk of chunks) parser.push(chunk);
  return seen;
}

console.log("=== framing ===");

check(
  "a named event with one data line",
  collect('event: chat-message\ndata: {"message_id":7}\n\n'),
  [["chat-message", '{"message_id":7}']]
);

check(
  "an event with no event: line defaults to message",
  collect('data: {"message_id":8}\n\n'),
  [["message", '{"message_id":8}']]
);

check(
  "two frames arriving in one chunk",
  collect('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n'),
  [["a", "1"], ["b", "2"]]
);

check(
  "a frame split across two reads is buffered, not dropped",
  collect('event: chat-message\ndata: {"mes', 'sage_id":9}\n\n'),
  [["chat-message", '{"message_id":9}']]
);

check(
  "a frame split mid-field-name",
  collect('event: chat-', 'message\ndata: 1\n\n'),
  [["chat-message", "1"]]
);

check(
  "a split that leaves a boundary in the second chunk",
  collect('event: a\ndata: 1\n\nevent: b\n', 'data: 2\n\n'),
  [["a", "1"], ["b", "2"]]
);

check(
  "multiple data lines are joined with a newline",
  collect("event: x\ndata: line one\ndata: line two\n\n"),
  [["x", "line one\nline two"]]
);

console.log("\n=== real server frames ===");

// Exactly what backend/server.js writes.
check(
  "the chat connected frame",
  collect('event: connected\ndata: {"ok":true}\n\n'),
  [["connected", '{"ok":true}']]
);

check(
  "a calendar broadcast frame",
  collect('event: class-booked\ndata: {"class_id":3,"updated_at":"2026-01-01T00:00:00.000Z","event":"class-booked"}\n\n'),
  [["class-booked", '{"class_id":3,"updated_at":"2026-01-01T00:00:00.000Z","event":"class-booked"}']]
);

check(
  "a heartbeat interleaved with real events is skipped by the caller, not parsed away",
  collect('event: heartbeat\ndata: {"at":"x"}\n\nevent: class-no-show\ndata: {"class_id":4}\n\n'),
  [["heartbeat", '{"at":"x"}'], ["class-no-show", '{"class_id":4}']]
);

check(
  "CRLF line endings are tolerated",
  collect('event: class-completed\r\ndata: {"class_id":5}\r\n\r\n'),
  [["class-completed", '{"class_id":5}']]
);

console.log("\n=== ignored input ===");

check("a comment-only keep-alive emits nothing", collect(': keep-alive\n\n'), []);
check("an empty chunk emits nothing", collect(""), []);
check("a partial frame with no boundary yet emits nothing", collect("event: a\ndata: 1"), []);
check(
  "an unknown field is ignored rather than treated as data",
  collect('event: a\nid: 42\ndata: 1\n\n'),
  [["a", "1"]]
);

console.log("\n=== flush ===");

{
  const seen = [];
  const parser = createFrameParser((name, data) => seen.push([name, data]));
  parser.push("event: a\ndata: 1");
  check("nothing emitted before flush", seen, []);
  parser.flush();
  check("a trailing frame without a blank line is recovered", seen, [["a", "1"]]);
}

{
  const seen = [];
  const parser = createFrameParser((name, data) => seen.push([name, data]));
  parser.push("event: a\ndata: 1\n\n");
  parser.flush();
  check("flush after a complete frame adds nothing", seen, [["a", "1"]]);
}

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All good.");
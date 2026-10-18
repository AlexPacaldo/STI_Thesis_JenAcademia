/**
 * Catches JavaScript comments that ended up inside SQL template literals.
 *
 *   node scripts/test-sql-literals.mjs
 *
 * !! A `//` comment written inside a backtick SQL string is not a comment. It is
 * !! part of the query text, and MySQL rejects the whole statement with
 * !! ER_PARSE_ERROR.
 * !!
 * !! That is what broke GET /api/users/:id: the account page's query had a block
 * !! of explanatory notes inside the literal, the endpoint began returning a bare
 * !! HTTP 500, and a student's account page rendered as though they had no
 * !! contract at all - with no error shown anywhere in the UI, because the page
 * !! keeps whatever the stored session user already had when the fetch fails.
 * !!
 * !! It is checked here rather than left to review because it is invisible to
 * !! every tool that does not run the query: the file parses, the SQL looks
 * !! right when read as text, and a manual test of the SAME query pasted into a
 * !! client succeeds. Only the code path that builds the string fails.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const TARGETS = [
  "backend/server.js",
  "backend/dbConfig.js",
  "backend/contractTerms.js",
  "backend/teacherMatching.js",
  "backend/teacherAdvisor.js",
  "backend/seed-demo-data.mjs",
];

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected: ${e}\n    actual:   ${a}`);
}

/**
 * Lines that look like JS comments while inside a template literal.
 *
 * Backticks are counted per line to track whether we are inside one. That is a
 * heuristic - a backtick inside a string, or a multi-line template that closes
 * and reopens on one line, would fool it - but it errs towards reporting, and
 * every report is checked by eye here.
 *
 * SQL block comments (-- and /*) are deliberately NOT reported: those are
 * genuinely valid inside a query, unlike `//`.
 */
function commentsInsideLiterals(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const found = [];
  let inside = false;
  let openedAt = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const backticks = (line.match(/`/g) || []).length;

    if (!inside) {
      if (backticks % 2 === 1) {
        inside = true;
        openedAt = i + 1;
      }
      continue;
    }

    const asComment = line.match(/^\s*(\/\/|\/\*)/);
    if (asComment) {
      // A line comment is always a mistake in SQL. A block comment is only a
      // mistake if it does not close on the same line, since /* ... */ is legal.
      const closes = line.includes("*/");
      if (asComment[1] === "//" || !closes) {
        found.push({ line: i + 1, text: line.trim(), openedAt });
      }
    }

    if (backticks % 2 === 1) inside = false;
  }

  return found;
}

for (const rel of TARGETS) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} is listed but does not exist`);
    continue;
  }

  const hits = commentsInsideLiterals(fs.readFileSync(full, "utf8"));
  check(
    `${rel} has no JS comments inside SQL literals`,
    hits,
    []
  );
}

// The check must actually be able to fail. A guard that cannot fail is worse
// than none, because it reports safety it has not verified.
const planted = [
  "const q = `SELECT 1",
  "  // this would break it",
  "  FROM t`;",
];
check(
  "the guard detects a planted line comment inside a literal",
  commentsInsideLiterals(planted.join("\n")).length,
  1
);

check(
  "the guard detects a planted unclosed block comment",
  commentsInsideLiterals("const q = `SELECT 1\n  /* never closed\n  FROM t`;").length,
  1
);

check(
  "a legal SQL block comment is not flagged",
  commentsInsideLiterals("const q = `SELECT 1 /* fine */\n  FROM t`;").length,
  0
);

check(
  "ordinary JS comments outside literals are not flagged",
  commentsInsideLiterals('// a normal comment\nconst x = 1;\n// another\nconst y = 2;').length,
  0
);

check(
  "a line comment inside a template that is not SQL is still flagged for review",
  commentsInsideLiterals("const t = `line one\n// looks like a comment\nline two`;").length,
  1
);

// The exact snippet that broke GET /api/users/:id in production, kept verbatim.
// A guard that has only ever seen a simplified example has not been shown it
// recognises the thing it exists for.
const ORIGINAL_BREAKAGE = [
  "const [studentRows] = await pool.query(",
  "  `SELECT sp.proficiency_level, sp.assigned_teacher_id, sp.trial_notes,",
  "          scp.total_classes, scp.classes_used, scp.classes_left,",
  "          scp.status AS package_status, scp.expires_at AS package_expires_at",
  "     FROM student_profiles sp",
  "     LEFT JOIN users t ON t.user_id = sp.assigned_teacher_id",
  "     // The most recent package, preferring an active one.",
  "     //",
  "     // !! This used to join on scp.status = 'active', which meant a student",
  "     // !! whose contract had run out got no package fields at all - no",
  "     LEFT JOIN student_class_packages scp",
  "       ON scp.student_id = sp.user_id",
  "   WHERE sp.user_id = ?`);",
].join("\n");

check(
  "the guard recognises the snippet that actually broke production",
  commentsInsideLiterals(ORIGINAL_BREAKAGE).length,
  4
);

check(
  "and the same snippet with the notes removed is clean",
  commentsInsideLiterals(ORIGINAL_BREAKAGE.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")),
  []
);

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("All good.");
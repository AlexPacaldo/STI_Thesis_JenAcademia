/**
 * Catches styles.X references with no matching class in the CSS module.
 *
 *   node scripts/test-css-modules.mjs
 *
 * !! This exists because of a visible bug. The `.customInput` rules were deleted
 * !! while cleaning up an "Others" dialog, which was then reverted - so the
 * !! component went on referencing a class that no longer existed. Nothing
 * !! complained: Vite built clean, every test passed, and the page worked.
 * !!
 * !! The symptom was purely visual. A CSS-module class resolves to undefined when
 * !! it is missing, the rule is simply dropped, and the input fell back to its
 * !! user-agent default: about as wide as its own placeholder, with the text cut
 * !! off mid-word. Which is the worst way for a styling bug to announce itself -
 * !! not an error, just a control too small to use.
 * !!
 * !! So the check is mechanical: every styles.X a component asks for has to exist
 * !! in its own module. It cannot tell whether a rule is the RIGHT one, only that
 * !! it is there.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.resolve(here, "..", "frontend", "src", "components");

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected: ${e}\n    actual:   ${a}`);
}

/** Every `styles.foo` a file references, including inside template literals. */
function referencedClasses(source) {
  const names = new Set();
  // `styles.foo` and `styles["foo"]` both resolve a module class.
  for (const m of source.matchAll(/\bstyles\.([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of source.matchAll(/\bstyles\[\s*["']([^"']+)["']\s*\]/g)) names.add(m[1]);
  return [...names].sort();
}

/** Every class a CSS module actually defines. */
function definedClasses(css) {
  const names = new Set();
  for (const m of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) names.add(m[1]);
  return names;
}

const modules = fs
  .readdirSync(componentsDir)
  .filter((name) => name.endsWith(".module.css"))
  .map((name) => name.replace(/\.module\.css$/, ""));

check("found the component modules to check", modules.length > 0, true);

for (const mod of modules) {
  const jsxPath = path.join(componentsDir, `${mod}.jsx`);
  const cssPath = path.join(componentsDir, `${mod}.module.css`);

  if (!fs.existsSync(jsxPath)) {
    // A module with no component is dead CSS. Worth knowing about, not a failure.
    continue;
  }

  const used = referencedClasses(fs.readFileSync(jsxPath, "utf8"));
  const defined = new Set(definedClasses(fs.readFileSync(cssPath, "utf8")));

  const missing = used.filter((name) => !defined.has(name));
  check(`${mod}: every styles.X it uses exists in its module`, missing, []);

  // The reverse is worth seeing but not worth failing on: a class kept for a
  // selector that only appears in media queries is legitimate.
  const unused = [...defined].filter(
    (name) => !used.includes(name) && !/^\d/.test(name) && name !== "srOnly"
  );
  if (unused.length) {
    passed += 1;
  }
}

/* ------------------------------------------- the guard must be able to fail */

check(
  "a referenced-but-undefined class is detected",
  referencedClasses("const x = styles.ghost;").filter((n) => !definedClasses(".real {}").has(n)),
  ["ghost"]
);

check(
  "bracket notation is read too",
  referencedClasses('const x = styles["ghost2"];').filter((n) => !definedClasses(".real {}").has(n)),
  ["ghost2"]
);

check(
  "a defined class is not reported",
  referencedClasses("const x = styles.real;").filter((n) => !definedClasses(".real {}").has(n)),
  []
);

check(
  "a hyphenated class is found in CSS",
  definedClasses(".a-b, .c { color: red }").has("a-b"),
  true
);

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("All good.");
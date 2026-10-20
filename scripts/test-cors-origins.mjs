/**
 * Tests for which websites may call the API.
 *
 *   node scripts/test-cors-origins.mjs
 *
 * !! An origin that is not on the list is refused BY THE BROWSER. The API
 * !! answers correctly, the server logs nothing wrong, and the visitor sees
 * !! "Failed to fetch". The only trace is a CORS error in the browser
 * !! console - so this is exactly the kind of thing that is missed until
 * !! somebody tries the contact form on the live site.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_CORS_ORIGINS,
  describeCorsOrigins,
  resolveCorsOrigins,
} from "../backend/corsOrigins.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`  - ${label}\n      expected: ${e}\n      actual:   ${a}`);
}

/* ------------------------------------------------------- the live domain */

// !! The site is served from jenacademia.com. This was the whole bug: the
// !! allowlist still had the old Vercel URL on it, so every request from the
// !! live site was blocked.
check(
  "the live domain is allowed",
  resolveCorsOrigins({}).includes("https://jenacademia.com"),
  true
);
check(
  "the www form is allowed",
  resolveCorsOrigins({}).includes("https://www.jenacademia.com"),
  true
);
check(
  "the old Vercel deployment is allowed",
  resolveCorsOrigins({}).includes("https://jenacademia.vercel.app"),
  true
);
check(
  "local development is allowed",
  resolveCorsOrigins({}).includes("http://localhost:5173"),
  true
);

check(
  "the plain http form of the live domain is NOT allowed",
  resolveCorsOrigins({}).includes("http://jenacademia.com"),
  false
);
check(
  "and neither is a subdomain that does not exist",
  resolveCorsOrigins({}).includes("https://evil.jenacademia.com"),
  false
);

/* ------------------------------------------------------------- the extras */

check(
  "an extra origin is added",
  resolveCorsOrigins({ CORS_ORIGINS: "https://staging.jenacademia.com" }).includes(
    "https://staging.jenacademia.com"
  ),
  true
);

check(
  "several extras are added",
  resolveCorsOrigins({ CORS_ORIGINS: "https://a.example.com, https://b.example.com" }).length,
  DEFAULT_CORS_ORIGINS.length + 2
);

// !! The extras ADD to the list. Replacing it would mean that setting the
// !! variable for one new domain silently removed the domain the site is
// !! actually served from - and the symptom of that is the exact failure
// !! this file exists to prevent.
check(
  "the extras do not replace the defaults",
  resolveCorsOrigins({ CORS_ORIGINS: "https://staging.jenacademia.com" }).includes(
    "https://jenacademia.com"
  ),
  true
);

// Spaces and a trailing slash are what a person pasting a URL actually types.
check(
  "spaces are trimmed",
  resolveCorsOrigins({ CORS_ORIGINS: "  https://staging.jenacademia.com  " }).includes(
    "https://staging.jenacademia.com"
  ),
  true
);
check(
  "a trailing slash is trimmed",
  resolveCorsOrigins({ CORS_ORIGINS: "https://staging.jenacademia.com/" }).includes(
    "https://staging.jenacademia.com"
  ),
  true
);
check(
  "and it is not also on the list with the slash",
  resolveCorsOrigins({ CORS_ORIGINS: "https://staging.jenacademia.com/" }).includes(
    "https://staging.jenacademia.com/"
  ),
  false
);

check("an empty variable adds nothing", resolveCorsOrigins({ CORS_ORIGINS: "" }).length, DEFAULT_CORS_ORIGINS.length);
check("a missing variable adds nothing", resolveCorsOrigins({}).length, DEFAULT_CORS_ORIGINS.length);
check("a variable of commas adds nothing", resolveCorsOrigins({ CORS_ORIGINS: " , , " }).length, DEFAULT_CORS_ORIGINS.length);
check("there are no duplicates", new Set(resolveCorsOrigins({ CORS_ORIGINS: "https://jenacademia.com" })).size, DEFAULT_CORS_ORIGINS.length);

/* ------------------------------------------------------- the description */

check(
  "the description is the list, comma separated",
  describeCorsOrigins(["https://a.example.com", "https://b.example.com"]),
  "https://a.example.com, https://b.example.com"
);

/* --------------------------------------------- the server uses this list */

const serverSource = fs.readFileSync(path.join(repoRoot, "backend/server.js"), "utf8");

check("the server resolves the origins", serverSource.includes("resolveCorsOrigins()"), true);
check("and prints them", serverSource.includes("[cors] Allowed origins"), true);
check("and does not keep its own hard-coded list", /origin:\s*\[\s*\]/.test(serverSource), false);
check("the preflight uses the same policy as the request", (serverSource.match(/cors\(corsOptions\)/g) || []).length, 2);
check("there is no second, permissive CORS policy", serverSource.includes("app.options(/(.*)/, cors());"), false);

// The old list must be gone, or it comes back the next time somebody copies
// it from an old branch.
check("the old Vercel-only list is not in the server", /origin:\s*\[\s*"https:\/\/jenacademia\.vercel\.app"/.test(serverSource), false);

// The env template has to teach the variable, or nobody finds it.
const envExample = fs.readFileSync(path.join(repoRoot, "backend/.env.example"), "utf8");
check(".env.example documents CORS_ORIGINS", envExample.includes("CORS_ORIGINS="), true);

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

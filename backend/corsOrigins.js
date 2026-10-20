// corsOrigins.js
/**
 * Which websites may talk to this API.
 *
 * !! Extracted from server.js for the same reason dbConfig.js and mailer.js
 * !! were extracted: the rule has to be in ONE place, and it has to be
 * !! checkable. A list of origins buried in the middle of server.js is a list
 * !! nobody updates when the site moves.
 *
 * !! Why this file exists at all: the site moved to its own domain, and the
 * !! allowlist still had the old Vercel URL on it. Every request from the
 * !! live site was refused by the browser with "No 'Access-Control-Allow-
 * !! Origin' header is present", and the contact form on the home page said
 * !! "Failed to fetch" with nothing else to go on. The API was fine. The
 * !! API was answering. The browser threw the answer away before it got
 * !! there.
 * !!
 * !! That failure is silent on the server and loud only in a visitor's
 * !! console, so it survives a deploy unnoticed. Which is why the list is
 * !! printed at start-up and why it can be changed with an environment
 * !! variable - a domain should not need a code change and a redeploy to
 * !! become allowed.
 */

/**
 * The origins that are always allowed.
 *
 * !! The custom domain and the Vercel deployment are both here because both
 * !! are real: the Vercel one is how the app was deployed before the domain
 * !! was pointed at it, and a hard cut-over breaks the old URL for whoever
 * !! still has it open in a tab.
 */
export const DEFAULT_CORS_ORIGINS = [
  "https://jenacademia.com",
  "https://www.jenacademia.com",
  "https://jenacademia.vercel.app",
  "http://localhost:5173",
];

/**
 * Every origin that may talk to this API.
 *
 * !! CORS_ORIGINS is a comma-separated list of extra origins, ADDED to the
 * !! defaults rather than replacing them. Replacing them would mean that
 * !! setting the variable for one new domain silently removed the domain
 * !! the site is actually served from - and the symptom of that is exactly
 * !! the failure this file exists to prevent.
 *
 * @param {NodeJS.ProcessEnv} [env] injected so the result is testable
 * @returns {string[]} the allowed origins, without duplicates
 */
export function resolveCorsOrigins(env = process.env) {
  const extra = String(env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  const all = [...DEFAULT_CORS_ORIGINS, ...extra];

  // Duplicates removed, order kept, so the log always reads the same way.
  return [...new Set(all.map((origin) => origin.replace(/\/+$/, "")))];
}

/**
 * The list as one line, for the start-up log.
 *
 * !! It is printed because the alternative is finding out that the site is
 * !! blocked by opening the browser console on the live site, which is what
 * !! happened the last time.
 */
export function describeCorsOrigins(origins) {
  return origins.join(", ");
}

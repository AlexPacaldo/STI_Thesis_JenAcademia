// dbConfig.js
/**
 * Where the database credentials come from, in one place.
 *
 * !! Extracted from server.js so that anything else which needs to reach the same
 * !! database - the demo seeder, a one-off query script - resolves them exactly
 * !! the way the server does.
 * !!
 * !! The first version of the seeder read DB_HOST/DB_USER/DB_PASSWORD/DB_NAME and
 * !! nothing else, defaulting the host to "localhost". Against Railway, where the
 * !! credential arrives as a single MYSQL_URL, every one of those was empty, so
 * !! mysql2 connected to localhost with no password and reported:
 * !!
 * !!     Access denied for user 'Q'@'localhost' (using password: NO)
 * !!
 * !! Note the "using password: NO" - the driver never sent one. That is a missing
 * !! credential, not a wrong one, and no amount of retrying or retyping would have
 * !! fixed it. Two copies of this resolution is how that happened, so there is one
 * !! now.
 *
 * Precedence, highest first:
 *   1. DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT
 *   2. MYSQLHOST / MYSQLUSER / MYSQLPASSWORD / MYSQLDATABASE / MYSQLPORT
 *   3. Parsed out of MYSQL_URL or DATABASE_URL   <- what Railway provides
 *   4. Hardcoded defaults, which are the developer's own machine, never a server.
 */

export function parseMysqlUrl(url) {
  if (!url) return {};

  try {
    const parsed = new URL(url);
    if (!["mysql:", "mysql2:"].includes(parsed.protocol)) return {};

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: parsed.pathname ? decodeURIComponent(parsed.pathname.replace(/^\//, "")) : "",
    };
  } catch (err) {
    console.warn("Ignoring invalid MYSQL_URL/DATABASE_URL:", err.message);
    return {};
  }
}

const mysqlUrlConfig = parseMysqlUrl(process.env.MYSQL_URL || process.env.DATABASE_URL || "");

export const DB_HOST =
  process.env.DB_HOST || process.env.MYSQLHOST || mysqlUrlConfig.host || "localhost";
export const DB_USER =
  process.env.DB_USER || process.env.MYSQLUSER || mysqlUrlConfig.user || "root";
export const DB_PASSWORD =
  process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || mysqlUrlConfig.password || "";
export const DB_NAME =
  process.env.DB_NAME || process.env.MYSQLDATABASE || mysqlUrlConfig.database || "jen_academia";
export const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQLPORT || mysqlUrlConfig.port || 3306);

const requestedLimit = Number(process.env.DB_CONNECTION_LIMIT || 5);
export const DB_CONNECTION_LIMIT = Number.isFinite(requestedLimit)
  ? Math.min(Math.max(requestedLimit, 1), 10)
  : 5;

/**
 * Where the credential actually came from.
 *
 * Only for diagnostics, and it never includes the password or the full URL -
 * that string carries the credential, so printing it would put it in the console
 * and into anything that captures it.
 */
export const DB_SOURCE = (() => {
  if (process.env.DB_PASSWORD || process.env.MYSQLPASSWORD) return "DB_PASSWORD / MYSQLPASSWORD";
  if (mysqlUrlConfig.password) {
    return process.env.MYSQL_URL ? "MYSQL_URL" : "DATABASE_URL";
  }
  return "NOT SET";
})();

/**
 * A safe one-line description of the resolved config.
 *
 * Use this to answer "which database am I about to touch?" BEFORE touching it.
 * An access-denied error from the driver names the user and host but not what it
 * was looking for, so it cannot tell you that the credential was never found.
 */
export function describeDbConfig() {
  return {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    database: DB_NAME,
    passwordSet: Boolean(DB_PASSWORD),
    source: DB_SOURCE,
    // True when the host is the developer machine rather than a server, which is
    // the tell that a Railway URL went unread.
    looksLocal: /^(localhost|127\.0\.0\.1|::1)$/i.test(DB_HOST),
  };
}

/**
 * Refuse to proceed without a password, and say which variable is missing.
 *
 * Required, with no fallback. This used to fall back to a real credential that was
 * committed to this repository, which meant anyone reading the source could
 * connect to a database still left using it - and, because it was also the last
 * resort for the chat and session secrets, a missing configuration looked like a
 * working one. Failing here is deliberate: a clear refusal beats an "access denied
 * for user" from the driver twenty lines later.
 *
 * Note that removing it from the source does not remove it from the git history.
 * The old password should still be rotated at the database.
 */
export function assertDbPasswordPresent() {
  if (DB_PASSWORD) return;
  throw new Error(
    "DB_PASSWORD is not set. Set DB_PASSWORD, MYSQLPASSWORD, or put a password in " +
      "MYSQL_URL / DATABASE_URL (for example ${{MySQL.MYSQL_URL}} in Railway)."
  );
}
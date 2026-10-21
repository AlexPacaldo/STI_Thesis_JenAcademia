/**
 * Checks whether the mail service is set up, and says what is missing.
 *
 *   node scripts/check-mail-setup.mjs                 check the setup
 *   node scripts/check-mail-setup.mjs you@example.com  ... and send a test
 *
 * !! Setting up a mail service is three separate things, and each one fails
 * !! in its own way with nothing to show for it:
 * !!
 * !!   1. the domain is verified with the provider (DNS records in place)
 * !!   2. the API key is in the environment
 * !!   3. the message actually arrives
 * !!
 * !! A failure in any of them looks the same from the outside - the contact
 * !! form says "Server error" and nobody knows which one it was. So this
 * !! checks all three, in order, and prints the next thing to do.
 *
 * !! The API key is read from MAIL_API_KEY, or from backend/.env when it is
 * !! not in the environment. The .env file is the same one the server reads,
 * !! so a key that is in there is a key the server has.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCname, resolveMx, resolveTxt } from "node:dns/promises";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const RESEND_API = "https://api.resend.com";

/**
 * Read a setting the way the server reads it: the environment first, then
 * the .env file.
 *
 * !! The .env file is parsed here by hand rather than by dotenv because the
 * !! backend's dotenv is loaded by the server module, and this script has to
 * !! work on its own, before the server is running.
 */
function readSetting(key) {
  const fromEnv = String(process.env[key] || "").trim();
  if (fromEnv) return fromEnv;

  const envPath = path.join(repoRoot, "backend", ".env");
  if (!fs.existsSync(envPath)) return "";

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1] !== key) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return "";
}

function say(line = "") {
  console.log(line);
}

function heading(text) {
  say("");
  say(text);
  say("-".repeat(text.length));
}

/**
 * Ask the provider about the domains on the account.
 *
 * !! The provider is the only one that knows what it wants in DNS. Guessing
 * !! the record names is how people spend an hour adding a DKIM record that
 * !! the provider never asked for.
 */
async function fetchDomains(apiKey) {
  const response = await fetch(`${RESEND_API}/domains`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const raw = await response.text();
  if (!response.ok) {
    let detail = raw;
    try {
      detail = JSON.parse(raw)?.message || raw;
    } catch {
      // Not JSON. The raw text is the reason.
    }
    // !! A key that may only send is refused here, and it says so in a way
    // !! that looks like a revoked key. "restricted_api_key" means the key
    // !! is fine and is simply not allowed to read the domains - which is
    // !! the right permission for a key that lives on a server.
    if (/restricted_api_key/i.test(String(detail))) {
      const error = new Error("this key may only send, so it cannot read the domains");
      error.restricted = true;
      throw error;
    }
    if (response.status === 401) {
      throw new Error("the key was refused (401). It was revoked, or copied with a space in it");
    }
    if (response.status === 403) {
      throw new Error(
        "the key cannot read the domains on the account (403). Make a key with " +
          "domain read permission, or read the records off the domain page in the dashboard"
      );
    }
    throw new Error(`the provider answered ${response.status}: ${String(detail).slice(0, 300)}`);
  }

  const payload = JSON.parse(raw);
  return Array.isArray(payload?.data) ? payload.data : [];
}

/**
 * Look a record up in DNS and say whether it is what the provider wants.
 *
 * !! A record that is "there but different" is a failure, not a near miss.
 * !! A DKIM key with one character changed is not the key.
 */
async function checkRecord(record) {
  const name = record.name;
  const expected = String(record.value || "").trim();

  try {
    if (record.type === "TXT") {
      const found = await resolveTxt(name);
      const values = found.map((chunks) => chunks.join("").trim());
      const hit = values.find((value) => value === expected || value.includes(expected));
      return { ok: Boolean(hit), found: values };
    }

    if (record.type === "CNAME") {
      const found = await resolveCname(name);
      const hit = found.some((value) => value.replace(/\.$/, "").toLowerCase() === expected.replace(/\.$/, "").toLowerCase());
      return { ok: hit, found };
    }

    if (record.type === "MX") {
      const found = await resolveMx(name);
      const hit = found.some((entry) => entry.exchange.replace(/\.$/, "").toLowerCase() === expected.replace(/\.$/, "").toLowerCase());
      return { ok: hit, found: found.map((entry) => entry.exchange) };
    }
  } catch (err) {
    return { ok: false, found: [], error: err?.code || err?.message };
  }

  return { ok: false, found: [], error: "unknown record type" };
}

function normalizeName(name, domain) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return domain;
  if (trimmed === "@") return domain;
  return trimmed;
}

/* --------------------------------------------------------------- the check */

async function main() {
  const apiKey = readSetting("MAIL_API_KEY");
  const provider = (readSetting("MAIL_API_PROVIDER") || "resend").toLowerCase();
  const toAddress = process.argv[2] || "";

  heading(`Mail setup (${provider})`);

  if (provider !== "resend") {
    say(`This script only knows how to check Resend. MAIL_API_PROVIDER is "${provider}".`);
    say("Set MAIL_API_PROVIDER=resend, or check the other provider's dashboard by hand.");
    return;
  }

  if (!apiKey) {
    say("No API key yet.");
    say("");
    say("Put one in backend/.env:");
    say("  MAIL_API_PROVIDER=resend");
    say("  MAIL_API_KEY=re_...");
    say("");
    say("Create one at resend.com -> API Keys -> Create API Key.");
    process.exitCode = 1;
    return;
  }

  say(`API key: found (${apiKey.slice(0, 6)}...)`);

  let domains = [];
  let keyCanReadDomains = true;
  try {
    domains = await fetchDomains(apiKey);
  } catch (err) {
    if (err.restricted) {
      // !! A key that may only send is the RIGHT key for a server. It just
      // !! cannot read the domains, so the DNS check is skipped - the records
      // !! are on the domain page in the dashboard, and the test message
      // !! below is what actually proves the setup works.
      keyCanReadDomains = false;
      say("");
      say("This key may only send, so it cannot list the domains.");
      say("That is the right permission for a key on a server. The DNS check");
      say("below is skipped; the records are on the Domains page in the");
      say("dashboard, and the test message is what proves the setup works.");
    } else {
      say("");
      say(`The provider would not answer: ${err.message}`);
      say("");
      say("A key that was revoked, or copied with a space in it, is refused here.");
      process.exitCode = 1;
      return;
    }
  }

  if (keyCanReadDomains && !domains.length) {
    say("");
    say("The key works, but no domains are on the account yet.");
    say("Add one at resend.com -> Domains -> Add Domain, and this script will");
    say("print the exact DNS records to paste into your domain host.");
    process.exitCode = 1;
    return;
  }

  if (keyCanReadDomains) {
    heading("Domains");
    for (const domain of domains) {
      say(`${domain.name}  [${domain.status}]`);
    }

    let allRecordsInPlace = true;
    for (const domain of domains) {
      const records = Array.isArray(domain.records) ? domain.records : [];
      if (!records.length) continue;

      heading(`DNS records for ${domain.name}`);
      for (const record of records) {
        const name = normalizeName(record.name, domain.name);
        const result = await checkRecord({ ...record, name });
        if (result.ok) {
          say(`  ok       ${record.type.padEnd(5)} ${name}`);
        } else {
          allRecordsInPlace = false;
          say(`  MISSING  ${record.type.padEnd(5)} ${name}`);
          say(`          value: ${record.value}`);
          if (record.priority) say(`          priority: ${record.priority}`);
          if (result.found?.length) say(`          there now: ${result.found.join(", ")}`);
        }
      }
    }

    const domainStatus = domains.map((domain) => domain.status);
    const allVerified = domainStatus.every((status) => status === "verified");

    heading("Where this stands");
    say(`  API key          ${apiKey ? "accepted" : "missing"}`);
    say(`  DNS records      ${allRecordsInPlace ? "all in place" : "missing or wrong"}`);
    say(`  Domain verified  ${allVerified ? "yes" : "not yet"}`);

    if (!allRecordsInPlace) {
      say("");
      say("Add the records above to your domain host (Spaceship -> Domain Manager ->");
      say("DNS), then run this again. DNS changes take a few minutes to spread.");
    }

    if (!allVerified) {
      say("");
      say("The provider has not confirmed the domain yet. Once the records are in");
      say("place, press \"Verify\" on the domain in the Resend dashboard.");
    }

    if (allRecordsInPlace && allVerified) {
      say("");
      say("The setup is complete. The next step is putting the key in Railway:");
      say("  MAIL_TRANSPORT=api");
      say("  MAIL_API_PROVIDER=resend");
      // !! Not the key itself. A credential printed to a console is a
      // !! credential in every screenshot of it, and the copy is in the
      // !! dashboard and in backend/.env.
      say(`  MAIL_API_KEY=${apiKey.slice(0, 6)}... (the key you just pasted in)`);
      say(`  MAIL_API_FROM=academy@${domains[0].name}`);
      say("then redeploy the backend service.");
    }
  }

  /* --------------------------------------------------------- a test email */

  if (!toAddress) return;

  heading(`Sending a test message to ${toAddress}`);

  // The app's own mailer, not a copy of it: a test that uses a different
  // sender is a test of the copy.
  const { sendMail, mailConfig } = await import("../backend/mailer.js");

  const config = mailConfig();
  if (!config.configured) {
    say("The app does not think mail is configured yet. Set the key in backend/.env.");
    process.exitCode = 1;
    return;
  }
  say(`Transport: ${config.transport} (${config.apiProviderLabel})`);
  say(`From:      ${config.apiFrom || config.from}`);
  say(`To:        ${config.contactTo}`);

  try {
    const result = await sendMail({
      to: toAddress,
      subject: "JEN Academia - mail setup test",
      text: [
        "This is a test message from the JEN Academia setup check.",
        "",
        `Sent: ${new Date().toISOString()}`,
      ].join("\n"),
    });
    say("");
    say(`Sent: ${JSON.stringify(result)}`);
    say("If it does not arrive in a minute, check the spam folder, then check");
    say("that the address above is the one you meant.");
  } catch (err) {
    say("");
    say(`It failed: ${err.message}`);
    say("");
    say("The provider refused it, or could not be reached. The reason is in");
    say("the line above, and it is the same reason the contact form would give.");
    process.exitCode = 1;
  }
}

// !! Not process.exit(). A process that is killed while an HTTP connection
// !! is still open takes Windows' socket cleanup down with it, and the
// !! script ends in an assertion failure instead of its last line.
await main();

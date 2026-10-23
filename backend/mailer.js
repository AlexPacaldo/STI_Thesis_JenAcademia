// mailer.js
/**
 * Sending email.
 *
 * !! Two transports, one place: raw SMTP and an HTTPS mail API.
 * !!
 * !! SMTP is what a mail server speaks. It is also the one thing a host like
 * !! Railway will not let out: outbound SMTP (ports 25, 465, 587) is blocked
 * !! below the Pro plan, and the block drops packets instead of refusing
 * !! them, so the connection hangs until it times out. That is not a
 * !! misconfiguration that can be fixed with a different password - the port
 * !! is closed from the outside, and the only way out is an HTTPS API, which
 * !! goes out on 443 like every other request the app makes.
 * !!
 * !! Both transports live in this file on purpose. The rule about what
 * !! "configured" means has to be the same everywhere, and the two used to
 * !! disagree: the contact form answered "not configured" while the invite
 * !! email went out. A second copy of that rule is how a mail server ends up
 * !! broken for a week with nobody noticing.
 *
 * !! Why the HTTPS API is not the only transport: it is the only one that
 * !! works from every host, but it needs an account with a provider and a
 * !! sending domain that has been verified. SMTP needs a mail server and a
 * !! password. Which one is used is decided by what is configured, and can be
 * !! forced with MAIL_TRANSPORT.
 *
 * !! Everything here is plain text. No HTML, no attachments, no template
 * !! engine. The three messages this app sends are an invite link, a
 * !! password reset link, and a message from the contact form - and all three
 * !! read better as plain text than as a newsletter.
 */

import nodemailer from "nodemailer";

/**
 * How long to wait for the mail server before giving up.
 *
 * !! A request that waits for a mail server that is not answering holds an
 * !! HTTP connection open until the browser gives up, and the person waiting
 * !! for it is a student who has just pressed "reset my password". A short
 * !! timeout turns a hung mail server into a quick, logged failure instead
 * !! of a page that spins for two minutes.
 */
const SMTP_TIMEOUT_MS = 15000;

/**
 * The same timeout for the HTTPS mail API.
 */
const API_TIMEOUT_MS = 15000;

/**
 * Where the contact form sends its messages.
 *
 * !! This used to be hard-coded to the address of whoever ran the mail
 * !! provider, because that provider could only send to its own account
 * !! holder. The address the website publishes as "Email us" is the one a
 * !! visitor is reading when they fill the form in, so that is where the
 * !! form goes - and it is an environment variable so it can be pointed
 * !! somewhere else without a code change.
 */
const DEFAULT_CONTACT_TO = "jenacademia31@gmail.com";

/**
 * The HTTPS mail APIs this app knows how to speak.
 *
 * !! Each one is a POST with a JSON body, and each one spells the body
 * !! differently. The differences are small but they are not interchangeable:
 * !! a body sent to the wrong API is refused with a message about a missing
 * !! field, and the message says nothing about which field was missing.
 * !!
 * !! No SDK is used. The whole request is a POST of a JSON object, and an SDK
 * !! for that is a dependency that has to be kept up to date for the sake of
 * !! four lines of code.
 */
const MAIL_API_PROVIDERS = {
  resend: {
    label: "Resend",
    defaultUrl: "https://api.resend.com/emails",
    buildRequest({ key, from, to, subject, text, replyTo }) {
      return {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        // !! reply_to only when there is one. A contact form that sends as
        // !! academy@jenacademia.com and carries no reply address sends the
        // !! visitor's answer to a mailbox that may not exist.
        body: { from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) },
      };
    },
  },
  postmark: {
    label: "Postmark",
    defaultUrl: "https://api.postmarkapp.com/email",
    buildRequest({ key, from, to, subject, text, replyTo }) {
      return {
        headers: {
          "X-Postmark-Server-Token": key,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: {
          From: from,
          To: to,
          Subject: subject,
          TextBody: text,
          ...(replyTo ? { ReplyTo: replyTo } : {}),
        },
      };
    },
  },
};

let cachedTransport = null;
let cachedTransportKey = "";

/**
 * A failure that happened while sending, as opposed to a failure that
 * happened in the app.
 *
 * !! The difference decides what the visitor is told. A transport failure is
 * !! the server's problem, not the visitor's, and the visitor has exactly one
 * !! way out: the email address printed beside the form. A bug in the app is
 * !! a different thing and must not be dressed up as "email is switched off".
 */
export class MailTransportError extends Error {
  /**
   * @param {string} message what went wrong, in plain words
   * @param {"unreachable"|"refused"} reason what kind of failure it was
   */
  constructor(message, reason = "refused") {
    super(message);
    this.name = "MailTransportError";
    this.reason = reason;
  }
}

/**
 * The mail settings, resolved from the environment.
 *
 * !! Read at CALL time, never at import time. The environment is loaded from
 * !! .env by a module that is imported earlier, and a value captured at the
 * !! top of this file would be read before that happened - which is how
 * !! "SMTP is not configured" appears on a server that has it configured.
 *
 * @returns {object} the resolved settings, and what is missing
 */
export function mailConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const from = String(process.env.SMTP_FROM || user).trim();
  const fromName = String(process.env.SMTP_FROM_NAME || "JEN Academia").trim();
  const ehlo = String(process.env.SMTP_EHLO_DOMAIN || "").trim();
  const redirectTo = String(process.env.SMTP_REDIRECT_TO || "").trim();
  const contactTo = String(process.env.CONTACT_FORM_TO || DEFAULT_CONTACT_TO).trim();

  // Port 465 is implicit TLS (the connection is encrypted from the first
  // byte), and 587 is STARTTLS (the connection starts plain and is upgraded).
  // Getting this wrong is the classic "certificate error" on an SMTP server
  // that works fine, so the port decides it unless the environment says
  // otherwise.
  const secure =
    String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true" || port === 465;

  // The HTTPS mail API.
  const apiProviderId = String(process.env.MAIL_API_PROVIDER || "resend").trim().toLowerCase();
  const apiProvider = MAIL_API_PROVIDERS[apiProviderId] || null;
  const apiKey = String(process.env.MAIL_API_KEY || "").trim();
  const apiUrl = String(process.env.MAIL_API_URL || "").trim() || apiProvider?.defaultUrl || "";
  // The address the message claims to be from. The API provider insists that
  // it is a domain the account has verified, so it cannot be invented here -
  // but it does not have to be a different setting from the SMTP one, and
  // falling back to it means most setups need one address, not two.
  const apiFrom = String(process.env.MAIL_API_FROM || "").trim() || from;
  const apiFromName = String(process.env.MAIL_API_FROM_NAME || "").trim() || fromName;

  // Which transport to use. "auto" means: the HTTPS API when it is set up,
  // because it is the one that works from every host, and SMTP otherwise.
  const transportPreference = String(process.env.MAIL_TRANSPORT || "auto").trim().toLowerCase();

  const smtpMissing = [];
  if (!host) smtpMissing.push("SMTP_HOST");
  if (!user) smtpMissing.push("SMTP_USER");
  if (!pass) smtpMissing.push("SMTP_PASS");

  const apiMissing = [];
  if (!apiProvider) apiMissing.push("MAIL_API_PROVIDER");
  if (!apiKey) apiMissing.push("MAIL_API_KEY");
  if (!apiFrom) apiMissing.push("MAIL_API_FROM");
  if (apiProvider && !apiUrl) apiMissing.push("MAIL_API_URL");

  const smtpReady = smtpMissing.length === 0;
  const apiReady = apiMissing.length === 0;

  let transport = null;
  if (transportPreference === "smtp") {
    transport = smtpReady ? "smtp" : null;
  } else if (transportPreference === "api") {
    transport = apiReady ? "api" : null;
  } else if (apiReady) {
    transport = "api";
  } else if (smtpReady) {
    transport = "smtp";
  }

  // What is missing, for the transport that was asked for.
  let missing = [];
  if (transportPreference === "smtp") {
    missing = smtpMissing;
  } else if (transportPreference === "api") {
    missing = apiMissing;
  } else if (!transport) {
    missing = [...smtpMissing];
    for (const key of apiMissing) {
      if (!missing.includes(key)) missing.push(key);
    }
  }

  return {
    // SMTP
    host,
    port,
    secure,
    user,
    pass,
    from,
    fromName,
    ehlo,
    redirectTo,
    contactTo,
    // The HTTPS mail API
    apiProvider: apiProviderId,
    apiProviderLabel: apiProvider?.label || apiProviderId,
    apiKey,
    apiUrl,
    apiFrom,
    apiFromName,
    // Which one is in use, and what it is still waiting for
    transportPreference,
    transport,
    configured: transport !== null,
    missing,
    smtpMissing,
    apiMissing,
  };
}

/**
 * Is email sending possible at all?
 *
 * The three messages this app sends all go through this one check, so a
 * missing setting is reported the same way everywhere.
 */
export function isMailConfigured() {
  return mailConfig().configured;
}

/**
 * A one-line description of the mail setup, for the start-up log.
 *
 * !! It never includes the password or the API key. A credential printed to a
 * !! log is a credential in every log aggregator, every crash reporter and
 * !! every screenshot of the console.
 */
export function describeMailConfig() {
  const config = mailConfig();
  if (!config.configured) {
    return `not configured (missing: ${config.missing.join(", ")})`;
  }
  const suffix = config.redirectTo ? " (redirecting all mail)" : "";
  if (config.transport === "api") {
    return `${config.apiProviderLabel} over HTTPS as ${config.apiFrom}${suffix}`;
  }
  return `SMTP ${config.host}:${config.port} as ${config.user}${suffix}`;
}

/**
 * What is not set up, said in a way that names both transports.
 *
 * !! The start-up log is the only place this shows up, so it has to say which
 * !! setting is missing - not just that something is.
 */
function describeMissing(config) {
  const parts = [];
  if (config.transportPreference !== "api") {
    parts.push(`SMTP is not configured (missing ${config.smtpMissing.join(", ")})`);
  }
  if (config.transportPreference !== "smtp") {
    parts.push(`the mail API is not configured (missing ${config.apiMissing.join(", ")})`);
  }
  return parts.join(" and ");
}

/**
 * The transport, built once and kept.
 *
 * !! A transport is a connection pool. Building one per message opens a
 * !! socket, negotiates TLS and authenticates for every single email, and
 * !! most SMTP servers rate-limit that. One transport for the life of the
 * !! process is the whole point of using a library instead of a socket.
 */
function getTransport(config) {
  const key = `${config.host}|${config.port}|${config.secure}|${config.user}|${config.pass}`;
  if (cachedTransport && cachedTransportKey === key) return cachedTransport;

  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    // The name the server is addressed by. Some hosts need it to match the
    // domain they issued the certificate for.
    ...(config.ehlo ? { name: config.ehlo } : {}),
  });
  cachedTransportKey = key;
  return cachedTransport;
}

/**
 * The failures that mean "the mail server could not be reached at all".
 *
 * !! These are the ones worth telling apart from a refused message, because
 * !! a refused message means the server answered and said no (a wrong
 * !! password, an unverified sender), while an unreachable one means nothing
 * !! came back at all - which is what a host that blocks the port looks like.
 */
const UNREACHABLE_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/**
 * Send one message over the HTTPS mail API.
 *
 * !! Native fetch, no SDK. The request is a POST of a JSON object and a
 * !! response that says whether it was accepted.
 */
async function sendViaApi(config, { to, subject, text, replyTo }) {
  const provider = MAIL_API_PROVIDERS[config.apiProvider];
  const from = config.apiFromName ? `"${config.apiFromName}" <${config.apiFrom}>` : config.apiFrom;
  const { headers, body } = provider.buildRequest({
    key: config.apiKey,
    from,
    to,
    subject,
    text,
    replyTo,
  });

  let response;
  try {
    response = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (err) {
    throw new MailTransportError(
      `Could not reach ${provider.label} at ${config.apiUrl}: ${err.message}`,
      "unreachable"
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new MailTransportError(
      `${provider.label} refused the message (HTTP ${response.status}): ${readApiError(raw)}`,
      "refused"
    );
  }

  return raw;
}

/**
 * The reason a mail API refused a message, in one line.
 *
 * !! The API says what is wrong in a JSON body, and the body is different for
 * !! every provider. A refusal that arrives with no reason is a refusal that
 * !! cannot be acted on, so the raw text is used when the JSON does not
 * !! explain it.
 */
function readApiError(raw) {
  const text = String(raw || "").trim();
  if (!text) return "no reason was returned";

  try {
    const payload = JSON.parse(text);
    const detail =
      payload?.message ||
      payload?.Message ||
      payload?.error?.message ||
      (typeof payload?.error === "string" ? payload.error : "") ||
      payload?.errors?.[0]?.message;
    if (detail) return String(detail);
  } catch {
    // Not JSON. The text below is the reason.
  }

  return text.slice(0, 300);
}

/**
 * Send one plain-text email.
 *
 * !! It returns { sent: false, skipped: true } when email is not configured,
 * !! rather than throwing. A server with no mail settings should still serve
 * !! the app: the admin can create an account, the link can be copied by
 * !! hand, and the only thing lost is the email itself. Throwing there took
 * !! down routes that had nothing to do with email.
 *
 * !! It DOES throw when the mail server is configured and then fails. That is
 * !! a different thing - the message was meant to go out and did not - and the
 * !! callers need to know, because a student who never receives their
 * !! password reset has to be told something other than "we sent it".
 *
 * @param {{to: string, subject: string, text: string, replyTo?: string}} mail
 * @returns {Promise<{sent: boolean, skipped?: boolean, redirectedTo?: string}>}
 */
export async function sendMail({ to, subject, text, replyTo }) {
  const config = mailConfig();

  if (!config.configured) {
    console.warn(`Email was not sent: ${describeMissing(config)}.`);
    return { sent: false, skipped: true };
  }

  const recipient = String(to || "").trim();
  if (!recipient) {
    throw new Error("An email needs a recipient.");
  }

  // !! Where an answer goes. The contact form sends from an address at the
  // !! academy's own domain, which is a sending identity and not necessarily
  // !! a mailbox anybody reads - so the visitor's address is set as the reply
  // !! address. Without it, replying to a contact-form notification goes to
  // !! noreply-style limbo instead of to the person who wrote in.
  const answerTo = String(replyTo || "").trim();

  // The redirect is a development convenience: point it at an inbox you can
  // read and every message the app sends lands there instead of at a
  // stranger. It is off unless it is asked for, and it says so in the body
  // of every message, because a message that arrives somewhere unexpected
  // and says nothing about it is worse than no message at all.
  const redirectedTo = config.redirectTo;
  const actualTo = redirectedTo || recipient;
  const actualSubject = redirectedTo ? `[DEV] ${subject}` : subject;
  const actualText = redirectedTo
    ? `[DEV] Originally addressed to: ${recipient}\n\n${text}`
    : text;

  if (config.transport === "api") {
    await sendViaApi(config, {
      to: actualTo,
      subject: actualSubject,
      text: actualText,
      replyTo: answerTo,
    });
  } else {
    const transport = getTransport(config);
    try {
      await transport.sendMail({
        from: config.fromName ? `"${config.fromName}" <${config.from}>` : config.from,
        to: actualTo,
        subject: actualSubject,
        text: actualText,
        ...(answerTo ? { replyTo: answerTo } : {}),
      });
    } catch (err) {
      const code = String(err?.code || "");
      const reason = UNREACHABLE_CODES.has(code) ? "unreachable" : "refused";
      throw new MailTransportError(
        `Could not send over SMTP (${config.host}:${config.port}): ${err?.message || String(err)}`,
        reason
      );
    }
  }

  return redirectedTo ? { sent: true, redirectedTo } : { sent: true };
}

/**
 * Check that the mail service answers.
 *
 * !! Separate from sending on purpose: it opens a connection and says
 * !! nothing, so it can be run on its own to find out whether a mail server
 * !! is reachable. Sending a message to find that out would leave a message
 * !! in somebody's inbox every time somebody tested the settings.
 *
 * !! For the HTTPS mail API there is no "verify" call, so this only proves
 * !! that the API answered - not that the key is good. The key is proved by
 * !! sending, which is the thing that has to be right anyway.
 *
 * @returns {Promise<{ok: boolean, error?: string, note?: string}>}
 */
export async function verifyMailConnection() {
  const config = mailConfig();
  if (!config.configured) {
    return { ok: false, error: `Mail is not configured (missing ${config.missing.join(", ")})` };
  }

  if (config.transport === "api") {
    try {
      const response = await fetch(config.apiUrl, {
        method: "GET",
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      return {
        ok: true,
        note: `${config.apiProviderLabel} answered with HTTP ${response.status}; the API key was not checked`,
      };
    } catch (err) {
      return { ok: false, error: `Could not reach ${config.apiProviderLabel}: ${err.message}` };
    }
  }

  try {
    await getTransport(config).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Where the contact form sends its messages.
 */
export function contactFormRecipient() {
  return mailConfig().contactTo;
}

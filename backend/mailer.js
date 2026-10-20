// mailer.js
/**
 * Sending email over SMTP.
 *
 * !! Extracted from server.js for the same reason dbConfig.js was extracted:
 * !! the credentials have to be read in ONE place, by everything that needs
 * !! them, and the rule about what "configured" means has to be the same
 * !! everywhere. A second copy of "is SMTP configured" is how a contact form
 * !! ends up answering "not configured" while the invite email goes out.
 *
 * !! Why SMTP and not an HTTP mail API: the app sends its email from an
 * !! account it already has, with a password it already has. The HTTP API
 * !! needed a domain verified with a third party before a single message
 * !! could go to a real student - and until that was done, every message had
 * !! to be redirected to the account owner's own inbox, because the sandbox
 * !! domain is not allowed to send to anyone else. That redirect was not a
 * !! safety net. It was the only way a message could leave the building, and
 * !! it meant a student's setup invite and a student's password reset both
 * !! went to one person's inbox instead of to the student.
 *
 * !! Everything here is plain text. No HTML, no attachments, no template
 * !! engine. The three messages this app sends are an invite link, a
 * !! password reset link, and a message from the contact form - and all three
 * !! read better as plain text than as a newsletter.
 */

import nodemailer from "nodemailer";

/**
 * How long to wait for the SMTP server before giving up.
 *
 * !! A request that waits for a mail server that is not answering holds an
 * !! HTTP connection open until the browser gives up, and the person waiting
 * !! for it is a student who has just pressed "reset my password". A short
 * !! timeout turns a hung mail server into a quick, logged failure instead
 * !! of a page that spins for two minutes.
 */
const SMTP_TIMEOUT_MS = 15000;

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
const DEFAULT_CONTACT_TO = "jenacademia@gmail.com";

let cachedTransport = null;
let cachedTransportKey = "";

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

  const missing = [];
  if (!host) missing.push("SMTP_HOST");
  if (!user) missing.push("SMTP_USER");
  if (!pass) missing.push("SMTP_PASS");

  return {
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
    configured: missing.length === 0,
    missing,
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
 * !! It never includes the password. A credential printed to a log is a
 * !! credential in every log aggregator, every crash reporter and every
 * !! screenshot of the console.
 */
export function describeMailConfig() {
  const config = mailConfig();
  if (!config.configured) {
    return `not configured (missing: ${config.missing.join(", ")})`;
  }
  return `${config.host}:${config.port} as ${config.user}${config.redirectTo ? " (redirecting all mail)" : ""}`;
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
 * Send one plain-text email.
 *
 * !! It returns { sent: false, skipped: true } when email is not configured,
 * !! rather than throwing. A server with no mail settings should still serve
 * !! the app: the admin can create an account, the link can be copied by
 * !! hand, and the only thing lost is the email itself. Throwing there took
 * !! down routes that had nothing to do with email.
 *
 * !! It DOES throw when the mail server is configured and then fails. That is
 * !! a different thing - the message was meant to go out and did not - and
 * !! the callers need to know, because a student who never receives their
 * !! password reset has to be told something other than "we sent it".
 *
 * @param {{to: string, subject: string, text: string}} mail
 * @returns {Promise<{sent: boolean, skipped?: boolean, redirectedTo?: string}>}
 */
export async function sendMail({ to, subject, text }) {
  const config = mailConfig();

  if (!config.configured) {
    console.warn(
      `Email was not sent: SMTP is not configured (missing ${config.missing.join(", ")}).`
    );
    return { sent: false, skipped: true };
  }

  const recipient = String(to || "").trim();
  if (!recipient) {
    throw new Error("An email needs a recipient.");
  }

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

  const transport = getTransport(config);
  await transport.sendMail({
    from: config.fromName ? `"${config.fromName}" <${config.from}>` : config.from,
    to: actualTo,
    subject: actualSubject,
    text: actualText,
  });

  return redirectedTo ? { sent: true, redirectedTo } : { sent: true };
}

/**
 * Check that the mail server answers and the credentials work.
 *
 * !! Separate from sending on purpose: it opens a connection and says
 * !! nothing, so it can be run on its own to find out whether a mail server
 * !! is reachable. Sending a message to find that out would leave a message
 * !! in somebody's inbox every time someone tested the settings.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function verifyMailConnection() {
  const config = mailConfig();
  if (!config.configured) {
    return { ok: false, error: `SMTP is not configured (missing ${config.missing.join(", ")})` };
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

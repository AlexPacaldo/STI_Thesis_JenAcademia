/**
 * Tests for sending email over SMTP.
 *
 *   node scripts/test-mailer.mjs
 *
 * !! Three emails depend on this: the account setup invite, the password
 * !! reset, and the message from the contact form. All three fail QUIETLY
 * !! when it is wrong - the invite says "prepared, but email was not sent",
 * !! the reset says the same thing it always says, and the contact form says
 * !! "not configured". Nobody sees a failure, so nobody fixes it, and a
 * !! student's password reset goes nowhere for a week.
 * !!
 * !! So the transport is tested against a real socket here, not mocked. A
 * !! mock proves that the code calls the library; it does not prove that a
 * !! message leaves the building.
 */

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  contactFormRecipient,
  describeMailConfig,
  isMailConfigured,
  mailConfig,
  sendMail,
} from "../backend/mailer.js";

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

/* --------------------------------------------------------- a fake server */

/**
 * Split a received message into its headers and its body.
 *
 * !! The headers matter as much as the body: the subject is how a student
 * !! knows what the message is, and the from address is how they know it
 * !! came from JEN Academia and not from somebody else.
 */
function parseMessage(message) {
  const raw = message.raw || "";
  const separator = raw.indexOf("\n\n");
  const headerText = separator === -1 ? raw : raw.slice(0, separator);
  const body = separator === -1 ? "" : raw.slice(separator + 2);

  const headers = {};
  headerText.split("\n").forEach((line) => {
    const match = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (match) headers[match[1].toLowerCase()] = match[2];
  });

  return { ...message, headers, body };
}

/**
 * A very small SMTP server, so a message can be sent to it and read back.
 *
 * !! It speaks only what nodemailer needs: a greeting, EHLO, AUTH, MAIL FROM,
 * !! RCPT TO, DATA and QUIT. It does not advertise STARTTLS, so nodemailer
 * !! talks to it in plain text - which is exactly what a server on a private
 * !! network looks like.
 */
function startFakeSmtp() {
  const messages = [];

  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = "";
    let current = null;

    socket.write("220 localhost ESMTP fake\r\n");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      let index;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push(parseMessage(current));
            current = null;
            socket.write("250 OK queued\r\n");
          } else {
            // A dot at the start of a line is doubled by the protocol.
            current.raw += `${line.startsWith("..") ? line.slice(1) : line}\n`;
          }
          continue;
        }

        const command = line.toUpperCase();

        if (command.startsWith("EHLO") || command.startsWith("HELO")) {
          socket.write("250-localhost\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 10485760\r\n");
        } else if (command.startsWith("AUTH PLAIN")) {
          socket.write("235 2.7.0 Authentication successful\r\n");
        } else if (command.startsWith("AUTH LOGIN")) {
          socket.write("334 VXNlcm5hbWU6\r\n");
        } else if (command.startsWith("MAIL FROM")) {
          current = { from: "", to: [], raw: "" };
          const match = line.match(/<([^>]*)>/);
          current.from = match ? match[1] : "";
          socket.write("250 OK\r\n");
        } else if (command.startsWith("RCPT TO")) {
          const match = line.match(/<([^>]*)>/);
          current.to.push(match ? match[1] : "");
          socket.write("250 OK\r\n");
        } else if (command === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (command === "QUIT") {
          socket.write("221 Bye\r\n");
          socket.end();
        } else if (command === "RSET" || command === "NOOP") {
          socket.write("250 OK\r\n");
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });

    socket.on("error", () => {});
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        messages,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/* ------------------------------------------------- what the env says */

const savedEnv = { ...process.env };

function setEnv(values) {
  for (const key of [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SMTP_FROM_NAME",
    "SMTP_EHLO_DOMAIN",
    "SMTP_REDIRECT_TO",
    "CONTACT_FORM_TO",
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = String(value);
  }
}

setEnv({});

check("with nothing set, email is not configured", isMailConfigured(), false);
check("and it says what is missing", mailConfig().missing, ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]);
check("and it does not say configured", describeMailConfig().includes("not configured"), true);

setEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@b.com", SMTP_PASS: "hunter2" });
check("with a host, a user and a password it is configured", isMailConfigured(), true);
check("the port defaults to 587", mailConfig().port, 587);
check("587 is not implicit TLS", mailConfig().secure, false);
check("the from address defaults to the user", mailConfig().from, "a@b.com");
check("the from name defaults to JEN Academia", mailConfig().fromName, "JEN Academia");
check("the contact form goes to the published address", contactFormRecipient(), "jenacademia@gmail.com");

setEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@b.com", SMTP_PASS: "x", SMTP_PORT: "465" });
check("465 is implicit TLS", mailConfig().secure, true);

setEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@b.com", SMTP_PASS: "x", SMTP_SECURE: "TRUE" });
check("SMTP_SECURE says so in any case", mailConfig().secure, true);

setEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@b.com", SMTP_PASS: "x", SMTP_FROM: "noreply@jenacademia.com" });
check("the from address can be its own thing", mailConfig().from, "noreply@jenacademia.com");

setEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@b.com", SMTP_PASS: "x", CONTACT_FORM_TO: "inbox@example.com" });
check("the contact form address can be changed", contactFormRecipient(), "inbox@example.com");

// !! A password in a start-up log is a password in every log aggregator, every
// !! crash reporter and every screenshot of the console.
setEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@b.com", SMTP_PASS: "hunter2" });
check("the description never includes the password", describeMailConfig().includes("hunter2"), false);
check("but it does say which account it uses", describeMailConfig().includes("a@b.com"), true);

/* --------------------------------------------- nothing configured is safe */

// !! With no mail server, the app has to keep working: the admin can still
// !! create an account, the link can still be copied by hand, and the only
// !! thing lost is the email. So this is a skip, not a crash - and it says
// !! out loud that it skipped, because a silent skip is how a mail server
// !! stays broken for a week.
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(" "));

setEnv({});
const skipped = await sendMail({ to: "student@example.com", subject: "Hi", text: "Hello" });

console.warn = realWarn;

check("with no mail server, sending is skipped rather than thrown", skipped, { sent: false, skipped: true });
check("and it says the mail server is not configured", warnings.some((w) => w.includes("SMTP is not configured")), true);
check("and it names what is missing", warnings.some((w) => w.includes("SMTP_HOST") && w.includes("SMTP_PASS")), true);

/* --------------------------------------- a message, end to end, over SMTP */

const smtp = await startFakeSmtp();

setEnv({
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: smtp.port,
  SMTP_SECURE: "false",
  SMTP_USER: "academy@jenacademia.com",
  SMTP_PASS: "app-password",
  SMTP_FROM: "academy@jenacademia.com",
  SMTP_FROM_NAME: "JEN Academia",
});

const sent = await sendMail({
  to: "student@example.com",
  subject: "Set up your JEN Academia student account",
  text: "Hi Alex,\n\nPlease use this link:\n\nhttps://example.com/setup/abc123\n",
});

check("the message was sent", sent.sent, true);
check("one message arrived", smtp.messages.length, 1);

const [message] = smtp.messages;
check("it went to the student", message.to, ["student@example.com"]);
check("it came from the academy", message.from, "academy@jenacademia.com");
check("the subject is the subject", message.headers.subject, "Set up your JEN Academia student account");
check("the body is the body", message.body.includes("https://example.com/setup/abc123"), true);
check("the body keeps its lines", message.body.includes("Hi Alex,"), true);
check("the from name is in the headers", (message.headers.from || "").includes("JEN Academia"), true);

/* ------------------------------------------------- the dev redirect */

setEnv({
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: smtp.port,
  SMTP_SECURE: "false",
  SMTP_USER: "academy@jenacademia.com",
  SMTP_PASS: "app-password",
  SMTP_REDIRECT_TO: "developer@example.com",
});

const redirected = await sendMail({
  to: "student@example.com",
  subject: "Reset your JEN Academia password",
  text: "https://example.com/reset/xyz789",
});

check("a redirected message is still sent", redirected.sent, true);
check("and it says where it was going", redirected.redirectedTo, "developer@example.com");

const redirectedMessage = smtp.messages[smtp.messages.length - 1];
check("it went to the developer, not the student", redirectedMessage.to, ["developer@example.com"]);
check("the student is named in the body", redirectedMessage.body.includes("Originally addressed to: student@example.com"), true);
check("the subject is marked", redirectedMessage.headers.subject.includes("[DEV]"), true);
check("the real body is still there", redirectedMessage.body.includes("https://example.com/reset/xyz789"), true);

// !! The redirect was a workaround for a mail provider that could only send to
// !! its own account holder, and it stayed in the code long after the reason
// !! for it was gone. With it on by default, every student's setup invite and
// !! password reset went to one person's inbox instead of to the student.
setEnv({
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: smtp.port,
  SMTP_SECURE: "false",
  SMTP_USER: "academy@jenacademia.com",
  SMTP_PASS: "app-password",
});
const notRedirected = await sendMail({ to: "student@example.com", subject: "Hello", text: "Hi" });
check("with no redirect set, the message goes to the student", smtp.messages[smtp.messages.length - 1].to, ["student@example.com"]);
check("and nothing says it was redirected", notRedirected.redirectedTo, undefined);

await smtp.close();

/* --------------------------------------------- the whole system, no Resend */

// !! "Resend" is also an ordinary English word - "ask the admin to resend it",
// !! "Resend Invite" on a button - so the guard looks for the SERVICE and not
// !! for the word. A guard that flagged the word would have had to be turned
// !! off, and a guard that gets turned off is not a guard.
const RESEND_MARKERS = [
  "RESEND_API_KEY",
  "resend.emails",
  "new Resend",
  'from "resend"',
  "@resend.dev",
  "RESEND_TEST_EMAIL",
];

const SOURCES = [
  "backend/server.js",
  "backend/mailer.js",
  "backend/.env.example",
  "backend/package.json",
  "frontend/src/pages/homepage.jsx",
  "frontend/src/pages/ForgotPassword.jsx",
  "frontend/src/pages/ResetPassword.jsx",
  "frontend/src/pages/login.jsx",
  "frontend/src/pages/AdminDashboard.jsx",
];

for (const rel of SOURCES) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`  - ${rel} is listed but does not exist`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  for (const marker of RESEND_MARKERS) {
    check(`${rel} does not use "${marker}"`, source.includes(marker), false);
  }
}

// The dependency itself has to be gone, not just the imports.
const backendPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "backend/package.json"), "utf8"));
check("the resend package is not a dependency", backendPackage.dependencies?.resend, undefined);
check("nodemailer is a dependency", typeof backendPackage.dependencies?.nodemailer, "string");

// !! The server used to answer "not configured" on one route and send on
// !! another, because two copies of the rule disagreed.
const serverSource = fs.readFileSync(path.join(repoRoot, "backend/server.js"), "utf8");
check("the server uses the shared mail check", serverSource.includes("isMailConfigured()"), true);
check("and never invents its own", serverSource.includes("smtpConfigured"), false);
check("and never calls the old sender", serverSource.includes("sendSmtpMail"), false);
check("the contact form does not hard-code an address", serverSource.includes('to: "alexpacaldo1105@gmail.com"'), false);

// The env template has to teach the new settings.
const envExample = fs.readFileSync(path.join(repoRoot, "backend/.env.example"), "utf8");
for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
  check(`.env.example documents ${key}`, envExample.includes(`${key}=`), true);
}
check(".env.example does not document RESEND_API_KEY", envExample.includes("RESEND_API_KEY"), false);

// !! A password reset that answers differently for a real account and a
// !! made-up one is how somebody finds out who has an account here.
check(
  "a failed reset email does not change the answer",
  /catch \(mailErr\)[\s\S]{0,400}res\.json\(\{ message: "If that email exists/.test(serverSource),
  true
);

// Leave the environment as it was found.
for (const key of Object.keys(process.env)) {
  if (!(key in savedEnv)) delete process.env[key];
}
Object.assign(process.env, savedEnv);

if (failures.length) {
  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  console.log("FAILED:");
  for (const failure of failures) console.log(failure);
  process.exit(1);
}
console.log(`\n${passed}/${passed} checks passed.`);
console.log("All good.");

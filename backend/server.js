// server.js (ESM)
import bcrypt from "bcryptjs";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import multer from "multer";
import mysql from "mysql2/promise";
import path from "path";
import { assessClassEvidence } from "./classEvidence.js";
// Aliased on purpose: the wrapper below owns the throttle and the logging, and two
// functions called archiveDormantAccounts in one file is how the policy engine and
// the scheduler get swapped over by accident.
import { archiveDormantAccounts as archiveDormantAccountsNow } from "./accountDormancy.js";
import { fetchAdminOverview } from "./adminOverview.js";
import { createDbStore, ensureRateLimitsTable } from "./dbRateLimit.js";
import {
  DB_CONNECTION_LIMIT,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
  DB_USER,
  assertDbPasswordPresent,
  describeDbConfig,
} from "./dbConfig.js";
import { CONTRACT_EXPIRY_WARNING_DAYS, CONTRACT_TERM_MONTHS } from "./contractTerms.js";
import {
  appendRevision,
  buildRevisionSnapshot,
  canCancelRequest,
  describeRevisions,
  normalizeRequestType,
} from "./contractRequestFlow.js";
import { createRateLimiter } from "./rateLimit.js";
import { describeCorsOrigins, resolveCorsOrigins } from "./corsOrigins.js";
import {
  MailTransportError,
  contactFormRecipient,
  describeMailConfig,
  isMailConfigured,
  sendMail,
} from "./mailer.js";
import { accountInviteEmail, contactFormEmail, passwordResetEmail } from "./emailTemplates.js";
import { readBearerToken, signSessionToken, verifySessionToken } from "./sessionToken.js";
import {
  RESCHEDULE_CLOSED_AFTER_START_MESSAGE,
  buildOtherPartyDeclineMessage,
  buildRequesterDeclineMessage,
  isRescheduleClosedByStart,
  normalizeDeclineReason,
} from "./rescheduleRequestFlow.js";
import { signFileLink, verifyFileLink } from "./fileLink.js";
import { deleteRecordingFromDrive, extractDriveFileId, isGoogleDriveConfigured, uploadRecordingToDrive } from "./googleDrive.js";
import {
  buildLevelEvaluationNotes,
  computeProficiencyLevel,
  parseLevelScores,
} from "./proficiencyEvaluation.js";
import {
  overBalanceTeachers,
  rankTeachers,
  scoreTeacherForStudent,
  selectTeacherFromRanking,
  evaluateAvailability,
  AVAILABILITY_HORIZON_DAYS,
  TEACHER_BALANCE_LIMIT,
  preferAvailable,
  applyAdvisorOrder,
  assessMatchStrength,
  preferTeachesChildren,
  teacherWillTeachChildren,
  isChildAge,
  ageFromBirthDate,
  CHILD_MAX_AGE,
} from "./teacherMatching.js";
import { adviseTeacherRanking, isTeacherAdvisorConfigured } from "./teacherAdvisor.js";
import {
  isResumeParserConfigured,
  MAX_RESUME_BYTES,
  parseResumeCourseNames,
  parseTeacherResume,
  RESUME_MIME_TYPES,
} from "./teacherResumeParser.js";
import { deriveMatchInsights, mergeInsights } from "./matchInsights.js";

dotenv.config();

const PORT = process.env.PORT || 3001;
const INVITE_EXPIRY_HOURS = Number(process.env.ACCOUNT_INVITE_EXPIRY_HOURS || 24);
// Where the credentials come from - DB_*, then MYSQL*, then a parsed MYSQL_URL or
// DATABASE_URL, which is what Railway provides. See dbConfig.js.
//
// The whole chain used to live here inline. It was moved because the demo seeder
// needed the same one and had a shortened copy that read DB_* only: against
// Railway, where the credential arrives as MYSQL_URL, that copy found nothing and
// connected to localhost with no password. Two copies of this is how that
// happened, so there is one now.
assertDbPasswordPresent();
const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_ROOT ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    path.join(process.cwd(), "uploads")
);
const PRIVATE_UPLOAD_ROOT = path.resolve(
  process.env.PRIVATE_UPLOAD_ROOT ||
    path.join(process.cwd(), "private-uploads")
);
const VOLUME_MOUNT_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || "";

/** Is `child` the same as, or inside, `parent`? */
function isInsidePath(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Read the new end date an admin chose when approving an extension.
 *
 * Must be a real date in the future. A date at or before now would be accepted
 * by a naive parse and then immediately undone by expireFinishedPackages, which
 * runs every 60 seconds - the admin would watch an approval evaporate with no
 * error anywhere. Rejecting it at the boundary is the only place that can be
 * sure.
 *
 * Returns a Date, or null when the input is unusable.
 */
function parseAdminExtensionExpiry(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() <= Date.now()) return null;
  return parsed;
}

/**
 * Say plainly at start-up whether uploads will survive a deploy.
 *
 * Railway mounts a volume at RAILWAY_VOLUME_MOUNT_PATH and wipes everything else
 * on redeploy. UPLOAD_ROOT is set explicitly, so if it points anywhere else - a
 * typo, or a leftover from local development - profile pictures and assignment
 * files disappear silently on the next deploy. Nothing else in the app reveals
 * that, which is why it is reported here and on the service console.
 */
function reportUploadPersistence() {
  console.log(`Uploads directory: ${UPLOAD_ROOT}`);
  console.log(`Private uploads:   ${PRIVATE_UPLOAD_ROOT}`);

  if (!VOLUME_MOUNT_PATH) {
    console.warn(
      "RAILWAY_VOLUME_MOUNT_PATH is not set, so no volume is attached to this " +
        "service. Everything under the uploads directory is container-local and " +
        "will be lost on the next deploy."
    );
    return;
  }

  const mount = path.resolve(VOLUME_MOUNT_PATH);
  console.log(`Volume mounted at: ${mount}`);

  if (!isInsidePath(UPLOAD_ROOT, mount)) {
    console.warn(
      `UPLOAD_ROOT (${UPLOAD_ROOT}) is NOT inside the volume mount (${mount}). ` +
        "Uploads are going to the container's ephemeral disk and will be lost on " +
        "the next deploy. Either set UPLOAD_ROOT to a path inside the mount, or " +
        "mount the volume at that path."
    );
  } else {
    console.log("Uploads are persisted on the volume.");
  }

  if (!isInsidePath(PRIVATE_UPLOAD_ROOT, mount)) {
    console.warn(
      `PRIVATE_UPLOAD_ROOT (${PRIVATE_UPLOAD_ROOT}) is NOT inside the volume mount ` +
        `(${mount}); locally cached class recordings are container-local. The Drive ` +
        "copy is unaffected, so this only means a redeploy drops the local copies."
    );
  }
}

const RECORDING_RETENTION_DAYS = Number(process.env.CLASS_RECORDING_RETENTION_DAYS || 7);

const app = express();

// Railway terminates TLS and forwards over an internal hop, so without this
// req.ip is the proxy's address rather than the caller's, and every client ends
// up sharing one rate-limit bucket. It also makes req.protocol report "http",
// which is what the assignment upload URL at POST /api/assignments is built
// from. Exactly one hop is trusted because that is how many Railway sits in
// front of this app; trusting more would let a client forge the header and
// pick its own bucket.
app.set("trust proxy", 1);

// Which websites may talk to this API.
//
// !! One policy, used for the request AND for the preflight. There used to
// !! be a second `app.options(/(.*)/, cors())` with the library's defaults,
// !! which allow every origin - so the preflight and the actual request
// !! could disagree about who was allowed, and which one answered depended
// !! on the order the middlewares ran in. It is the same list now, and it
// !! is printed at start-up, because a domain that is not on the list fails
// !! silently on the server and only visibly in a browser console.
const CORS_ORIGINS = resolveCorsOrigins();
console.log(`[cors] Allowed origins: ${describeCorsOrigins(CORS_ORIGINS)}`);

const corsOptions = {
  origin: CORS_ORIGINS,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
};
app.use(cors(corsOptions));
app.options(/(.*)/, cors(corsOptions));
app.use(express.json());

const ENCRYPTED_VALUE_PREFIX = "enc:v1:";
const ENCRYPTION_SECRET =
  process.env.CHAT_ENCRYPTION_KEY ||
  process.env.ENCRYPTION_KEY ||
  process.env.JWT_SECRET ||
  DB_PASSWORD;
const ENCRYPTION_KEY = crypto.scryptSync(String(ENCRYPTION_SECRET), "jen-academia-chat-v1", 32);

if (!process.env.CHAT_ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET) {
  console.warn("CHAT_ENCRYPTION_KEY is not set; using DB_PASSWORD as the chat encryption secret.");
}


// Signing key for session tokens. Preferred over reusing the chat secret so the
// two can be rotated independently.
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.ENCRYPTION_SECRET ||
  process.env.CHAT_ENCRYPTION_KEY ||
  process.env.ENCRYPTION_KEY ||
  process.env.JWT_SECRET ||
  DB_PASSWORD;
const SESSION_TTL_MS = Math.max(60_000, Number(process.env.SESSION_TTL_MS) || 12 * 60 * 60 * 1000);

if (!process.env.SESSION_SECRET) {
  console.warn(
    "SESSION_SECRET is not set; falling back to another secret for signing session tokens. " +
      "Set SESSION_SECRET to a long random value so tokens cannot be forged by anyone who can read the source."
  );
}

// What email is going to do, said out loud at start-up.
//
// !! Three messages depend on this - the account setup invite, the password
// !! reset and the contact form - and all three fail quietly when it is
// !! misconfigured: the invite route says "prepared, but email was not sent",
// !! the reset says the same thing it always says, and the contact form says
// !! "not configured". Nobody sees a failure, so nobody fixes it. One line
// !! at start-up is the difference between a mail server that is working and
// !! one that has been broken since Tuesday.
console.log(`[mail] ${describeMailConfig()}`);
if (!isMailConfigured()) {
  console.warn(
    "[mail] Email is not configured, so account setup invites, password resets " +
      "and the contact form will not send anything. Set MAIL_API_KEY (for the " +
      "HTTPS mail API), or SMTP_HOST, SMTP_USER and SMTP_PASS."
  );
}
if (String(process.env.SMTP_REDIRECT_TO || "").trim()) {
  console.warn(
    `[mail] EVERY email is being redirected to ${process.env.SMTP_REDIRECT_TO}. ` +
      "Clear SMTP_REDIRECT_TO when this is a real server."
  );
}

// Where the links inside those emails point.
//
// !! The setup invite link and the password reset link are built from this,
// !! and if it is wrong every one of them is a dead link. The fallback is
// !! localhost, which is right on a laptop and useless to a student on a
// !! phone, so it is said out loud for the same reason the mail setup is.
console.log(`[frontend] base URL: ${getFrontendBaseUrl()}`);
if (
  process.env.NODE_ENV === "production" &&
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(getFrontendBaseUrl())
) {
  console.warn(
    "[frontend] The base URL is still localhost, so every setup invite link and " +
      "every password reset link will point at a developer's own machine " +
      "instead of the live site. Set FRONTEND_BASE_URL."
  );
}

function encryptNullableText(value) {
  if (value === null || value === undefined) return null;

  const text = String(value);
  if (!text || text.startsWith(ENCRYPTED_VALUE_PREFIX)) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_VALUE_PREFIX.slice(0, -1),
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptNullableText(value) {
  if (value === null || value === undefined) return null;

  const text = String(value);
  if (!text.startsWith(ENCRYPTED_VALUE_PREFIX)) return text;

  try {
    const [, , ivBase64, tagBase64, encryptedBase64] = text.split(":");
    if (!ivBase64 || !tagBase64 || !encryptedBase64) return "";

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      ENCRYPTION_KEY,
      Buffer.from(ivBase64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    console.error("Could not decrypt stored text:", err);
    return "";
  }
}

function decryptFields(row, fields) {
  if (!row) return row;
  const next = { ...row };
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(next, field)) {
      next[field] = decryptNullableText(next[field]);
    }
  });
  return next;
}

function decryptRows(rows, fields) {
  return Array.isArray(rows) ? rows.map((row) => decryptFields(row, fields)) : [];
}

function getFrontendBaseUrl() {
  const explicit = process.env.FRONTEND_BASE_URL || process.env.PUBLIC_APP_URL || "";
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  return "http://localhost:5173";
}

function makeSetupInviteUrl(token) {
  return `${getFrontendBaseUrl()}/setup-account/${encodeURIComponent(token)}`;
}

function hashInviteToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeEmailHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

async function sendAccountSetupInviteEmail({ email, firstName, role, inviteUrl, expiresAt }) {
  const expiryText = new Date(expiresAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const roleLabel = role === "teacher" ? "teacher" : "student";
  const { text, html } = accountInviteEmail({
    firstName,
    roleLabel,
    inviteUrl,
    expiresText: expiryText,
    contactEmail: contactFormRecipient(),
  });

  return sendMail({
    to: email,
    subject: `Set up your JEN Academia ${roleLabel} account`,
    text,
    html,
  });
}

async function createAccountSetupInvite(connection, userId) {
  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
  const expiresAtSql = expiresAt.toISOString().slice(0, 19).replace("T", " ");

  await connection.query(
    "UPDATE account_setup_invites SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
  await connection.query(
    "INSERT INTO account_setup_invites (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [userId, tokenHash, expiresAtSql]
  );

  return {
    token,
    inviteUrl: makeSetupInviteUrl(token),
    expiresAt,
  };
}

function formatNotificationReason(reason, maxLength = 240) {
  const text = String(reason || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMysqlConnectionLimitError(err) {
  return err?.code === "ER_USER_LIMIT_REACHED" || err?.errno === 1226;
}

const uploadDir = path.join(UPLOAD_ROOT, "assignments");
fs.mkdirSync(uploadDir, { recursive: true });
const profileUploadDir = path.join(UPLOAD_ROOT, "profiles");
fs.mkdirSync(profileUploadDir, { recursive: true });
const classProofUploadDir = path.join(UPLOAD_ROOT, "class-proofs");
fs.mkdirSync(classProofUploadDir, { recursive: true });
const classRecordingUploadDir = path.join(PRIVATE_UPLOAD_ROOT, "class-recordings");
fs.mkdirSync(classRecordingUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

// An optional single "file" field, on a route that may not be multipart at all.
//
// Shared by the two file-bearing assignment routes: the worksheet a teacher
// attaches when posting a task, and the work a student sends back. Both files
// are optional - a task can be instructions only, and a submission can be a
// written answer with nothing attached - so this passes through when no file
// part is present rather than rejecting the request.
//
// Multipart is detected instead of assumed because both routes are also reached
// with a plain JSON body, and handing that to multer throws.
const optionalFileUpload = (req, res, next) => {
  if (!req.is("multipart/form-data")) {
    next();
    return;
  }

  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Error uploading file" });
      return;
    }
    next();
  });
};

// Build the public URL for a file just written by multer.
//
// Built from the request rather than a configured base URL so the value stays
// correct behind the Railway TLS hop, and from req.file.filename rather than
// the client's name so a traversal attempt in the name cannot escape the
// uploads directory.
function uploadedFileUrl(req, file) {
  if (!file) return null;
  return `${req.protocol}://${req.get("host")}/uploads/assignments/${encodeURIComponent(file.filename)}`;
}

// For GET /f, which streams a file off disk and so has no req.file.mimetype to
// read. Without a correct type the browser downloads instead of rendering, which
// is the one thing that route exists to avoid.
const MIME_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/**
 * Turn a stored upload URL back into a path on disk.
 *
 * The stored value is the file's public URL, but express.static is mounted AT
 * /uploads, so that segment is the mount point rather than a folder inside
 * UPLOAD_ROOT - keeping it resolves one directory too deep and 404s.
 *
 * Returns null when the result would land outside UPLOAD_ROOT, so a stored
 * value containing traversal cannot produce a readable path.
 */
function uploadPathFromStoredUrl(storedUrl) {
  if (!storedUrl) return null;
  const relative = String(storedUrl)
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^uploads\//, "");
  const absolute = path.join(UPLOAD_ROOT, relative);
  return isInsidePath(absolute, UPLOAD_ROOT) ? absolute : null;
}

/**
 * Delete a file from the uploads tree, ignoring one that is already gone.
 *
 * Best effort by design: a missing file must not fail the request that is
 * cleaning up the database, or a half-finished delete would leave the rows in
 * place and make the button look broken.
 */
function removeUploadedFile(storedUrl) {
  const absolute = uploadPathFromStoredUrl(storedUrl);
  if (!absolute) return;
  fs.promises.unlink(absolute).catch((err) => {
    if (err?.code !== "ENOENT") {
      console.warn("Could not remove uploaded file", absolute, "-", err.message);
    }
  });
}

const profileStorage = multer.diskStorage({
  destination: profileUploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});
const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPG, PNG, WEBP, and GIF profile images are allowed"));
  },
});
const classProofStorage = multer.diskStorage({
  destination: classProofUploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".webp";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});
const classProofUpload = multer({
  storage: classProofStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPG, PNG, and WEBP class proof screenshots are allowed"));
  },
});
const classRecordingStorage = multer.diskStorage({
  destination: classRecordingUploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".webm";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});
const classRecordingUpload = multer({
  storage: classRecordingStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["video/webm", "video/mp4", "video/x-matroska"].includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only WEBM or MP4 class recordings are allowed"));
  },
});
// Resume auto-fill. Memory storage, not disk: the upload is forwarded to Gemini
// and never persisted, so a CV cannot be left sitting in the uploads folder.
// The stored resume is the admin's own text bio, not the file.
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_BYTES },
  fileFilter: (_req, file, cb) => {
    if (RESUME_MIME_TYPES[file.mimetype]) {
      cb(null, true);
      return;
    }
    cb(new Error("Resume must be a PDF, DOCX, or TXT file"));
  },
});

// The resume parser rate limiter is declared below, next to the MySQL pool it
// reads its shared counters from. It cannot live here: `pool` is a const
// declared further down, so referencing it at module scope up here is a
// temporal dead zone ReferenceError thrown while the module is still
// evaluating - which crashes the process at startup, before any route runs and
// outside the try/catch around the counter table migration.

// Static files: profile photos, assignment submissions, class proof screenshots,
// lesson PDFs and book covers.
//
// !! KNOWN, ACCEPTED: this is deliberately unauthenticated, unlike every API
// !! route. Do not "fix" it without reading this first, because the obvious
// !! approaches both fail here.
//!
// Stored files are only served to a signed-in account.
//
// Filenames are a millisecond timestamp plus 8 bytes of random hex, so nothing
// here was ever browsable or guessable - the exposure was that a URL leaking
// through a shared link or a screenshot stayed readable by anyone, indefinitely.
// Every API route that returns one of these paths requires a session, so the
// URLs are not handed out to anonymous callers in the first place; this closes
// the second half, where the URL itself is the only thing an attacker needs.
//
// CORS is mounted above this (and app.options(/(.*)/) answers preflights for
// every path), which is what lets the browser send the Authorization header on
// these cross-origin requests.
//
// See requireSessionForUpload below for why this was not simply requireSession,
// and frontend/src/utils/authenticatedFile.js for the client half.
// A blob: URL is not reused across page loads, so every avatar on a page is a
// fresh request where a plain <img src> would have come from the browser's
// cache. Caching privately for a few minutes puts that back.
//
// Safe because these files are immutable in practice: an upload is written to a
// new timestamp-plus-random filename, so replacing a profile picture yields a
// new URL rather than new bytes at the old one. Anything that must take effect
// promptly - an archived account - is handled by invalidating the session memo
// below, not by the cache lifetime.
//
// private, not public: express.static would send `public, max-age`, which
// invites a shared cache to store a file only reachable with a session.
const UPLOAD_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

app.use("/uploads", requireSessionForUpload, express.static(UPLOAD_ROOT, {
  maxAge: UPLOAD_CACHE_MAX_AGE_MS,
  setHeaders(res) {
    res.setHeader("Cache-Control", `private, max-age=${Math.floor(UPLOAD_CACHE_MAX_AGE_MS / 1000)}`);
  },
}));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// MySQL pool
const poolConfig = {
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
  maxIdle: DB_CONNECTION_LIMIT,
  idleTimeout: 10000,
  queueLimit: 0,
};

if (String(process.env.DB_SSL || "").toLowerCase() === "true") {
  poolConfig.ssl = { rejectUnauthorized: false };
}

export const pool = mysql.createPool(poolConfig);

/**
 * Require a signed session token, and then corroborate it against the database.
 *
 * The signature proves the server issued the token. The database check is what
 * makes revocation real: a token stays cryptographically valid until it expires,
 * so without re-reading the account an archived or suspended user would keep
 * their access until the token aged out.
 *
 * Replaces the previous arrangement on admin routes, where the caller stated an
 * admin_id in the request body and requireAdmin believed it.
 */
//! Must stay below the `pool` declaration above.
async function authenticateSession(req, res) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Sign in to continue" });
    return null;
  }

  const claims = verifySessionToken(token, { secret: SESSION_SECRET });
  if (!claims) {
    res.status(401).json({ message: "Your session has expired. Please sign in again" });
    return null;
  }

  try {
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, role, status, is_super_admin
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [claims.sub]
    );

    const account = rows[0];
    if (!account || account.status !== "active") {
      res.status(401).json({ message: "This account is no longer active" });
      return null;
    }

    // Verified from the database, not from the token payload.
    req.session = {
      userId: account.user_id,
      role: account.role,
      firstName: account.first_name,
      lastName: account.last_name,
      isSuperAdmin: Boolean(account.is_super_admin),
    };
    return req.session;
  } catch (err) {
    console.error("authenticateSession error:", err);
    res.status(500).json({ message: "Could not verify your session" });
    return null;
  }
}

/** Any signed-in account, whatever its role. */
async function requireSession(req, res, next) {
  if (!(await authenticateSession(req, res))) return;
  next();
}

/**
 * Require a signed-in account before serving anything from /uploads.
 *
 * !! Why this was left open until now, and why the obvious fixes did not work:
 * !! these URLs render as <img src> and are used as <a href> downloads, and
 * !! neither can send an Authorization header. A plain requireSession in front
 * !! of the static handler therefore 401'd every avatar in the app (d5be64a, and
 * !! the note that stood here until this commit).
 * !!
 * !! Tried and reverted (d5be64a): a session cookie scoped to Path=/uploads.
 * !! The frontend is on jenacademia.vercel.app and the API on railway.app, so an
 * !! <img> request is cross-site and SameSite=Lax is never sent on it - every
 * !! image 401'd. SameSite=None would work but lets any site the user visits
 * !! make authenticated requests, which is a worse trade than the exposure.
 * !!
 * !! What made it possible instead: the frontend now fetches each file through
 * !! apiFetch, which already attaches the header, and renders it from a blob:
 * !! URL. That is why this guard is safe now and was not before. See
 * !! frontend/src/utils/authenticatedFile.js.
 *
 * The signature check is the same HMAC as the API and is not cached, so a
 * forged or expired token is rejected outright. The database check is memoised
 * for a minute: blob URLs are not held in the browser's HTTP cache the way a
 * plain image URL is, so a page with a dozen avatars is a dozen requests, and
 * that against a five-connection pool is worth avoiding. The trade is that an
 * account archived mid-session keeps file access for up to that minute; the API
 * routes, which are not numerous enough to matter, still check every time.
 */
const uploadSessionCache = new Map();
const UPLOAD_SESSION_CACHE_MS = 60 * 1000;

async function requireSessionForUpload(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: "Sign in to continue" });
  }

  const claims = verifySessionToken(token, { secret: SESSION_SECRET });
  if (!claims) {
    return res.status(401).json({ message: "Your session has expired. Please sign in again" });
  }

  const now = Date.now();
  // String key throughout: invalidation below is driven by a route param, which
  // arrives as a string even though claims.sub is numeric.
  const userKey = String(claims.sub);
  const cached = uploadSessionCache.get(userKey);
  if (cached && cached.expiresAt > now) {
    if (!cached.active) {
      return res.status(401).json({ message: "This account is no longer active" });
    }
    return next();
  }

  try {
    const [rows] = await pool.query(
      `SELECT user_id, status
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [claims.sub]
    );
    const account = rows[0];
    const active = Boolean(account) && account.status === "active";

    // Replace rather than accumulate, so a long-lived process cannot grow this
    // without bound.
    uploadSessionCache.set(userKey, { active, expiresAt: now + UPLOAD_SESSION_CACHE_MS });

    if (!active) {
      return res.status(401).json({ message: "This account is no longer active" });
    }
    return next();
  } catch (err) {
    console.error("requireSessionForUpload error:", err);
    return res.status(500).json({ message: "Could not verify your session" });
  }
}

async function requireAdminSession(req, res, next) {
  const session = await authenticateSession(req, res);
  if (!session) return;

  if (session.role !== "admin") {
    return res.status(403).json({ message: "Administrator access is required" });
  }
  next();
}

/**
 * Require the super administrator - the original admin account. Limited
 * administrators created through the UI cannot pass this gate.
 */
async function requireSuperAdminSession(req, res, next) {
  const session = await authenticateSession(req, res);
  if (!session) return;

  if (session.role !== "admin" || !session.isSuperAdmin) {
    return res.status(403).json({ message: "Super administrator access is required" });
  }
  next();
}

/**
 * The caller's identity, taken from the verified session rather than from a
 * query string the caller chose.
 *
 * The read routes used to read student_id / teacher_id / admin_id straight out of
 * req.query, so any caller could claim to be anybody by editing the URL. The
 * authorization branches themselves are unchanged: these are deliberately named
 * like the query params they replace, so each route reads exactly as before.
 */
function sessionIdentity(req) {
  const role = req.session?.role || "";
  const userId = req.session?.userId || null;
  return {
    adminId: role === "admin" ? userId : null,
    teacherId: role === "teacher" ? userId : null,
    studentId: role === "student" ? userId : null,
  };
}

/**
 * Whose lesson progress this request is about.
 *
 * A student is pinned to their own id and the supplied one is ignored, so
 * editing student_id in the URL or body cannot expose another student's record.
 * Staff keep the oversight they have everywhere else, so for a teacher or admin
 * the supplied id still applies - see the note on the progress routes that this
 * is deliberately not narrowed further to a teacher's own students.
 */
function progressStudentId(req) {
  const identity = sessionIdentity(req);
  return (
    identity.studentId ||
    req.query.student_id ||
    req.body?.student_id ||
    req.body?.studentId ||
    null
  );
}

/**
 * May this session act as the teacher named in a path?
 *
 * An admin may act for anyone. Everyone else may only act as themselves, which
 * is what stops one teacher reading another's student list, assignments and
 * submissions by editing a user id into the URL.
 */
function sessionMayActFor(req, claimedId) {
  if (req.session?.role === "admin") return true;
  if (claimedId === undefined || claimedId === null || claimedId === "") return false;
  return String(req.session?.userId) === String(claimedId);
}

/**
 * May this session read this student's data?
 *
 * The student themselves, an admin, or the teacher they are actually assigned
 * to. The assigned-teacher case matters: staff legitimately open a student's
 * page, and denying it would break that workflow, so this checks the real
 * relationship instead of blanket-allowing every teacher.
 */
async function sessionMayReadStudent(req, studentId) {
  const session = req.session || {};
  if (session.role === "admin") return true;
  if (String(session.userId) === String(studentId)) return true;
  if (session.role === "teacher") {
    const profile = await getStudentProfile(studentId);
    return String(profile?.assigned_teacher_id || "") === String(session.userId);
  }
  return false;
}

/**
 * May this session reach this assignment?
 *
 * An assignment belongs to exactly one teacher and one student, so either of
 * them may read it, and an admin may read any. Verified by looking the row up
 * rather than trusting an id in the request, which is the whole point: the
 * assignment id is the only thing the caller supplies here.
 */
async function sessionMayReadAssignment(req, assignmentId) {
  const session = req.session || {};
  if (session.role === "admin") return true;

  const [rows] = await pool.query(
    "SELECT teacher_id, student_id, is_archived FROM assignments WHERE assignment_id = ? LIMIT 1",
    [assignmentId]
  );
  const assignment = rows[0];
  if (!assignment) return false;

  return (
    String(assignment.teacher_id) === String(session.userId) ||
    (!assignment.is_archived && String(assignment.student_id) === String(session.userId))
  );
}

/**
 * May this session read a submission?
 *
 * Same shape as sessionMayReadAssignment: the teacher the work was set for, the
 * student who submitted it, or an admin. Kept separate rather than resolving the
 * parent assignment first because the mint endpoint takes a submission id, and
 * an assignment check would need the extra lookup to prove the submission
 * actually belongs to that assignment.
 */
async function sessionMayReadSubmission(req, submissionId) {
  const session = req.session || {};
  if (session.role === "admin") return true;

  const [rows] = await pool.query(
    `SELECT s.student_id, a.teacher_id
     FROM assignment_submissions s
     JOIN assignments a ON a.assignment_id = s.assignment_id
     WHERE s.submission_id = ?
     LIMIT 1`,
    [submissionId]
  );
  const submission = rows[0];
  if (!submission) return false;

  return (
    String(submission.teacher_id) === String(session.userId) ||
    String(submission.student_id) === String(session.userId)
  );
}

/**
 * Middleware form of sessionMayActOnClass.
 *
 * Most class routes are plain async handlers, but some - the recording upload
 * among them - wrap a multer middleware and take (req, res, next) instead, and
 * a guard inlined after a try block does not fit those.
 */
function requireClassAccess() {
  return async (req, res, next) => {
    if (!(await sessionMayActOnClass(req, req.params.class_id ?? req.body?.class_id))) {
      return res.status(403).json({ message: "You can only act on your own classes." });
    }
    next();
  };
}

/**
 * May this session run a query scoped to one of these people?
 *
 * The calendar list endpoints take a student_id or teacher_id in the query and
 * return that person's classes joined with the other party's details, so
 * offering someone else's id reads their schedule.
 */
/** Middleware: the body must identify the caller, or the caller is an admin. */
function requireBodyIdentity(field) {
  return (req, res, next) => {
    if (!sessionMayActFor(req, req.body?.[field])) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    next();
  };
}

/**
 * May this session book a class between these two people?
 *
 * !! A student books a class WITH their teacher, so the body names the
 * !! teacher - and the general "you may only act on your own account" rule
 * !! refused it, because a teacher's id is not a student's id. Every booking
 * !! a student made came back 403: they could see the free times, press the
 * !! button, and nothing happened.
 * !!
 * !! So the rule is the relationship, not the id:
 * !!   - an admin may book for anybody;
 * !!   - a teacher may book their own class;
 * !!   - a student may book a class for themselves - but only with the
 * !!     teacher assigned to them, and not with any teacher who happens to
 * !!     have a free slot.
 */
async function sessionMayBookClass(req) {
  const session = req.session || {};
  if (session.role === "admin") return true;

  const { teacher_id, student_id } = req.body || {};
  const me = String(session.userId);

  if (teacher_id != null && String(teacher_id) === me) return true;

  if (student_id != null && String(student_id) === me) {
    const [rows] = await pool.query(
      `SELECT assigned_teacher_id FROM student_profiles WHERE user_id = ? LIMIT 1`,
      [session.userId]
    );
    const assigned = rows[0]?.assigned_teacher_id;
    return assigned != null && String(assigned) === String(teacher_id);
  }

  return false;
}

/**
 * Middleware: the caller must be one of the two people in the class.
 */
function requireClassBookingScope() {
  return (req, res, next) => {
    sessionMayBookClass(req)
      .then((allowed) => {
        if (!allowed) {
          return res.status(403).json({ message: "You can only book classes for yourself." });
        }
        next();
      })
      .catch((err) => {
        console.error("requireClassBookingScope error:", err);
        res.status(500).json({ message: "Server error" });
      });
  };
}

/**
 * Middleware: the query must be scoped to the caller.
 *
 * The calendar lists return a person's classes joined with the other party's
 * name, email and image, so passing someone else's id reads their schedule.
 */
function requireQueryScope(...names) {
  return (req, res, next) => {
    if (!sessionMayQueryAs(req, names.map((name) => req.query[name]))) {
      return res.status(403).json({ message: "You can only view your own schedule." });
    }
    next();
  };
}

/**
 * May this session read a teacher's availability?
 *
 * !! A student has to be able to read the availability of the teacher
 * !! assigned to them. It is how they know which days they can book, and
 * !! without it the booking form says "no free times on this day" on every
 * !! single day - including the days the teacher is free, which is every day
 * !! the teacher is free.
 * !!
 * !! The teacher_id in the query is not the caller's own id, so the general
 * !! "you may only query yourself" rule refused it. That rule was right for
 * !! the calendar lists, where a query id reads somebody's schedule, and
 * !! wrong here: a teacher's free times are not private, and the student
 * !! standing in front of the booking form needs them.
 * !!
 * !! So the check is the relationship, not the id: an admin may read any
 * !! teacher, a teacher may read their own, and a student may read the one
 * !! teacher assigned to them - and nobody else.
 */
async function sessionMayReadTeacherAvailability(req, teacherId) {
  if (teacherId === undefined || teacherId === null || teacherId === "") return false;

  const session = req.session || {};

  if (session.role === "admin") return true;
  if (session.role === "teacher") return String(session.userId) === String(teacherId);

  if (session.role === "student") {
    const [rows] = await pool.query(
      `SELECT assigned_teacher_id FROM student_profiles WHERE user_id = ? LIMIT 1`,
      [session.userId]
    );
    return (
      rows.length > 0 &&
      rows[0].assigned_teacher_id != null &&
      String(rows[0].assigned_teacher_id) === String(teacherId)
    );
  }

  return false;
}

/**
 * Middleware: the query may name a teacher, as long as the caller is allowed
 * to read that teacher's availability.
 */
function requireTeacherAvailabilityScope(name = "teacher_id") {
  return (req, res, next) => {
    sessionMayReadTeacherAvailability(req, req.query?.[name])
      .then((allowed) => {
        if (!allowed) {
          return res.status(403).json({ message: "You can only view your own schedule." });
        }
        next();
      })
      .catch((err) => {
        console.error("requireTeacherAvailabilityScope error:", err);
        res.status(500).json({ message: "Server error" });
      });
  };
}

/** Does this notification belong to the caller? */
async function sessionMayActOnNotification(req, notificationId) {
  const session = req.session || {};
  if (session.role === "admin") return true;
  const [rows] = await pool.query(
    "SELECT user_id FROM notifications WHERE notification_id = ? LIMIT 1",
    [notificationId]
  );
  return rows.length > 0 && String(rows[0].user_id) === String(session.userId);
}

/** Does this availability record belong to the caller? */
async function sessionMayActOnAvailability(req, availabilityId) {
  const session = req.session || {};
  if (session.role === "admin") return true;
  const [rows] = await pool.query(
    "SELECT teacher_id FROM teacher_availability WHERE availability_id = ? LIMIT 1",
    [availabilityId]
  );
  return rows.length > 0 && String(rows[0].teacher_id) === String(session.userId);
}

/** A video session belongs to a class, so resolve it and check class access. */
async function sessionMayActOnVideoSession(req, videoSessionId) {
  const [rows] = await pool.query(
    "SELECT class_id FROM video_sessions WHERE session_id = ? LIMIT 1",
    [videoSessionId]
  );
  if (!rows.length) return false;
  return sessionMayActOnClass(req, rows[0].class_id);
}

function requireNotificationOwnership() {
  return async (req, res, next) => {
    if (!(await sessionMayActOnNotification(req, req.params.notification_id))) {
      return res.status(403).json({ message: "You can only act on your own notifications." });
    }
    next();
  };
}

function requireAvailabilityOwnership() {
  return async (req, res, next) => {
    if (!(await sessionMayActOnAvailability(req, req.params.availability_id))) {
      return res.status(403).json({ message: "You can only change your own availability." });
    }
    next();
  };
}

function requireVideoSessionOwnership() {
  return async (req, res, next) => {
    if (!(await sessionMayActOnVideoSession(req, req.params.session_id))) {
      return res.status(403).json({ message: "You can only change your own video sessions." });
    }
    next();
  };
}

function sessionMayQueryAs(req, ids) {
  if (req.session?.role === "admin") return true;
  const userId = req.session?.userId;
  if (userId === undefined || userId === null) return false;
  return ids.some((id) => id !== undefined && id !== null && String(id) === String(userId));
}

/** Same shape for the remarks on a class: its own teacher, its own student, or an admin. */
async function sessionMayActOnClass(req, classId) {
  const session = req.session || {};
  if (session.role === "admin") return true;

  const [rows] = await pool.query(
    "SELECT teacher_id, student_id FROM classes WHERE class_id = ? LIMIT 1",
    [classId]
  );
  const klass = rows[0];
  if (!klass) return false;

  return (
    String(klass.teacher_id) === String(session.userId) ||
    String(klass.student_id) === String(session.userId)
  );
}

// Every accepted resume costs one Gemini call, and the endpoint has no auth of
// its own (see the route below), so the quota is the thing worth bounding.
// Deliberately generous: a human cannot meaningfully create a teacher's profile
// faster than this, while a runaway loop or casual probing hits the wall.
//
// Counters go through MySQL rather than process memory. The app runs on
// several Railway replicas, and an in-memory counter gave each replica its own
// budget, so the real limit was that number times the replica count. If the
// table is unavailable the limiter fails open by design.
// !! Must stay below the `pool` declaration above.
const RESUME_PARSE_WINDOW_MS = Math.max(1, Number(process.env.RESUME_PARSE_RATE_WINDOW_MS) || 10 * 60 * 1000);
const RESUME_PARSE_MAX = Math.max(1, Number(process.env.RESUME_PARSE_RATE_MAX) || 10);
const limitResumeParsing = createRateLimiter({
  windowMs: RESUME_PARSE_WINDOW_MS,
  max: RESUME_PARSE_MAX,
  store: createDbStore({ pool }),
  message: "Too many resumes uploaded. Wait a few minutes before trying again.",
});

// The per-client cap above is best effort. Railway sits behind an edge, and
// the address Express unwinds to for a given browser varies between requests,
// so one client lands in two or more buckets and its real allowance is the
// per-bucket limit times that count. Measured in production: 9,9,8,8,7,7...
//
// Rather than guess at the proxy chain to recover a stable client identity -
// and rather than trust a client-sendable header, which an attacker can forge
// to mint unlimited buckets - cap the resource itself. Gemini quota is shared
// by everyone, so a global ceiling bounds total spend no matter how badly
// client identification degrades. Generous enough that normal staff use never
// reaches it.
const RESUME_PARSE_TOTAL_WINDOW_MS = Math.max(1, Number(process.env.RESUME_PARSE_RATE_TOTAL_WINDOW_MS) || 60 * 60 * 1000);
const RESUME_PARSE_TOTAL_MAX = Math.max(1, Number(process.env.RESUME_PARSE_RATE_TOTAL_MAX) || 60);
const limitResumeParsingTotal = createRateLimiter({
  windowMs: RESUME_PARSE_TOTAL_WINDOW_MS,
  max: RESUME_PARSE_TOTAL_MAX,
  store: createDbStore({ pool }),
  // One shared bucket for every caller, which is the entire point: it is not
  // derived from the request at all.
  keyFn: () => "all-clients",
  message: "Resume uploads are temporarily paused for everyone. Try again shortly.",
});

// Login has no rate limit at all today, so credentials can be guessed without
// bound (bcrypt makes each guess slow, not impossible). Keyed by address rather
// than by the submitted email, since an attacker varies the email to spread
// attempts. Deliberately high: a whole campus can share one NAT address, so
// this must not lock out a morning of students signing in together.
const LOGIN_WINDOW_MS = Math.max(1, Number(process.env.LOGIN_RATE_WINDOW_MS) || 15 * 60 * 1000);
const LOGIN_MAX = Math.max(1, Number(process.env.LOGIN_RATE_MAX) || 100);
// The trial-notes insights call. Rate limited for the same reason the resume one
// is: every accepted request costs a Gemini call, and the ceiling is the only
// thing that actually bounds the spend.
const INSIGHT_RATE_WINDOW_MS = Math.max(1, Number(process.env.MATCH_INSIGHT_RATE_WINDOW_MS) || 10 * 60 * 1000);
const INSIGHT_RATE_MAX = Math.max(1, Number(process.env.MATCH_INSIGHT_RATE_MAX) || 40);
const limitMatchInsights = createRateLimiter({
  windowMs: INSIGHT_RATE_WINDOW_MS,
  max: INSIGHT_RATE_MAX,
  store: createDbStore({ pool }),
  message: "Too many AI insights requested. Wait a few minutes before trying again.",
});

const limitLoginAttempts = createRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  max: LOGIN_MAX,
  store: createDbStore({ pool }),
  message: "Too many sign-in attempts from this network. Wait a few minutes and try again.",
});

const chatStreamClients = new Map();
const chatPresenceUsers = new Map();
const calendarStreamClients = new Map();

function addCalendarStreamClient(userId, res) {
  const key = String(userId);
  if (!calendarStreamClients.has(key)) {
    calendarStreamClients.set(key, new Set());
  }
  calendarStreamClients.get(key).add(res);
}

function removeCalendarStreamClient(userId, res) {
  const key = String(userId);
  const clients = calendarStreamClients.get(key);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) {
    calendarStreamClients.delete(key);
  }
}

function sendCalendarStreamEvent(userId, eventName, payload) {
  const clients = calendarStreamClients.get(String(userId));
  if (!clients || !clients.size) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => {
    try {
      res.write(message);
    } catch {
      removeCalendarStreamClient(userId, res);
    }
  });
}

function broadcastCalendarChange(userIds, eventName, payload = {}) {
  [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))]
    .forEach((userId) => sendCalendarStreamEvent(userId, eventName, {
      ...payload,
      event: eventName,
      updated_at: new Date().toISOString(),
    }));
}

function addChatStreamClient(userId, res) {
  const key = String(userId);
  if (!chatStreamClients.has(key)) {
    chatStreamClients.set(key, new Set());
  }
  chatStreamClients.get(key).add(res);
  chatPresenceUsers.set(key, Date.now());
  broadcastChatPresenceChange(userId, true);
}

function removeChatStreamClient(userId, res) {
  const key = String(userId);
  const clients = chatStreamClients.get(key);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) {
    chatStreamClients.delete(key);
    chatPresenceUsers.delete(key);
    broadcastChatPresenceChange(userId, false);
  }
}

function sendChatStreamEvent(userId, eventName, payload) {
  const clients = chatStreamClients.get(String(userId));
  if (!clients || !clients.size) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => {
    try {
      res.write(message);
    } catch {
      removeChatStreamClient(userId, res);
    }
  });
}

function broadcastChatMessage(messagePayload) {
  if (!messagePayload) return;
  sendChatStreamEvent(messagePayload.sender_id, "chat-message", messagePayload);
  if (String(messagePayload.recipient_id) !== String(messagePayload.sender_id)) {
    sendChatStreamEvent(messagePayload.recipient_id, "chat-message", messagePayload);
  }
}

function broadcastChatReadReceipt(payload) {
  if (!payload) return;
  sendChatStreamEvent(payload.sender_id, "chat-read-receipt", payload);
  sendChatStreamEvent(payload.reader_id, "chat-read-receipt", payload);
}

function broadcastChatPresenceChange(userId, active) {
  const payload = {
    user_id: Number(userId),
    active: Boolean(active),
    status_label: active ? "Active now" : "Not active",
    updated_at: new Date().toISOString(),
  };

  for (const clients of chatStreamClients.values()) {
    clients.forEach((res) => {
      try {
        res.write(`event: chat-presence-change\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        // Ignore individual stream write failures; cleanup occurs on close.
      }
    });
  }
}

function isUserChatActive(userId) {
  return chatPresenceUsers.has(String(userId));
}

// ---------- helpers ----------
const COUNTRY_TIMEZONES = {
  Australia: "Australia/Sydney",
  Canada: "America/Toronto",
  China: "Asia/Shanghai",
  India: "Asia/Kolkata",
  Indonesia: "Asia/Jakarta",
  Japan: "Asia/Tokyo",
  Malaysia: "Asia/Kuala_Lumpur",
  Philippines: "Asia/Manila",
  Singapore: "Asia/Singapore",
  "South Korea": "Asia/Seoul",
  Taiwan: "Asia/Taipei",
  Thailand: "Asia/Bangkok",
  "United Arab Emirates": "Asia/Dubai",
  "United Kingdom": "Europe/London",
  "United States": "America/New_York",
  Vietnam: "Asia/Ho_Chi_Minh",
  Samoa: "Pacific/Pago_Pago",
};

function timezoneFromCountry(country) {
  return COUNTRY_TIMEZONES[String(country || "").trim()] || "Asia/Manila";
}

function normalizeTimezone(timezone, fallback = "Asia/Manila") {
  const value = String(timezone || "").trim();
  if (!value) return fallback;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return fallback;
  }
}

const pad = (n) => String(n).padStart(2, "0");
function toMySQLDateTime(isoLike) {
  if (!isoLike) return null;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function splitAssignmentDue(due) {
  if (!due) return { dueDate: null, dueTime: null };
  const [datePart, timePart = ""] = String(due).split("T");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return { dueDate: null, dueTime: null };
  }
  const dueTime = timePart ? `${timePart.slice(0, 5)}:00` : null;
  return { dueDate: datePart, dueTime };
}

function isDueDatePast(dueDate, dueTime) {
  if (!dueDate) return false;
  const now = new Date();
  const datePart = dueDate instanceof Date
    ? `${dueDate.getFullYear()}-${pad(dueDate.getMonth() + 1)}-${pad(dueDate.getDate())}`
    : String(dueDate).slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  let dueDateObj;
  
  if (dueTime) {
    const [hour, minute] = String(dueTime).split(":").map(Number);
    dueDateObj = new Date(year, month - 1, day, hour, minute, 0);
  } else {
    dueDateObj = new Date(year, month - 1, day, 23, 59, 59);
  }
  
  return dueDateObj < now;
}

function humanDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(dateStr);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function humanTime(timeStr) {
  if (!timeStr) return "";
  const [hourPart, minutePart = "00"] = String(timeStr).split(":");
  let hour = Number(hourPart);
  if (Number.isNaN(hour)) return String(timeStr);
  const minute = String(minutePart).padStart(2, "0").slice(0, 2);
  const period = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`;
}

function normalizeDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysToDateKey(dateKey, days) {
  const match = normalizeDateKey(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return formatDateKey(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
}

function normalizeTimeKey(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function timeToMinutes(value) {
  const timeKey = normalizeTimeKey(value);
  if (!timeKey) return null;
  const [hour, minute] = timeKey.split(":").map(Number);
  return hour * 60 + minute;
}

const ALLOWED_CLASS_DURATIONS = new Set([25, 50]);
const DEFAULT_CLASS_DURATION = 50;
const CLASS_BREAK_BUFFER_MINUTES = 10;
const SCHEDULE_WINDOW_MONTHS = 3;

function normalizeClassDuration(value) {
  const parsed = parseInt(value, 10);
  return ALLOWED_CLASS_DURATIONS.has(parsed) ? parsed : DEFAULT_CLASS_DURATION;
}

function minutesToTimeKey(totalMinutes) {
  const safeMinutes = ((Number(totalMinutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

function getRangeMinutes(startTime, durationMinutes) {
  const start = timeToMinutes(startTime);
  if (start == null) return null;
  const duration = parseInt(durationMinutes, 10);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return {
    start,
    end: start + duration,
  };
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function rangesOverlapWithClassBuffer(aStart, aEnd, bStart, bEnd) {
  return rangesOverlap(aStart, aEnd, bStart - CLASS_BREAK_BUFFER_MINUTES, bEnd + CLASS_BREAK_BUFFER_MINUTES);
}

function addMonthsClamped(date, months) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const targetMonth = base.getMonth() + months;
  const lastDay = new Date(base.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(base.getFullYear(), targetMonth, Math.min(base.getDate(), lastDay));
}

function getClassInterval(startTime, durationMinutes, endTime = null) {
  const start = timeToMinutes(startTime);
  if (start == null) return null;
  let end = null;
  const duration = parseInt(durationMinutes, 10);
  if (Number.isFinite(duration) && duration > 0) {
    end = start + duration;
  } else if (endTime) {
    end = timeToMinutes(endTime);
  }

  if (end == null || end <= start) return null;
  return { start, end };
}

function hasClassConflict(rows, start, end, excludeClassId = null) {
  return rows.some((row) => {
    if (excludeClassId != null && Number(row.class_id) === Number(excludeClassId)) {
      return false;
    }

    const interval = getClassInterval(row.start_time, row.duration, row.end_time);
    if (!interval) return false;
    return rangesOverlapWithClassBuffer(start, end, interval.start, interval.end);
  });
}

async function getStudentPackageAvailability(connection, studentId) {
  const db = connection || pool;
  await autoMarkPastClassesAsNoShow(db);
  const [packageRows] = await db.query(
    `SELECT package_id, student_id, total_classes, classes_used, classes_left, class_duration, status, created_at, expires_at
     FROM student_class_packages
     WHERE student_id = ? AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [studentId]
  );

  // The most recent package whatever its status.
  //
  // !! The `active` filter above is load-bearing: an expired package must not be
  // !! bookable, and every booking calculation is derived from `package`. But
  // !! returning null for it meant a student whose contract had just run out saw
  // !! NO contract anywhere - not on the Dashboard, not on the Calendar, not on
  // !! their own account page. An expired contract and a student who never had
  // !! one became indistinguishable, which is the opposite of what the expiry
  // !! work was for.
  // !!
  // !! So the booking package stays exactly as it was, and this is returned
  // !! alongside it purely for display. Nothing here feeds a booking decision.
  const [latestRows] = await db.query(
    `SELECT package_id, total_classes, classes_used, classes_left, status, created_at, expires_at
     FROM student_class_packages
     WHERE student_id = ?
     ORDER BY created_at DESC, package_id DESC
     LIMIT 1`,
    [studentId]
  );

  const latestPackage = latestRows[0] || null;

  if (!packageRows.length) {
    return { package: null, latestPackage, bookedClasses: 0, bookableClasses: 0 };
  }

  const packageInfo = packageRows[0];

  const [scheduledRows] = await db.query(
    `SELECT COUNT(*) AS booked_count
     FROM classes
     WHERE student_id = ?
       AND status = 'scheduled'
       AND scheduled_date >= CURDATE()
       AND NOT EXISTS (
         SELECT 1 FROM class_attendance_logs cal
         WHERE cal.class_id = classes.class_id
           AND cal.verification_status = 'incomplete'
       )
       AND created_at >= ?`,
    [studentId, packageInfo.created_at]
  );

  const bookedClasses = Number(scheduledRows[0]?.booked_count || 0);
  const totalClasses = Number(packageInfo.total_classes || 0);
  const classesLeft = Number(packageInfo.classes_left ?? Math.max(0, totalClasses - Number(packageInfo.classes_used || 0)));

  return {
    package: packageInfo,
    latestPackage,
    bookedClasses,
    bookableClasses: Math.max(0, classesLeft - bookedClasses),
  };
}

async function deleteLocalProfileImage(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith("/uploads/profiles/")) return;

  const fileName = path.basename(decodeURIComponent(String(imageUrl)));
  const filePath = path.resolve(profileUploadDir, fileName);
  const profileDir = path.resolve(profileUploadDir);

  if (!filePath.startsWith(profileDir + path.sep)) return;

  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("Could not delete old profile image:", err.message);
    }
  }
}

async function deleteLocalClassProofImage(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith("/uploads/class-proofs/")) return;

  const fileName = path.basename(decodeURIComponent(String(imageUrl)));
  const filePath = path.resolve(classProofUploadDir, fileName);
  const proofDir = path.resolve(classProofUploadDir);

  if (!filePath.startsWith(proofDir + path.sep)) return;

  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("Could not delete class proof image:", err.message);
    }
  }
}

async function deleteLocalClassRecording(recordingUrl) {
  if (!recordingUrl || !String(recordingUrl).startsWith("/private-uploads/class-recordings/")) return;
  const fileName = path.basename(recordingUrl);
  const filePath = path.resolve(classRecordingUploadDir, fileName);
  const recordingDir = path.resolve(classRecordingUploadDir);

  if (!filePath.startsWith(recordingDir + path.sep)) return;

  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("Could not delete class recording:", err.message);
    }
  }
}

async function deleteClassRecording(recordingUrl) {
  if (!recordingUrl) return;
  if (String(recordingUrl).startsWith("http")) {
    await deleteRecordingFromDrive(recordingUrl);
  } else {
    await deleteLocalClassRecording(recordingUrl);
  }
}

async function cleanupExpiredClassRecordings(db = pool) {
  const [rows] = await db.query(
    `SELECT class_id, recording_url
     FROM class_attendance_logs
     WHERE recording_url IS NOT NULL
       AND recording_url <> ''
       AND recording_expires_at IS NOT NULL
       AND recording_expires_at <= NOW()`
  );

  if (!rows.length) return;

  await Promise.all(rows.map((row) => deleteClassRecording(row.recording_url)));
  await db.query(
    `UPDATE class_attendance_logs
     SET recording_url = NULL,
         recording_mime_type = NULL,
         recording_size_bytes = NULL,
         recording_uploaded_at = NULL,
         recording_expires_at = NULL
     WHERE recording_expires_at IS NOT NULL
       AND recording_expires_at <= NOW()`
  );
}

const MS_TENANT_ID = process.env.MS_TENANT_ID || "";
const MS_CLIENT_ID = process.env.MS_CLIENT_ID || "";
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || "";
const MS_TEAMS_ORGANIZER_UPN = process.env.MS_TEAMS_ORGANIZER_UPN || "";
const JITSI_BASE_URL = process.env.JITSI_BASE_URL || "https://meet.jit.si";
const JITSI_JWT_APP_ID = process.env.JITSI_JWT_APP_ID || "";
const JITSI_JWT_APP_SECRET = process.env.JITSI_JWT_APP_SECRET || "";
const JITSI_JWT_AUDIENCE = process.env.JITSI_JWT_AUDIENCE || JITSI_JWT_APP_ID;
function getHostnameFromUrl(value, fallback = "meet.jit.si") {
  try {
    return new URL(value).hostname || fallback;
  } catch {
    return fallback;
  }
}
const JITSI_JWT_SUBJECT = process.env.JITSI_JWT_SUBJECT || getHostnameFromUrl(JITSI_BASE_URL);

async function getMicrosoftGraphAccessToken() {
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) {
    return null;
  }

  const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    scope: "https://graph.microsoft.com/.default",
    client_secret: MS_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Graph token error: ${response.status} ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

function formatMeetingDateTime(date, time) {
  if (!date || !time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  const dt = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
  return dt.toISOString();
}

const classSelectFields = `
  c.class_id,
  c.class_name,
  c.teacher_id,
  c.student_id,
  DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
  TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
  TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
  c.duration,
  c.class_link,
  c.status,
  c.created_at,
  c.updated_at
`;

async function createTeamsMeeting(subject, date, startTime, endTime, organizerEmail) {
  const accessToken = await getMicrosoftGraphAccessToken();
  if (!accessToken) {
    throw new Error("Microsoft Graph credentials not configured");
  }

  const organizer = organizerEmail || MS_TEAMS_ORGANIZER_UPN;
  if (!organizer) {
    throw new Error("No organizer email configured for Teams meeting creation");
  }

  const startDateTime = formatMeetingDateTime(date, startTime);
  const endDateTime = formatMeetingDateTime(date, endTime);
  if (!startDateTime || !endDateTime) {
    throw new Error("Invalid meeting start or end time");
  }

  const meetingBody = {
    subject: subject || "Jen Academia Class",
    startDateTime,
    endDateTime,
  };

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizer)}/onlineMeetings`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(meetingBody),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Graph meeting creation error: ${response.status} ${body}`);
  }

  const data = await response.json();
  const joinUrl = data.joinWebUrl || data.joinUrl;
  if (!joinUrl) {
    throw new Error("Graph meeting response missing joinWebUrl");
  }

  return joinUrl;
}

function slugifyMeetingPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function generateJitsiMeetingLink({ className, scheduledDate, startTime, teacherId, studentId }) {
  const roomParts = [
    "jen-academia",
    slugifyMeetingPart(className) || "class",
    slugifyMeetingPart(scheduledDate),
    slugifyMeetingPart(startTime),
    `t${teacherId}`,
    `s${studentId}`,
    crypto.randomBytes(4).toString("hex"),
  ].filter(Boolean);

  const baseUrl = JITSI_BASE_URL.replace(/\/+$/, "");
  return `${baseUrl}/${roomParts.join("-")}`;
}

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64url");
}

function signJitsiJwt(payload) {
  if (!JITSI_JWT_APP_ID || !JITSI_JWT_APP_SECRET) return "";

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signature = crypto
    .createHmac("sha256", JITSI_JWT_APP_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function getJitsiRoomName(classLink) {
  try {
    const parsed = new URL(classLink || "");
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, ""));
  } catch {
    return "";
  }
}

function createJitsiJwtForClass({ classInfo, user, isModerator }) {
  const room = getJitsiRoomName(classInfo?.class_link);
  if (!room) return "";

  const nowSeconds = Math.floor(Date.now() / 1000);
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.email || "Jen Academia User";

  return signJitsiJwt({
    aud: JITSI_JWT_AUDIENCE,
    iss: JITSI_JWT_APP_ID,
    sub: JITSI_JWT_SUBJECT,
    room,
    exp: nowSeconds + 2 * 60 * 60,
    nbf: nowSeconds - 30,
    context: {
      user: {
        id: String(user?.user_id || ""),
        name: displayName,
        email: user?.email || "",
        moderator: Boolean(isModerator),
      },
    },
  });
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [DB_NAME, tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [DB_NAME, tableName, indexName]
  );
  return rows.length > 0;
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [DB_NAME, tableName]
  );
  return rows.length > 0;
}

async function ensureIndex(tableName, indexName, columnsSql) {
  if (await indexExists(tableName, indexName)) return;
  await pool.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} (${columnsSql})`);
}

async function deletePastTeacherAvailability(teacherId = null) {
  if (teacherId) {
    await pool.query(
      "DELETE FROM teacher_availability WHERE teacher_id = ? AND available_date < CURDATE()",
      [teacherId]
    );
    return;
  }

  await pool.query("DELETE FROM teacher_availability WHERE available_date < CURDATE()");
}

async function ensurePerformanceIndexes() {
  const indexes = [
    ["classes", "idx_classes_teacher_day_status_time", "teacher_id, scheduled_date, status, start_time"],
    ["classes", "idx_classes_student_day_status_time", "student_id, scheduled_date, status, start_time"],
    ["classes", "idx_classes_student_status_created", "student_id, status, created_at"],
    ["assignments", "idx_assignments_teacher_created", "teacher_id, created_at, assignment_id"],
    ["assignments", "idx_assignments_student_due", "student_id, due_date, due_time, created_at"],
    ["assignment_submissions", "idx_submissions_assignment_submitted", "assignment_id, submitted_at, submission_id"],
    ["books", "idx_books_status_teacher_course_created", "status, teacher_id, course_id, created_at"],
    ["class_attendance_logs", "idx_class_attendance_status", "verification_status, created_at"],
    ["class_remarks", "idx_remarks_student_created", "student_id, created_at"],
    ["lesson_progress", "idx_lesson_progress_student_updated", "student_id, updated_at"],
    ["messages", "idx_messages_recipient_read", "recipient_id, is_read"],
    ["messages", "idx_messages_pair_sent", "sender_id, recipient_id, sent_at"],
    ["notifications", "idx_notifications_user_read", "user_id, is_read"],
    ["notifications", "idx_notifications_user_created", "user_id, created_at"],
    ["student_class_packages", "idx_packages_student_status_created", "student_id, status, created_at"],
  ];

  for (const [tableName, indexName, columnsSql] of indexes) {
    try {
      await ensureIndex(tableName, indexName, columnsSql);
    } catch (err) {
      console.warn(`Could not ensure index ${indexName}:`, err.message);
    }
  }
}

async function ensureAssignmentAttemptColumns() {
  await pool.query("ALTER TABLE assignments MODIFY COLUMN due_date DATE NULL");
  await pool.query("ALTER TABLE assignment_submissions MODIFY COLUMN file_url VARCHAR(1000) DEFAULT NULL");

  if (!(await columnExists("assignments", "attempt_limit"))) {
    await pool.query("ALTER TABLE assignments ADD COLUMN attempt_limit INT DEFAULT NULL AFTER due_time");
  }

  if (!(await columnExists("assignment_submissions", "attempt_count"))) {
    await pool.query("ALTER TABLE assignment_submissions ADD COLUMN attempt_count INT NOT NULL DEFAULT 1 AFTER file_url");
  }
}

// The file a teacher attaches to a task, and the file a student sends back.
//
// Two separate name columns, because they are separate columns on separate
// tables that merely happen to share a directory. Each keeps the original
// filename, which matters because the stored filename is a timestamp prefix
// plus a sanitised original - so "Week 3 Notes.pdf" is on disk as
// "Week_3_Notes.pdf" and the URL can never carry the name a user expects to
// see. /f serves both by signed link and titles the tab from these.
async function ensureAssignmentAttachmentColumns() {
  if (!(await columnExists("assignments", "attachment_url"))) {
    await pool.query("ALTER TABLE assignments ADD COLUMN attachment_url VARCHAR(1000) DEFAULT NULL AFTER attempt_limit");
  }

  if (!(await columnExists("assignments", "attachment_name"))) {
    await pool.query("ALTER TABLE assignments ADD COLUMN attachment_name VARCHAR(255) DEFAULT NULL AFTER attachment_url");
  }

  if (!(await columnExists("assignment_submissions", "file_name"))) {
    await pool.query("ALTER TABLE assignment_submissions ADD COLUMN file_name VARCHAR(255) DEFAULT NULL AFTER file_url");
  }
}

async function ensureAssignmentArchiveColumn() {
  if (!(await columnExists("assignments", "is_archived"))) {
    await pool.query(
      "ALTER TABLE assignments ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER status"
    );
  }
}

async function ensureSubmissionHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submission_history (
      history_id INT AUTO_INCREMENT PRIMARY KEY,
      assignment_id INT NOT NULL,
      student_id INT NOT NULL,
      submission_text LONGTEXT,
      file_url VARCHAR(1000) DEFAULT NULL,
      file_name VARCHAR(255) DEFAULT NULL,
      submitted_at DATETIME NOT NULL,
      attempt_count INT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_assignment_student (assignment_id, student_id),
      INDEX idx_created_at (created_at)
    )
  `);
}

async function ensureBooksColumns() {
  if (!(await columnExists("books", "teacher_id"))) {
    await pool.query("ALTER TABLE books ADD COLUMN teacher_id INT DEFAULT NULL AFTER course_id");
    await pool.query("ALTER TABLE books ADD INDEX idx_teacher_id (teacher_id)");
  }

  if (!(await columnExists("books", "cover_url"))) {
    await pool.query("ALTER TABLE books ADD COLUMN cover_url VARCHAR(1000) DEFAULT NULL AFTER teacher_id");
  }

  if (!(await columnExists("books", "status"))) {
    await pool.query("ALTER TABLE books ADD COLUMN status ENUM('active','archived') NOT NULL DEFAULT 'active' AFTER cover_url");
    await pool.query("ALTER TABLE books ADD INDEX idx_books_status (status)");
  }

  if (!(await columnExists("books", "archived_at"))) {
    await pool.query("ALTER TABLE books ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER status");
  }
}

async function ensureLessonsColumns() {
  if (!(await columnExists("lessons", "file_path"))) {
    await pool.query("ALTER TABLE lessons ADD COLUMN file_path VARCHAR(500) DEFAULT NULL AFTER content");
  }
}

/**
 * Books are now authored by an admin and handed out to teachers, so the
 * "which teacher owns this" link moved off books.teacher_id and into its own
 * join table - one book can be distributed to many teachers at once.
 */
async function ensureBookTeachersTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS book_teachers (
       book_id INT NOT NULL,
       teacher_id INT NOT NULL,
       assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       assigned_by INT DEFAULT NULL,
       PRIMARY KEY (book_id, teacher_id),
       KEY idx_book_teachers_teacher (teacher_id),
       KEY idx_book_teachers_teacher_assigned (teacher_id, assigned_at),
       CONSTRAINT book_teachers_book_fk FOREIGN KEY (book_id) REFERENCES books (book_id) ON DELETE CASCADE,
       CONSTRAINT book_teachers_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users (user_id) ON DELETE CASCADE,
       CONSTRAINT book_teachers_assigner_fk FOREIGN KEY (assigned_by) REFERENCES users (user_id) ON DELETE SET NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  // Books created before this table existed recorded their teacher straight on
  // books.teacher_id. Carry those over so nothing a teacher could already see
  // vanishes the moment they lose the right to create books.
  const [backfilled] = await pool.query(
    `INSERT IGNORE INTO book_teachers (book_id, teacher_id)
     SELECT book_id, teacher_id FROM books WHERE teacher_id IS NOT NULL`
  );
  if (backfilled?.affectedRows) {
    console.log(`Migrated ${backfilled.affectedRows} book(s) into book_teachers.`);
  }
}

async function indexColumnCount(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS column_count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB_NAME, tableName, indexName]
  );
  return rows.length ? Number(rows[0].column_count) : 0;
}

async function ensureRemarkColumns() {
  if (!(await columnExists("class_remarks", "status"))) {
    await pool.query("ALTER TABLE class_remarks ADD COLUMN status ENUM('active','archived') NOT NULL DEFAULT 'active' AFTER rating");
  }

  if (!(await columnExists("class_remarks", "archived_at"))) {
    await pool.query("ALTER TABLE class_remarks ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER status");
  }

  // BUGFIX: the original unique key was (class_id, teacher_id) with no
  // student_id. Remarking on a second student in the same class therefore
  // collided with the first student's row, and because the upsert never
  // updated student_id, the new text was written onto the FIRST student's
  // remark - so the wrong student saw the remark and the right one saw nothing.
  // Widening a too-narrow unique key cannot introduce violations, and the
  // pre-existing rows are all still distinct on the wider key.
  const uniqueColumns = await indexColumnCount("class_remarks", "unique_class_remark");
  if (uniqueColumns > 0 && uniqueColumns < 3) {
    await pool.query("ALTER TABLE class_remarks DROP INDEX unique_class_remark");
    await pool.query("ALTER TABLE class_remarks ADD UNIQUE KEY unique_class_remark (class_id, teacher_id, student_id)");
  }

  await ensureIndex("class_remarks", "idx_remarks_teacher_status", "teacher_id, status, created_at");
}

// Declining a reschedule request now requires the decliner to say why, so the
// requester can be told the reason. The reason lives on the request row itself
// (encrypted, like the requester's own reason) so it can be re-read later and
// shown in the admin request list.
async function ensureRescheduleRequestDeclineReasonColumn() {
  // The table ships in Database.sql, but an environment created before it did
  // may not have it yet, so it is created before the column is touched.
  if (!(await tableExists("reschedule_requests"))) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reschedule_requests (
        request_id INT NOT NULL AUTO_INCREMENT,
        class_id INT NOT NULL,
        requested_by_id INT NOT NULL,
        requested_date DATE NOT NULL,
        requested_time TIME NOT NULL,
        reason TEXT DEFAULT NULL,
        status ENUM('pending','approved','declined') DEFAULT 'pending',
        decline_reason TEXT DEFAULT NULL,
        requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (request_id),
        KEY idx_class_id (class_id),
        KEY idx_status (status),
        KEY idx_requested_by (requested_by_id),
        CONSTRAINT reschedule_requests_ibfk_1 FOREIGN KEY (class_id) REFERENCES classes (class_id),
        CONSTRAINT reschedule_requests_ibfk_2 FOREIGN KEY (requested_by_id) REFERENCES users (user_id)
      )
    `);
  }

  if (!(await columnExists("reschedule_requests", "decline_reason"))) {
    await pool.query("ALTER TABLE reschedule_requests ADD COLUMN decline_reason TEXT DEFAULT NULL AFTER status");
  }
}

async function ensureLessonProgressTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_progress (
      progress_id INT NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      lesson_id INT NOT NULL,
      progress_percentage INT NOT NULL DEFAULT 0,
      is_completed TINYINT(1) NOT NULL DEFAULT 0,
      started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      time_spent_minutes INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (progress_id),
      UNIQUE KEY unique_student_lesson (student_id, lesson_id),
      KEY idx_lesson_progress_student (student_id),
      KEY idx_lesson_progress_lesson (lesson_id),
      KEY idx_lesson_progress_completed (is_completed),
      CONSTRAINT lesson_progress_student_fk FOREIGN KEY (student_id) REFERENCES users (user_id),
      CONSTRAINT lesson_progress_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons (lesson_id) ON DELETE CASCADE
    )
  `);

  if (!(await columnExists("lesson_progress", "progress_percentage"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN progress_percentage INT NOT NULL DEFAULT 0 AFTER lesson_id");
  }

  if (!(await columnExists("lesson_progress", "started_at"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER is_completed");
  }

  if (!(await columnExists("lesson_progress", "completed_at"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL AFTER started_at");
  }

  if (!(await columnExists("lesson_progress", "time_spent_minutes"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN time_spent_minutes INT NOT NULL DEFAULT 0 AFTER completed_at");
  }

  if (!(await columnExists("lesson_progress", "updated_at"))) {
    await pool.query("ALTER TABLE lesson_progress ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER time_spent_minutes");
  } else {
    await pool.query("ALTER TABLE lesson_progress MODIFY COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  }
}

async function ensureClassAttendanceLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_attendance_logs (
      log_id INT NOT NULL AUTO_INCREMENT,
      class_id INT NOT NULL,
      teacher_id INT NOT NULL,
      student_id INT NOT NULL,
      teacher_started_at TIMESTAMP NULL DEFAULT NULL,
      student_joined_at TIMESTAMP NULL DEFAULT NULL,
      teacher_ended_at TIMESTAMP NULL DEFAULT NULL,
      duration_minutes INT NOT NULL DEFAULT 0,
      proof_url VARCHAR(1000) DEFAULT NULL,
      recording_url VARCHAR(1000) DEFAULT NULL,
      recording_mime_type VARCHAR(120) DEFAULT NULL,
      recording_size_bytes BIGINT DEFAULT NULL,
      recording_uploaded_at TIMESTAMP NULL DEFAULT NULL,
      recording_expires_at TIMESTAMP NULL DEFAULT NULL,
      teacher_recording_consent_at TIMESTAMP NULL DEFAULT NULL,
      student_recording_consent_at TIMESTAMP NULL DEFAULT NULL,
      summary TEXT DEFAULT NULL,
      verification_status ENUM('pending','in_progress','student_confirmed','verified','needs_review','incomplete') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (log_id),
      UNIQUE KEY unique_class_attendance_log (class_id),
      KEY idx_class_attendance_class (class_id),
      KEY idx_class_attendance_teacher (teacher_id),
      KEY idx_class_attendance_student (student_id),
      CONSTRAINT class_attendance_class_fk FOREIGN KEY (class_id) REFERENCES classes (class_id) ON DELETE CASCADE,
      CONSTRAINT class_attendance_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users (user_id),
      CONSTRAINT class_attendance_student_fk FOREIGN KEY (student_id) REFERENCES users (user_id)
    )
  `);

  const columns = [
    ["evidence_mode", "ALTER TABLE class_attendance_logs ADD COLUMN evidence_mode VARCHAR(20) DEFAULT NULL"],
    ["start_proof_url", "ALTER TABLE class_attendance_logs ADD COLUMN start_proof_url VARCHAR(1000) DEFAULT NULL"],
    ["start_proof_uploaded_at", "ALTER TABLE class_attendance_logs ADD COLUMN start_proof_uploaded_at TIMESTAMP NULL"],
    ["end_proof_uploaded_at", "ALTER TABLE class_attendance_logs ADD COLUMN end_proof_uploaded_at TIMESTAMP NULL"],
    ["recording_started_at", "ALTER TABLE class_attendance_logs ADD COLUMN recording_started_at TIMESTAMP NULL"],
    ["recording_duration_seconds", "ALTER TABLE class_attendance_logs ADD COLUMN recording_duration_seconds INT DEFAULT 0"],
    ["review_reason", "ALTER TABLE class_attendance_logs ADD COLUMN review_reason TEXT DEFAULT NULL"],
    ["recording_url", "ALTER TABLE class_attendance_logs ADD COLUMN recording_url VARCHAR(1000) DEFAULT NULL AFTER proof_url"],
    ["recording_mime_type", "ALTER TABLE class_attendance_logs ADD COLUMN recording_mime_type VARCHAR(120) DEFAULT NULL AFTER recording_url"],
    ["recording_size_bytes", "ALTER TABLE class_attendance_logs ADD COLUMN recording_size_bytes BIGINT DEFAULT NULL AFTER recording_mime_type"],
    ["recording_uploaded_at", "ALTER TABLE class_attendance_logs ADD COLUMN recording_uploaded_at TIMESTAMP NULL DEFAULT NULL AFTER recording_size_bytes"],
    ["recording_expires_at", "ALTER TABLE class_attendance_logs ADD COLUMN recording_expires_at TIMESTAMP NULL DEFAULT NULL AFTER recording_uploaded_at"],
    ["teacher_recording_consent_at", "ALTER TABLE class_attendance_logs ADD COLUMN teacher_recording_consent_at TIMESTAMP NULL DEFAULT NULL AFTER recording_expires_at"],
    ["student_recording_consent_at", "ALTER TABLE class_attendance_logs ADD COLUMN student_recording_consent_at TIMESTAMP NULL DEFAULT NULL AFTER teacher_recording_consent_at"],
  ];

  for (const [columnName, alterSql] of columns) {
    if (!(await columnExists("class_attendance_logs", columnName))) {
      await pool.query(alterSql);
    }
  }
}

async function ensureStudentCourseProgressTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_course_progress (
      progress_id INT NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      book_id INT NOT NULL,
      course_id INT NOT NULL,
      status ENUM('In Progress','Completed') NOT NULL DEFAULT 'In Progress',
      completed_lessons INT NOT NULL DEFAULT 0,
      total_lessons INT NOT NULL DEFAULT 0,
      progress_percentage INT NOT NULL DEFAULT 0,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (progress_id),
      UNIQUE KEY unique_student_book_progress (student_id, book_id),
      KEY idx_student_course_progress_student (student_id),
      KEY idx_student_course_progress_book (book_id),
      KEY idx_student_course_progress_course (course_id),
      KEY idx_student_course_progress_status (status),
      CONSTRAINT student_course_progress_student_fk FOREIGN KEY (student_id) REFERENCES users (user_id),
      CONSTRAINT student_course_progress_book_fk FOREIGN KEY (book_id) REFERENCES books (book_id) ON DELETE CASCADE,
      CONSTRAINT student_course_progress_course_fk FOREIGN KEY (course_id) REFERENCES courses (course_id)
    )
  `);
}

async function ensureUserProfileImageColumn() {
  if (!(await columnExists("users", "profile_image_url"))) {
    await pool.query("ALTER TABLE users ADD COLUMN profile_image_url VARCHAR(500) DEFAULT NULL AFTER contact_number");
  }
}

async function ensureUserPasswordChangedColumn() {
  if (!(await columnExists("users", "password_changed"))) {
    await pool.query("ALTER TABLE users ADD COLUMN password_changed BOOLEAN DEFAULT FALSE AFTER profile_completed");
  }
}

async function ensureAccountSetupInvitesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_setup_invites (
      invite_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (invite_id),
      UNIQUE KEY unique_account_setup_token_hash (token_hash),
      KEY idx_account_setup_user (user_id),
      KEY idx_account_setup_expires (expires_at),
      CONSTRAINT account_setup_invites_user_fk FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
    )
  `);
}

/**
 * Counters for the resume rate limiter.
 *
 * Never rejects. A missing counter table only means the limiter fails open and
 * the route behaves as it did before rate limiting existed, which is a far
 * better outcome than refusing to boot.
 */
async function ensureApiRateLimitsTable() {
  try {
    await ensureRateLimitsTable(pool);
  } catch (err) {
    // Deliberately non-fatal, following the same pattern as
    // ensurePerformanceIndexes(). prepareDatabaseWithRetry() calls
    // process.exit(1) for any error that is not a connection-limit problem, so
    // an optional feature's migration sitting on that path can take every
    // replica offline. This table backs a rate limit, not data.
    console.warn(
      "Could not create api_rate_limits; resume uploads will run without a rate limit:",
      err.message
    );
  }
}

async function ensurePasswordResetTokensTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      reset_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (reset_id),
      UNIQUE KEY unique_password_reset_token_hash (token_hash),
      KEY idx_password_reset_user (user_id),
      KEY idx_password_reset_expires (expires_at),
      CONSTRAINT password_reset_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
    )
  `);
}

async function ensureUserDemographicsColumns() {
  if (!(await columnExists("users", "country"))) {
    await pool.query("ALTER TABLE users ADD COLUMN country VARCHAR(100) DEFAULT NULL AFTER contact_number");
  }

  if (!(await columnExists("users", "birth_date"))) {
    await pool.query("ALTER TABLE users ADD COLUMN birth_date TEXT DEFAULT NULL AFTER country");
  } else {
    await pool.query("ALTER TABLE users MODIFY COLUMN birth_date TEXT DEFAULT NULL");
  }

  await pool.query("ALTER TABLE users MODIFY COLUMN contact_number TEXT DEFAULT NULL");
}

/**
 * Add teacher_profiles.teaches_children, in the same guarded style as
 * ensureUserDemographicsColumns - no migration file, no separate deploy step.
 *
 * DEFAULT 1 on purpose: the column is opt-out, not opt-in. Adding it cannot
 * retroactively rule any existing teacher out of teaching children, which is the
 * only safe default - the alternative would silently change who can be assigned
 * to every child already on the books.
 */
async function ensureTeacherProfileColumns() {
  if (!(await columnExists("teacher_profiles", "teaches_children"))) {
    await pool.query(
      `ALTER TABLE teacher_profiles
       ADD COLUMN teaches_children TINYINT(1) NOT NULL DEFAULT 1 AFTER experience_years`
    );
  }
}

/**
 * Let a contract request be an extension rather than a new contract.
 *
 * These are genuinely different requests and the difference is not cosmetic.
 * Approving a NEW contract expires the student's active package and inserts a
 * fresh one with classes_used = 0 - correct when someone wants to buy more
 * classes, and destructive when they are asking for more TIME on classes they
 * already paid for and never used. Running an extension down that path would
 * silently discard the unused balance, which is the exact thing the student is
 * asking to keep.
 *
 * So the kind of request is stored rather than inferred, and the approval path
 * branches on it.
 *
 *   request_type            'new' (the only kind that existed before) or
 *                           'extension'
 *   package_id              which package the extension applies to. NULL for a
 *                           new contract, which has no package yet.
 *   classes_left_at_request a snapshot of what was left when they asked.
 *
 * The snapshot is deliberate. If the admin reads the request a week later the
 * balance may have moved, and "you had 6 classes left when you asked" is a
 * different and more honest claim than whatever the number says today.
 *
 * DEFAULT 'new' on request_type: every row that already exists is a new-contract
 * request, so existing rows need no rewriting and the old approval path keeps
 * behaving exactly as it did.
 */
async function ensureContractRequestScheduleColumns() {
  // When the student can actually attend.
  //
  // The admin's Create Student form collects this and passes it straight to
  // recommendTeacher, where it filters candidates by availability. Nothing stores
  // it - student_profiles has no column for it and never did - which was fine
  // while matching happened in the same request that collected it.
  //
  // A contract request is not the same request. The student fills this in, an
  // admin approves it later, and the matching happens on that later approval. So
  // unlike the admin's version this has to survive in between, or the student
  // states when they can attend and it is then ignored by the one process that
  // could have acted on it.
  //
  // Comma-separated weekday numbers rather than a join table: this is three
  // values read once, next to a request row, and it is never queried across
  // students. days are JS getDay indices, 0 = Sunday, which is what weekdayOf()
  // and normalizePreferredSchedule() already speak.
  if (!(await columnExists("student_contract_requests", "preferred_days"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN preferred_days VARCHAR(64) NULL AFTER class_duration`
    );
  }

  if (!(await columnExists("student_contract_requests", "preferred_start"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN preferred_start TIME NULL AFTER preferred_days`
    );
  }

  if (!(await columnExists("student_contract_requests", "preferred_end"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN preferred_end TIME NULL AFTER preferred_start`
    );
  }
}

async function ensureContractRequestTypeColumns() {
  if (!(await columnExists("student_contract_requests", "request_type"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN request_type ENUM('new','extension') NOT NULL DEFAULT 'new' AFTER student_id`
    );
  }

  if (!(await columnExists("student_contract_requests", "package_id"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN package_id INT NULL AFTER request_type`
    );
  }

  if (!(await columnExists("student_contract_requests", "classes_left_at_request"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN classes_left_at_request INT NULL AFTER requested_classes`
    );
  }

  try {
    await pool.query(
      `CREATE INDEX idx_contract_requests_type ON student_contract_requests (request_type, status)`
    );
  } catch {
    // Present after the first boot. Not worth a noisy failure path.
  }
}

/**
 * The lifecycle of a contract request: withdrawal, revision and the rule that
 * makes "one pending request per kind" a fact about the database rather than a
 * convention.
 *
 * Four things are added:
 *
 *   status           gains 'cancelled'. A student who sent a request by
 *                    mistake has to be able to withdraw it. Without a state for
 *                    that, the only way out was to wait for an admin to decline
 *                    it - a decision somebody else has to make for you - and
 *                    the request stayed in the queue the whole time.
 *
 *   revision_count   how many versions the request has had. A request sent
 *                    once is version 1.
 *
 *   request_history  the earlier versions, so revising a request does not
 *                    destroy what the admin would have read the first time.
 *
 *   pending_key      a generated column holding "<student>:<kind>" while the
 *                    request is pending and NULL once it is resolved, with a
 *                    UNIQUE key over it. That is the enforcement: MySQL treats
 *                    every NULL as distinct, so resolved rows are unconstrained
 *                    and pending rows are not.
 *
 * !! The unique key is the point of all of this. The route handler checked for
 * !! a pending row before writing one, which is a check and a write in two
 * !! steps - and two students pressing the button at the same moment could
 * !! both pass the check and both write. The database does not have that gap:
 * !! the second write fails, and the handler turns that into a clean answer
 * !! instead of a stack trace.
 */
async function ensureContractRequestLifecycleColumns() {
  if (!(await columnExists("student_contract_requests", "revision_count"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN revision_count INT NOT NULL DEFAULT 1 AFTER status`
    );
  }

  if (!(await columnExists("student_contract_requests", "request_history"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN request_history TEXT DEFAULT NULL AFTER revision_count`
    );
  }

  // The status enum. MODIFY is safe to repeat: it always sets the same set.
  await pool.query(
    `ALTER TABLE student_contract_requests
     MODIFY COLUMN status ENUM('pending','approved','declined','cancelled') NOT NULL DEFAULT 'pending'`
  );

  if (!(await columnExists("student_contract_requests", "pending_key"))) {
    // Duplicates first. The rule was enforced in application code only, and
    // that code could be raced. Any database that has been up long enough may
    // already hold two pending requests of the same kind for one student, and
    // the unique key below would refuse to be created while they are there.
    //
    // The newest of each group is kept - it is the one the student last
    // touched - and the older ones are withdrawn. A withdrawal is the honest
    // record of what happened to them: they were superseded, not declined.
    const [duplicates] = await pool.query(
      `SELECT student_id, request_type, COUNT(*) AS total
         FROM student_contract_requests
        WHERE status = 'pending'
        GROUP BY student_id, request_type
       HAVING total > 1`
    );

    for (const group of duplicates) {
      const [rows] = await pool.query(
        `SELECT request_id
           FROM student_contract_requests
          WHERE student_id = ? AND request_type = ? AND status = 'pending'
          ORDER BY requested_at DESC, request_id DESC`,
        [group.student_id, group.request_type]
      );

      const superseded = rows.slice(1).map((row) => row.request_id);
      if (!superseded.length) continue;

      await pool.query(
        `UPDATE student_contract_requests
            SET status = 'cancelled', resolved_at = CURRENT_TIMESTAMP
          WHERE request_id IN (${superseded.map(() => "?").join(", ")})`,
        superseded
      );

      console.log(
        `Contract requests: withdrew ${superseded.length} duplicate pending ` +
          `'${group.request_type}' request(s) for student ${group.student_id}.`
      );
    }

    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD COLUMN pending_key VARCHAR(64)
         GENERATED ALWAYS AS (IF(status = 'pending', CONCAT(student_id, ':', request_type), NULL)) STORED`
    );
  }

  if (!(await indexExists("student_contract_requests", "uq_contract_requests_pending"))) {
    await pool.query(
      `ALTER TABLE student_contract_requests
       ADD UNIQUE KEY uq_contract_requests_pending (pending_key)`
    );
  }
}

/**
 * One live notification per contract request, for the notifications that
 * already exist.
 *
 * !! The old code inserted a new notification for every submission, so a
 * !! student who revised a request three times had three unread entries in
 * !! every admin's bell for one request. The route now updates the existing
 * !! notification instead of adding another, but the rows that were already
 * !! there are still stacked up - and the number on the bell is the number the
 * !! admin trusts.
 * !!
 * !! So the older copies are read rather than deleted. They stay as a record
 * !! that the request was submitted more than once, and they stop counting.
 */
async function dedupeContractRequestNotifications() {
  const [duplicates] = await pool.query(
    `SELECT user_id, related_id, COUNT(*) AS total
       FROM notifications
      WHERE related_type = 'contract_request' AND related_id IS NOT NULL
      GROUP BY user_id, related_id
     HAVING total > 1`
  );

  let read = 0;

  for (const group of duplicates) {
    const [rows] = await pool.query(
      `SELECT notification_id
         FROM notifications
        WHERE user_id = ? AND related_id = ? AND related_type = 'contract_request'
        ORDER BY created_at DESC, notification_id DESC`,
      [group.user_id, group.related_id]
    );

    const older = rows.slice(1).map((row) => row.notification_id);
    if (!older.length) continue;

    await pool.query(
      `UPDATE notifications
          SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE notification_id IN (${older.map(() => "?").join(", ")})`,
      older
    );

    read += older.length;
  }

  if (read) {
    console.log(`Contract requests: read ${read} duplicate notification(s) left by earlier submissions.`);
  }
}

async function refreshProfileCompletion(userId) {
  await pool.query(
    `UPDATE users
     SET profile_completed = (
       first_name IS NOT NULL AND TRIM(first_name) <> ''
       AND last_name IS NOT NULL AND TRIM(last_name) <> ''
       AND contact_number IS NOT NULL AND TRIM(contact_number) <> ''
       AND timezone IS NOT NULL AND TRIM(timezone) <> ''
       AND profile_image_url IS NOT NULL AND TRIM(profile_image_url) <> ''
     )
     WHERE user_id = ?`,
    [userId]
  );
}

async function refreshAllProfileCompletion() {
  await pool.query(
    `UPDATE users
     SET profile_completed = (
       first_name IS NOT NULL AND TRIM(first_name) <> ''
       AND last_name IS NOT NULL AND TRIM(last_name) <> ''
       AND contact_number IS NOT NULL AND TRIM(contact_number) <> ''
       AND timezone IS NOT NULL AND TRIM(timezone) <> ''
       AND profile_image_url IS NOT NULL AND TRIM(profile_image_url) <> ''
     )`
  );
}

async function ensureStudentContractRequestsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_contract_requests (
      request_id INT NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      course_id INT DEFAULT NULL,
      requested_classes INT NOT NULL,
      class_duration INT NOT NULL DEFAULT 50,
      trial_notes TEXT DEFAULT NULL,
      ai_criteria TEXT DEFAULT NULL,
      status ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
      admin_response VARCHAR(500) DEFAULT NULL,
      requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (request_id),
      KEY idx_student_contract_requests_student (student_id),
      KEY idx_student_contract_requests_course (course_id),
      KEY idx_student_contract_requests_status (status),
      CONSTRAINT student_contract_requests_student_fk FOREIGN KEY (student_id) REFERENCES users (user_id),
      CONSTRAINT student_contract_requests_course_fk FOREIGN KEY (course_id) REFERENCES courses (course_id)
    )
  `);

  if (!(await columnExists("student_contract_requests", "trial_notes"))) {
    await pool.query("ALTER TABLE student_contract_requests ADD COLUMN trial_notes TEXT DEFAULT NULL AFTER requested_classes");
  }

  if (!(await columnExists("student_contract_requests", "class_duration"))) {
    await pool.query("ALTER TABLE student_contract_requests ADD COLUMN class_duration INT NOT NULL DEFAULT 50 AFTER requested_classes");
  }

  if (!(await columnExists("student_contract_requests", "ai_criteria"))) {
    await pool.query("ALTER TABLE student_contract_requests ADD COLUMN ai_criteria TEXT DEFAULT NULL AFTER trial_notes");
  }

  await pool.query("ALTER TABLE student_contract_requests MODIFY COLUMN admin_response TEXT DEFAULT NULL");
}

async function ensureStudentClassPackageDurationColumn() {
  if (!(await columnExists("student_class_packages", "class_duration"))) {
    await pool.query("ALTER TABLE student_class_packages ADD COLUMN class_duration INT NOT NULL DEFAULT 50 AFTER classes_left");
  }
}

async function ensureClassStatusSupportsNoShow() {
  await pool.query(
    "ALTER TABLE classes MODIFY COLUMN status ENUM('scheduled','completed','cancelled','no-show') DEFAULT 'scheduled'"
  );
}

async function ensureStudentProficiencyLevels() {
  await pool.query("ALTER TABLE student_profiles MODIFY COLUMN proficiency_level VARCHAR(50) DEFAULT 'novice-low'");
  await pool.query(`
    UPDATE student_profiles
    SET proficiency_level = CASE proficiency_level
      WHEN 'beginner' THEN 'novice-low'
      WHEN 'elementary' THEN 'novice-high'
      WHEN 'intermediate' THEN 'intermediate-mid'
      WHEN 'upper-intermediate' THEN 'intermediate-high'
      WHEN 'proficient' THEN 'advanced'
      WHEN 'fluent' THEN 'advanced'
      WHEN 'novice-low' THEN 'novice-low'
      WHEN 'novice-mid' THEN 'novice-mid'
      WHEN 'novice-high' THEN 'novice-high'
      WHEN 'intermediate-low' THEN 'intermediate-low'
      WHEN 'intermediate-mid' THEN 'intermediate-mid'
      WHEN 'intermediate-high' THEN 'intermediate-high'
      WHEN 'advanced' THEN 'advanced'
      ELSE 'novice-low'
    END
    WHERE proficiency_level IS NOT NULL
  `);
  await pool.query(
    "ALTER TABLE student_profiles MODIFY COLUMN proficiency_level ENUM('novice-low','novice-mid','novice-high','intermediate-low','intermediate-mid','intermediate-high','advanced') DEFAULT 'novice-low'"
  );
}

async function removeStudentPackageDateColumns() {
  if (await columnExists("student_class_packages", "package_start_date")) {
    await pool.query("ALTER TABLE student_class_packages DROP COLUMN package_start_date");
  }

  if (await columnExists("student_class_packages", "package_end_date")) {
    await pool.query("ALTER TABLE student_class_packages DROP COLUMN package_end_date");
  }
}

/**
 * Record WHY an account was archived, and when.
 *
 * !! Only the automatic sweep writes these. An account the admin archived by
 * !! hand has both NULL, which is the point: the columns are what let the UI say
 * !! "archived automatically, 12 days ago, contract ended" rather than the
 * !! indistinguishable "archived". An action that happens on its own, with no one
 * !! watching, has to leave a trace - otherwise the first sign of it is a student
 * !! who cannot log in and nobody who can say why.
 */
async function ensureUserArchiveColumns() {
  if (!(await columnExists("users", "archived_at"))) {
    await pool.query("ALTER TABLE users ADD COLUMN archived_at DATETIME NULL DEFAULT NULL AFTER status");
  }

  if (!(await columnExists("users", "archived_reason"))) {
    await pool.query("ALTER TABLE users ADD COLUMN archived_reason VARCHAR(160) NULL DEFAULT NULL AFTER archived_at");
  }

  try {
    await pool.query("CREATE INDEX idx_users_status_archived ON users (status, archived_at)");
  } catch {
    // Present already after the first boot.
  }
}

async function ensureSuperAdminColumn() {
  if (!(await columnExists("users", "is_super_admin"))) {
    await pool.query("ALTER TABLE users ADD COLUMN is_super_admin TINYINT(1) DEFAULT 0 AFTER role");
  }

  // The original, first-created admin is the super admin. Every admin created
  // afterward through the UI is a limited administrator - they can manage
  // students, teachers, books and contracts, but cannot create other admins or
  // touch the super admin's account.
  await pool.query("UPDATE users SET is_super_admin = 1 WHERE role = 'admin' ORDER BY user_id ASC LIMIT 1");
}

/**
 * Give student_class_packages a deadline and a "we told them" marker.
 *
 * Named expires_at rather than the old package_end_date on purpose:
 * removeStudentPackageDateColumns() drops package_start_date and
 * package_end_date on every boot, so reusing either name would have the new
 * column deleted at the next restart. That function stays as it is - it is still
 * doing the job it was written to do.
 *
 * Backfilled from created_at, which is the purchase moment, so existing packages
 * get the same 3-month term as new ones rather than quietly being exempt.
 */
async function ensureStudentClassPackageExpiryColumns() {
  if (!(await columnExists("student_class_packages", "expires_at"))) {
    await pool.query(
      "ALTER TABLE student_class_packages ADD COLUMN expires_at DATETIME NULL DEFAULT NULL AFTER status"
    );
  }

  if (!(await columnExists("student_class_packages", "expiry_notified_at"))) {
    await pool.query(
      "ALTER TABLE student_class_packages ADD COLUMN expiry_notified_at DATETIME NULL DEFAULT NULL AFTER expires_at"
    );
  }

  // Re-runnable: only rows with no deadline get one, so a restart does not keep
  // pushing an existing expiry further out.
  await pool.query(
    `UPDATE student_class_packages
        SET expires_at = DATE_ADD(created_at, INTERVAL ? MONTH)
      WHERE expires_at IS NULL
        AND created_at IS NOT NULL`,
    [CONTRACT_TERM_MONTHS]
  );

  try {
    await pool.query("CREATE INDEX idx_packages_expiry ON student_class_packages (status, expires_at)");
  } catch {
    // Present already after the first boot. Not worth a noisy failure path.
  }
}

async function ensureTeacherCoursesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_courses (
      teacher_id INT NOT NULL,
      course_id INT NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (teacher_id, course_id),
      KEY idx_teacher_courses_course (course_id),
      CONSTRAINT teacher_courses_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users (user_id) ON DELETE CASCADE,
      CONSTRAINT teacher_courses_course_fk FOREIGN KEY (course_id) REFERENCES courses (course_id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    INSERT IGNORE INTO teacher_courses (teacher_id, course_id)
    SELECT u.user_id, c.course_id
    FROM users u
    CROSS JOIN courses c
    WHERE u.role = 'teacher'
      AND NOT EXISTS (
        SELECT 1 FROM teacher_courses tc WHERE tc.teacher_id = u.user_id
    )
  `);
}

async function ensureMessagesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id INT NOT NULL AUTO_INCREMENT,
      sender_id INT NOT NULL,
      recipient_id INT NOT NULL,
      subject VARCHAR(255) DEFAULT NULL,
      content TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT '0',
      sent_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (message_id),
      KEY sender_id (sender_id),
      KEY idx_recipient_id (recipient_id),
      KEY idx_is_read (is_read),
      KEY idx_sent_at (sent_at),
      CONSTRAINT messages_ibfk_1 FOREIGN KEY (sender_id) REFERENCES users (user_id),
      CONSTRAINT messages_ibfk_2 FOREIGN KEY (recipient_id) REFERENCES users (user_id)
    )
  `);

  await pool.query("ALTER TABLE messages MODIFY COLUMN subject TEXT DEFAULT NULL");
}

async function ensureSensitiveEncryptedColumnTypes() {
  const statements = [
    "ALTER TABLE classes MODIFY COLUMN class_link TEXT DEFAULT NULL",
    "ALTER TABLE video_sessions MODIFY COLUMN teams_meeting_link TEXT DEFAULT NULL",
  ];

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (err) {
      console.warn(`Could not update encrypted column type: ${statement}`, err.message);
    }
  }
}

async function encryptExistingPlaintextColumn(tableName, columnName, whereClause = "") {
  const [rows] = await pool.query(
    `SELECT ${columnName} AS value, ${whereClause ? `${whereClause},` : ""} 1 AS marker
     FROM ${tableName}
     WHERE ${columnName} IS NOT NULL
       AND ${columnName} <> ''
       AND ${columnName} NOT LIKE ?`,
    [`${ENCRYPTED_VALUE_PREFIX}%`]
  );

  for (const row of rows) {
    await pool.query(
      `UPDATE ${tableName}
       SET ${columnName} = ?
       WHERE ${columnName} = ?`,
      [encryptNullableText(row.value), row.value]
    );
  }

  if (rows.length) {
    console.log(`Encrypted ${rows.length} existing ${tableName}.${columnName} value(s).`);
  }
}

async function encryptExistingSensitiveData() {
  const sensitiveColumns = [
    ["users", "contact_number"],
    ["users", "birth_date"],
    ["class_remarks", "remarks"],
    ["reschedule_requests", "reason"],
    ["reschedule_requests", "decline_reason"],
    ["student_contract_requests", "trial_notes"],
    ["student_contract_requests", "ai_criteria"],
    ["student_contract_requests", "admin_response"],
    ["student_profiles", "trial_notes"],
    ["assignment_submissions", "submission_text"],
    ["assignment_submissions", "feedback"],
    ["notifications", "title"],
    ["notifications", "message"],
    ["classes", "class_link"],
    ["video_sessions", "teams_meeting_link"],
  ];

  for (const [tableName, columnName] of sensitiveColumns) {
    // One missing column must not stop the remaining columns from being
    // encrypted, so each column is handled on its own.
    try {
      await encryptExistingPlaintextColumn(tableName, columnName);
    } catch (err) {
      console.warn(`Could not encrypt existing ${tableName}.${columnName} values:`, err?.message || err);
    }
  }
}

async function encryptExistingPlaintextMessages() {
  const [rows] = await pool.query(
    `SELECT message_id, subject, content
     FROM messages
     WHERE (subject IS NOT NULL AND subject NOT LIKE ?)
        OR (content IS NOT NULL AND content NOT LIKE ?)`,
    [`${ENCRYPTED_VALUE_PREFIX}%`, `${ENCRYPTED_VALUE_PREFIX}%`]
  );

  for (const row of rows) {
    await pool.query(
      `UPDATE messages
       SET subject = ?,
           content = ?
       WHERE message_id = ?`,
      [
        encryptNullableText(row.subject),
        encryptNullableText(row.content || ""),
        row.message_id,
      ]
    );
  }

  if (rows.length) {
    console.log(`Encrypted ${rows.length} existing plaintext chat message(s).`);
  }
}

/**
 * Every schema step, run in order at boot.
 *
 * Named and run individually rather than awaited as a bare sequence. A bare
 * sequence means one bad statement takes the whole service down: the throw skips
 * every later step and prepareDatabaseWithRetry calls process.exit(1), which on
 * Railway is an unrecoverable crash loop - the router ends up with no healthy
 * replica and answers 502 to everything, with no clue which statement failed.
 *
 * A server that boots with one feature broken is recoverable and the logs say
 * which feature. A server that never answers is neither.
 *
 * Order still matters - later steps can depend on earlier tables - so this is a
 * sequence, just one that survives a failure.
 */
const SCHEMA_STEPS = [
  ["assignment attempt columns", ensureAssignmentAttemptColumns],
  ["assignment attachment columns", ensureAssignmentAttachmentColumns],
  ["assignment archive column", ensureAssignmentArchiveColumn],
  ["submission history table", ensureSubmissionHistoryTable],
  ["books columns", ensureBooksColumns],
  ["remark columns", ensureRemarkColumns],
  ["reschedule request decline reason column", ensureRescheduleRequestDeclineReasonColumn],
  ["lessons columns", ensureLessonsColumns],
  ["book teachers table", ensureBookTeachersTable],
  ["lesson progress table", ensureLessonProgressTable],
  ["class attendance logs table", ensureClassAttendanceLogsTable],
  ["student course progress table", ensureStudentCourseProgressTable],
  ["user profile image column", ensureUserProfileImageColumn],
  ["user password changed column", ensureUserPasswordChangedColumn],
  ["account setup invites table", ensureAccountSetupInvitesTable],
  ["password reset tokens table", ensurePasswordResetTokensTable],
  ["api rate limits table", ensureApiRateLimitsTable],
  ["user demographics columns", ensureUserDemographicsColumns],
  ["teacher profile columns", ensureTeacherProfileColumns],
  ["contract request type columns", ensureContractRequestTypeColumns],
  ["contract request schedule columns", ensureContractRequestScheduleColumns],
  ["contract request lifecycle columns", ensureContractRequestLifecycleColumns],
  ["contract request notification dedupe", dedupeContractRequestNotifications],
  ["profile completion refresh", refreshAllProfileCompletion],
  ["student contract requests table", ensureStudentContractRequestsTable],
  ["class package duration column", ensureStudentClassPackageDurationColumn],
  ["class status no-show column", ensureClassStatusSupportsNoShow],
  ["student proficiency levels", ensureStudentProficiencyLevels],
  ["messages table", ensureMessagesTable],
  ["encrypted column types", ensureSensitiveEncryptedColumnTypes],
  ["performance indexes", ensurePerformanceIndexes],
  ["encrypt plaintext messages", encryptExistingPlaintextMessages],
  ["encrypt existing sensitive data", encryptExistingSensitiveData],
  ["remove legacy package date columns", removeStudentPackageDateColumns],
  ["class package expiry columns", ensureStudentClassPackageExpiryColumns],
  // Before the dormancy sweep below, which writes to both of these columns.
  ["user archive audit columns", ensureUserArchiveColumns],
  ["super admin flag", ensureSuperAdminColumn],
  ["teacher courses table", ensureTeacherCoursesTable],
  ["expire finished packages", expireFinishedPackages],
  ["delete past teacher availability", deletePastTeacherAvailability],
];

async function prepareDatabase() {
  const failed = [];

  for (const [name, run] of SCHEMA_STEPS) {
    try {
      await run();
    } catch (err) {
      // A connection-limit error means the database is momentarily unavailable
      // rather than wrong, and it is transient - so it is rethrown for the retry
      // wrapper to handle, exactly as before. Anything else is a statement or
      // schema problem: skipping it costs one feature, whereas exiting costs the
      // entire service.
      if (isMysqlConnectionLimitError(err)) throw err;

      failed.push(name);
      console.error(`[schema] step "${name}" failed and was skipped:`, err?.message || err);
    }
  }

  if (failed.length) {
    console.error(
      `[schema] ${failed.length} of ${SCHEMA_STEPS.length} steps failed: ${failed.join(", ")}. ` +
        "Starting anyway - the affected features will error until the schema is fixed."
    );
  }

  return failed;
}

async function prepareDatabaseWithRetry() {
  const maxAttempts = Number(process.env.DB_PREPARE_MAX_ATTEMPTS || 24);
  const retryDelayMs = Number(process.env.DB_PREPARE_RETRY_DELAY_MS || 5000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prepareDatabase();
      return;
    } catch (err) {
      // Only a connection-limit error reaches here now; prepareDatabase skips
      // every other kind and keeps going. Exiting after exhausting the retries
      // is still right for a genuinely unreachable database, because starting
      // without one would just serve 500s from every route.
      if (!isMysqlConnectionLimitError(err) || attempt === maxAttempts) {
        console.error("Error preparing database columns:", err);
        process.exit(1);
      }

      console.warn(
        `Database connection limit reached while preparing schema; retrying in ${Math.round(retryDelayMs / 1000)}s (${attempt}/${maxAttempts}).`
      );
      await sleep(retryDelayMs);
    }
  }
}

await prepareDatabaseWithRetry();

async function resolveCourseIdByIdOrName(value) {
  if (!value) return null;
  // numeric id?
  if (/^\d+$/.test(String(value))) return parseInt(value, 10);

  // try by name
  const [rows] = await pool.query(
    "SELECT course_id FROM courses WHERE course_name = ? LIMIT 1",
    [value]
  );
  if (rows.length) return rows[0].course_id;

  // create if missing
  const [ins] = await pool.query(
    "INSERT INTO courses (course_name) VALUES (?)",
    [value]
  );
  return ins.insertId;
}

const aiCriterionLabels = {
  learningGoal: "Learning goal",
  learningStyle: "Learning style",
  focusArea: "Focus area",
  pace: "Learning pace",
};

function normalizeAiValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "").trim();
}

function aiValueText(value) {
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

function parseAiCriteriaJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeCriteria(criteria = {}) {
  return Object.fromEntries(
    Object.entries(aiCriterionLabels).map(([key]) => [key, normalizeAiValues(criteria[key])])
  );
}

function buildCriteriaNotes(criteria) {
  const lines = Object.entries(criteria)
    .filter(([, value]) => Array.isArray(value) ? value.length : value)
    .map(([key, value]) => `${aiCriterionLabels[key]}: ${aiValueText(value)}`);

  return lines.length ? `AI matching criteria:\n${lines.join("\n")}` : "";
}

function buildTeacherAiBio({ bio, teachingStyle, idealStudentPace }) {
  // These are now multi-selects on the Create Teacher form, so each attribute
  // is a comma-joined list. The template is unchanged so bios written by
  // earlier versions still parse back out (see parseTeacherProfileTags).
  const tag = (label, value) => {
    const values = (Array.isArray(value) ? value : [value])
      .map((item) => String(item == null ? "" : item).trim())
      .filter(Boolean);
    return values.length ? `${label}: ${values.join(", ")}` : "";
  };

  const aiTags = [
    tag("Teaching style", teachingStyle),
    tag("Best student pace", idealStudentPace),
  ].filter(Boolean);

  return [bio || "", aiTags.length ? `AI matching profile:\n${aiTags.join("\n")}` : ""]
    .filter((part) => String(part).trim())
    .join("\n\n");
}

// Scoring and the workload policy now live in ./teacherMatching.js so they can
// be unit tested. The level vocabulary below is still used by the other
// assessment endpoints (final class assessment, profile creation).

const PROFICIENCY_LEVELS = new Set([
  "novice-low",
  "novice-mid",
  "novice-high",
  "intermediate-low",
  "intermediate-mid",
  "intermediate-high",
  "advanced",
]);

const PROFICIENCY_LEVEL_LABELS = {
  "novice-low": "Novice Low",
  "novice-mid": "Novice Mid",
  "novice-high": "Novice High",
  "intermediate-low": "Intermediate Low",
  "intermediate-mid": "Intermediate Mid",
  "intermediate-high": "Intermediate High",
  advanced: "Advanced (Fluent)",
};

function formatProficiencyLevel(value) {
  return PROFICIENCY_LEVEL_LABELS[value] || String(value || "").replace(/-/g, " ");
}

function normalizeProficiencyLevel(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
  const legacyMap = {
    beginner: "novice-low",
    elementary: "novice-high",
    intermediate: "intermediate-mid",
    "upper-intermediate": "intermediate-high",
    proficient: "advanced",
    fluent: "advanced",
  };
  if (legacyMap[normalized]) return legacyMap[normalized];
  return PROFICIENCY_LEVELS.has(normalized) ? normalized : "";
}

// ISO date N days from today, in UTC so the value cannot drift with the
// server's timezone. A one-day skew is immaterial here: the window spans three
// weeks precisely so every weekday occurs several times inside it.
function isoDateFromToday(offsetDays) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays))
    .toISOString()
    .slice(0, 10);
}

/**
 * The student's preferred slot, or null when they did not give one.
 *
 * Null is the important part: without it the matcher behaves exactly as it did
 * before availability existed - no queries, no flags, no UI line.
 */
function normalizePreferredSchedule(raw) {
  const days = Array.isArray(raw?.days) ? raw.days.filter((d) => d !== null && d !== "") : [];
  const start = String(raw?.start ?? "").trim();
  const end = String(raw?.end ?? "").trim();
  if (!days.length || !start || !end) return null;
  return { days, start, end };
}

/**
 * Read a stored preferred schedule back off a contract request row.
 *
 * Three columns rather than one JSON blob, so this is the only place that has to
 * know how they are shaped. Everything downstream receives the same object shape
 * the admin's Create Student form sends, so recommendTeacher cannot tell - and
 * does not need to - whether the preference came from a live request or from one
 * that sat in an admin queue for a week.
 *
 * Returns null when any part is missing, which is what makes the whole thing
 * optional: normalizePreferredSchedule treats null as "no preference" and skips
 * the availability check entirely, so a student who did not say when they can
 * attend is matched exactly as they were before this existed.
 */
function preferredScheduleFromRow(row) {
  if (!row) return null;
  const days = String(row.preferred_days || "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d !== "")
    .map((d) => String(Number(d)));
  return normalizePreferredSchedule({
    days,
    start: row.preferred_start || "",
    end: row.preferred_end || "",
  });
}

/**
 * Is each candidate free during the preferred slot?
 *
 * Reads the same teacher_availability table the Calendar reads, plus scheduled
 * classes for collisions. Two queries, only when a preference exists. Availability
 * is per DATE rather than a repeating weekly pattern, so a preference for
 * "Tuesdays, 18:00" is resolved by finding real upcoming dates on that weekday.
 */
async function loadTeacherAvailability(teacherIds, preference, db) {
  const ids = teacherIds.map((id) => parseInt(id, 10)).filter(Number.isFinite);
  const result = new Map();
  if (!ids.length) return result;

  const endOffset = AVAILABILITY_HORIZON_DAYS - 1;
  const startDate = isoDateFromToday(0);
  const endDate = isoDateFromToday(endOffset);
  const dates = Array.from({ length: AVAILABILITY_HORIZON_DAYS }, (_, i) => isoDateFromToday(i));
  const placeholders = ids.map(() => "?").join(", ");

  const [availabilityRows] = await db.query(
    `SELECT teacher_id,
            DATE_FORMAT(available_date, '%Y-%m-%d') AS available_date,
            status,
            TIME_FORMAT(start_time, '%H:%i') AS start_time,
            TIME_FORMAT(end_time, '%H:%i') AS end_time,
            TIME_FORMAT(break_start, '%H:%i') AS break_start,
            TIME_FORMAT(break_end, '%H:%i') AS break_end
     FROM teacher_availability
     WHERE teacher_id IN (${placeholders})
       AND available_date BETWEEN ? AND ?`,
    [...ids, startDate, endDate]
  );

  const [bookingRows] = await db.query(
    `SELECT teacher_id,
            DATE_FORMAT(scheduled_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(start_time, '%H:%i') AS start_time,
            TIME_FORMAT(end_time, '%H:%i') AS end_time
     FROM classes
     WHERE status = 'scheduled'
       AND teacher_id IN (${placeholders})
       AND scheduled_date BETWEEN ? AND ?`,
    [...ids, startDate, endDate]
  );

  const buckets = new Map(ids.map((id) => [String(id), { rows: [], bookings: [] }]));
  for (const row of availabilityRows) buckets.get(String(row.teacher_id))?.rows.push(row);
  for (const row of bookingRows) buckets.get(String(row.teacher_id))?.bookings.push(row);

  for (const [key, bucket] of buckets) {
    result.set(key, evaluateAvailability({
      rows: bucket.rows,
      bookings: bucket.bookings,
      dates,
      ...preference,
    }));
  }
  return result;
}

// baselineCriteria scores a second criteria set from the SAME loaded rows, so
// measuring what the AI changed costs no extra query. It exists only to report
// whether the suggestions moved the pick - the returned teacher always comes
// from criteria.
async function recommendTeacher({ criteria = {}, insightsPromise = null, trialNotes = "", courseId = null, courseName = "", proficiencyLevel = "", studentBirthDate = null, preferredTeacherId = null, baselineCriteria = null, preferredSchedule = null, honourPreferredTeacher = false, db = pool }) {
  // What the admin actually typed, available immediately. The insights only ever
  // add to it, so this is a sound basis for ranking before they have arrived.
  const baseCriteria = normalizeCriteria(criteria);
  const level = normalizeProficiencyLevel(proficiencyLevel);
  const courseFilter = courseId ? parseInt(courseId, 10) : null;
  // Every ACTIVE teacher is a candidate. There is deliberately no
  // profile_completed filter here.
  //
  // !! That flag means the user finished their own onboarding: name, contact,
  // !! timezone and a profile photo. POST /api/admin/users sets it to false on
  // !! purpose, so the teacher completes their own profile later. Filtering on it
  // !! therefore excluded every admin-created teacher from matching, and the
  // !! symptom was "No teacher found for this student" however many teachers
  // !! existed. It is an onboarding flag, not a statement that a teacher is
  // !! usable - and an unusable teacher is already excluded by status.
  //
  // A thin profile is not a reason to hide someone: it just means fewer matching
  // fields, so the score is lower and they rank below better-documented teachers.
  // Ranking on the available evidence is what "closest match" has to mean.
  const [teachers] = await db.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.email, u.profile_completed,
            tp.bio, tp.specialization, tp.experience_years, tp.teaches_children,
            COUNT(student.user_id) AS assigned_student_count,
            MAX(CASE WHEN selected_tc.course_id IS NOT NULL THEN 1 ELSE 0 END) AS selected_course_match
     FROM users u
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.user_id
     LEFT JOIN teacher_courses selected_tc ON selected_tc.teacher_id = u.user_id AND selected_tc.course_id = ?
     LEFT JOIN student_profiles sp ON sp.assigned_teacher_id = u.user_id
     LEFT JOIN users student ON student.user_id = sp.user_id AND student.status = 'active' AND student.profile_completed = TRUE
     WHERE u.role = 'teacher' AND u.status = 'active'
       AND (? IS NULL OR selected_tc.course_id IS NOT NULL)
     GROUP BY u.user_id, u.first_name, u.last_name, u.email, u.profile_completed, tp.bio, tp.specialization, tp.experience_years, tp.teaches_children
     ORDER BY u.first_name ASC, u.last_name ASC`,
    [courseFilter || 0, courseFilter]
  );

  // Availability is only read when the admin gave a preferred slot. Without one
  // this stays null and preferAvailable is a no-op, so the result is exactly what
  // it always was.
  const preference = normalizePreferredSchedule(preferredSchedule);
  const availability = preference
    ? await loadTeacherAvailability(teachers.map((teacher) => teacher.user_id), preference, db)
    : null;

  const scoreWith = (activeCriteria) =>
    rankTeachers(
      teachers.map((teacher) => ({
        ...scoreTeacherForStudent(teacher, activeCriteria, trialNotes, courseId, level),
        availability: availability ? availability.get(String(teacher.user_id)) || null : null,
      }))
    );

  // Both model calls are now in flight at the same time instead of one after the
  // other, so one click costs one round trip's latency rather than two.
  //
  // This is only sound because the candidate pool does not depend on the
  // criteria. Eligibility is fixed by role, status and course, so the insights
  // can change the ORDER teachers come back in but never WHICH ones are
  // eligible. The advisor therefore ranks the same complete pool that the rules
  // will, and its answer stays applicable to whatever order they produce.
  //
  // It reads the admin's own criteria and the trial notes themselves, which is
  // the material the insights are extracted from in the first place, so it is
  // not working from less than the rules are - it is working from the same notes
  // by a different route.
  //
  // The catch is because a dangling rejected promise would surface as an
  // unhandled rejection rather than as a failed request. adviseTeacherRanking
  // does not throw; this keeps that true even if it ever did.
  const advisorPromise = adviseTeacherRanking({
    criteria: baseCriteria,
    trialNotes,
    courseName,
    scored: scoreWith(baseCriteria),
    availability,
    preferredLabel: preference
      ? `${preference.days.join(", ")} ${preference.start}-${preference.end}`
      : "",
  }).catch(() => ({ ok: false, reason: "unavailable" }));

  // The one edge that genuinely has to wait. The inferred criteria change the
  // rules' scores, so the rules cannot run until the notes have been read. If
  // that call is the slow one, the advisor has simply finished and is waiting.
  const insights = insightsPromise ? await insightsPromise : null;
  const normalizedCriteria = insights
    ? normalizeCriteria(mergeInsights(criteria, insights.added))
    : baseCriteria;

  // The rules ordering: the fallback if the advisor is unavailable, and the list
  // the advisor's answer is applied to.
  let ranked = scoreWith(normalizedCriteria);

  // The advisor reorders that list. It cannot add, drop or qualify anyone: the
  // pool is already fixed above, and availability and workload are applied to
  // its answer below.
  const advisor = await advisorPromise;
  if (advisor.ok) {
    ranked = applyAdvisorOrder(ranked, advisor.order);
  }

  // Availability: a constraint, applied to whatever ordering we ended up with, so
  // neither the scorer nor the model can place someone unavailable ahead of
  // someone who can teach the slot.
  ranked = preferAvailable(ranked, availability);

  // Then the same idea for age. A teacher who has said they will not teach
  // children is not a weaker match for a child, they are not a candidate - which
  // is why this partitions the order rather than costing points.
  //
  // An unknown birth date does NOT make the student a child. A missing field is
  // not evidence, and inferring one would exclude teachers on the strength of
  // data nobody entered. It is reported as unknown instead, so the admin can see
  // the rule did not apply rather than assuming it did.
  const studentAge = ageFromBirthDate(studentBirthDate);
  const studentAgeKnown = studentAge !== null;
  const studentIsChild = studentAgeKnown && studentAge <= CHILD_MAX_AGE;
  ranked = preferTeachesChildren(ranked, studentIsChild);

  const { assigned, usedLeastLoadedFallback, preferredHonouredOverLimit } = selectTeacherFromRanking(
    ranked,
    preferredTeacherId,
    { honourPreferred: honourPreferredTeacher }
  );

  const result = {
    teacher: assigned || null,
    rankedTeachers: ranked,
    criteria: normalizedCriteria,
    overBalanceTeachers: overBalanceTeachers(ranked),
    usedLeastLoadedFallback,
    noTeacherReason: "",
    preferredScheduleEvaluated: false,
    availabilityConflict: false,
    availabilityReason: "",
    preferredHonouredOverLimit: false,
    matchStrength: { level: "unknown", matched: 0, total: 0, ratio: 0 },
    studentAgeKnown,
    studentAgeGroup: !studentAgeKnown ? "unknown" : studentIsChild ? "child" : "adult",
    childAgeConflict: false,
    childAgeReason: "",
  };

  // Reported either way, and always here rather than at each return: a rules-only
  // result that looks identical to a considered one is how an admin ends up
  // trusting a degraded recommendation.
  result.advisor = advisor.ok
    ? {
        used: true,
        summary: advisor.summary || "",
        reasons: advisor.reasons || {},
        shortlisted: Boolean(advisor.shortlisted),
        candidateCount: advisor.candidateCount || 0,
        shortlistSize: advisor.shortlistSize || 0,
      }
    : {
        used: false,
        configured: isTeacherAdvisorConfigured(),
        reason: advisor.reason || "",
        // The cause of the failures that tripped the breaker, plus how long
        // until it is worth trying again. Without these, an open breaker
        // reported "temporarily unavailable" and hid the one failure worth
        // reading - so the only way to find out why the AI was down was to go
        // and read the server log.
        lastFailureReason: advisor.lastFailureReason || advisor.reason || "",
        lastFailureDetail: advisor.lastFailureDetail || advisor.detail || "",
        retryInMs: advisor.retryInMs || 0,
      };

  if (advisor.ok && advisor.shortlisted) {
    console.log(
      "[teacher-advisor] shortlist:",
      advisor.candidateCount,
      "candidates, model saw",
      advisor.shortlistSize
    );
  }

  if (!ranked.length) {
    // An empty pool has two very different causes and the admin needs to be told
    // which, because the action is different: create a teacher, or assign one to
    // this course. One query, only when the pool was empty.
    const [[pool]] = await db.query(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'teacher' AND status = 'active'`
    );
    result.noTeacherReason = Number(pool?.total) === 0 ? "no-teachers" : "no-teacher-for-course";
  }

  if (baselineCriteria) {
    const baselinePick = selectTeacherFromRanking(scoreWith(normalizeCriteria(baselineCriteria)), preferredTeacherId)
      .assigned;
    result.baselineTeacherId = baselinePick ? String(baselinePick.user_id) : null;
  }

  // The recommendation is still made even when nobody is free then, but the
  // caller is told, so an unavailable pick is never presented as a clean one.
  const assignedAvailability = assigned && availability ? availability.get(String(assigned.user_id)) : null;
  result.preferredScheduleEvaluated = Boolean(preference);
  result.availabilityConflict = Boolean(assignedAvailability?.evaluated && !assignedAvailability.available);
  result.availabilityReason = result.availabilityConflict ? assignedAvailability.reason : "";
  result.preferredHonouredOverLimit = Boolean(preferredHonouredOverLimit);

  // How well the teacher we actually picked covers what the admin asked for.
  //
  // This is the "closest possible" rule made visible. Selection has always
  // taken the closest available teacher - the best-ranked one under the load
  // limit, or the least loaded if there is nobody under it - so the behaviour
  // was never wrong. What was missing is that the admin could not tell a good
  // match from a compromise, because the score behind it also counts experience
  // and workload. Reported on coverage instead, which is the honest measure.
  //
  // Read off the assigned teacher rather than the rules' first choice, so it
  // stays true after the advisor reorders and after availability moves someone.
  if (assigned) {
    result.matchStrength = assessMatchStrength({
      criterionMatched: assigned.criterionMatched,
      criterionTotal: assigned.criterionTotal,
    });

    // The constraint is applied, not enforced absolutely: if every candidate has
    // opted out of children we still return the closest one, because refusing to
    // recommend leaves the admin with nothing. But it is never presented as a
    // clean pick - that is what this flag is for.
    result.childAgeConflict = Boolean(studentIsChild && !teacherWillTeachChildren(assigned));
    if (result.childAgeConflict) {
      result.childAgeReason =
        `${assigned.first_name || "This teacher"} ${assigned.last_name || ""}`.trim() +
        " has said they will not teach children, and no other available teacher will";
    }
  }

  return result;
}

// A contract runs for a fixed term as well as for a fixed number of classes.
// Both limits apply and whichever runs out first ends it, so a student who takes
// weekly finishes on the class count first.
//
// The term runs from purchase. created_at IS the purchase moment for every
// package in the system, which is why no separate start date is stored: one
// timestamp, and the deadline is derived from it.


// book the classes they have left, short enough that it is still news.


function packageStatusFromUsage(status, totalClasses, classesUsed, expiresAt = null) {
  const normalizedStatus = ["active", "expired", "cancelled"].includes(status) ? status : "active";
  const total = Math.max(0, parseInt(totalClasses, 10) || 0);
  const used = Math.max(0, parseInt(classesUsed, 10) || 0);
  if (total - used <= 0) return "expired";
  // A cancelled or already-expired package stays that way. Only an ACTIVE one
  // can be expired by the clock running out.
  if (normalizedStatus !== "active") return normalizedStatus;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "expired";
  return normalizedStatus;
}

/**
 * End contracts that are finished, by either limit.
 *
 * Deliberately an UPDATE on the stored status rather than only a computed one,
 * so every reader - the student's own page, the booking gate, the admin list -
 * gets the same answer without each re-deriving the deadline for itself.
 */
async function expireFinishedPackages(db = pool) {
  await db.query(
    `UPDATE student_class_packages
      SET status = 'expired'
      WHERE status = 'active'
        AND (classes_left <= 0 OR (expires_at IS NOT NULL AND expires_at <= NOW()))`
  );
}

/**
 * Tell students whose contract is about to run out.
 *
 * Once per package, tracked by expiry_notified_at. Without that this re-sends on
 * every sweep, and the sweep runs every minute - a student would get the same
 * warning 960 times a day.
 *
 * Best-effort by design. A failed notification must never stop the sweep or
 * block a booking; the contract expires on time regardless, and a student who
 * misses the warning finds out when they try to book.
 */
async function notifyUpcomingContractExpirations(db = pool) {
  const [rows] = await db.query(
    `SELECT p.package_id, p.student_id, p.total_classes, p.classes_used, p.expires_at
       FROM student_class_packages p
       JOIN users u ON u.user_id = p.student_id
      WHERE p.status = 'active'
        AND p.expiry_notified_at IS NULL
        AND p.expires_at IS NOT NULL
        AND p.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
        AND u.status = 'active'`,
    [CONTRACT_EXPIRY_WARNING_DAYS]
  );

  for (const row of rows) {
    const when = new Date(row.expires_at);
    const pretty = Number.isNaN(when.getTime())
      ? "soon"
      : when.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const left = Math.max(0, Number(row.total_classes || 0) - Number(row.classes_used || 0));

    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'general', ?, ?, ?, 'contract_expiry', '/Calendar')`,
      [
        row.student_id,
        "Your contract expires soon",
        encryptNullableText(
          `Your contract expires on ${pretty}. You have ${left} of ${row.total_classes} classes left to book before then, or they will be lost.`
        ),
        row.package_id,
      ]
    );

    // Flagged only after the notification is written. If the insert throws, the
    // flag stays clear and the next sweep tries again, which is what we want.
    await db.query(
      "UPDATE student_class_packages SET expiry_notified_at = NOW() WHERE package_id = ?",
      [row.package_id]
    );
  }

  return rows.length;
}

const AUTO_MARK_PAST_CLASSES_INTERVAL_MS = 60 * 1000;
const CLASS_ATTENDANCE_GRACE_MINUTES = 15;
let lastAutoMarkPastClassesAt = 0;
let autoMarkPastClassesPromise = null;

async function autoMarkPastClassesAsNoShow(db = pool) {
  const now = Date.now();
  if (autoMarkPastClassesPromise) return autoMarkPastClassesPromise;
  if (now - lastAutoMarkPastClassesAt < AUTO_MARK_PAST_CLASSES_INTERVAL_MS) return;

  autoMarkPastClassesPromise = db
    .query(
      `SELECT c.class_id, c.teacher_id, c.student_id
       FROM classes c
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       WHERE c.status = 'scheduled'
         AND TIMESTAMP(c.scheduled_date, COALESCE(c.start_time, '00:00:00')) <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
         AND (
           cal.log_id IS NULL
           OR cal.teacher_started_at IS NULL
           OR cal.student_joined_at IS NULL
         )`,
      [CLASS_ATTENDANCE_GRACE_MINUTES]
    )
    .then(async ([rows]) => {
      if (!rows.length) return;
      const classIds = rows.map((row) => row.class_id);
      await db.query(
        `UPDATE classes
         SET status = 'no-show'
         WHERE class_id IN (?) AND status = 'scheduled'`,
        [classIds]
      );
      rows.forEach((row) => {
        broadcastCalendarChange([row.teacher_id, row.student_id], "class-no-show", {
          class_id: row.class_id,
          status: "no-show",
        });
      });
    })
    .then(() => {
      lastAutoMarkPastClassesAt = Date.now();
    })
    .finally(() => {
      autoMarkPastClassesPromise = null;
    });

  await autoMarkPastClassesPromise;
}

/**
 * How often the dormancy sweep is allowed to run.
 *
 * !! An hour, not the 60 seconds the rest of the sweep uses. Every other task in
 * !! it reacts to a class that has just become due, where being late is visible
 * !! and being early costs nothing. This one destroys an account's active status
 * !! on nobody's say-so, and the shortest threshold it can act on is 60 days - so
 * !! running it more often than that would do exactly the same work more often.
 */
const DORMANCY_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
let lastDormancySweepAt = 0;
let dormancySweepPromise = null;

/**
 * Archive accounts that have gone quiet past their threshold.
 *
 * Runs unattended by request, so it is built to be un-surprising: every decision
 * it declines to make is logged with the reason, and the accounts it leaves alone
 * are logged too. "No candidates" has to mean "nothing was eligible", not "the
 * query failed" - which is why the skipped list exists and why the whole thing
 * refuses to run rather than guessing if it cannot read the data.
 */
async function archiveDormantAccounts(db = pool) {
  if (dormancySweepPromise) return dormancySweepPromise;
  if (Date.now() - lastDormancySweepAt < DORMANCY_SWEEP_INTERVAL_MS) return;

  dormancySweepPromise = runDormancySweep(db).finally(() => {
    dormancySweepPromise = null;
  });

  await dormancySweepPromise;
}

async function runDormancySweep(db) {
  let result;
  try {
    result = await archiveDormantAccountsNow(db);
  } catch (err) {
    // Never let this take the server down, and never let a failure look like a
    // quiet day. An admin reading "no candidates" has to be able to trust it.
    console.error("Dormancy sweep failed - no accounts were archived:", err);
    return;
  } finally {
    lastDormancySweepAt = Date.now();
  }

  for (const row of result.archived) {
    console.log(
      `[dormancy] archived ${row.role} "${row.name}" (${row.user_id}) - ${row.reason}; ` +
        `${row.quietDays} days quiet against a ${row.thresholdDays} day threshold`
    );
  }

  if (result.archived.length === 0 && result.skipped.length) {
    console.log(
      `[dormancy] scanned ${result.scanned} active accounts, archived 0. ` +
        `Closest to the line: ` +
        result.skipped
          .slice(0, 3)
          .map((row) => `${row.name} (${row.reason})`)
          .join("; ")
    );
  } else {
    console.log(`[dormancy] scanned ${result.scanned} active accounts, archived ${result.archived.length}`);
  }
}

async function markClassNoShowIfAttendanceGraceExpired(db, classId) {
  const [result] = await db.query(
    `UPDATE classes c
     LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
     SET c.status = 'no-show'
     WHERE c.class_id = ?
       AND c.status = 'scheduled'
       AND TIMESTAMP(c.scheduled_date, COALESCE(c.start_time, '00:00:00')) <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
       AND (
         cal.log_id IS NULL
         OR cal.teacher_started_at IS NULL
         OR cal.student_joined_at IS NULL
       )`,
    [classId, CLASS_ATTENDANCE_GRACE_MINUTES]
  );
  return Number(result.affectedRows || 0) > 0;
}

const assignmentSelect = `
  SELECT a.assignment_id AS id,
         a.assignment_id AS assignmentId,
         a.teacher_id AS teacherId,
         a.student_id AS studentId,
         CONCAT(student.first_name, ' ', student.last_name) AS student,
         student.profile_image_url AS studentProfileImageUrl,
         student.profile_image_url AS student_profile_image_url,
         CONCAT(teacher.first_name, ' ', teacher.last_name) AS teacherName,
         teacher.profile_image_url AS teacherProfileImageUrl,
         teacher.profile_image_url AS teacher_profile_image_url,
         a.course_id AS courseId,
         c.course_name AS subject,
         a.title AS name,
         a.title,
         a.instructions,
         a.instructions AS description,
         DATE_FORMAT(a.due_date, '%Y-%m-%d') AS dueDate,
         TIME_FORMAT(a.due_time, '%H:%i') AS dueTime,
         a.attempt_limit AS attemptLimit,
         a.attachment_url AS attachmentUrl,
         a.attachment_name AS attachmentName,
         a.is_archived AS isArchived,
         CASE
           WHEN a.due_time IS NULL THEN DATE_FORMAT(a.due_date, '%Y-%m-%d')
           ELSE CONCAT(DATE_FORMAT(a.due_date, '%Y-%m-%d'), 'T', TIME_FORMAT(a.due_time, '%H:%i'))
         END AS due,
         a.status,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS postedAt,
         CASE
           WHEN s.grade IS NULL THEN 'Pending'
           ELSE CAST(s.grade AS CHAR)
         END AS score,
         s.submission_id AS submissionId,
         s.submission_text AS comments,
         s.file_url AS fileUrl,
         s.file_name AS fileName,
         COALESCE(s.attempt_count, 0) AS attemptsUsed,
         COALESCE(s.attempt_count, 0) AS attemptCount,
         DATE_FORMAT(s.submitted_at, '%Y-%m-%d %H:%i') AS submittedAt,
         s.feedback
  FROM assignments a
  JOIN users student ON student.user_id = a.student_id
    AND student.status = 'active' AND student.profile_completed = TRUE
  JOIN users teacher ON teacher.user_id = a.teacher_id
    AND teacher.status = 'active' AND teacher.profile_completed = TRUE
  LEFT JOIN courses c ON c.course_id = a.course_id
  LEFT JOIN assignment_submissions s ON s.assignment_id = a.assignment_id
`;

const submissionSelect = `
  SELECT s.submission_id AS id,
         s.submission_id AS submissionId,
         s.assignment_id AS assignmentId,
         a.title AS assignmentName,
         a.instructions AS assignmentInstructions,
         a.teacher_id AS teacherId,
         a.student_id AS studentId,
         a.attempt_limit AS attemptLimit,
         CONCAT(student.first_name, ' ', student.last_name) AS student,
         CONCAT(student.first_name, ' ', student.last_name) AS assignedStudent,
         CONCAT(teacher.first_name, ' ', teacher.last_name) AS teacherName,
         s.submission_text AS comments,
         s.file_url AS fileUrl,
         s.file_name AS fileName,
         s.attempt_count AS attemptsUsed,
         s.attempt_count AS attemptCount,
         COALESCE(s.file_url, 'Comment submission') AS file,
         CASE WHEN s.grade IS NULL THEN 'Submitted' ELSE 'Graded' END AS status,
         DATE_FORMAT(s.submitted_at, '%Y-%m-%d %H:%i') AS submittedAt,
         s.grade,
         s.feedback
  FROM assignment_submissions s
  JOIN assignments a ON a.assignment_id = s.assignment_id
  JOIN users student ON student.user_id = s.student_id
    AND student.status = 'active' AND student.profile_completed = TRUE
  JOIN users teacher ON teacher.user_id = a.teacher_id
    AND teacher.status = 'active' AND teacher.profile_completed = TRUE
`;

// ---------- courses ----------
app.get("/api/courses", async (_req, res) => {
  const [rows] = await pool.query("SELECT course_id, course_name FROM courses ORDER BY course_name");
  res.json({ courses: rows });
});

app.get("/api/teacher-courses", requireAdminSession, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tc.teacher_id, tc.course_id, c.course_name
       FROM teacher_courses tc
       JOIN courses c ON c.course_id = tc.course_id
       ORDER BY tc.teacher_id ASC, c.course_name ASC`
    );

    res.json({ teacherCourses: rows });
  } catch (err) {
    console.error("GET /api/teacher-courses error:", err);
    res.status(500).json({ message: "Error fetching teacher courses" });
  }
});

app.get("/api/dashboard/:role/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { role, user_id } = req.params;
    const scheduledDate = req.query.scheduled_date;

    if (!["student", "teacher"].includes(role)) {
      return res.status(400).json({ message: "Invalid dashboard role" });
    }

    if (!scheduledDate) {
      return res.status(400).json({ message: "scheduled_date is required" });
    }

    await autoMarkPastClassesAsNoShow(pool);
    const scheduledDateText = normalizeDateKey(scheduledDate);
    const sourceStartDate = addDaysToDateKey(scheduledDateText, -1) || scheduledDateText;
    const sourceEndDate = addDaysToDateKey(scheduledDateText, 1) || scheduledDateText;

    const classIdColumn = role === "teacher" ? "teacher_id" : "student_id";
    const classesPromise = pool.query(
      `SELECT ${classSelectFields},
              stu.first_name as student_name,
              stu.last_name as student_last_name,
              stu.email as student_email,
              stu.profile_image_url AS student_profile_image_url,
              stu.profile_image_url AS studentProfileImageUrl,
              stu.timezone as student_timezone,
              sp.proficiency_level AS student_proficiency_level,
              tea.first_name as teacher_name,
              tea.last_name as teacher_last_name,
              tea.email as teacher_email,
              tea.profile_image_url AS teacher_profile_image_url,
              tea.timezone as teacher_timezone,
              COALESCE(c.class_link, vs.teams_meeting_link) as class_link
       FROM classes c
       LEFT JOIN video_sessions vs ON vs.class_id = c.class_id
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       LEFT JOIN student_profiles sp ON sp.user_id = stu.user_id
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE c.scheduled_date BETWEEN ? AND ?
         AND c.status = 'scheduled'
         AND c.scheduled_date >= CURDATE()
         AND c.${classIdColumn} = ?
       ORDER BY c.start_time ASC, c.class_id ASC`,
      [sourceStartDate, sourceEndDate, user_id]
    );

    const coursesPromise = pool.query("SELECT course_id, course_name FROM courses ORDER BY course_name");

    if (role === "teacher") {
      const [classesResult, coursesResult, studentsResult, assignmentsResult, submissionsResult, booksResult] =
        await Promise.all([
          classesPromise,
          coursesPromise,
          pool.query(
            `SELECT u.user_id, u.first_name, u.last_name, u.email, u.contact_number AS contact,
                    u.profile_image_url,
                    sp.proficiency_level, sp.assigned_teacher_id, sp.course_id, sp.trial_notes
             FROM users u
             JOIN student_profiles sp ON u.user_id = sp.user_id
             WHERE sp.assigned_teacher_id = ?
               AND u.status = 'active'
               AND u.profile_completed = TRUE`,
            [user_id]
          ),
          pool.query(
            `${assignmentSelect}
             WHERE a.teacher_id = ?
             ORDER BY a.created_at DESC, a.assignment_id DESC`,
            [user_id]
          ),
          pool.query(
            `${submissionSelect}
             WHERE a.teacher_id = ?
             ORDER BY s.submitted_at DESC, s.submission_id DESC`,
            [user_id]
          ),
          pool.query(
            `${bookListSelectFields}
             WHERE b.status = 'active'
               AND EXISTS (
                 SELECT 1 FROM book_teachers dbt
                 WHERE dbt.book_id = b.book_id AND dbt.teacher_id = ?
               )
             ORDER BY b.created_at DESC`,
            [user_id]
          ),
        ]);

      const students = studentsResult[0].map((student) => ({
        user_id: student.user_id,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
        contact: decryptNullableText(student.contact),
        profileImageUrl: student.profile_image_url,
        profile_image_url: student.profile_image_url,
        proficiency_level: student.proficiency_level,
        assigned_teacher_id: student.assigned_teacher_id,
        course_id: student.course_id,
        trial_notes: decryptNullableText(student.trial_notes),
      }));

      return res.json({
        classes: decryptRows(classesResult[0], ["class_link"]),
        courses: coursesResult[0],
        students,
        assignments: decryptRows(assignmentsResult[0], ["instructions", "description", "comments", "feedback"]),
        submissions: decryptRows(submissionsResult[0], ["comments", "feedback", "assignmentInstructions"]),
        books: booksResult[0],
      });
    }

    const profile = await getStudentProfile(user_id);
    const booksPromise = profile?.assigned_teacher_id
      ? pool.query(
          `${bookListSelectFields}
           WHERE b.status = 'active'
             AND EXISTS (
               SELECT 1 FROM book_teachers sbt
               WHERE sbt.book_id = b.book_id AND sbt.teacher_id = ?
             )
             ${profile.course_id ? "AND b.course_id = ?" : ""}
           ORDER BY b.created_at DESC`,
          profile.course_id ? [profile.assigned_teacher_id, profile.course_id] : [profile.assigned_teacher_id]
        )
      : Promise.resolve([[]]);

    const assignedTeacherPromise = profile?.assigned_teacher_id
      ? pool.query(
          `SELECT user_id, first_name, last_name, email, profile_image_url
           FROM users
           WHERE user_id = ? AND role = 'teacher' AND status = 'active' AND profile_completed = TRUE
           LIMIT 1`,
          [profile.assigned_teacher_id]
        )
      : Promise.resolve([[]]);

    const packagePromise = getStudentPackageAvailability(pool, user_id).catch(() => ({
      package: null,
      bookedClasses: 0,
      bookableClasses: 0,
    }));

    const [
      classesResult,
      coursesResult,
      remarksResult,
      assignmentsResult,
      booksResult,
      progressResult,
      assignedTeacherResult,
      packageAvailability,
    ] = await Promise.all([
      classesPromise,
      coursesPromise,
      pool.query(
        `SELECT cr.*, c.class_name, c.scheduled_date, c.start_time, c.end_time,
                t.first_name AS teacher_first, t.last_name AS teacher_last,
                t.profile_image_url AS teacher_profile_image_url
         FROM class_remarks cr
         JOIN classes c ON cr.class_id = c.class_id
         JOIN users t ON cr.teacher_id = t.user_id
         WHERE cr.student_id = ?
         ORDER BY cr.created_at DESC`,
        [user_id]
      ),
      pool.query(
        `${assignmentSelect}
         WHERE a.student_id = ? AND a.is_archived = 0
         ORDER BY a.due_date ASC, a.due_time ASC, a.created_at DESC`,
        [user_id]
      ),
      booksPromise,
      pool.query(
        `SELECT lp.* FROM lesson_progress lp
         JOIN lessons l ON lp.lesson_id = l.lesson_id
         WHERE lp.student_id = ?
         ORDER BY lp.updated_at DESC`,
        [user_id]
      ),
      assignedTeacherPromise,
      packagePromise,
    ]);

    const remarks = remarksResult[0].map((row) => ({
      remark_id: row.remark_id,
      class_id: row.class_id,
      class_name: row.class_name,
      teacher_name: `${row.teacher_first} ${row.teacher_last}`,
      teacher_profile_image_url: row.teacher_profile_image_url,
      remarks: decryptNullableText(row.remarks),
      rating: row.rating,
      created_at: row.created_at,
      scheduled_date: row.scheduled_date,
      start_time: row.start_time,
      end_time: row.end_time,
    }));

    const packageInfo = packageAvailability.package
      ? {
          ...packageAvailability.package,
          booked_classes: packageAvailability.bookedClasses,
          bookable_classes: packageAvailability.bookableClasses,
        }
      : null;

    res.json({
      classes: decryptRows(classesResult[0], ["class_link"]),
      courses: coursesResult[0],
      remarks,
      assignments: decryptRows(assignmentsResult[0], ["instructions", "description", "comments", "feedback"]),
      books: booksResult[0],
      progress: progressResult[0],
      package: packageInfo,
      assignedTeacher: assignedTeacherResult[0][0] || null,
    });
  } catch (err) {
    console.error("GET /api/dashboard/:role/:user_id error:", err);
    res.status(500).json({ message: "Error fetching dashboard data" });
  }
});

// Whether a teacher will teach children is set when the admin creates them, but
// it has to be correctable afterwards: teachers change their minds, and some
// join already set. Without this the only way to change it is a database edit.
app.patch("/api/admin/teachers/:teacherId/teaches-children", requireAdminSession, async (req, res) => {
  try {
    const teacherId = parseInt(req.params.teacherId, 10);
    if (!teacherId) {
      return res.status(400).json({ message: "Invalid teacher selected" });
    }

    // Tri-state on the wire. An absent value means "I did not mean to change
    // this", which is different from false, and is rejected rather than guessed
    // at - silently defaulting would flip a teacher's stated preference.
    const raw = req.body?.teachesChildren;
    if (typeof raw !== "boolean") {
      return res.status(400).json({ message: "teachesChildren must be true or false" });
    }

    const [[teacher]] = await pool.query(
      "SELECT user_id FROM users WHERE user_id = ? AND role = 'teacher' LIMIT 1",
      [teacherId]
    );
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    // A teacher row should exist, but an admin-created teacher might predate it.
    const [result] = await pool.query(
      `UPDATE teacher_profiles SET teaches_children = ? WHERE user_id = ?`,
      [raw ? 1 : 0, teacherId]
    );

    if (!result.affectedRows) {
      await pool.query(
        `INSERT INTO teacher_profiles (user_id, teaches_children) VALUES (?, ?)`,
        [teacherId, raw ? 1 : 0]
      );
    }

    res.json({ teacherId: String(teacherId), teachesChildren: raw });
  } catch (err) {
    console.error("PATCH /api/admin/teachers/:teacherId/teaches-children error:", err);
    res.status(500).json({ message: "Could not update that preference" });
  }
});

app.put("/api/admin/teachers/:teacherId/courses", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const teacherId = parseInt(req.params.teacherId, 10);
    const courseIds = Array.isArray(req.body?.courseIds)
      ? [...new Set(req.body.courseIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0))]
      : [];

    if (!teacherId) {
      return res.status(400).json({ message: "Invalid teacher selected" });
    }

    if (!courseIds.length) {
      return res.status(400).json({ message: "Please select at least one course for this teacher" });
    }

    const [[teacher]] = await connection.query(
      "SELECT user_id FROM users WHERE user_id = ? AND role = 'teacher' LIMIT 1",
      [teacherId]
    );
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const [validCourses] = await connection.query(
      `SELECT course_id FROM courses WHERE course_id IN (${courseIds.map(() => "?").join(", ")})`,
      courseIds
    );
    if (validCourses.length !== courseIds.length) {
      return res.status(400).json({ message: "One or more selected courses are invalid" });
    }

    await connection.beginTransaction();
    await connection.query("DELETE FROM teacher_courses WHERE teacher_id = ?", [teacherId]);
    await connection.query(
      `INSERT INTO teacher_courses (teacher_id, course_id)
       VALUES ${courseIds.map(() => "(?, ?)").join(", ")}`,
      courseIds.flatMap((courseId) => [teacherId, courseId])
    );
    await connection.commit();

    res.json({ message: "Teacher courses updated" });
  } catch (err) {
    await connection.rollback();
    console.error("PUT /api/admin/teachers/:teacherId/courses error:", err);
    res.status(500).json({ message: "Error updating teacher courses" });
  } finally {
    connection.release();
  }
});

// ---------- month availability ----------
/**
 * GET /api/trial/availability?year=2025&month=11
 * Returns: { days: { 'YYYY-MM-DD': { disabled: bool, booked: ['09:00', ...] } } }
 */
app.get("/api/trial/availability", async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10); // 1..12

  if (!year || !month) return res.json({ days: {} });

  const start = `${year}-${pad(month)}-01 00:00:00`;
  const end = `${year}-${pad(month)}-31 23:59:59`; // safe enough

  // Pull existing trial bookings for that month
  const [rows] = await pool.query(
    `SELECT DATE(trial_datetime) as d, TIME_FORMAT(trial_datetime, '%H:%i') as t
     FROM trial_bookings
     WHERE trial_datetime BETWEEN ? AND ?
       AND status IN ('pending','approved')`,
    [start, end]
  );

  // Build per-day map of booked slots
  const map = {};
  for (const r of rows) {
    if (!map[r.d]) map[r.d] = new Set();
    map[r.d].add(r.t);
  }

  // Make response: all days enabled unless all slots are taken
  const days = {};
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const booked = Array.from(map[iso] || []);
    // consider a day "disabled" if every slot is already booked
    const disabled = booked.length >= 3; // because SLOTS has 3 default times
    days[iso] = { disabled, booked };
  }

  res.json({ days });
});

// ---------- (existing) login kept the same ----------
app.post("/api/login", limitLoginAttempts, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Look up the user by email
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, email, contact_number AS contact, password_hash, role, status, profile_completed, password_changed, profile_image_url, country, birth_date, timezone, is_super_admin
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];

    // Compare password with bcrypt
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.status === "archived") {
      return res.status(403).json({
        message: "This account is currently archived and cannot be accessed. Please contact the administrator to request account reactivation.",
      });
    }

    // Success — fetch assigned teacher for students and return a trimmed user object
    let assignedTeacherId = null;
    if (user.role === "student") {
      const [profileRows] = await pool.query(
        `SELECT assigned_teacher_id FROM student_profiles WHERE user_id = ? LIMIT 1`,
        [user.user_id]
      );
      if (profileRows.length) {
        assignedTeacherId = profileRows[0].assigned_teacher_id;
      }
    }

    await refreshProfileCompletion(user.user_id);
    const [[completion]] = await pool.query(
      "SELECT profile_completed, password_changed, profile_image_url FROM users WHERE user_id = ? LIMIT 1",
      [user.user_id]
    );

    // Issued here so protected routes have something real to check. Wrapped
    // because failing to sign must never turn a valid password into a failed
    // sign-in: without a token the account can still browse, it just cannot
    // reach admin actions.
    let sessionToken = null;
    try {
      sessionToken = signSessionToken(
        { userId: user.user_id, role: user.role },
        { secret: SESSION_SECRET, ttlMs: SESSION_TTL_MS }
      );
    } catch (err) {
      console.error("Could not issue a session token at login:", err);
    }

    res.json({
      message: "Login successful",
      token: sessionToken,
      user: {
        id: user.user_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        contact: decryptNullableText(user.contact),
        role: user.role,
        isSuperAdmin: Boolean(user.is_super_admin),
        country: user.country,
        birthDate: decryptNullableText(user.birth_date),
        timezone: normalizeTimezone(user.timezone),
        profileCompleted: completion?.profile_completed,
        passwordChanged: completion?.password_changed,
        profileImageUrl: completion?.profile_image_url,
        assignedTeacherId,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/contact", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const message = String(req.body?.message || "").trim();

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "A valid email address is required" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ message: "Message is too long" });
    }

    if (!isMailConfigured()) {
      return res.status(503).json({ message: "Contact form is not configured" });
    }

    // The address the website publishes as "Email us" is where the form goes.
    //
    // !! It used to be hard-coded to the mail provider's account holder,
    // !! because that provider's sandbox domain is only allowed to send to
    // !! its own account holder. That was not a default - it was a
    // !! workaround, and it outlived the reason for it.
    const inbox = contactFormRecipient();
    const { text, html } = contactFormEmail({ name, email, message, inbox });

    await sendMail({
      to: inbox,
      // !! The address in the form, not the academy's sending address. The
      // !! person who receives the notification is being asked to answer a
      // !! visitor, and "reply" has to reach that visitor.
      replyTo: email,
      subject: `JEN Academia contact form — ${escapeEmailHeader(name)}`,
      text,
      html,
    });

    res.json({ message: "Message sent successfully." });
  } catch (err) {
    console.error("POST /api/contact error:", err);

    // !! A visitor cannot fix a mail server. When the mail service could not
    // !! be reached - a host that blocks the port, a wrong key, an API that is
    // !! down - the only way out for the person who filled the form in is the
    // !! address printed beside it. So the answer says so, instead of
    // !! "server error", which tells a visitor nothing and asks them to try
    // !! again for a result that will be the same.
    if (err instanceof MailTransportError) {
      return res.status(503).json({
        message: "Sending messages is not set up yet. Please email us instead.",
      });
    }

    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

app.post("/api/forgot-password", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    const [rows] = await pool.query(
      "SELECT user_id, first_name, status FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length || rows[0].status === "archived") {
      return res.json({ message: "If that email exists, a reset link has been sent." });
    }

    const user = rows[0];
    const token = createInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const expiresAtSql = expiresAt.toISOString().slice(0, 19).replace("T", " ");

    await pool.query(
      "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL",
      [user.user_id]
    );
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [user.user_id, tokenHash, expiresAtSql]
    );

    const resetUrl = `${getFrontendBaseUrl()}/reset-password/${encodeURIComponent(token)}`;

    // A failure here must not change the answer.
    //
    // !! The response is deliberately the same whether the account exists,
    // !! whether it does not, and whether the mail server answered. It used
    // !! to throw on a send failure, and the route's catch turned that into
    // !! a 500 - so a real account whose mail failed answered 500 and an
    // !! account that does not exist answered 200. That difference is how
    // !! somebody finds out which email addresses are registered, and it was
    // !! one line of code away from being fixed.
    try {
      const { text, html } = passwordResetEmail({
        firstName: user.first_name,
        resetUrl,
        contactEmail: contactFormRecipient(),
      });

      await sendMail({
        to: email,
        subject: "Reset your JEN Academia password",
        text,
        html,
      });
    } catch (mailErr) {
      console.error("POST /api/forgot-password: the reset email could not be sent:", mailErr);
    }

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("POST /api/forgot-password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/reset-password/:token", async (req, res) => {
  try {
    const { password, confirmPassword } = req.body || {};
    const newPassword = String(password || "");

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    if (newPassword !== String(confirmPassword || "")) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const tokenHash = hashInviteToken(req.params.token || "");
    const [rows] = await pool.query(
      `SELECT prt.reset_id, prt.expires_at, prt.used_at, prt.user_id
       FROM password_reset_tokens prt
       WHERE prt.token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Reset link is invalid or has expired" });
    }

    const record = rows[0];

    if (record.used_at) {
      return res.status(410).json({ message: "This reset link has already been used" });
    }
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ message: "This reset link has expired. Please request a new one." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await pool.query(
      "UPDATE users SET password_hash = ?, password_changed = 1 WHERE user_id = ?",
      [passwordHash, record.user_id]
    );
    await pool.query(
      "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE reset_id = ?",
      [record.reset_id]
    );

    res.json({ message: "Password updated successfully. You can now sign in." });
  } catch (err) {
    console.error("POST /api/reset-password/:token error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/reset-password/:token", async (req, res) => {
  try {
    const tokenHash = hashInviteToken(req.params.token || "");
    const [rows] = await pool.query(
      "SELECT reset_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1",
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Reset link is invalid or has expired" });
    }
    if (rows[0].used_at) {
      return res.status(410).json({ message: "This reset link has already been used" });
    }
    if (new Date(rows[0].expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ message: "This reset link has expired. Please request a new one." });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error("GET /api/reset-password/:token error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/account-setup/:token", async (req, res) => {
  try {
    const tokenHash = hashInviteToken(req.params.token || "");
    const [rows] = await pool.query(
      `SELECT asi.invite_id, asi.expires_at, asi.used_at,
              u.user_id, u.first_name, u.last_name, u.email, u.role, u.status
       FROM account_setup_invites asi
       JOIN users u ON u.user_id = asi.user_id
       WHERE asi.token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Invite link was not found" });
    }

    const invite = rows[0];
    if (invite.used_at) {
      return res.status(410).json({ message: "Invite link has already been used" });
    }

    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ message: "Invite link has expired. Please ask the admin to resend it." });
    }

    if (!["student", "teacher"].includes(invite.role) || invite.status === "archived") {
      return res.status(400).json({ message: "Invite link is no longer valid" });
    }

    res.json({
      invite: {
        userId: invite.user_id,
        email: invite.email,
        firstName: invite.first_name,
        lastName: invite.last_name,
        expiresAt: invite.expires_at,
      },
    });
  } catch (err) {
    console.error("GET /api/account-setup/:token error:", err);
    res.status(500).json({ message: "Error validating invite link" });
  }
});

app.post("/api/account-setup/:token", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { password, confirmPassword } = req.body || {};
    const nextPassword = String(password || "");

    if (!nextPassword || nextPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    if (confirmPassword !== undefined && nextPassword !== String(confirmPassword || "")) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    await connection.beginTransaction();

    const tokenHash = hashInviteToken(req.params.token || "");
    const [rows] = await connection.query(
      `SELECT asi.invite_id, asi.expires_at, asi.used_at,
              u.user_id, u.role, u.status
       FROM account_setup_invites asi
       JOIN users u ON u.user_id = asi.user_id
       WHERE asi.token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Invite link was not found" });
    }

    const invite = rows[0];
    if (invite.used_at) {
      await connection.rollback();
      return res.status(410).json({ message: "Invite link has already been used" });
    }

    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await connection.rollback();
      return res.status(410).json({ message: "Invite link has expired. Please ask the admin to resend it." });
    }

    if (!["student", "teacher"].includes(invite.role) || invite.status === "archived") {
      await connection.rollback();
      return res.status(400).json({ message: "Invite link is no longer valid" });
    }

    const hash = await bcrypt.hash(nextPassword, 10);
    await connection.query(
      "UPDATE users SET password_hash = ?, password_changed = TRUE WHERE user_id = ?",
      [hash, invite.user_id]
    );
    await connection.query(
      "UPDATE account_setup_invites SET used_at = CURRENT_TIMESTAMP WHERE invite_id = ?",
      [invite.invite_id]
    );

    await connection.commit();
    await refreshProfileCompletion(invite.user_id);

    res.json({ message: "Password set successfully. Please log in to complete your profile." });
  } catch (err) {
    await connection.rollback();
    console.error("POST /api/account-setup/:token error:", err);
    res.status(500).json({ message: "Error completing account setup" });
  } finally {
    connection.release();
  }
});



//ACCOUNT
app.get("/api/users/:id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    await refreshProfileCompletion(req.params.id);
    await autoMarkPastClassesAsNoShow(pool);
    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.contact_number AS contact, u.country, u.birth_date, u.profile_image_url, u.timezone, u.role, u.status,
              u.profile_completed, u.password_changed, u.created_at,
              sp.assigned_teacher_id
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const u = decryptFields(rows[0], ["contact", "birth_date"]);
    let roleDetails = {};

    if (u.role === "student") {
      // The most recent package, preferring an active one.
      //
      // !! This used to join on scp.status = 'active', which meant a student
      // !! whose contract had run out got no package fields at all - no
      // !! classes count, and above all no expiry. Their own account page
      // !! could not tell them their contract had ended, which is the single
      // !! thing that page most needs to say. Same resolution the teacher's
      // !! Students page already uses, so both agree on what "this student's
      // !! contract" means.
      //
      // !! These notes have to live OUTSIDE the template literal. Written inside
      // !! it they became part of the SQL text, and MySQL rejected the whole
      // !! query with ER_PARSE_ERROR - which surfaced as a bare HTTP 500 and a
      // !! student account page that silently rendered as though the student had
      // !! no contract at all. Comments in a query string are not comments.
      //
      // !! scp.package_id is selected because the account page keys "does this
      // !! student have a contract at all" off it. Without that column the page
      // !! reported no contract for students who demonstrably had one - a quieter
      // !! version of the same mistake, and the reason the "none" state is worth
      // !! having but must never be reached by accident.
      const [studentRows] = await pool.query(
        `SELECT sp.proficiency_level, sp.assigned_teacher_id, sp.trial_notes,
                c.course_id, c.course_name, c.description AS course_description, c.duration AS course_duration,
                t.first_name AS teacher_first_name, t.last_name AS teacher_last_name, t.email AS teacher_email,
                scp.package_id, scp.total_classes, scp.classes_used, scp.classes_left, scp.class_duration,
                scp.status AS package_status, scp.expires_at AS package_expires_at
         FROM student_profiles sp
         LEFT JOIN courses c ON c.course_id = sp.course_id
         LEFT JOIN users t ON t.user_id = sp.assigned_teacher_id
         LEFT JOIN student_class_packages scp
           ON scp.student_id = sp.user_id
          AND scp.package_id = (
            SELECT latest.package_id
            FROM student_class_packages latest
            WHERE latest.student_id = sp.user_id
            ORDER BY latest.status = 'active' DESC, latest.created_at DESC, latest.package_id DESC
            LIMIT 1
          )
         WHERE sp.user_id = ?
         LIMIT 1`,
        [req.params.id]
      );
      roleDetails = decryptFields(studentRows[0] || {}, ["trial_notes"]);
    } else if (u.role === "teacher") {
      const [teacherRows] = await pool.query(
        `SELECT tp.bio, tp.specialization, tp.experience_years, tp.hourly_rate, tp.teaches_children,
                COUNT(DISTINCT student.user_id) AS active_students,
                GROUP_CONCAT(DISTINCT c.course_name ORDER BY c.course_name SEPARATOR ', ') AS courses
         FROM users u
         LEFT JOIN teacher_profiles tp ON tp.user_id = u.user_id
         LEFT JOIN student_profiles sp ON sp.assigned_teacher_id = u.user_id
         LEFT JOIN users student ON student.user_id = sp.user_id AND student.status = 'active' AND student.profile_completed = TRUE
         LEFT JOIN teacher_courses tc ON tc.teacher_id = u.user_id
         LEFT JOIN courses c ON c.course_id = tc.course_id
         WHERE u.user_id = ?
         GROUP BY tp.bio, tp.specialization, tp.experience_years, tp.hourly_rate, tp.teaches_children
         LIMIT 1`,
        [req.params.id]
      );
      const [classRows] = await pool.query(
        `SELECT COUNT(*) AS upcoming_classes
         FROM classes
         WHERE teacher_id = ? AND status = 'scheduled' AND scheduled_date >= CURDATE()`,
        [req.params.id]
      );
      roleDetails = {
        ...(teacherRows[0] || {}),
        upcoming_classes: classRows[0]?.upcoming_classes || 0,
      };
    } else if (u.role === "admin") {
      const [[stats]] = await pool.query(
        `SELECT
           SUM(role = 'student' AND status = 'active') AS active_students,
           SUM(role = 'teacher' AND status = 'active') AS active_teachers,
           SUM(status = 'archived') AS archived_users
         FROM users`
      );
      roleDetails = stats || {};
    }

    res.json({
      user: {
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        contact: u.contact,
        country: u.country,
        birthDate: u.birth_date,
        profileImageUrl: u.profile_image_url,
        timezone: u.timezone,
        role: u.role,
        status: u.status,
        createdAt: u.created_at,
        profileCompleted: u.profile_completed,
        passwordChanged: u.password_changed,
        assignedTeacherId: u.assigned_teacher_id || null,
        roleDetails,
      },
    });
  } catch (err) {
    console.error("GET /api/users/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// A teacher changing this on their own account page.
//
// No id is accepted from the body on purpose: the subject of the change is the
// session. An endpoint that took a teacherId would be a way for any teacher to
// rewrite someone else's stated preference, which is exactly the field this
// exists to make trustworthy.
app.patch("/api/teacher/teaches-children", requireSession, async (req, res) => {
  try {
    const teacherId = parseInt(req.session?.userId, 10);
    if (!teacherId || req.session?.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can set this." });
    }

    const raw = req.body?.teachesChildren;
    if (typeof raw !== "boolean") {
      return res.status(400).json({ message: "teachesChildren must be true or false" });
    }

    const [result] = await pool.query(
      `UPDATE teacher_profiles SET teaches_children = ? WHERE user_id = ?`,
      [raw ? 1 : 0, teacherId]
    );

    if (!result.affectedRows) {
      // An admin-created teacher whose profile row is somehow absent. Inserting
      // is better than reporting success on a change that did not happen.
      await pool.query(
        `INSERT INTO teacher_profiles (user_id, teaches_children) VALUES (?, ?)`,
        [teacherId, raw ? 1 : 0]
      );
    }

    res.json({ teachesChildren: raw });
  } catch (err) {
    console.error("PATCH /api/teacher/teaches-children error:", err);
    res.status(500).json({ message: "Could not update that preference" });
  }
});

app.put("/api/users/:id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { firstName, lastName, email, contact, country, birthDate, timezone } = req.body;
    const normalizedBirthDate = birthDate ? String(birthDate).slice(0, 10) : null;
    const normalizedCountry = String(country || "").trim();
    const resolvedTimezone = normalizeTimezone(timezone, timezoneFromCountry(normalizedCountry));

    if (normalizedBirthDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
      return res.status(400).json({ message: "Birthday must be a valid date" });
    }

    // Validate required fields for profile completion
    if (!firstName || !lastName || !contact || !resolvedTimezone) {
      return res.status(400).json({ 
        message: "First name, last name, contact, and timezone are required to complete your profile"
      });
    }

    await pool.query(
      `UPDATE users
       SET first_name = ?, last_name = ?, email = ?, contact_number = ?, country = ?, birth_date = ?, timezone = ?
       WHERE user_id = ?`,
      [
        firstName,
        lastName,
        email,
        encryptNullableText(contact),
        normalizedCountry || null,
        encryptNullableText(normalizedBirthDate),
        resolvedTimezone,
        req.params.id,
      ]
    );
    await refreshProfileCompletion(req.params.id);

    res.json({ message: "Profile updated successfully!" });
  } catch (err) {
    console.error("PUT /api/users/:id error:", err);
    res.status(500).json({ message: "Could not update profile" });
  }
});

app.post("/api/users/:id/profile-picture", profileUpload.single("profile_picture"), requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Please choose an image to upload" });
    }

    const imageUrl = `/uploads/profiles/${req.file.filename}`;
    const [currentRows] = await pool.query(
      `SELECT profile_image_url FROM users WHERE user_id = ? LIMIT 1`,
      [req.params.id]
    );

    if (!currentRows.length) {
      await deleteLocalProfileImage(imageUrl);
      return res.status(404).json({ message: "User not found" });
    }

    const oldImageUrl = currentRows[0].profile_image_url;
    const [result] = await pool.query(
      `UPDATE users SET profile_image_url = ? WHERE user_id = ?`,
      [imageUrl, req.params.id]
    );

    if (!result.affectedRows) {
      await deleteLocalProfileImage(imageUrl);
      return res.status(404).json({ message: "User not found" });
    }

    await pool.query(
      `UPDATE teacher_profiles SET profile_image_url = ? WHERE user_id = ?`,
      [imageUrl, req.params.id]
    );

    if (oldImageUrl && oldImageUrl !== imageUrl) {
      await deleteLocalProfileImage(oldImageUrl);
    }
    await refreshProfileCompletion(req.params.id);

    res.json({ message: "Profile picture updated", profileImageUrl: imageUrl });
  } catch (err) {
    console.error("POST /api/users/:id/profile-picture error:", err);
    res.status(500).json({ message: err.message || "Could not upload profile picture" });
  }
});

app.put("/api/users/:id/password", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { current, next } = req.body;
    const userId = req.params.id;

    // Fetch current hash
    const [rows] = await pool.query(
      "SELECT password_hash FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const user = rows[0];
    const match = await bcrypt.compare(current, user.password_hash);
    if (!match)
      return res.status(401).json({ message: "Current password incorrect" });

    // Hash new password
    const newHash = await bcrypt.hash(next, 10);
    await pool.query(
      "UPDATE users SET password_hash = ?, password_changed = TRUE WHERE user_id = ?",
      [newHash, userId]
    );
    await refreshProfileCompletion(userId);

    res.json({ message: "Password updated successfully!" });
  } catch (err) {
    console.error("PUT /api/users/:id/password error:", err);
    res.status(500).json({ message: "Could not change password" });
  }
});

//ADMIN

// Load and availability for one teacher, for the create-student confirm dialog.
app.post("/api/admin/teacher-fit-check", requireAdminSession, async (req, res) => {
  try {
    const { teacherId, preferredSchedule } = req.body || {};
    const id = parseInt(teacherId, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Missing teacher_id" });
    }

    const [rows] = await pool.query(
      `SELECT u.user_id,
              u.first_name,
              u.last_name,
              COUNT(sp.student_id) AS assigned_student_count
       FROM users u
       LEFT JOIN student_profiles sp ON sp.assigned_teacher_id = u.user_id
       WHERE u.user_id = ? AND u.role = 'teacher' AND u.status = 'active'
       GROUP BY u.user_id, u.first_name, u.last_name
       LIMIT 1`,
      [id]
    );
    const teacher = rows[0];
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const assignedStudentCount = Number(teacher.assigned_student_count || 0);
    const fitStudentIsChild = isChildAge(req.body?.studentBirthDate);
    const fitStudentAgeKnown = ageFromBirthDate(req.body?.studentBirthDate) !== null;
    const preference = normalizePreferredSchedule(preferredSchedule);
    const availability = preference
      ? (await loadTeacherAvailability([id], preference, pool)).get(String(id)) || null
      : null;

    res.json({
      teacherId: String(teacher.user_id),
      name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim(),
      assignedStudentCount,
      atOrOverLimit: assignedStudentCount >= TEACHER_BALANCE_LIMIT,
      balanceLimit: TEACHER_BALANCE_LIMIT,
      availabilityEvaluated: Boolean(availability?.evaluated),
      available: availability ? availability.available : null,
      availabilityReason: availability?.reason || "",
      matchingDates: availability?.matchingDates || [],
      willTeachChildren: teacherWillTeachChildren(teacher),
      studentIsChild: fitStudentIsChild,
      studentAgeKnown: fitStudentAgeKnown,
      childAgeConflict: fitStudentIsChild && !teacherWillTeachChildren(teacher),
    });
  } catch (err) {
    console.error("POST /api/admin/teacher-fit-check error:", err);
    res.status(500).json({ message: "Could not check that teacher" });
  }
});

app.post("/api/admin/recommend-teacher", requireAdminSession, limitMatchInsights, async (req, res) => {
  try {
    const { criteria, trialNotes, courseId, courseName, proficiencyLevel, teacherId, preferredSchedule, studentBirthDate } = req.body || {};

    // Read the trial notes for extra criteria, and pass the promise down rather
    // than the answer. recommendTeacher ranks the teachers alongside this call
    // instead of after it, so a Gemini failure here costs the suggestions and
    // nothing else - the rules are still doing the ranking either way.
    const insightsPromise = deriveMatchInsights({ trialNotes, criteria });

    const recommendation = await recommendTeacher({
      criteria,
      insightsPromise,
      baselineCriteria: criteria,
      trialNotes,
      courseId,
      courseName,
      proficiencyLevel,
      studentBirthDate,
      preferredTeacherId: teacherId,
      preferredSchedule,
      // The admin's explicit pick wins over the balance limit, and the UI warns.
      honourPreferredTeacher: Boolean(teacherId),
    });

    // recommendTeacher awaited this to apply the insights, so it has already
    // settled and reading it here costs no further round trip.
    const insights = await insightsPromise;

    const applied = Object.keys(insights.added || {}).length > 0;
    const pickedId = recommendation.teacher ? String(recommendation.teacher.user_id) : null;
    const aiInsights = {
      applied,
      // Reported even when nothing was added, so the admin can tell a quiet AI
      // apart from a broken one instead of reading silence as no signal.
      unavailable: Boolean(insights.unavailable),
      reason: insights.reason || "",
      added: insights.added || {},
      changedTopPick:
        applied && Boolean(recommendation.baselineTeacherId) && pickedId !== recommendation.baselineTeacherId,
    };

    // Logged so that over real trials we can see whether the suggestions help or
    // only add noise. That evidence is what any later decision about letting the
    // model rank at all would rest on.
    if (applied) {
      console.log(
        "[match-insights]",
        JSON.stringify({
          added: insights.added,
          topPick: pickedId,
          rulesOnlyPick: recommendation.baselineTeacherId || null,
          changedTopPick: aiInsights.changedTopPick,
        })
      );
    }

    res.json({
      teacher: recommendation.teacher,
      rankedTeachers: recommendation.rankedTeachers,
      overBalanceTeachers: recommendation.overBalanceTeachers,
      usedLeastLoadedFallback: recommendation.usedLeastLoadedFallback,
      criteria: recommendation.criteria,
      aiInsights,
      noTeacherReason: recommendation.noTeacherReason || "",
      preferredScheduleEvaluated: recommendation.preferredScheduleEvaluated,
      availabilityConflict: recommendation.availabilityConflict,
      availabilityReason: recommendation.availabilityReason || "",
      preferredHonouredOverLimit: recommendation.preferredHonouredOverLimit,
      matchStrength: recommendation.matchStrength,
      studentAgeKnown: recommendation.studentAgeKnown,
      studentAgeGroup: recommendation.studentAgeGroup,
      childAgeConflict: recommendation.childAgeConflict,
      childAgeReason: recommendation.childAgeReason,
      advisor: recommendation.advisor,
    });
  } catch (err) {
    // Swallowing the message here is what turns "bad schema" into "the AI is
    // down" - the caller gets a 500 with no cause and has to go read the log
    // to find out whether the key is wrong, the model is retired, or a payload
    // was malformed. Surfacing it costs nothing in production (the message is
    // never secret) and saves three minutes of blank-eyed debugging every
    // time. Hidden behind NODE_ENV so a hostile environment cannot ask for it.
    console.error("POST /api/admin/recommend-teacher error:", err);
    res.status(500).json({
      message: "Error recommending teacher",
      ...(process.env.NODE_ENV !== "production" ? { error: err.message } : {}),
    });
  }
});

// Read a teacher resume and return the AI Matching Profile it implies. The
// response is only pre-filled form state: the admin confirms it and the real
// insert still happens on POST /api/admin/users.
//
// Requires a signed admin session (see requireAdminSession) and is bounded by
// the rate limiters above. Note that requireAdmin, used by the book and lesson
// routes, still trusts an admin_id supplied in the request body and is not
// session based; migrating those routes onto requireAdminSession is still
// outstanding.
app.post("/api/admin/parse-resume", requireAdminSession, limitResumeParsingTotal, limitResumeParsing, (req, res, next) =>
  // Multer raises filter/size errors in middleware, before the route body runs,
  // and there is no global error handler, so without this wrapper they would
  // surface as Express's default HTML error page.
  resumeUpload.single("resume")(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "Resume must be 8 MB or smaller"
        : err.message || "Could not read the uploaded resume";
    res.status(400).json({ message });
  }), async (req, res) => {
  try {
    if (!isResumeParserConfigured()) {
      return res.status(503).json({
        message: "Resume auto-fill is not configured. Set GOOGLE_GEMINI_API_KEY on the backend.",
      });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Please choose a resume to upload" });
    }

    const profile = await parseTeacherResume({
      file: req.file,
      // Specialization chips are filtered by the ticked courses, so the parser
      // needs to know which ones are selected or it will suggest chips that
      // are not on screen and would be dropped on save.
      courseNames: parseResumeCourseNames(req.body?.courseNames),
      // Every course the academy offers, so the parser can pick which ones this
      // teacher can teach. Courses live in the database rather than in the
      // parser, so the client sends the current list and anything outside it is
      // dropped on the way back out.
      availableCourseNames: parseResumeCourseNames(req.body?.availableCourseNames),
    });

    res.json(profile);
  } catch (err) {
    console.error("POST /api/admin/parse-resume error:", err);
    res.status(500).json({ message: err.message || "Could not read that resume" });
  }
});

/**
 * teacher_profiles.specialization is VARCHAR(255) and holds the whole
 * comma-joined list. Nine specializations land right around the limit, so drop
 * whole trailing entries rather than let MySQL reject the insert in strict mode
 * and fail the whole teacher creation with a cryptic error.
 */
function clampSpecialization(value) {
  const items = (Array.isArray(value)
    ? value
    : String(value || "").split(",")
  )
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const kept = [];
  let length = 0;
  for (const item of items) {
    const next = kept.length ? length + 2 : item.length;
    if (next > 255) break;
    kept.push(item);
    length = next;
  }
  return kept.join(", ");
}

//Create Teacher Account
app.post("/api/admin/users", requireAdminSession, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      contact,
      country,
      birthDate,
      birth_date,
      role = "teacher",
      classesAvailed,
      teacherId,
      trialNotes,
      courseId,
      classDuration,
      levelScores,
      aiCriteria,
      specialization,
      experienceYears,
      experience_years,
      teachingStyle,
      idealStudentPace,
      bio,
      courseIds = [],
      preferredSchedule,
    } = req.body;

    // Only the super administrator may create another administrator account.
    if (role === "admin" && !req.session.isSuperAdmin) {
      return res.status(403).json({ message: "Only a super administrator can create admin accounts" });
    }

    const [exist] = await pool.query("SELECT user_id FROM users WHERE email = ?", [email]);
    if (exist.length) return res.status(409).json({ message: "Email already exists" });

    const selectedTeacherCourseIds = Array.isArray(courseIds)
      ? courseIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0)
      : [];

    if (role === "teacher" && !selectedTeacherCourseIds.length) {
      return res.status(400).json({ message: "Please select at least one course this teacher can teach" });
    }

    if (role === "student" && !courseId) {
      return res.status(400).json({ message: "Please select the student's course" });
    }

    // The student's proficiency level is computed from the 5 level-evaluation
    // scores, never taken from the client. Reject rather than defaulting to a
    // level, so a partial rubric can't be stored as a real assessment.
    let studentLevelScores = null;
    let studentLevelEvaluation = null;
    if (role === "student") {
      studentLevelScores = parseLevelScores(levelScores);
      if (!studentLevelScores) {
        return res.status(400).json({ message: "Please score all level evaluation criteria" });
      }
      studentLevelEvaluation = computeProficiencyLevel(studentLevelScores);
    }

    const normalizedCountry = String(country || "").trim();
    const normalizedBirthDate = birthDate || birth_date || null;
    if (!normalizedCountry || !normalizedBirthDate) {
      return res.status(400).json({ message: "Country and birthday are required" });
    }

    const defaultPassword = role === "teacher" ? "teacher" : "student";
    const initialPassword = ["student", "teacher"].includes(role)
      ? crypto.randomBytes(32).toString("hex")
      : password || defaultPassword;
    const hash = await bcrypt.hash(initialPassword, 10);
    
    // Always mark newly created users as incomplete so they must complete their profile
    // This ensures they select their timezone and other settings
    const profileCompleted = false;
    const detectedTimezone = timezoneFromCountry(normalizedCountry);

    const [ins] = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, contact_number, country, birth_date, timezone, role, profile_completed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      email,
      hash,
      firstName,
      lastName,
      encryptNullableText(contact || null),
      normalizedCountry,
      encryptNullableText(normalizedBirthDate),
      detectedTimezone,
      role,
      profileCompleted,
    ]);

    const userId = ins.insertId;
    
    // Create teacher profile if role is teacher
    if (role === "teacher") {
      const rawExperienceYears = experienceYears ?? experience_years ?? null;
      const parsedExperienceYears =
        rawExperienceYears === null || rawExperienceYears === "" ? null : Number(rawExperienceYears);
      const teacherBio = buildTeacherAiBio({
        bio,
        teachingStyle,
        idealStudentPace,
      });
      const specializationText = clampSpecialization(specialization);

      await pool.query(
        `INSERT INTO teacher_profiles (user_id, bio, specialization, experience_years, teaches_children)
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          teacherBio || "",
          specializationText || null,
          Number.isFinite(parsedExperienceYears) ? parsedExperienceYears : null,
          // Opt-out, defaulting to teaching everyone. Only an explicit false or 0
          // restricts, so a missing or malformed field can never exclude a
          // teacher by accident.
          teachesChildren === false || teachesChildren === 0 || teachesChildren === "0" ? 0 : 1,
        ]
      );

      await pool.query(
        `INSERT INTO teacher_courses (teacher_id, course_id)
         VALUES ${selectedTeacherCourseIds.map(() => "(?, ?)").join(", ")}`,
        selectedTeacherCourseIds.flatMap((courseId) => [userId, courseId])
      );
    }
    
    let setupInvite = null;
    let inviteEmailResult = null;

    // Create student profile if role is student
    if (role === "student") {
      // Validated above, so this always resolves. The level feeds both the
      // teacher matching and the stored profile.
      const proficiencyLevel = studentLevelEvaluation.level;
      const recommendation = await recommendTeacher({
        criteria: aiCriteria,
        trialNotes,
        courseId,
        proficiencyLevel,
        // The admin typed the birthday two dozen lines above and it is what decides
        // whether a teacher who declines children is eligible at all. Passing it is
        // what makes that rule apply on this path rather than only when the admin
        // stops and presses Analyze, which reads as the rule working when it is
        // the Analyze button doing it.
        studentBirthDate: normalizedBirthDate,
        preferredTeacherId: teacherId,
        preferredSchedule,
        // The admin assigns teachers personally, so an explicit choice is honoured
        // even at or over the balance limit. TEACHER_BALANCE_LIMIT still governs
        // the automatic match and the least-loaded fallback; exceeding it here is
        // surfaced as a warning, not blocked.
        //
        // The contract-request approval path passes a preferredTeacherId too, but
        // there it is the student's CURRENTLY assigned teacher rather than a fresh
        // human choice, so it deliberately does not set this flag.
        honourPreferredTeacher: Boolean(teacherId),
      });
      const assignedTeacherId = recommendation.teacher?.user_id || null;
      const courseIdValue = courseId ? parseInt(courseId, 10) : null;
      const classDurationValue = normalizeClassDuration(classDuration);
      const criteriaNotes = buildCriteriaNotes(recommendation.criteria);
      // The rubric scores are persisted in the notes rather than a new column,
      // the same way buildCriteriaNotes records the matching criteria.
      const levelEvaluationNotes = buildLevelEvaluationNotes(studentLevelScores, studentLevelEvaluation);
      const finalTrialNotes = [trialNotes || "", criteriaNotes, levelEvaluationNotes]
        .filter((part) => String(part).trim())
        .join("\n\n");
      
      await pool.query(`
        INSERT INTO student_profiles (user_id, proficiency_level, assigned_teacher_id, course_id, trial_notes)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, proficiencyLevel, assignedTeacherId, courseIdValue, encryptNullableText(finalTrialNotes || null)]);
      
      // Create student class package if classesAvailed is provided
      if (classesAvailed && parseInt(classesAvailed, 10) > 0) {
        await pool.query(`
          INSERT INTO student_class_packages (student_id, total_classes, classes_used, status, class_duration)
          VALUES (?, ?, 0, 'active', ?)
        `, [userId, parseInt(classesAvailed, 10), classDurationValue]);
      }

    }

    if (["student", "teacher"].includes(role)) {
      setupInvite = await createAccountSetupInvite(pool, userId);
      try {
        inviteEmailResult = await sendAccountSetupInviteEmail({
          email,
          firstName,
          role,
          inviteUrl: setupInvite.inviteUrl,
          expiresAt: setupInvite.expiresAt,
        });
      } catch (mailErr) {
        console.error(`${role} account created, but invite email failed:`, mailErr);
        inviteEmailResult = { sent: false, error: mailErr.message };
      }
    }

    res.json({
      message: ["student", "teacher"].includes(role)
        ? `${role.charAt(0).toUpperCase() + role.slice(1)} account created and setup invite prepared`
        : `${role.charAt(0).toUpperCase() + role.slice(1)} account created`,
      userId,
      // Echoed back so the client can confirm the level the server computed from
      // the scores rather than the one it predicted.
      proficiencyLevel: studentLevelEvaluation?.level || null,
      inviteEmailSent: Boolean(inviteEmailResult?.sent),
      inviteEmailSkipped: Boolean(inviteEmailResult?.skipped),
      setupInviteExpiresAt: setupInvite?.expiresAt || null,
      setupInviteUrl: process.env.NODE_ENV === "production" ? undefined : setupInvite?.inviteUrl,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating user" });
  }
});

// NOTE: the old archived-based endpoint was removed; use the status-aware version below

// ==================== ADMIN ENDPOINTS ====================

// Get users with optional role and status filtering
app.get("/api/admin/users", requireAdminSession, async (req, res) => {
  try {
    const { role, status } = req.query;
    let query = `
      SELECT u.user_id, u.first_name, u.last_name, u.email, u.role, u.status,
             u.is_super_admin,
             u.profile_completed, u.password_changed,
             u.profile_image_url,
             u.archived_at,
             u.archived_reason,
             asi.expires_at AS setup_invite_expires_at,
             asi.used_at AS setup_invite_used_at,
             CASE
               WHEN u.role IN ('student', 'teacher') AND u.password_changed = TRUE THEN 'completed'
               WHEN u.role IN ('student', 'teacher') AND asi.invite_id IS NULL THEN 'not_sent'
               WHEN u.role IN ('student', 'teacher') AND asi.used_at IS NOT NULL THEN 'completed'
               WHEN u.role IN ('student', 'teacher') AND asi.expires_at <= NOW() THEN 'expired'
               WHEN u.role IN ('student', 'teacher') THEN 'sent'
               ELSE NULL
             END AS setup_invite_status
      FROM users u
      LEFT JOIN account_setup_invites asi
        ON asi.invite_id = (
          SELECT latest.invite_id
          FROM account_setup_invites latest
          WHERE latest.user_id = u.user_id
          ORDER BY latest.created_at DESC, latest.invite_id DESC
          LIMIT 1
        )
      WHERE 1=1`;
    const params = [];

    if (role) {
      query += " AND u.role = ?";
      params.push(role);
    }

    if (status) {
      query += " AND u.status = ?";
      params.push(status);
    }

    query += " ORDER BY u.first_name ASC";
    const [users] = await pool.query(query, params);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.get("/api/admin/users/:userId/account", requireAdminSession, async (req, res) => {
  try {
    const { userId } = req.params;
    await refreshProfileCompletion(userId);

    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email,
              u.is_super_admin,
              u.contact_number AS contact, u.country, u.birth_date, u.timezone,
              u.role, u.status, u.profile_completed, u.password_changed, u.created_at,
              sp.proficiency_level, sp.course_id, sp.assigned_teacher_id, sp.trial_notes,
              c.course_name,
              CONCAT(t.first_name, ' ', t.last_name) AS teacher_name,
              scp.package_id, scp.total_classes, scp.classes_used, scp.classes_left,
              scp.class_duration, scp.status AS package_status,
              asi.expires_at AS setup_invite_expires_at,
              asi.used_at AS setup_invite_used_at,
              CASE
                WHEN u.role IN ('student', 'teacher') AND u.password_changed = TRUE THEN 'completed'
                WHEN u.role IN ('student', 'teacher') AND asi.invite_id IS NULL THEN 'not_sent'
                WHEN u.role IN ('student', 'teacher') AND asi.used_at IS NOT NULL THEN 'completed'
                WHEN u.role IN ('student', 'teacher') AND asi.expires_at <= NOW() THEN 'expired'
                WHEN u.role IN ('student', 'teacher') THEN 'sent'
                ELSE NULL
              END AS setup_invite_status
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN courses c ON c.course_id = sp.course_id
       LEFT JOIN users t ON t.user_id = sp.assigned_teacher_id
       LEFT JOIN student_class_packages scp
         ON scp.package_id = (
           SELECT latest_package.package_id
           FROM student_class_packages latest_package
           WHERE latest_package.student_id = u.user_id
           ORDER BY FIELD(latest_package.status, 'active', 'expired', 'cancelled'), latest_package.created_at DESC
           LIMIT 1
         )
       LEFT JOIN account_setup_invites asi
         ON asi.invite_id = (
           SELECT latest_invite.invite_id
           FROM account_setup_invites latest_invite
           WHERE latest_invite.user_id = u.user_id
           ORDER BY latest_invite.created_at DESC, latest_invite.invite_id DESC
           LIMIT 1
         )
       WHERE u.user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = decryptFields(rows[0], ["contact", "birth_date", "trial_notes"]);
    res.json({ user });
  } catch (err) {
    console.error("GET /api/admin/users/:userId/account error:", err);
    res.status(500).json({ message: "Error fetching account details" });
  }
});

app.post("/api/admin/students/:studentId/setup-invite", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { studentId } = req.params;
    const shouldSendEmail = req.body?.sendEmail !== false;
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT user_id, first_name, email, role, status
       FROM users
       WHERE user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [studentId]
    );

    if (!rows.length || rows[0].role !== "student") {
      await connection.rollback();
      return res.status(404).json({ message: "Student account not found" });
    }

    if (rows[0].status === "archived") {
      await connection.rollback();
      return res.status(400).json({ message: "Archived students cannot receive setup invites" });
    }

    const setupInvite = await createAccountSetupInvite(connection, rows[0].user_id);
    await connection.commit();

    let inviteEmailResult = null;
    if (shouldSendEmail) {
      try {
        inviteEmailResult = await sendAccountSetupInviteEmail({
          email: rows[0].email,
          firstName: rows[0].first_name,
          role: rows[0].role,
          inviteUrl: setupInvite.inviteUrl,
          expiresAt: setupInvite.expiresAt,
        });
      } catch (mailErr) {
        console.error("Setup invite email failed:", mailErr);
        inviteEmailResult = { sent: false, error: mailErr.message };
      }
    }

    res.json({
      message: shouldSendEmail
        ? inviteEmailResult?.sent ? "Setup invite sent" : "Setup invite prepared, but email was not sent"
        : "Setup invite link prepared",
      inviteEmailSent: Boolean(inviteEmailResult?.sent),
      inviteEmailSkipped: Boolean(inviteEmailResult?.skipped),
      setupInviteExpiresAt: setupInvite.expiresAt,
      setupInviteUrl: setupInvite.inviteUrl,
    });
  } catch (err) {
    await connection.rollback();
    console.error("POST /api/admin/students/:studentId/setup-invite error:", err);
    res.status(500).json({ message: "Error sending setup invite" });
  } finally {
    connection.release();
  }
});

app.post("/api/admin/users/:userId/setup-invite", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { userId } = req.params;
    const shouldSendEmail = req.body?.sendEmail !== false;
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT user_id, first_name, email, role, status
       FROM users
       WHERE user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    if (!rows.length || !["student", "teacher"].includes(rows[0].role)) {
      await connection.rollback();
      return res.status(404).json({ message: "Account not found" });
    }

    if (rows[0].status === "archived") {
      await connection.rollback();
      return res.status(400).json({ message: "Archived accounts cannot receive setup invites" });
    }

    const setupInvite = await createAccountSetupInvite(connection, rows[0].user_id);
    await connection.commit();

    let inviteEmailResult = null;
    if (shouldSendEmail) {
      try {
        inviteEmailResult = await sendAccountSetupInviteEmail({
          email: rows[0].email,
          firstName: rows[0].first_name,
          role: rows[0].role,
          inviteUrl: setupInvite.inviteUrl,
          expiresAt: setupInvite.expiresAt,
        });
      } catch (mailErr) {
        console.error("Setup invite email failed:", mailErr);
        inviteEmailResult = { sent: false, error: mailErr.message };
      }
    }

    res.json({
      message: shouldSendEmail
        ? inviteEmailResult?.sent ? "Setup invite sent" : "Setup invite prepared, but email was not sent"
        : "Setup invite link prepared",
      inviteEmailSent: Boolean(inviteEmailResult?.sent),
      inviteEmailSkipped: Boolean(inviteEmailResult?.skipped),
      setupInviteExpiresAt: setupInvite.expiresAt,
      setupInviteUrl: setupInvite.inviteUrl,
    });
  } catch (err) {
    await connection.rollback();
    console.error("POST /api/admin/users/:userId/setup-invite error:", err);
    res.status(500).json({ message: "Error sending setup invite" });
  } finally {
    connection.release();
  }
});

app.put("/api/admin/students/:studentId/email", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { studentId } = req.params;
    const email = String(req.body?.email || "").trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    await connection.beginTransaction();

    const [studentRows] = await connection.query(
      `SELECT user_id, first_name, email, role, status
       FROM users
       WHERE user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [studentId]
    );

    if (!studentRows.length || studentRows[0].role !== "student") {
      await connection.rollback();
      return res.status(404).json({ message: "Student account not found" });
    }

    if (studentRows[0].status === "archived") {
      await connection.rollback();
      return res.status(400).json({ message: "Restore the student before changing the email" });
    }

    const [existingRows] = await connection.query(
      "SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1",
      [email, studentId]
    );

    if (existingRows.length) {
      await connection.rollback();
      return res.status(409).json({ message: "Email already exists" });
    }

    await connection.query("UPDATE users SET email = ? WHERE user_id = ?", [email, studentId]);
    const setupInvite = await createAccountSetupInvite(connection, studentId);
    await connection.commit();

    let inviteEmailResult = null;
    try {
      inviteEmailResult = await sendAccountSetupInviteEmail({
        email,
        firstName: studentRows[0].first_name,
        role: studentRows[0].role,
        inviteUrl: setupInvite.inviteUrl,
        expiresAt: setupInvite.expiresAt,
      });
    } catch (mailErr) {
      console.error("Email updated, but setup invite email failed:", mailErr);
      inviteEmailResult = { sent: false, error: mailErr.message };
    }

    res.json({
      message: inviteEmailResult?.sent
        ? "Student email updated and setup invite sent"
        : "Student email updated and setup invite prepared, but email was not sent",
      inviteEmailSent: Boolean(inviteEmailResult?.sent),
      inviteEmailSkipped: Boolean(inviteEmailResult?.skipped),
      setupInviteExpiresAt: setupInvite.expiresAt,
      setupInviteUrl: setupInvite.inviteUrl,
    });
  } catch (err) {
    await connection.rollback();
    console.error("PUT /api/admin/students/:studentId/email error:", err);
    res.status(500).json({ message: "Error updating student email" });
  } finally {
    connection.release();
  }
});

app.put("/api/admin/users/:userId/email", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { userId } = req.params;
    const email = String(req.body?.email || "").trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    // The super administrator's email cannot be changed from the UI - it is the
    // recovery credential for the whole school.
    const [superCheck] = await pool.query(
      "SELECT is_super_admin FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (superCheck.length && Boolean(superCheck[0].is_super_admin)) {
      return res.status(403).json({ message: "The super administrator's email cannot be changed" });
    }

    await connection.beginTransaction();

    const [userRows] = await connection.query(
      `SELECT user_id, first_name, email, role, status
       FROM users
       WHERE user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    if (!userRows.length || !["student", "teacher"].includes(userRows[0].role)) {
      await connection.rollback();
      return res.status(404).json({ message: "Account not found" });
    }

    if (userRows[0].status === "archived") {
      await connection.rollback();
      return res.status(400).json({ message: "Restore the account before changing the email" });
    }

    const [existingRows] = await connection.query(
      "SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1",
      [email, userId]
    );

    if (existingRows.length) {
      await connection.rollback();
      return res.status(409).json({ message: "Email already exists" });
    }

    await connection.query("UPDATE users SET email = ? WHERE user_id = ?", [email, userId]);
    const setupInvite = await createAccountSetupInvite(connection, userId);
    await connection.commit();

    let inviteEmailResult = null;
    try {
      inviteEmailResult = await sendAccountSetupInviteEmail({
        email,
        firstName: userRows[0].first_name,
        role: userRows[0].role,
        inviteUrl: setupInvite.inviteUrl,
        expiresAt: setupInvite.expiresAt,
      });
    } catch (mailErr) {
      console.error("Email updated, but setup invite email failed:", mailErr);
      inviteEmailResult = { sent: false, error: mailErr.message };
    }

    res.json({
      message: inviteEmailResult?.sent
        ? "Email updated and setup invite sent"
        : "Email updated and setup invite prepared, but email was not sent",
      inviteEmailSent: Boolean(inviteEmailResult?.sent),
      inviteEmailSkipped: Boolean(inviteEmailResult?.skipped),
      setupInviteExpiresAt: setupInvite.expiresAt,
      setupInviteUrl: setupInvite.inviteUrl,
    });
  } catch (err) {
    await connection.rollback();
    console.error("PUT /api/admin/users/:userId/email error:", err);
    res.status(500).json({ message: "Error updating account email" });
  } finally {
    connection.release();
  }
});

app.get("/api/admin/student-contracts", requireAdminSession, async (_req, res) => {
  try {
    await expireFinishedPackages();

    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email,
              sp.course_id, c.course_name, sp.assigned_teacher_id,
              CONCAT(t.first_name, ' ', t.last_name) AS teacher_name,
              scp.package_id, scp.total_classes, scp.classes_used, scp.classes_left, scp.class_duration,
              scp.status AS package_status, scp.expires_at
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN courses c ON c.course_id = sp.course_id
       LEFT JOIN users t ON t.user_id = sp.assigned_teacher_id
       LEFT JOIN student_class_packages scp
         ON scp.package_id = (
           SELECT latest.package_id
           FROM student_class_packages latest
           WHERE latest.student_id = u.user_id
           ORDER BY FIELD(latest.status, 'active', 'expired', 'cancelled'), latest.created_at DESC
           LIMIT 1
         )
       WHERE u.role = 'student' AND u.status = 'active'
       ORDER BY u.first_name ASC, u.last_name ASC`
    );

    res.json({ contracts: rows });
  } catch (err) {
    console.error("GET /api/admin/student-contracts error:", err);
    res.status(500).json({ message: "Error fetching student contracts" });
  }
});

/**
 * Everything the admin Overview tab shows, read as one snapshot.
 *
 * Deliberately a single route rather than the browser calling the eight existing
 * admin routes it needs. See the note at the top of adminOverview.js: separate
 * requests produced numbers on screen that did not agree with each other, because
 * they were true at different moments.
 */
app.get("/api/admin/overview", requireAdminSession, async (_req, res) => {
  try {
    // Same housekeeping the Contracts tab does. A package that ran out between the
    // last visit and this one should read as expired here too, or the dashboard
    // contradicts the tab the admin clicks through to.
    await expireFinishedPackages();

    const overview = await fetchAdminOverview(pool);
    res.json({ overview });
  } catch (err) {
    console.error("GET /api/admin/overview error:", err);
    res.status(500).json({ message: "Error loading the admin overview" });
  }
});

app.put("/api/admin/student-contracts/:student_id", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { student_id } = req.params;
    const {
      course_id,
      assigned_teacher_id,
      package_id,
      total_classes,
      classes_used,
      class_duration,
      status,
    } = req.body;

    const parsedTotal = Math.max(0, parseInt(total_classes, 10) || 0);
    const parsedUsed = Math.min(parsedTotal, Math.max(0, parseInt(classes_used, 10) || 0));
    const parsedDuration = normalizeClassDuration(class_duration);
    const packageStatus = packageStatusFromUsage(status, parsedTotal, parsedUsed);
    const courseIdValue = course_id ? parseInt(course_id, 10) : null;
    const teacherIdValue = assigned_teacher_id ? parseInt(assigned_teacher_id, 10) : null;

    if (courseIdValue && teacherIdValue) {
      const [teacherCourseRows] = await connection.query(
        `SELECT 1 FROM teacher_courses WHERE teacher_id = ? AND course_id = ? LIMIT 1`,
        [teacherIdValue, courseIdValue]
      );

      if (!teacherCourseRows.length) {
        return res.status(400).json({ message: "Selected teacher cannot teach the selected course" });
      }
    }

    await connection.beginTransaction();

    await connection.query(
      `UPDATE student_profiles
       SET course_id = COALESCE(?, course_id), assigned_teacher_id = ?
       WHERE user_id = ?`,
      [courseIdValue, teacherIdValue, student_id]
    );

    if (package_id) {
      await connection.query(
        `UPDATE student_class_packages
         SET total_classes = ?, classes_used = ?, status = ?, class_duration = ?
         WHERE package_id = ? AND student_id = ?`,
        [
          parsedTotal,
          parsedUsed,
          packageStatus,
          parsedDuration,
          package_id,
          student_id,
        ]
      );
    } else if (parsedTotal > 0) {
      await connection.query(
        `INSERT INTO student_class_packages
         (student_id, total_classes, classes_used, status, class_duration)
         VALUES (?, ?, ?, ?, ?)`,
        [student_id, parsedTotal, parsedUsed, packageStatus, parsedDuration]
      );
    }

    await connection.commit();
    res.json({ message: "Student contract updated" });
  } catch (err) {
    await connection.rollback();
    console.error("PUT /api/admin/student-contracts/:student_id error:", err);
    res.status(500).json({ message: "Error updating student contract" });
  } finally {
    connection.release();
  }
});

/**
 * Tell the admins about a contract request, without burying them.
 *
 * !! One live notification per request, not one per submission. A student who
 * !! revises a request three times used to put three unread notifications in
 * !! every admin's bell, all saying the same thing about the same request, and
 * !! the count climbed with every keystroke-driven submit. The bell is a to-do
 * !! list; a to-do list with four copies of one item has told the admin nothing
 * !! about how much work there is.
 * !!
 * !! So the notification for a request is UPDATED in place. Its text changes
 * !! to describe what the request is now, and it goes back to unread, because
 * !! the request did change and the admin has to look at it again. One request,
 * !! one bell entry - which is what the number on the bell is supposed to mean.
 */
async function notifyAdminsOfContractRequest({
  connection,
  requestId,
  title,
  message,
}) {
  const [adminRows] = await connection.query(
    `SELECT user_id FROM users WHERE role = 'admin' AND status = 'active'`
  );
  if (!adminRows.length) return;

  for (const admin of adminRows) {
    const [result] = await connection.query(
      `UPDATE notifications
          SET title = ?, message = ?, is_read = 0, read_at = NULL, created_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND related_id = ? AND related_type = 'contract_request'`,
      [encryptNullableText(title), encryptNullableText(message), admin.user_id, requestId]
    );

    if (result.affectedRows > 0) continue;

    await connection.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'general', ?, ?, ?, 'contract_request', '/AdminDashboard')`,
      [admin.user_id, encryptNullableText(title), encryptNullableText(message), requestId]
    );
  }
}

/**
 * Mark the admins' notification for a request as read.
 *
 * Called when the request is resolved - approved, declined or withdrawn. The
 * bell is a to-do list, and a request that has been decided is not on it any
 * more. Without this the count kept climbing and never came back down, which
 * is how a badge stops being information.
 */
async function markAdminNotificationsRead(connection, requestId) {
  await connection.query(
    `UPDATE notifications
        SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE related_id = ? AND related_type = 'contract_request'
        AND user_id IN (SELECT user_id FROM users WHERE role = 'admin')`,
    [requestId]
  );
}

/**
 * A student asks for a contract, or for more time on the one they have.
 *
 * The two kinds are handled by one route because they share a lifecycle: both
 * are pending until an admin decides, both can be revised while they wait, and
 * both can be withdrawn.
 *
 * THE RULE: a student has at most one pending request of each kind. Asking
 * again while one is pending is a REVISION of that request, not a second one.
 *
 * !! That was already the behaviour, and it was already right in the way that
 * !! matters - the admin's queue never grew a duplicate. What it did not do
 * !! was keep the earlier version, tell the student that is what they were
 * !! doing, or make the rule survive two tabs open at once. It revised the row
 * !! in place, overwriting the note the admin had not read yet, and the
 * !! notification bell counted one more entry for every submit.
 * !!
 * !! So asking again now:
 * !!   - archives the version it replaces, so the admin can still read what
 * !!     the student said the first time
 * !!   - counts as a revision, and says so
 * !!   - updates the admin's existing notification instead of adding another
 * !!   - is protected by a unique key in the database, so two simultaneous
 * !!     submissions cannot both create a pending request
 */
app.post("/api/student/contract-requests", requireSession, requireBodyIdentity("student_id"), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { student_id, course_id, requested_classes, class_duration, trial_notes, ai_criteria, request_type, preferred_schedule } = req.body;
    const parsedStudentId = parseInt(student_id, 10);
    const parsedCourseId = course_id ? parseInt(course_id, 10) : null;
    const parsedClasses = parseInt(requested_classes, 10);
    const parsedDuration = normalizeClassDuration(class_duration);

    // Anything unrecognised becomes "new" rather than being rejected. A client
    // that has not been updated yet still submits a plain contract request, and
    // failing it because a column it knows nothing about is missing would break
    // a flow that works.
    const parsedRequestType = normalizeRequestType(request_type);

    await connection.beginTransaction();

    // The student's own row, locked for the length of the transaction.
    //
    // !! This is what makes "one pending request per kind" hold under two
    // !! simultaneous submissions. The check and the write below are two
    // !! statements, and without a lock two requests could both pass the check
    // !! and both write. The unique key on the generated column catches that
    // !! too, but it catches it as a failure - the second request would be
    // !! rejected with an error the student has to retry. Locking here means
    // !! the second request waits, then sees the first one and revises it.
    //
    // Locking the user row rather than the request row: the request row may not
    // exist yet, and a lock on a row that is not there locks nothing.
    await connection.query(`SELECT user_id FROM users WHERE user_id = ? FOR UPDATE`, [parsedStudentId]);

    // One request in flight at a time, of either kind.
    //
    // !! The two kinds contradict each other. A new contract REPLACES the
    // !! contract the unused classes are on, so a student with a new-contract
    // !! request in flight who also asks for an extension is asking for two
    // !! things where approving one throws away what the other is asking to
    // !! preserve. The admin has no way to know that the second request
    // !! undoes the first - they see two rows in a queue and a reason to
    // !! pick one.
    // !!
    // !! So the second ask is refused, and the student is told how to get
    // !! what they want: withdraw the first one. Which is what they would
    // !! have to do anyway - there is no version of these two requests that
    // !! can both be granted.
    // !!
    // !! Checked before the extension's own conditions, because the real
    // !! problem is the other request, not the state of the contract. A
    // !! student told "this contract has not ended yet" when what they need
    // !! to know is "you already asked for something else" is being sent
    // !! down the wrong path.
    const [otherPending] = await connection.query(
      `SELECT request_id, request_type
         FROM student_contract_requests
        WHERE student_id = ? AND status = 'pending' AND request_type <> ?
        LIMIT 1`,
      [parsedStudentId, parsedRequestType]
    );

    if (otherPending.length) {
      await connection.rollback();
      const otherIsExtension = otherPending[0].request_type === "extension";
      return res.status(409).json({
        message: otherIsExtension
          ? "You already have an extension request with the admin. Withdraw it first if you would rather ask for a new contract."
          : "You already have a contract request with the admin. Withdraw it first if you would rather ask for an extension.",
      });
    }

    // An extension is a request for more TIME on a contract that already ran
    // out, with classes on it they never used. Every one of those conditions is
    // checked here rather than trusted from the browser, because approving one
    // mutates a package and a UI that can be bypassed is not a guard.
    let extensionPackage = null;
    if (parsedRequestType === "extension") {
      const [packageRows] = await connection.query(
        `SELECT package_id, total_classes, classes_used, classes_left, class_duration,
                status, created_at, expires_at
           FROM student_class_packages
          WHERE student_id = ?
          ORDER BY created_at DESC, package_id DESC
          LIMIT 1`,
        [parsedStudentId]
      );

      if (!packageRows.length) {
        await connection.rollback();
        return res.status(400).json({
          message: "You have no class contract to extend. Request a new contract instead.",
        });
      }

      extensionPackage = packageRows[0];

      const left = Number(extensionPackage.classes_left ?? 0);
      const endPassed =
        extensionPackage.expires_at != null && new Date(extensionPackage.expires_at) <= new Date();

      if (left <= 0) {
        // Nothing to extend. They used everything, so this is a new contract and
        // sending it down the new path is what they actually want.
        await connection.rollback();
        return res.status(400).json({
          message:
            "You have used all the classes on this contract, so there is nothing to extend. Please request a new contract instead.",
        });
      }

      if (extensionPackage.status !== "expired" && !endPassed) {
        await connection.rollback();
        return res.status(400).json({
          message: "This contract has not ended yet, so there is nothing to extend.",
        });
      }
    }

    if (parsedRequestType === "new") {
      if (!parsedStudentId || !parsedCourseId || !Number.isFinite(parsedClasses) || parsedClasses <= 0) {
        await connection.rollback();
        return res.status(400).json({ message: "Please choose a course and number of classes." });
      }
    }

    // One pending request per KIND, not per student.
    //
    // !! This used to match any pending row for the student, which was fine when
    // !! there was only one kind. With extensions it silently became dangerous: a
    // !! student with a pending new-contract request who then asked for an
    // !! extension would have had that row rewritten, and the admin would open
    // !! the queue to find an extension where a class purchase was submitted -
    // !! with the original request gone and nobody told.
    const [existing] = await connection.query(
      `SELECT request_id, request_type, course_id, requested_classes, class_duration,
              trial_notes, ai_criteria, package_id, classes_left_at_request,
              preferred_days, preferred_start, preferred_end,
              revision_count, request_history, status, requested_at
         FROM student_contract_requests
        WHERE student_id = ? AND status = 'pending' AND request_type = ?
        LIMIT 1`,
      [parsedStudentId, parsedRequestType]
    );

    const isExtension = parsedRequestType === "extension";
    const snapshotClassesLeft = isExtension
      ? Number(extensionPackage.classes_left ?? 0)
      : null;
    const snapshotPackageId = isExtension ? extensionPackage.package_id : null;

    // When the student can attend, if they said. Optional in every part: a
    // partial answer is treated as no answer rather than half a preference that
    // would filter candidates against an unspecified end time.
    const preferredSchedule = normalizePreferredSchedule(preferred_schedule);
    const preferredDays = preferredSchedule ? preferredSchedule.days.join(",") : null;
    const preferredStart = preferredSchedule ? preferredSchedule.start : null;
    const preferredEnd = preferredSchedule ? preferredSchedule.end : null;

    const [studentRows] = await connection.query(
      `SELECT first_name, last_name FROM users WHERE user_id = ?`,
      [parsedStudentId]
    );
    const [courseRows] = await connection.query(
      `SELECT course_name FROM courses WHERE course_id = ?`,
      [parsedCourseId]
    );

    const studentName = studentRows.length
      ? `${studentRows[0].first_name} ${studentRows[0].last_name}`.trim()
      : "A student";
    const courseName = courseRows[0]?.course_name || "a course";

    if (existing.length) {
      const requestId = existing[0].request_id;
      // Decrypted before it is read. The note and the history are stored
      // encrypted, and what goes into the history has to be the words the
      // student wrote rather than the ciphertext they were stored as.
      const previous = decryptFields(existing[0], ["trial_notes", "ai_criteria", "request_history"]);

      // Keep the version that is being replaced. The admin may have read it
      // already, and even if they have not, the first thing a student said is
      // part of the request - it is what the rest of it is a revision of.
      //
      // Decrypted first, and encrypted again as one blob on the way out.
      //
      // !! The snapshot holds the note the student wrote, and that note is
      // !! stored encrypted in its own column. Copying that ciphertext into
      // !! the history produced a history whose entries were unreadable: the
      // !! column decrypted to a JSON string, and every note inside it was
      // !! still `enc:v1:...`. The admin saw a history of nothing.
      // !!
      // !! The history is one encrypted column holding plaintext inside, so
      // !! the note is protected by the column and readable once it is out.
      const archived = appendRevision(
        previous.request_history,
        buildRevisionSnapshot(previous, { revisedAt: new Date().toISOString() })
      );

      const nextRevision = Math.max(1, Number(previous.revision_count ?? 1) || 1) + 1;

      await connection.query(
        `UPDATE student_contract_requests
            SET course_id = ?, requested_classes = ?, class_duration = ?, trial_notes = ?, ai_criteria = ?,
                request_type = ?, package_id = ?, classes_left_at_request = ?,
                preferred_days = ?, preferred_start = ?, preferred_end = ?,
                revision_count = ?, request_history = ?,
                admin_response = NULL, resolved_at = NULL, requested_at = CURRENT_TIMESTAMP, status = 'pending'
          WHERE request_id = ?`,
        [
          parsedCourseId,
          isExtension ? 0 : parsedClasses,
          isExtension ? normalizeClassDuration(extensionPackage.class_duration) : parsedDuration,
          encryptNullableText(String(trial_notes || "").trim() || null),
          encryptNullableText(JSON.stringify(normalizeCriteria(ai_criteria || {}))),
          parsedRequestType,
          snapshotPackageId,
          snapshotClassesLeft,
          preferredDays,
          preferredStart,
          preferredEnd,
          nextRevision,
          encryptNullableText(archived),
          requestId,
        ]
      );

      const notificationMessage = isExtension
        ? `${studentName} updated their pending extension request${nextRevision > 2 ? ` (version ${nextRevision})` : ""}. They have ${snapshotClassesLeft} unused class${snapshotClassesLeft === 1 ? "" : "es"} left on a contract that has ended.`
        : `${studentName} updated a pending contract request${nextRevision > 2 ? ` (version ${nextRevision})` : ""} for ${courseName} with ${parsedClasses} classes (${parsedDuration}-minute lessons).`;

      await notifyAdminsOfContractRequest({
        connection,
        requestId,
        title: isExtension ? "Updated Extension Request" : "Updated Contract Request",
        message: notificationMessage,
      });

      await connection.commit();

      return res.status(200).json({
        message: isExtension ? "Extension request updated" : "Contract request updated",
        request_id: requestId,
        revision: nextRevision,
        isRevision: true,
      });
    }

    const [result] = await connection.query(
      `INSERT INTO student_contract_requests
         (student_id, course_id, requested_classes, class_duration, trial_notes, ai_criteria, status,
          request_type, package_id, classes_left_at_request, revision_count,
          preferred_days, preferred_start, preferred_end)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1, ?, ?, ?)`,
      [
        parsedStudentId,
        parsedCourseId,
        isExtension ? 0 : parsedClasses,
        isExtension ? normalizeClassDuration(extensionPackage.class_duration) : parsedDuration,
        encryptNullableText(String(trial_notes || "").trim() || null),
        encryptNullableText(JSON.stringify(normalizeCriteria(ai_criteria || {}))),
        parsedRequestType,
        snapshotPackageId,
        snapshotClassesLeft,
        preferredDays,
        preferredStart,
        preferredEnd,
      ]
    );

    const notificationMessage = isExtension
      ? `${studentName} requested an extension. They have ${snapshotClassesLeft} unused class${snapshotClassesLeft === 1 ? "" : "es"} left on a contract that has ended.`
      : `${studentName} requested a new contract for ${courseName} with ${parsedClasses} classes (${parsedDuration}-minute lessons).`;

    await notifyAdminsOfContractRequest({
      connection,
      requestId: result.insertId,
      title: isExtension ? "Extension Request" : "New Contract Request",
      message: notificationMessage,
    });

    await connection.commit();

    res.status(201).json({
      message: isExtension ? "Extension request sent" : "Contract request sent",
      request_id: result.insertId,
      revision: 1,
      isRevision: false,
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch {
      // The transaction was already gone. Nothing to undo.
    }

    // The unique key on the generated column. Two submissions that raced past
    // the check, both reaching the insert. The second one is not an error the
    // student caused, so it is answered as a revision of the first rather than
    // a failure - and the student is told which it is.
    if (err?.code === "ER_DUP_ENTRY") {
      try {
        const [pending] = await pool.query(
          `SELECT request_id FROM student_contract_requests
            WHERE student_id = ? AND status = 'pending' AND request_type = ?
            LIMIT 1`,
          [parseInt(req.body?.student_id, 10), normalizeRequestType(req.body?.request_type)]
        );

        if (pending.length) {
          return res.status(200).json({
            message: "Your request was already received. The admin has it.",
            request_id: pending[0].request_id,
            isRevision: true,
          });
        }
      } catch {
        // Fall through to the generic error below.
      }
    }

    console.error("POST /api/student/contract-requests error:", err);
    res.status(500).json({ message: "Error sending contract request" });
  } finally {
    connection.release();
  }
});

app.get("/api/student/contract-requests/:student_id", requireSession, async (req, res) => {
  try {
    if (!(await sessionMayReadStudent(req, req.params.student_id))) {
      return res.status(403).json({ message: "You can only view your own records." });
    }
    const { student_id } = req.params;
    const [rows] = await pool.query(
      `SELECT r.*, c.course_name
       FROM student_contract_requests r
       LEFT JOIN courses c ON c.course_id = r.course_id
       WHERE r.student_id = ?
       ORDER BY r.requested_at DESC
       LIMIT 5`,
      [student_id]
    );

    // The pending requests, separately and without a limit.
    //
    // !! The list above is the last five requests, which is a history to read.
    // !! Deciding what the student may do next from a history is a mistake: the
    // !! history is a window, and a student with six requests in it had their
    // !! pending extension fall out of the window - so the card told them they
    // !! had never asked, while the admin was holding a request from them. The
    // !! pending set is the fact; it gets its own query and no limit.
    const [pendingRows] = await pool.query(
      `SELECT r.*, c.course_name
       FROM student_contract_requests r
       LEFT JOIN courses c ON c.course_id = r.course_id
       WHERE r.student_id = ? AND r.status = 'pending'
       ORDER BY r.requested_at DESC`,
      [student_id]
    );

    const decryptFieldsForStudent = ["trial_notes", "ai_criteria", "admin_response", "request_history"];

    res.json({
      requests: decryptRows(rows, decryptFieldsForStudent).map(decorateContractRequest),
      pending: decryptRows(pendingRows, decryptFieldsForStudent).map(decorateContractRequest),
    });
  } catch (err) {
    console.error("GET /api/student/contract-requests/:student_id error:", err);
    res.status(500).json({ message: "Error fetching contract requests" });
  }
});

/**
 * Withdraw a request that is still pending.
 *
 * !! A student who sent a request by mistake had no way out. The only thing
 * !! they could do was wait for an admin to decline it, and the request sat in
 * !! the queue the whole time - the student was told they had asked for
 * !! something they had not asked for, and the admin had to spend a decision
 * !! on a mistake. A request the student no longer wants is not a request at
 * !! all, and the queue is where that has to be decided.
 *
 * Only a pending request can be withdrawn. Once an admin has approved or
 * declined it, it is a decision and not a draft - the student asks again with
 * a new request, which leaves the old one readable as history.
 */
app.post("/api/student/contract-requests/:request_id/cancel", requireSession, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const requestId = parseInt(req.params.request_id, 10);
    if (!Number.isFinite(requestId)) {
      await connection.rollback();
      return res.status(400).json({ message: "That is not a request." });
    }

    const [rows] = await connection.query(
      `SELECT request_id, student_id, request_type, status
         FROM student_contract_requests
        WHERE request_id = ?
        FOR UPDATE`,
      [requestId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "That request no longer exists." });
    }

    const request = rows[0];

    // Only the student who asked may withdraw it. An admin may resolve it from
    // the queue, and that is a different action with a different record.
    if (String(request.student_id) !== String(req.session?.userId)) {
      await connection.rollback();
      return res.status(403).json({ message: "You can only withdraw your own request." });
    }

    if (!canCancelRequest(request)) {
      await connection.rollback();
      return res.status(409).json({
        message:
          request.status === "cancelled"
            ? "That request has already been withdrawn."
            : "That request has already been answered, so it cannot be withdrawn.",
      });
    }

    await connection.query(
      `UPDATE student_contract_requests
          SET status = 'cancelled', resolved_at = CURRENT_TIMESTAMP
        WHERE request_id = ?`,
      [requestId]
    );

    // The admins' notification is read, not deleted. It stays as a record that
    // the request existed and was withdrawn, and the bell stops counting it -
    // a withdrawn request is not work waiting to be done.
    const [studentRows] = await connection.query(
      `SELECT first_name, last_name FROM users WHERE user_id = ?`,
      [request.student_id]
    );
    const studentName = studentRows.length
      ? `${studentRows[0].first_name} ${studentRows[0].last_name}`.trim()
      : "A student";

    await connection.query(
      `UPDATE notifications
          SET title = ?, message = ?, is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE related_id = ? AND related_type = 'contract_request' AND user_id IN (
          SELECT user_id FROM users WHERE role = 'admin'
        )`,
      [
        encryptNullableText("Contract Request Withdrawn"),
        encryptNullableText(`${studentName} withdrew their ${request.request_type === "extension" ? "extension" : "contract"} request.`),
        requestId,
      ]
    );

    await connection.commit();

    res.json({ message: "Your request has been withdrawn." });
  } catch (err) {
    try {
      await connection.rollback();
    } catch {
      // The transaction was already gone. Nothing to undo.
    }
    console.error("POST /api/student/contract-requests/:request_id/cancel error:", err);
    res.status(500).json({ message: "Error withdrawing the request" });
  } finally {
    connection.release();
  }
});

/**
 * Add the revision trail to a request row, as something the UI can read.
 *
 * The stored history is a JSON string in an encrypted column, so it arrives
 * here as text. The UI wants the list of earlier versions, not the string that
 * holds them, and it wants to know how many times the request was changed.
 */
function decorateContractRequest(row) {
  const revisions = describeRevisions(row);
  return {
    ...row,
    revision_count: revisions.count,
    revision_label: revisions.label,
    revisions: revisions.history,
  };
}

app.get("/api/admin/contract-requests", requireAdminSession, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, c.course_name,
              u.first_name, u.last_name, u.email,
              p.expires_at AS package_expires_at,
              p.classes_left AS package_classes_left,
              p.status AS package_status
       FROM student_contract_requests r
       JOIN users u ON u.user_id = r.student_id
       LEFT JOIN courses c ON c.course_id = r.course_id
       LEFT JOIN student_class_packages p ON p.package_id = r.package_id
       ORDER BY FIELD(r.status, 'pending', 'approved', 'declined', 'cancelled'), r.requested_at DESC`
    );

    res.json({
      requests: decryptRows(rows, ["trial_notes", "ai_criteria", "admin_response", "request_history"]).map(
        decorateContractRequest
      ),
    });
  } catch (err) {
    console.error("GET /api/admin/contract-requests error:", err);
    res.status(500).json({ message: "Error fetching contract requests" });
  }
});

/**
 * What a student's contract request would match, before they send it.
 *
 * !! Read-only, and it assigns nothing. The whole point is that the student can
 * !! see who is likely and how strong it is, adjust their criteria, and send -
 * !! the assignment still happens on admin approval and nowhere else. A student
 * !! cannot name a teacher here, and cannot cause one to be assigned.
 *
 * Deliberately a different endpoint from /api/admin/recommend-teacher rather
 * than the same one with a looser guard. That endpoint accepts a teacherId to
 * assign, is admin-only, and returns internal ranking detail. Reusing it would
 * mean either handing a student the ability to assign a teacher or returning a
 * payload built for someone who has to make the decision.
 *
 * The inputs are read from the student's own profile and from the body, and the
 * same recommendTeacher runs - so this is a genuine preview of the approval path,
 * not an approximation of it. Which is the only kind worth showing: a preview
 * that could disagree with what actually happens would be worse than none.
 */
app.post("/api/student/contract-match-preview", requireSession, requireBodyIdentity("student_id"), limitMatchInsights, async (req, res) => {
  try {
    const { student_id, course_id, criteria, preferred_schedule } = req.body || {};
    const parsedStudentId = parseInt(student_id, 10);
    const parsedCourseId = course_id ? parseInt(course_id, 10) : null;

    if (!parsedStudentId || !parsedCourseId) {
      return res.status(400).json({ message: "Choose a course to see who would match." });
    }

    // Identity: a student may only preview themselves. requireBodyIdentity
    // already rejects a body that disagrees with the session; this additionally
    // refuses an admin previewing somebody else, so this endpoint cannot become
    // a back door around the admin one's own guards.
    const [canRead] = await pool.query(
      "SELECT 1 FROM users WHERE user_id = ? AND role = 'student' AND status = 'active' LIMIT 1",
      [parsedStudentId]
    );
    if (!canRead.length) {
      return res.status(403).json({ message: "You can only preview your own match." });
    }

    // proficiency_level lives on student_profiles, birth_date on users - and
    // birth_date is encrypted, so it has to come back through the decryptor. Read
    // both here rather than trusting that the caller sends a usable one: the age
    // decides whether a teacher who declines children is eligible at all.
    const [profileRows] = await pool.query(
      `SELECT sp.proficiency_level, sp.assigned_teacher_id, u.birth_date
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.user_id = ?
       LIMIT 1`,
      [parsedStudentId]
    );

    const recommendation = await recommendTeacher({
      criteria: normalizeCriteria(criteria || {}),
      trialNotes: "",
      courseId: parsedCourseId,
      proficiencyLevel: profileRows[0]?.proficiency_level || "",
      studentBirthDate: decryptNullableText(profileRows[0]?.birth_date) || null,
      // Their current teacher, exactly as the approval path passes it. Leaving it
      // out would let the preview name someone the approval would not pick, which
      // is the one thing a preview must never do. Not honoured as a preference
      // though - honourPreferredTeacher stays false, because a student's existing
      // teacher is an assignment they were given, not a choice they made.
      preferredTeacherId: profileRows[0]?.assigned_teacher_id || null,
      preferredSchedule: normalizePreferredSchedule(preferred_schedule),
      honourPreferredTeacher: false,
    });

    const teacher = recommendation.teacher;
    if (!teacher) {
      return res.json({
        teacher: null,
        noTeacherReason: recommendation.noTeacherReason || "",
        rankedTeachers: [],
      });
    }

    // A deliberately narrow payload. The admin card shows workload fallbacks,
    // profile-completion state and balance-limit warnings - all things an admin
    // needs to make a decision and a student has no use for, and two of which
    // are about other students' loads.
    res.json({
      teacher: {
        user_id: teacher.user_id,
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        reasons: teacher.reasons || [],
      },
      matchStrength: recommendation.matchStrength,
      advisor: recommendation.advisor
        ? {
            // Reported whether or not it was used, so a quiet AI is
            // distinguishable from a broken one instead of reading as silence.
            used: Boolean(recommendation.advisor.used),
            configured: Boolean(recommendation.advisor.configured),
            // Which of the ways it failed, not just that it did. A bad key, a
            // rate limit and an open circuit breaker all read identically as
            // "could not be reached" and need three different fixes, so the card
            // has to be able to say which one this was.
            //
            // Safe to send: a fixed enum string computed in teacherAdvisor.js,
            // carrying nothing about the server or the key.
            reason: recommendation.advisor.reason || "",
            // The underlying cause of a tripped breaker, and roughly how long
            // until it retries. Both are enum-ish strings and a millisecond
            // count - nothing about the server or the key is sent here. The
            // human-readable detail is deliberately NOT sent to a student.
            lastFailureReason: recommendation.advisor.lastFailureReason || "",
            retryInMs: recommendation.advisor.retryInMs || 0,
            summary: recommendation.advisor.summary || "",
            reasons: recommendation.advisor.reasons || {},
          }
        : null,
      preferredScheduleEvaluated: Boolean(recommendation.preferredScheduleEvaluated),
      availabilityConflict: Boolean(recommendation.availabilityConflict),
      availabilityReason: recommendation.availabilityReason || "",
      // Enough to understand the outcome without the internal bookkeeping.
      rankedCount: recommendation.rankedTeachers?.length || 0,
    });
  } catch (err) {
    console.error("POST /api/student/contract-match-preview error:", err);
    res.status(500).json({
      message: "Could not work out a match right now.",
      ...(process.env.NODE_ENV !== "production" ? { error: err.message } : {}),
    });
  }
});

app.put("/api/admin/contract-requests/:request_id", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { request_id } = req.params;
    const { status, admin_response } = req.body;

    if (!["approved", "declined"].includes(status)) {
      return res.status(400).json({ message: "Invalid request status" });
    }

    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT r.request_id, r.student_id, r.course_id, r.requested_classes, r.class_duration, r.trial_notes, r.ai_criteria, r.status,
              r.request_type, r.package_id, r.classes_left_at_request,
              r.preferred_days, r.preferred_start, r.preferred_end,
              c.course_name
       FROM student_contract_requests r
       LEFT JOIN courses c ON c.course_id = r.course_id
       WHERE r.request_id = ?
       FOR UPDATE`,
      [request_id]
    );

    if (!requestRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Contract request not found" });
    }

    const request = decryptFields(requestRows[0], ["trial_notes", "ai_criteria", "admin_response"]);
    if (request.status !== "pending") {
      await connection.rollback();
      // Each way this can happen is worth naming. "Already been resolved" sent
      // the admin looking for a decision they had already made, when in fact
      // the student had withdrawn the request and it was never going to be
      // decided at all.
      if (request.status === "cancelled") {
        return res.status(409).json({
          message: "This request was withdrawn by the student, so there is nothing to decide.",
        });
      }
      return res.status(409).json({ message: "This request has already been resolved" });
    }

    const isExtension = String(request.request_type || "new").toLowerCase() === "extension";

    if (isExtension) {
      // An extension changes ONE thing: how much longer the existing contract
      // runs. Everything below the new-contract branch is deliberately absent -
      // no teacher recommendation, no profile rewrite, no expiring the package
      // and no fresh package with classes_used = 0.
      //
      // That last one is the whole point. The student is asking to keep classes
      // they already paid for and never used; running this down the new-contract
      // path would discard that balance and hand them a blank package, which is
      // the opposite of the request.
      if (status === "declined") {
        await connection.query(
          `UPDATE student_contract_requests
           SET status = ?, admin_response = ?, resolved_at = NOW()
           WHERE request_id = ?`,
          [status, encryptNullableText(admin_response || null), request_id]
        );

        await markAdminNotificationsRead(connection, request.request_id);

        await connection.query(
          `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
           VALUES (?, 'general', ?, ?, ?, 'contract_request', '/Calendar')`,
          [
            request.student_id,
            encryptNullableText("Extension Request Declined"),
            encryptNullableText(
              admin_response?.trim()
                ? `Your request to extend your contract was declined: ${admin_response.trim()}`
                : "Your request to extend your contract was declined. Your unused classes remain on the expired contract."
            ),
            request.request_id,
          ]
        );

        await connection.commit();
        return res.json({ message: "Extension request declined" });
      }

      const newExpiry = parseAdminExtensionExpiry(req.body.extension_expires_at);
      if (!newExpiry) {
        await connection.rollback();
        return res.status(400).json({
          message:
            "Choose a new end date for the contract. It has to be in the future, or the extension would end the contract rather than extend it.",
        });
      }

      const [packageRows] = await connection.query(
        `SELECT package_id, total_classes, classes_used, classes_left, status, expires_at
           FROM student_class_packages
          WHERE package_id = ?
          FOR UPDATE`,
        [request.package_id]
      );

      if (!packageRows.length) {
        await connection.rollback();
        return res.status(404).json({
          message: "The contract this extension refers to no longer exists.",
        });
      }

      const target = packageRows[0];

      // Guard against approving an extension for a balance that is gone. The
      // snapshot is what the student asked about; this is what is actually
      // there now, and if they have since used the classes the admin should
      // send them to the new-contract path instead.
      if (Number(target.classes_left ?? 0) <= 0) {
        await connection.rollback();
        return res.status(409).json({
          message:
            "This student has no unused classes left on that contract, so there is nothing to extend. Ask them to request a new contract.",
        });
      }

      const left = Number(target.classes_left);

      await connection.query(
        `UPDATE student_class_packages
            SET expires_at = ?,
                status = 'active',
                -- Cleared so the 14-day warning fires again for the new deadline.
                -- Without this the student is never warned about the extension
                -- they were just given, because the old warning already consumed
                -- the one notification this contract is allowed.
                expiry_notified_at = NULL
          WHERE package_id = ?`,
        [newExpiry, target.package_id]
      );

      await connection.query(
        `UPDATE student_contract_requests
         SET status = ?, admin_response = ?, resolved_at = NOW()
         WHERE request_id = ?`,
        [status, encryptNullableText(admin_response || null), request_id]
      );

      await markAdminNotificationsRead(connection, request.request_id);

      const endDate = newExpiry.toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      });

      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
         VALUES (?, 'general', ?, ?, ?, 'contract_request', '/Calendar')`,
        [
          request.student_id,
          encryptNullableText("Contract Extended"),
          encryptNullableText(
            `Your contract was extended to ${endDate}. Your ${left} unused class${left === 1 ? "" : "es"} ` +
              `${left === 1 ? "is" : "are"} still available to book.`
          ),
          request.request_id,
        ]
      );

      await connection.commit();
      return res.json({
        message: "Extension approved",
        package_id: target.package_id,
        expires_at: newExpiry,
        classes_left: left,
      });
    }

    if (status === "approved") {
      const [profileRows] = await connection.query(
        `SELECT trial_notes, assigned_teacher_id, proficiency_level
         FROM student_profiles
         WHERE user_id = ?
         LIMIT 1
         FOR UPDATE`,
        [request.student_id]
      );

      if (!profileRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: "Student profile not found" });
      }

      const requestCriteria = parseAiCriteriaJson(request.ai_criteria);
      const requestCriteriaNotes = buildCriteriaNotes(normalizeCriteria(requestCriteria));
      const combinedTrialNotes = [decryptNullableText(profileRows[0].trial_notes) || "", request.trial_notes || ""]
        .filter((part) => String(part).trim())
        .join("\n\nContract request notes:\n");

      // The student's birthday decides whether a teacher who declines children is
      // eligible at all, so the matcher has to be told it. Read separately from the
      // locked profile row because birth_date is on users and encrypted, and
      // locking the user row just to read one field would block every other write
      // to that account for the length of this approval.
      //
      // This was silently missing, which made the child rule inert on the one path
      // that assigns a teacher from a student's own request: with no birthday,
      // every student reads as an adult and a teacher who said they will not teach
      // children stays in the running.
      const [requestBirthRows] = await connection.query(
        "SELECT birth_date FROM users WHERE user_id = ? LIMIT 1",
        [request.student_id]
      );

      const recommendation = await recommendTeacher({
        criteria: requestCriteria,
        trialNotes: combinedTrialNotes,
        courseId: request.course_id,
        proficiencyLevel: profileRows[0].proficiency_level,
        studentBirthDate: decryptNullableText(requestBirthRows[0]?.birth_date) || null,
        preferredTeacherId: profileRows[0].assigned_teacher_id,
        // The student said when they can attend. Honoured here, on approval,
        // rather than at submission - which is the whole reason this had to be
        // stored at all. Without it the preference is a note the admin reads and
        // the one process that could have acted on it never sees.
        preferredSchedule: preferredScheduleFromRow(request),
        db: connection,
      });
      const assignedTeacherId = recommendation.teacher?.user_id || null;

      if (!assignedTeacherId) {
        await connection.rollback();
        return res.status(400).json({
          message: "No active teacher can currently teach the requested course. Assign a teacher to this course first.",
        });
      }

      await connection.query(
        `UPDATE student_profiles
         SET course_id = COALESCE(?, course_id), assigned_teacher_id = ?, trial_notes = ?
         WHERE user_id = ?`,
        [
          request.course_id,
          assignedTeacherId,
          [decryptNullableText(profileRows[0].trial_notes) || "", request.trial_notes || "", requestCriteriaNotes]
            .filter((part) => String(part).trim())
            .join("\n\n"),
          request.student_id,
        ]
      );

      await connection.query(
        `UPDATE student_class_packages
         SET status = 'expired'
         WHERE student_id = ? AND status = 'active'`,
        [request.student_id]
      );

      await connection.query(
        `INSERT INTO student_class_packages
         (student_id, total_classes, classes_used, status, class_duration)
         VALUES (?, ?, 0, 'active', ?)`,
        [request.student_id, request.requested_classes, normalizeClassDuration(request.class_duration)]
      );
    }

    await connection.query(
      `UPDATE student_contract_requests
       SET status = ?, admin_response = ?, resolved_at = NOW()
       WHERE request_id = ?`,
      [status, encryptNullableText(admin_response || null), request_id]
    );

    await markAdminNotificationsRead(connection, request.request_id);

    const notificationTitle = status === "approved"
      ? "Contract Request Approved"
      : "Contract Request Declined";
    const notificationMessage = status === "approved"
      ? `Your contract request for ${request.course_name || "your selected course"} with ${request.requested_classes} classes (${normalizeClassDuration(request.class_duration)}-minute lessons) was approved.`
      : `Your contract request for ${request.course_name || "your selected course"} with ${request.requested_classes} classes (${normalizeClassDuration(request.class_duration)}-minute lessons) was declined.`;

    await connection.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'general', ?, ?, ?, 'contract_request', '/Calendar')`,
      [request.student_id, encryptNullableText(notificationTitle), encryptNullableText(notificationMessage), request.request_id]
    );

    await connection.commit();
    res.json({ message: `Contract request ${status}` });
  } catch (err) {
    await connection.rollback();
    console.error("PUT /api/admin/contract-requests/:request_id error:", err);
    res.status(500).json({ message: "Error updating contract request" });
  } finally {
    connection.release();
  }
});

// Update user status (active, suspended, archived)
app.put("/api/users/:userId/status", requireAdminSession, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // Validate status value
    const validStatuses = ["active", "suspended", "archived"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // The super administrator cannot be archived, suspended, or deactivated -
    // they are the account that recovers the school if every other admin is
    // locked out.
    const [targetRows] = await pool.query(
      "SELECT is_super_admin FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (targetRows.length && Boolean(targetRows[0].is_super_admin)) {
      return res.status(403).json({ message: "The super administrator account cannot be archived or suspended" });
    }

    const [result] = await pool.query(
      "UPDATE users SET status = ? WHERE user_id = ?",
      [status, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "User not found" });
    }

    // The only route that changes a user's status, and so the only place this
    // memo can go stale. Without it an archived account kept file access for up
    // to a minute; with it, the next request re-reads the account and is
    // refused.
    uploadSessionCache.delete(String(userId));

    res.json({ message: `User status updated to ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user status" });
  }
});

// ==================== CALENDAR ENDPOINTS ====================

app.get("/api/calendar/stream/:user_id", requireSession, (req, res) => {
  if (!sessionMayActFor(req, req.params.user_id)) {
    return res.status(403).json({ message: "You can only subscribe to your own calendar." });
  }
  const { user_id } = req.params;
  if (!user_id) {
    return res.status(400).json({ message: "Missing user_id" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  addCalendarStreamClient(user_id, res);
  res.write(`event: connected\ndata: ${JSON.stringify({ user_id, connected: true })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    } catch {
      clearInterval(heartbeat);
      removeCalendarStreamClient(user_id, res);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeCalendarStreamClient(user_id, res);
  });
});

// Get teacher availability for a month
app.get("/api/calendar/teacher-availability", requireSession, requireTeacherAvailabilityScope(), async (req, res) => {
  try {
    const { teacher_id, year, month } = req.query;
    
    if (!teacher_id || !year || !month) {
      return res.status(400).json({ message: "Missing teacher_id, year, or month" });
    }

    await deletePastTeacherAvailability(teacher_id);

    const monthIndex = parseInt(month, 10);
    const yearValue = parseInt(year, 10);
    const daysInMonth = new Date(yearValue, monthIndex, 0).getDate();
    const startDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-01`;
    const endDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const sourceStartDate = addDaysToDateKey(startDate, -1) || startDate;
    const sourceEndDate = addDaysToDateKey(endDate, 1) || endDate;

    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(ta.available_date, '%Y-%m-%d') as available_date,
              ta.status,
              TIME_FORMAT(ta.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(ta.end_time, '%H:%i:%s') AS end_time,
              u.timezone AS teacher_timezone
       FROM teacher_availability ta
       JOIN users u ON u.user_id = ta.teacher_id
       WHERE ta.teacher_id = ?
         AND u.status = 'active'
         AND u.profile_completed = TRUE
         AND ta.available_date BETWEEN ? AND ?
       ORDER BY ta.available_date`,
      [teacher_id, sourceStartDate, sourceEndDate]
    );

    const availability = {};
    const records = [];
    rows.forEach(row => {
      availability[row.available_date] = row.status;
      records.push(row);
    });

    res.json({ availability, records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching availability" });
  }
});

// Set teacher availability for a date
app.post("/api/calendar/teacher-availability", requireSession, requireBodyIdentity("teacher_id"), async (req, res) => {
  try {
    const { teacher_id, available_date, status } = req.body;
    
    if (!teacher_id || !available_date || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [teacherRows] = await pool.query(
      `SELECT user_id
       FROM users
       WHERE user_id = ?
         AND role = 'teacher'
         AND status = 'active'
         AND profile_completed = TRUE
       LIMIT 1`,
      [teacher_id]
    );

    if (!teacherRows.length) {
      return res.status(400).json({ message: "Teacher account must be active and complete before setting availability." });
    }

    await pool.query(
      `INSERT INTO teacher_availability (teacher_id, available_date, status)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?`,
      [teacher_id, available_date, status, status]
    );

    res.json({ message: "Availability updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating availability" });
  }
});

// Get all classes for a specific date
app.get("/api/calendar/classes-by-date", requireSession, requireQueryScope("student_id", "teacher_id"), async (req, res) => {
  try {
    const { scheduled_date, student_id, teacher_id } = req.query;
    await autoMarkPastClassesAsNoShow(pool);

    let query = `SELECT ${classSelectFields},
                       stu.first_name as student_name,
                       stu.last_name as student_last_name,
                       stu.email as student_email,
                       stu.profile_image_url AS student_profile_image_url,
                       stu.profile_image_url AS studentProfileImageUrl,
                       stu.timezone as student_timezone,
                       sp.proficiency_level AS student_proficiency_level,
                       tea.first_name as teacher_name,
                       tea.last_name as teacher_last_name,
                       tea.email as teacher_email,
                       tea.profile_image_url AS teacher_profile_image_url,
                       tea.timezone as teacher_timezone,
                       cal.teacher_started_at,
                       cal.student_joined_at,
                       cal.teacher_ended_at,
                       cal.duration_minutes AS verified_duration_minutes,
                       cal.proof_url AS class_proof_url,
                       cal.recording_url AS class_recording_url,
                       cal.recording_uploaded_at AS class_recording_uploaded_at,
                       cal.recording_expires_at AS class_recording_expires_at,
                       cal.summary AS class_summary,
                       cal.verification_status,
                       COALESCE(c.class_link, vs.teams_meeting_link) as class_link
                 FROM classes c
                 LEFT JOIN video_sessions vs ON vs.class_id = c.class_id
                 LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
                 JOIN users stu ON c.student_id = stu.user_id
                  AND stu.status = 'active' AND stu.profile_completed = TRUE
                 LEFT JOIN student_profiles sp ON sp.user_id = stu.user_id
                 JOIN users tea ON c.teacher_id = tea.user_id
                  AND tea.status = 'active' AND tea.profile_completed = TRUE
                 WHERE c.scheduled_date = ?
                 AND c.status = 'scheduled'
                 ${req.query.include_reserved === 'true' ? '' : "AND COALESCE(cal.verification_status, 'pending') <> 'incomplete'"}
                 AND c.scheduled_date >= CURDATE()`;
    const params = [scheduled_date];

    if (student_id) {
      query += ` AND c.student_id = ?`;
      params.push(student_id);
    }
    if (teacher_id) {
      query += ` AND c.teacher_id = ?`;
      params.push(teacher_id);
    }

    query += ` ORDER BY c.start_time ASC, c.class_id ASC`;

    const [rows] = await pool.query(query, params);
    res.json({ classes: decryptRows(rows, ["class_link", "class_summary"]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching classes" });
  }
});

// Get all classes for a month, grouped by scheduled_date
app.get("/api/calendar/classes-by-month", requireSession, requireQueryScope("student_id", "teacher_id"), async (req, res) => {
  try {
    const { year, month, student_id, teacher_id } = req.query;

    if (!year || !month) {
      return res.status(400).json({ message: "Missing year or month" });
    }

    const monthIndex = parseInt(month, 10);
    const yearValue = parseInt(year, 10);

    if (
      Number.isNaN(monthIndex) ||
      Number.isNaN(yearValue) ||
      monthIndex < 1 ||
      monthIndex > 12
    ) {
      return res.status(400).json({ message: "Invalid year or month" });
    }

    await autoMarkPastClassesAsNoShow(pool);

    const daysInMonth = new Date(yearValue, monthIndex, 0).getDate();
    const startDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-01`;
    const endDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    let query = `SELECT ${classSelectFields},
                       stu.first_name as student_name,
                       stu.last_name as student_last_name,
                       stu.email as student_email,
                       stu.profile_image_url AS student_profile_image_url,
                       stu.profile_image_url AS studentProfileImageUrl,
                       stu.timezone as student_timezone,
                       sp.proficiency_level AS student_proficiency_level,
                       tea.first_name as teacher_name,
                       tea.last_name as teacher_last_name,
                       tea.email as teacher_email,
                       tea.profile_image_url AS teacher_profile_image_url,
                       tea.timezone as teacher_timezone,
                       cal.teacher_started_at,
                       cal.student_joined_at,
                       cal.teacher_ended_at,
                       cal.duration_minutes AS verified_duration_minutes,
                       cal.proof_url AS class_proof_url,
                       cal.recording_url AS class_recording_url,
                       cal.recording_uploaded_at AS class_recording_uploaded_at,
                       cal.recording_expires_at AS class_recording_expires_at,
                       cal.summary AS class_summary,
                       cal.verification_status,
                       COALESCE(c.class_link, vs.teams_meeting_link) as class_link
                 FROM classes c
                 LEFT JOIN video_sessions vs ON vs.class_id = c.class_id
                 LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
                 JOIN users stu ON c.student_id = stu.user_id
                  AND stu.status = 'active' AND stu.profile_completed = TRUE
                 LEFT JOIN student_profiles sp ON sp.user_id = stu.user_id
                 JOIN users tea ON c.teacher_id = tea.user_id
                  AND tea.status = 'active' AND tea.profile_completed = TRUE
                 WHERE c.scheduled_date BETWEEN ? AND ?
                 AND c.status = 'scheduled'
                 ${req.query.include_reserved === 'true' ? '' : "AND COALESCE(cal.verification_status, 'pending') <> 'incomplete'"}
                 AND c.scheduled_date >= CURDATE()`;
    const params = [startDate, endDate];

    if (student_id) {
      query += ` AND c.student_id = ?`;
      params.push(student_id);
    }
    if (teacher_id) {
      query += ` AND c.teacher_id = ?`;
      params.push(teacher_id);
    }

    query += ` ORDER BY c.scheduled_date ASC, c.start_time ASC, c.class_id ASC`;

    const [rows] = await pool.query(query, params);
    const classesByDate = decryptRows(rows, ["class_link", "class_summary"]).reduce((acc, row) => {
      const dateKey = row.scheduled_date instanceof Date
        ? row.scheduled_date.toISOString().slice(0, 10)
        : String(row.scheduled_date).slice(0, 10);
      acc[dateKey] = acc[dateKey] || [];
      acc[dateKey].push(row);
      return acc;
    }, {});

    res.json({ classesByDate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching monthly classes" });
  }
});

// Get upcoming classes for a teacher or student
app.get("/api/calendar/upcoming-classes", requireSession, requireQueryScope("teacher_id", "student_id"), async (req, res) => {
  try {
    const { teacher_id, student_id, limit = 10 } = req.query;
    if (!teacher_id && !student_id) {
      return res.status(400).json({ message: "Missing teacher_id or student_id" });
    }

    await autoMarkPastClassesAsNoShow(pool);

    let query = `SELECT ${classSelectFields}, \
                       stu.first_name as student_name, \
                       stu.last_name as student_last_name, \
                       stu.email as student_email, \
                       stu.profile_image_url AS student_profile_image_url, \
                       stu.profile_image_url AS studentProfileImageUrl, \
                       stu.timezone as student_timezone, \
                       sp.proficiency_level AS student_proficiency_level, \
                       tea.first_name as teacher_name, \
                       tea.last_name as teacher_last_name, \
                       tea.last_name as teacher_last_name, \
                       tea.email as teacher_email, \
                       tea.profile_image_url AS teacher_profile_image_url, \
                       tea.timezone as teacher_timezone, \
                       COALESCE(c.class_link, vs.teams_meeting_link) as class_link \
                 FROM classes c \
                 LEFT JOIN video_sessions vs ON vs.class_id = c.class_id \
                 JOIN users stu ON c.student_id = stu.user_id \
                  AND stu.status = 'active' AND stu.profile_completed = TRUE \
                 LEFT JOIN student_profiles sp ON sp.user_id = stu.user_id \
                 JOIN users tea ON c.teacher_id = tea.user_id \
                  AND tea.status = 'active' AND tea.profile_completed = TRUE \
                 WHERE c.status = 'scheduled' \
                 AND NOT EXISTS (SELECT 1 FROM class_attendance_logs cal WHERE cal.class_id = c.class_id AND cal.verification_status = 'incomplete') \
                 AND c.scheduled_date >= CURDATE()`;
    const params = [];

    if (teacher_id) {
      query += ` AND c.teacher_id = ?`;
      params.push(teacher_id);
    }
    if (student_id) {
      query += ` AND c.student_id = ?`;
      params.push(student_id);
    }

    query += ` ORDER BY c.scheduled_date ASC, c.start_time ASC LIMIT ?`;
    params.push(parseInt(limit, 10) || 10);

    const [rows] = await pool.query(query, params);
    res.json({ classes: decryptRows(rows, ["class_link"]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching upcoming classes" });
  }
});

const getRequiredClassMinutes = (duration) => {
  const parsedDuration = normalizeClassDuration(duration);
  return Math.max(1, Math.min(30, Math.ceil(parsedDuration * 0.6)));
};

const hasCompleteSentence = (value) => {
  const text = String(value || "").trim();
  const words = text.match(/[A-Za-z0-9]+/g) || [];
  return words.length >= 4 && /[.!?]$/.test(text);
};

const classVerificationSelect = `
  cal.log_id,
  cal.class_id,
  cal.teacher_id,
  cal.student_id,
  cal.teacher_started_at,
  cal.student_joined_at,
  cal.teacher_ended_at,
  cal.duration_minutes,
  cal.proof_url,
  cal.evidence_mode,
  cal.start_proof_url,
  cal.start_proof_uploaded_at,
  cal.end_proof_uploaded_at,
  cal.recording_duration_seconds,
  cal.review_reason,
  cal.recording_url,
  cal.recording_mime_type,
  cal.recording_size_bytes,
  cal.recording_uploaded_at,
  cal.recording_expires_at,
  cal.teacher_recording_consent_at,
  cal.student_recording_consent_at,
  cal.summary,
  cal.verification_status,
  cal.created_at,
  cal.updated_at
`;

async function getClassVerification(connection, classId) {
  const [rows] = await connection.query(
    `SELECT ${classVerificationSelect}
     FROM class_attendance_logs cal
     WHERE cal.class_id = ?
     LIMIT 1`,
    [classId]
  );

  return rows.length ? decryptFields(rows[0], ["summary"]) : null;
}

app.get("/api/calendar/classes/:class_id/verification", requireSession, requireClassAccess(), async (req, res) => {
  try {
    const { class_id } = req.params;
    const verification = await getClassVerification(pool, class_id);
    res.json({ verification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching class verification" });
  }
});

app.get("/api/calendar/classes/:class_id/classroom", requireSession, requireClassAccess(), async (req, res) => {
  try {
    const { class_id } = req.params;
    if (!class_id) {
      return res.status(400).json({ message: "Missing class_id" });
    }

    // The caller's id comes from the verified session, not the query string.
    //
    // This was read from req.query and used both to load the `users` row that
    // decides access and to derive isModerator below. sessionMayActOnClass only
    // requires being a participant, so any student in the class could pass
    // their teacher's id and be handed a Jitsi JWT with isModerator: true,
    // minted from the teacher's own row - their name, their email, and
    // moderator rights in the teacher's live classroom. Only the classroom
    // handler was affected: the recording handler reads the same field but
    // derives nothing but participant status from it.
    //
    // Both callers already sent the caller's own id, so this changes no
    // legitimate behaviour.
    const userId = req.session.userId;

    const [rows] = await pool.query(
      `SELECT c.class_id,
              c.class_name,
              c.teacher_id,
              c.student_id,
              c.status,
              DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
              c.duration,
              COALESCE(c.class_link, vs.teams_meeting_link) AS class_link,
              tea.first_name AS teacher_first_name,
              tea.last_name AS teacher_last_name,
              tea.email AS teacher_email,
              stu.first_name AS student_first_name,
              stu.last_name AS student_last_name,
              stu.email AS student_email
       FROM classes c
       LEFT JOIN video_sessions vs ON vs.class_id = c.class_id
       JOIN users tea ON tea.user_id = c.teacher_id
       JOIN users stu ON stu.user_id = c.student_id
       WHERE c.class_id = ?
       LIMIT 1`,
      [class_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = decryptFields(rows[0], ["class_link"]);
    const [userRows] = await pool.query(
      "SELECT user_id, first_name, last_name, email, role, status, profile_completed FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );
    const user = userRows[0];
    const isParticipant =
      String(classInfo.teacher_id) === String(userId) ||
      String(classInfo.student_id) === String(userId);
    const isAdmin = user?.role === "admin";

    if (!user || user.status !== "active" || (!isAdmin && !user.profile_completed) || (!isParticipant && !isAdmin)) {
      return res.status(403).json({ message: "You do not have access to this classroom" });
    }

    const verification = await getClassVerification(pool, class_id);
    const jitsiJwt = createJitsiJwtForClass({
      classInfo,
      user,
      isModerator: isAdmin || String(classInfo.teacher_id) === String(userId),
    });

    res.json({
      class: classInfo,
      verification,
      jitsi_jwt: jitsiJwt,
      jitsi_auth_configured: Boolean(JITSI_JWT_APP_ID && JITSI_JWT_APP_SECRET),
      public_meet_jitsi: /^https:\/\/meet\.jit\.si\/?/i.test(classInfo.class_link || JITSI_BASE_URL),
    });
  } catch (err) {
    console.error("GET /api/calendar/classes/:class_id/classroom error:", err);
    res.status(500).json({ message: "Error loading classroom" });
  }
});

app.post("/api/calendar/classes/:class_id/start", requireSession, requireClassAccess(), async (req, res) => {
  try {
    const { class_id } = req.params;
    const { teacher_id, recording_consent, evidence_mode } = req.body;
    if (!["recording", "screenshots"].includes(evidence_mode)) {
      return res.status(400).json({ message: "Choose recording or start-and-end screenshots before starting." });
    }

    if (!class_id || !teacher_id) {
      return res.status(400).json({ message: "Missing class_id or teacher_id" });
    }

    const [classRows] = await pool.query(
      `SELECT c.class_id, c.teacher_id, c.student_id, c.status
       FROM classes c
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE c.class_id = ?
       LIMIT 1`,
      [class_id]
    );

    if (!classRows.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    if (String(classInfo.teacher_id) !== String(teacher_id)) {
      return res.status(403).json({ message: "Only the assigned teacher can start this class" });
    }

    if (classInfo.status !== "scheduled") {
      return res.status(400).json({ message: "Only scheduled classes can be started" });
    }

    if (await markClassNoShowIfAttendanceGraceExpired(pool, classInfo.class_id)) {
      broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-no-show", {
        class_id: classInfo.class_id,
        status: "no-show",
      });
      return res.status(409).json({ message: `This class was missed because attendance was not completed within ${CLASS_ATTENDANCE_GRACE_MINUTES} minutes after the scheduled start time.` });
    }

    if (recording_consent !== true && recording_consent !== "true") {
      return res.status(400).json({ message: "Recording consent is required before joining this class" });
    }

    await pool.query(
      `INSERT INTO class_attendance_logs (class_id, teacher_id, student_id, evidence_mode, teacher_started_at, teacher_recording_consent_at, verification_status)
       VALUES (?, ?, ?, ?, NOW(), NOW(), 'in_progress')
       ON DUPLICATE KEY UPDATE
         evidence_mode = COALESCE(evidence_mode, VALUES(evidence_mode)),
         teacher_started_at = COALESCE(teacher_started_at, NOW()),
         teacher_recording_consent_at = COALESCE(teacher_recording_consent_at, NOW()),
         verification_status = CASE
           WHEN teacher_ended_at IS NOT NULL THEN verification_status
           WHEN student_joined_at IS NOT NULL THEN 'student_confirmed'
           ELSE 'in_progress'
         END`,
      [classInfo.class_id, classInfo.teacher_id, classInfo.student_id, evidence_mode]
    );

    const verification = await getClassVerification(pool, class_id);
    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-verification-changed", {
      class_id: classInfo.class_id,
      verification_status: verification?.verification_status || "in_progress",
    });
    res.json({ message: "Class session started", verification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error starting class session" });
  }
});

app.post("/api/calendar/classes/:class_id/join", requireSession, requireClassAccess(), async (req, res) => {
  try {
    const { class_id } = req.params;
    const { student_id, recording_consent } = req.body;

    if (!class_id || !student_id) {
      return res.status(400).json({ message: "Missing class_id or student_id" });
    }

    const [classRows] = await pool.query(
      `SELECT c.class_id, c.teacher_id, c.student_id, c.status
       FROM classes c
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE c.class_id = ?
       LIMIT 1`,
      [class_id]
    );

    if (!classRows.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    if (String(classInfo.student_id) !== String(student_id)) {
      return res.status(403).json({ message: "Only the assigned student can confirm attendance" });
    }

    if (classInfo.status !== "scheduled") {
      return res.status(400).json({ message: "Only scheduled classes can be confirmed" });
    }

    if (await markClassNoShowIfAttendanceGraceExpired(pool, classInfo.class_id)) {
      broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-no-show", {
        class_id: classInfo.class_id,
        status: "no-show",
      });
      return res.status(409).json({ message: `This class was missed because attendance was not completed within ${CLASS_ATTENDANCE_GRACE_MINUTES} minutes after the scheduled start time.` });
    }

    if (recording_consent !== true && recording_consent !== "true") {
      return res.status(400).json({ message: "Recording consent is required before joining this class" });
    }

    const [logRows] = await pool.query(
      `SELECT log_id, teacher_started_at
       FROM class_attendance_logs
       WHERE class_id = ?
       LIMIT 1`,
      [class_id]
    );

    if (!logRows.length || !logRows[0].teacher_started_at) {
      return res.status(400).json({ message: "The teacher must start the class before attendance can be confirmed" });
    }

    await pool.query(
      `UPDATE class_attendance_logs
       SET student_joined_at = COALESCE(student_joined_at, NOW()),
           student_recording_consent_at = COALESCE(student_recording_consent_at, NOW()),
           verification_status = CASE
             WHEN teacher_ended_at IS NULL THEN 'student_confirmed'
             ELSE verification_status
           END
       WHERE class_id = ?`,
      [class_id]
    );

    const verification = await getClassVerification(pool, class_id);
    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-verification-changed", {
      class_id: classInfo.class_id,
      verification_status: verification?.verification_status || "student_confirmed",
    });
    res.json({ message: "Attendance confirmed", verification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error confirming attendance" });
  }
});

app.post("/api/calendar/classes/:class_id/recording", requireSession, requireClassAccess(), (req, res, next) => {
  classRecordingUpload.single("recording")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "The recording exceeds the 500 MB upload limit." });
    }
    if (error instanceof multer.MulterError || error.message === "Only WEBM or MP4 class recordings are allowed") {
      return res.status(400).json({ message: error.message });
    }
    console.error("Class recording upload middleware error:", error);
    return res.status(500).json({ message: "The server could not save the recording. Please retry the upload." });
  });
}, async (req, res) => {
  try {
    const { class_id } = req.params;
    const { teacher_id } = req.body || {};

    if (!class_id || !teacher_id) {
      return res.status(400).json({ message: "Missing class_id or teacher_id" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No recording file uploaded" });
    }

    const [classRows] = await pool.query(
      `SELECT c.class_id, c.teacher_id, c.student_id, c.status
       FROM classes c
       WHERE c.class_id = ?
       LIMIT 1`,
      [class_id]
    );

    if (!classRows.length) {
      await deleteLocalClassRecording(`/private-uploads/class-recordings/${req.file.filename}`);
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    if (String(classInfo.teacher_id) !== String(teacher_id)) {
      await deleteLocalClassRecording(`/private-uploads/class-recordings/${req.file.filename}`);
      return res.status(403).json({ message: "Only the assigned teacher can upload this class recording" });
    }

    const [existingRows] = await pool.query(
      "SELECT recording_url, evidence_mode, teacher_ended_at, recording_started_at, TIMESTAMPDIFF(SECOND, recording_started_at, NOW()) AS elapsed_seconds FROM class_attendance_logs WHERE class_id = ? LIMIT 1",
      [class_id]
    );

    const reportedSeconds = Number(req.body.duration_seconds);
    const recordingLog = existingRows[0];
    if (!recordingLog?.recording_started_at || recordingLog.evidence_mode !== 'recording' || recordingLog.teacher_ended_at || !Number.isFinite(reportedSeconds) || reportedSeconds <= 0) {
      await deleteLocalClassRecording(`/private-uploads/class-recordings/${req.file.filename}`);
      return res.status(400).json({ message: "Start a recording from Calendar before uploading it." });
    }

    const recordingSeconds = Math.max(0, Math.floor(Math.min(reportedSeconds, Number(recordingLog.elapsed_seconds))));

    let recordingUrl;
    if (isGoogleDriveConfigured()) {
      try {
        const driveUpload = await uploadRecordingToDrive({
          filePath: path.join(classRecordingUploadDir, req.file.filename),
          filename: `${classInfo.class_id}-${Date.now()}-${path.basename(req.file.originalname) || "recording.webm"}`,
          mimeType: req.file.mimetype,
        });
        recordingUrl = driveUpload.webViewLink || driveUpload.webContentLink;
        await deleteLocalClassRecording(`/private-uploads/class-recordings/${req.file.filename}`);
      } catch (err) {
        await deleteLocalClassRecording(`/private-uploads/class-recordings/${req.file.filename}`);
        const driveError = err?.response?.data?.error;
        const driveDetail =
          (typeof driveError === "string" ? driveError : driveError?.message) ||
          err?.message ||
          String(err);
        console.error("Google Drive upload error:", driveDetail);
        return res.status(502).json({
          message: "The recording could not be stored in Google Drive. Please retry the upload.",
          error: driveDetail,
        });
      }
    } else {
      recordingUrl = `/private-uploads/class-recordings/${req.file.filename}`;
    }

    await pool.query(
      `INSERT INTO class_attendance_logs (
         class_id, teacher_id, student_id, recording_url, recording_mime_type,
         recording_size_bytes, recording_uploaded_at, recording_expires_at, recording_duration_seconds, verification_status
       )
       VALUES (?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?, 'needs_review')
       ON DUPLICATE KEY UPDATE
         recording_url = VALUES(recording_url),
         recording_mime_type = VALUES(recording_mime_type),
         recording_size_bytes = VALUES(recording_size_bytes),
         recording_uploaded_at = NOW(),
         recording_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY),
         recording_duration_seconds = ?`,
      [
        classInfo.class_id,
        classInfo.teacher_id,
        classInfo.student_id,
        recordingUrl,
        req.file.mimetype,
        req.file.size,
        RECORDING_RETENTION_DAYS,
        recordingSeconds,
        RECORDING_RETENTION_DAYS,
        recordingSeconds,
      ]
    );

    if (existingRows[0]?.recording_url && existingRows[0].recording_url !== recordingUrl) {
      await deleteClassRecording(existingRows[0].recording_url);
    }

    const verification = await getClassVerification(pool, class_id);
    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-verification-changed", {
      class_id: classInfo.class_id,
      verification_status: verification?.verification_status || "needs_review",
    });

    res.json({
      message: "Class recording uploaded",
      recording_url: recordingUrl,
      recording_expires_at: verification?.recording_expires_at,
      verification,
    });
  } catch (err) {
    if (req.file) {
      await deleteLocalClassRecording(`/private-uploads/class-recordings/${req.file.filename}`);
    }
    console.error("POST /api/calendar/classes/:class_id/recording error:", err);
    res.status(500).json({ message: "Error uploading class recording" });
  }
});

app.get("/api/calendar/classes/:class_id/recording", requireSession, requireClassAccess(), async (req, res) => {
  try {
    await cleanupExpiredClassRecordings(pool);

    const { class_id } = req.params;
    if (!class_id) {
      return res.status(400).json({ message: "Missing class_id" });
    }

    // From the verified session, not the query string. requireClassAccess had
    // already stopped anyone who was not a participant, so this was reading
    // someone else's account to decide this caller's access rather than being
    // exploitable - see the note on the classroom handler above, where the same
    // pattern was worse.
    const userId = req.session.userId;

    const [rows] = await pool.query(
      `SELECT c.teacher_id,
              c.student_id,
              cal.recording_url,
              cal.recording_mime_type,
              cal.recording_expires_at,
              u.role,
              u.status,
              u.profile_completed
       FROM classes c
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       JOIN users u ON u.user_id = ?
       WHERE c.class_id = ?
       LIMIT 1`,
      [userId, class_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Recording not found" });
    }

    const row = rows[0];
    const isParticipant =
      String(row.teacher_id) === String(userId) ||
      String(row.student_id) === String(userId);
    const isAdmin = row.role === "admin";

    if (row.status !== "active" || (!isAdmin && !row.profile_completed) || (!isAdmin && !isParticipant)) {
      return res.status(403).json({ message: "You do not have access to this recording" });
    }

    if (!row.recording_url) {
      return res.status(404).json({ message: "No recording is available for this class" });
    }

    if (row.recording_expires_at && new Date(row.recording_expires_at).getTime() <= Date.now()) {
      await cleanupExpiredClassRecordings(pool);
      return res.status(404).json({ message: "This recording has expired" });
    }

    if (String(row.recording_url).startsWith("http")) {
      const fileId = extractDriveFileId(String(row.recording_url));
      if (fileId) {
        return res.redirect(302, `https://drive.google.com/file/d/${fileId}/view`);
      }
      return res.redirect(302, row.recording_url);
    }

    const fileName = path.basename(row.recording_url);
    const filePath = path.resolve(classRecordingUploadDir, fileName);
    const recordingDir = path.resolve(classRecordingUploadDir);
    if (!filePath.startsWith(recordingDir + path.sep) || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Recording file not found" });
    }

    res.setHeader("Content-Type", row.recording_mime_type || "video/webm");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error("GET /api/calendar/classes/:class_id/recording error:", err);
    res.status(500).json({ message: "Error loading class recording" });
  }
});

/**
 * Where a class recording actually lives, so the client can open it.
 *
 * !! Why this exists: the route above streams local files and redirects Drive
 * !! ones, but both sit behind requireSession, and neither <a href> nor
 * !! <video src> can send an Authorization header. The three "View Recording"
 * !! links were therefore dead - they 401'd before ever reaching the redirect,
 * !! so a Drive recording did not work either, contrary to what the 302 in that
 * !! handler suggests. Fetching the Drive URL with fetch() is not an option
 * !! either: it is a cross-origin hop, so the response cannot be read.
 *
 * So this answers the only question the client actually has - Drive or local -
 * and keeps every access check in front of it:
 *
 *   drive -> the client navigates straight to Drive, exactly as the 302 did.
 *   local -> the client fetches /recording with the header and renders it from
 *            a blob: URL. That buffers the whole file in memory, which for a
 *            recording near the 500 MB cap is not free. A short-lived token in
 *            the query string would let <video src> stream instead, but that
 *            widens where the session token can leak (logs, history, referrer),
 *            so it is not done here.
 *
 * Note the user_id the local URL carries is taken from the session, not the
 * query. The handler above still trusts a caller-supplied user_id for its own
 * lookup, which is harmless only because requireClassAccess has already
 * established the caller may act on this class.
 */
app.get("/api/calendar/classes/:class_id/recording-link", requireSession, requireClassAccess(), async (req, res) => {
  try {
    await cleanupExpiredClassRecordings(pool);

    const { class_id } = req.params;

    const [rows] = await pool.query(
      `SELECT cal.recording_url, cal.recording_expires_at
       FROM classes c
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       WHERE c.class_id = ?
       LIMIT 1`,
      [class_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Recording not found" });
    }

    const row = rows[0];
    if (!row.recording_url) {
      return res.status(404).json({ message: "No recording is available for this class" });
    }

    if (row.recording_expires_at && new Date(row.recording_expires_at).getTime() <= Date.now()) {
      return res.status(404).json({ message: "This recording has expired" });
    }

    const url = String(row.recording_url);
    if (url.startsWith("http")) {
      const fileId = extractDriveFileId(url);
      return res.json({
        kind: "drive",
        url: fileId ? `https://drive.google.com/file/d/${fileId}/view` : url,
      });
    }

    // No user_id: the handler above now reads the session, so passing one would
    // only suggest to a reader that it is still load-bearing.
    return res.json({
      kind: "local",
      url: `/api/calendar/classes/${encodeURIComponent(class_id)}/recording`,
    });
  } catch (err) {
    console.error("GET /api/calendar/classes/:class_id/recording-link error:", err);
    res.status(500).json({ message: "Error loading class recording" });
  }
});

app.post("/api/calendar/classes/:class_id/recording-start", requireSession, requireClassAccess(), async (req, res) => {
  try {
    const [result] = await pool.query(`UPDATE class_attendance_logs cal JOIN classes c ON c.class_id = cal.class_id
      SET cal.recording_started_at = NOW(), cal.evidence_mode = COALESCE(cal.evidence_mode, 'recording')
      WHERE cal.class_id = ? AND c.teacher_id = ? AND c.status = 'scheduled'
      AND cal.teacher_started_at IS NOT NULL AND cal.teacher_ended_at IS NULL
      AND (cal.evidence_mode IS NULL OR cal.evidence_mode = 'recording')`, [req.params.class_id, req.body.teacher_id]);
    if (!result.affectedRows) return res.status(400).json({ message: "Recording is unavailable for this class." });
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ message: "Unable to start recording." }); }
});

app.post("/api/calendar/classes/:class_id/start-proof", classProofUpload.single("proof_image"), requireSession, requireClassAccess(), async (req, res) => {
  try {
    const log = await getClassVerification(pool, req.params.class_id);
    if (!req.file || !log || String(log.teacher_id) !== String(req.body.teacher_id) || !log.student_joined_at || log.teacher_ended_at || log.evidence_mode !== 'screenshots' || log.start_proof_url) {
      if (req.file) await deleteLocalClassProofImage(`/uploads/class-proofs/${req.file.filename}`);
      return res.status(400).json({ message: "Start screenshot requires screenshot mode, confirmed student attendance, and no previous start screenshot." });
    }
    await pool.query("UPDATE class_attendance_logs SET start_proof_url = ?, start_proof_uploaded_at = NOW() WHERE class_id = ?", [`/uploads/class-proofs/${req.file.filename}`, req.params.class_id]);
    res.json({ verification: await getClassVerification(pool, req.params.class_id) });
  } catch (error) { res.status(500).json({ message: "Unable to upload start screenshot." }); }
});

app.delete("/api/calendar/classes/:class_id/start-proof", requireSession, requireClassAccess(), async (req, res) => {
  try {
    const log = await getClassVerification(pool, req.params.class_id);
    if (!log || String(log.teacher_id) !== String(req.body.teacher_id) || log.teacher_ended_at || log.evidence_mode !== 'screenshots' || !log.start_proof_url) {
      return res.status(400).json({ message: "Start screenshot cannot be removed for this class." });
    }

    const oldProofUrl = log.start_proof_url;
    await pool.query(
      "UPDATE class_attendance_logs SET start_proof_url = NULL, start_proof_uploaded_at = NULL WHERE class_id = ?",
      [req.params.class_id]
    );
    await deleteLocalClassProofImage(oldProofUrl);

    const verification = await getClassVerification(pool, req.params.class_id);
    res.json({ verification });
  } catch (error) {
    res.status(500).json({ message: "Unable to remove start screenshot." });
  }
});

app.post("/api/calendar/classes/:class_id/end", classProofUpload.single("proof_image"), requireSession, requireClassAccess(), async (req, res) => {
  try {
    const { class_id } = req.params;
    const { teacher_id, summary, review_reason } = req.body;
    const requestedReview = String(review_reason || "").trim();

    if (!class_id || !teacher_id) {
      return res.status(400).json({ message: "Missing class_id or teacher_id" });
    }

    const [classRows] = await pool.query(
      `SELECT c.class_id, c.teacher_id, c.student_id, c.duration, c.status
       FROM classes c
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE c.class_id = ?
       LIMIT 1`,
      [class_id]
    );

    if (!classRows.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    if (String(classInfo.teacher_id) !== String(teacher_id)) {
      return res.status(403).json({ message: "Only the assigned teacher can end this class" });
    }

    if (classInfo.status !== "scheduled") {
      return res.status(400).json({ message: "Only scheduled classes can be ended" });
    }

    const [logRows] = await pool.query(
      `SELECT *
       FROM class_attendance_logs
       WHERE class_id = ?
       LIMIT 1`,
      [class_id]
    );

    if (!logRows.length || !logRows[0].teacher_started_at) {
      return res.status(400).json({ message: "Start the class before ending it" });
    }

    if (!logRows[0].student_joined_at && !requestedReview) {
      return res.status(400).json({ message: "The student must join and confirm attendance before the class can be ended and verified" });
    }

    const trimmedSummary = String(summary || "").trim();
    if (!hasCompleteSentence(trimmedSummary)) {
      return res.status(400).json({ message: "Please enter at least one complete sentence in the class summary" });
    }

    const uploadedProofUrl = req.file ? `/uploads/class-proofs/${req.file.filename}` : String(logRows[0].proof_url || "");
    const requiredMinutes = getRequiredClassMinutes(classInfo.duration);
    let validEvidence = assessClassEvidence({ ...logRows[0], proof_url: uploadedProofUrl }, requiredMinutes);
    if (validEvidence && logRows[0].evidence_mode === 'screenshots' && req.file) {
      const startImage = await fs.promises.readFile(path.join(classProofUploadDir, path.basename(logRows[0].start_proof_url)));
      const endImage = await fs.promises.readFile(req.file.path);
      if (startImage.equals(endImage)) validEvidence = false;
    }
    if (!validEvidence && !requestedReview) {
      return res.status(400).json({ message: `Upload timely start and end screenshots, or a recording of at least ${requiredMinutes} minutes. Otherwise submit for review with a reason.` });
    }

    await pool.query(
      `UPDATE class_attendance_logs
       SET teacher_ended_at = COALESCE(teacher_ended_at, NOW()),
           duration_minutes = GREATEST(duration_minutes, TIMESTAMPDIFF(MINUTE, teacher_started_at, COALESCE(teacher_ended_at, NOW()))),
           proof_url = NULLIF(?, ''),
           end_proof_uploaded_at = IF(? <> '', NOW(), end_proof_uploaded_at),
           review_reason = NULLIF(?, ''),
           summary = ?,
           verification_status = CASE
             WHEN student_joined_at IS NOT NULL
              AND TIMESTAMPDIFF(MINUTE, teacher_started_at, COALESCE(teacher_ended_at, NOW())) >= ?
              AND ? = 1 AND ? = ''
             THEN 'verified'
             ELSE 'needs_review'
           END
       WHERE class_id = ?`,
      [
        uploadedProofUrl,
        uploadedProofUrl,
        requestedReview,
        encryptNullableText(trimmedSummary || null),
        requiredMinutes,
        validEvidence ? 1 : 0,
        requestedReview,
        class_id,
      ]
    );

    const verification = await getClassVerification(pool, class_id);
    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-verification-changed", {
      class_id: classInfo.class_id,
      verification_status: verification?.verification_status || "needs_review",
    });
    res.json({ message: "Class session ended", required_minutes: requiredMinutes, verification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error ending class session" });
  }
});

app.get("/api/admin/class-verifications", requireAdminSession, async (req, res) => {
  try {
    const { status = "all", from, to, limit = 200 } = req.query;
    const params = [];
    const filters = [
      "(cal.log_id IS NOT NULL OR TIMESTAMP(c.scheduled_date, COALESCE(c.start_time, '00:00:00')) <= NOW())",
    ];

    if (from) {
      filters.push("c.scheduled_date >= ?");
      params.push(from);
    }
    if (to) {
      filters.push("c.scheduled_date <= ?");
      params.push(to);
    }
    if (status && status !== "all") {
      if (status === "missing") {
        filters.push("cal.log_id IS NULL");
      } else {
        filters.push("cal.verification_status = ?");
        params.push(status);
      }
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const parsedLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));

    const [rows] = await pool.query(
      `SELECT c.class_id,
              c.class_name,
              c.status AS class_status,
              DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
              c.duration,
              cal.teacher_started_at,
              cal.student_joined_at,
              cal.teacher_ended_at,
              cal.duration_minutes,
              cal.proof_url,
              cal.start_proof_url, cal.start_proof_uploaded_at, cal.end_proof_uploaded_at,
              cal.evidence_mode, cal.recording_duration_seconds, cal.review_reason,
              cal.recording_url,
              cal.recording_uploaded_at,
              cal.recording_expires_at,
              cal.summary,
              COALESCE(cal.verification_status, 'pending') AS verification_status,
              stu.user_id AS student_id,
              stu.first_name AS student_first_name,
              stu.last_name AS student_last_name,
              stu.email AS student_email,
              tea.user_id AS teacher_id,
              tea.first_name AS teacher_first_name,
              tea.last_name AS teacher_last_name,
              tea.email AS teacher_email
       FROM classes c
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
       ${whereClause}
       ORDER BY c.scheduled_date DESC, c.start_time DESC, c.class_id DESC
       LIMIT ?`,
      [...params, parsedLimit]
    );

    res.json({ verifications: decryptRows(rows, ["summary"]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching class verifications" });
  }
});

app.delete("/api/admin/class-verifications/:class_id", requireAdminSession, async (req, res) => {
  try {
    const { class_id } = req.params;
    const [rows] = await pool.query(
      "SELECT proof_url, start_proof_url, recording_url, verification_status FROM class_attendance_logs WHERE class_id = ?",
      [class_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Verification record not found" });
    }

if (!["verified", "incomplete"].includes(rows[0].verification_status)) {
      return res.status(400).json({ message: "Only verified or incomplete verification records can be removed." });
    }

    await pool.query("DELETE FROM class_attendance_logs WHERE class_id = ?", [class_id]);
    await Promise.all(rows.flatMap((row) => [deleteLocalClassProofImage(row.proof_url), deleteLocalClassProofImage(row.start_proof_url)]));
    await Promise.all(rows.map((row) => deleteClassRecording(row.recording_url)));

    res.json({ message: "Verification record removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error removing verification record" });
  }
});

app.put("/api/admin/class-verifications/:class_id/approve", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { class_id } = req.params;

    await connection.beginTransaction();

    const [classRows] = await connection.query(
      `SELECT c.class_id, c.teacher_id, c.student_id, c.status, c.created_at
       FROM classes c
       WHERE c.class_id = ?
       LIMIT 1
       FOR UPDATE`,
      [class_id]
    );

    if (!classRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    const [result] = await connection.query(
      `UPDATE class_attendance_logs
       SET verification_status = 'verified'
       WHERE class_id = ?`,
      [class_id]
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: "Verification record not found" });
    }

    let updatedPackage = null;
    if (classInfo.status !== "completed") {
      const [packageRows] = await connection.query(
        `SELECT package_id, student_id, total_classes, classes_used, classes_left, status
         FROM student_class_packages
         WHERE student_id = ?
           AND status = 'active'
           AND classes_left > 0
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [classInfo.student_id]
      );

      if (!packageRows.length) {
        await connection.rollback();
        return res.status(400).json({ message: "This student has no classes left to consume." });
      }

      await connection.query(
        `UPDATE classes SET status = 'completed' WHERE class_id = ?`,
        [class_id]
      );

      await connection.query(
        `UPDATE student_class_packages
         SET classes_used = classes_used + 1,
             status = CASE
               WHEN total_classes - (classes_used + 1) <= 0 THEN 'expired'
               ELSE status
             END
         WHERE package_id = ?`,
        [packageRows[0].package_id]
      );

      const [updatedPackageRows] = await connection.query(
        `SELECT package_id, student_id, total_classes, classes_used, classes_left, status
         FROM student_class_packages
         WHERE package_id = ?`,
        [packageRows[0].package_id]
      );
      updatedPackage = updatedPackageRows[0] || null;
    }

    const { package: refreshedPackage, bookedClasses: refreshedBookedClasses, bookableClasses: refreshedBookableClasses } =
      await getStudentPackageAvailability(connection, classInfo.student_id);
    const verification = await getClassVerification(connection, class_id);
    await connection.commit();

    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-verification-changed", {
      class_id: classInfo.class_id,
      verification_status: "verified",
    });
    if (classInfo.status !== "completed") {
      broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-completed", {
        class_id: classInfo.class_id,
        status: "completed",
      });
    }

    res.json({ message: "Class verification approved", verification, package: updatedPackage });
  } catch (err) {
    try {
      await connection.rollback();
    } catch {}
    console.error(err);
    res.status(500).json({ message: "Error approving class verification" });
  } finally {
    connection.release();
  }
});

app.put("/api/admin/class-verifications/:class_id/incomplete", requireAdminSession, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { class_id } = req.params;

    await connection.beginTransaction();

    const [classRows] = await connection.query(
      `SELECT c.class_id, c.teacher_id, c.student_id, c.status, c.created_at,
              COALESCE(cal.verification_status, 'pending') AS current_verification_status
       FROM classes c
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       WHERE c.class_id = ?
       LIMIT 1
       FOR UPDATE`,
      [class_id]
    );

    if (!classRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    const [result] = await connection.query(
      `UPDATE class_attendance_logs
       SET verification_status = 'incomplete'
       WHERE class_id = ?`,
      [class_id]
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: "Verification record not found" });
    }

    if (classInfo.status === "completed" && classInfo.current_verification_status !== "incomplete") {
      const [packageRows] = await connection.query(
        `SELECT package_id
         FROM student_class_packages
         WHERE student_id = ?
           AND created_at <= ?
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [classInfo.student_id, classInfo.created_at]
      );

      if (packageRows.length) {
        await connection.query(
          `UPDATE student_class_packages
           SET classes_used = GREATEST(classes_used - 1, 0),
               status = 'active'
           WHERE package_id = ?`,
          [packageRows[0].package_id]
        );
      }

      await connection.query(
        `UPDATE classes SET status = 'no-show' WHERE class_id = ?`,
        [class_id]
      );
    }

    const verification = await getClassVerification(connection, class_id);
    await connection.commit();

    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-verification-changed", {
      class_id: classInfo.class_id,
      verification_status: "incomplete",
    });

    res.json({
      message: "Class verification marked incomplete",
      verification,
      package: refreshedPackage
        ? {
            ...refreshedPackage,
            booked_classes: refreshedBookedClasses,
            bookable_classes: refreshedBookableClasses,
          }
        : null,
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch {}
    console.error(err);
    res.status(500).json({ message: "Error marking class verification incomplete" });
  } finally {
    connection.release();
  }
});

app.delete("/api/admin/class-verifications", requireAdminSession, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT proof_url, start_proof_url, recording_url
       FROM class_attendance_logs
       WHERE verification_status IN ('verified', 'incomplete')
         AND (
           (start_proof_url IS NOT NULL AND start_proof_url <> '')
           OR (proof_url IS NOT NULL AND proof_url <> '')
           OR (recording_url IS NOT NULL AND recording_url <> '')
         )`
    );

const [result] = await pool.query(
      "DELETE FROM class_attendance_logs WHERE verification_status IN ('verified', 'incomplete')"
    );

    await Promise.all(rows.flatMap((row) => [deleteLocalClassProofImage(row.proof_url), deleteLocalClassProofImage(row.start_proof_url)]));
    await Promise.all(rows.map((row) => deleteClassRecording(row.recording_url)));
    res.json({ message: "Final verification records cleared", removed: result.affectedRows || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error clearing verification records" });
  }
});

app.get("/api/student/:student_id/class-history", requireSession, async (req, res) => {
  try {
    const { student_id } = req.params;
    if (!(await sessionMayReadStudent(req, student_id))) {
      return res.status(403).json({ message: "You can only view your own records." });
    }
    const parsedLimit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

    const [rows] = await pool.query(
      `SELECT c.class_id,
              c.class_name,
              c.status AS class_status,
              DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
              c.duration,
              cal.teacher_started_at,
              cal.student_joined_at,
              cal.teacher_ended_at,
              cal.duration_minutes,
              cal.proof_url,
              cal.start_proof_url, cal.start_proof_uploaded_at, cal.end_proof_uploaded_at,
              cal.evidence_mode, cal.recording_duration_seconds, cal.review_reason,
              cal.recording_url,
              cal.recording_uploaded_at,
              cal.recording_expires_at,
              cal.summary,
              COALESCE(cal.verification_status, 'pending') AS verification_status,
              tea.user_id AS teacher_id,
              tea.first_name AS teacher_first_name,
              tea.last_name AS teacher_last_name,
              tea.email AS teacher_email
       FROM classes c
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE c.student_id = ?
         AND (
           cal.log_id IS NOT NULL
           OR c.status IN ('completed', 'no-show')
           OR TIMESTAMP(c.scheduled_date, COALESCE(c.start_time, '00:00:00')) <= NOW()
         )
       ORDER BY c.scheduled_date DESC, c.start_time DESC, c.class_id DESC
       LIMIT ?`,
      [student_id, parsedLimit]
    );

    res.json({ history: decryptRows(rows, ["summary"]) });
  } catch (err) {
    console.error("GET /api/student/:student_id/class-history error:", err);
    res.status(500).json({ message: "Error fetching class history" });
  }
});

app.get("/api/teacher/:teacher_id/class-history", requireSession, async (req, res) => {
  try {
    const { teacher_id } = req.params;
    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only view your own students' data." });
    }
    const parsedLimit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

    const [rows] = await pool.query(
      `SELECT c.class_id,
              c.class_name,
              c.status AS class_status,
              DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
              c.duration,
              cal.teacher_started_at,
              cal.student_joined_at,
              cal.teacher_ended_at,
              cal.duration_minutes,
              cal.proof_url,
              cal.start_proof_url, cal.start_proof_uploaded_at, cal.end_proof_uploaded_at,
              cal.evidence_mode, cal.recording_duration_seconds, cal.review_reason,
              cal.recording_url,
              cal.recording_uploaded_at,
              cal.recording_expires_at,
              cal.summary,
              COALESCE(cal.verification_status, 'pending') AS verification_status,
              stu.user_id AS student_id,
              stu.first_name AS student_first_name,
              stu.last_name AS student_last_name,
              stu.email AS student_email
       FROM classes c
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       WHERE c.teacher_id = ?
         AND (
           cal.log_id IS NOT NULL
           OR c.status IN ('completed', 'no-show')
           OR TIMESTAMP(c.scheduled_date, COALESCE(c.start_time, '00:00:00')) <= NOW()
         )
       ORDER BY c.scheduled_date DESC, c.start_time DESC, c.class_id DESC
       LIMIT ?`,
      [teacher_id, parsedLimit]
    );

    res.json({ history: decryptRows(rows, ["summary"]) });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/class-history error:", err);
    res.status(500).json({ message: "Error fetching class history" });
  }
});

// Create a new class
app.post("/api/calendar/class", requireSession, requireClassBookingScope(), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, class_link } = req.body;
    const hasRequestedDuration = duration !== undefined && duration !== null && String(duration).trim() !== "";
    const normalizedDuration = normalizeClassDuration(duration);

    if (!class_name || !teacher_id || !student_id || !scheduled_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await autoMarkPastClassesAsNoShow(pool);
    await connection.beginTransaction();

    const [participantRows] = await connection.query(
      `SELECT user_id, role, status, profile_completed
       FROM users
       WHERE user_id IN (?, ?)`,
      [teacher_id, student_id]
    );
    const teacherReady = participantRows.some((user) =>
      Number(user.user_id) === Number(teacher_id) &&
      user.role === "teacher" &&
      user.status === "active" &&
      Boolean(user.profile_completed)
    );
    const studentReady = participantRows.some((user) =>
      Number(user.user_id) === Number(student_id) &&
      user.role === "student" &&
      user.status === "active" &&
      Boolean(user.profile_completed)
    );

    if (!teacherReady || !studentReady) {
      await connection.rollback();
      return res.status(400).json({ message: "Teacher and student accounts must be active and complete before booking a class." });
    }

    const [packageRows] = await connection.query(
      `SELECT package_id, total_classes, classes_used, classes_left, class_duration, created_at
       FROM student_class_packages
       WHERE student_id = ? AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [student_id]
    );

    if (!packageRows.length) {
      await connection.rollback();
      return res.status(400).json({ message: "This student has no active contract. Please contact the admin for a new contract." });
    }

    const [scheduledRows] = await connection.query(
      `SELECT COUNT(*) AS booked_count
       FROM classes
       WHERE student_id = ?
         AND status = 'scheduled'
         AND scheduled_date >= CURDATE()
         AND NOT EXISTS (
           SELECT 1 FROM class_attendance_logs cal
           WHERE cal.class_id = classes.class_id
             AND cal.verification_status = 'incomplete'
         )
         AND created_at >= ?`,
      [student_id, packageRows[0].created_at]
    );

    const bookedClasses = Number(scheduledRows[0]?.booked_count || 0);
    const totalClasses = Number(packageRows[0].total_classes || 0);
    const classesLeft = Number(packageRows[0].classes_left ?? Math.max(0, totalClasses - Number(packageRows[0].classes_used || 0)));
    const remainingBookableClasses = Math.max(0, classesLeft - bookedClasses);
    if (remainingBookableClasses <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: "This student has reached the maximum number of classes in the active contract. Please contact the admin for a new contract." });
    }

    const packageDuration = normalizeClassDuration(packageRows[0].class_duration);
    const classDuration = packageDuration;
    if (hasRequestedDuration && normalizedDuration !== packageDuration) {
      await connection.rollback();
      return res.status(400).json({ message: "Class duration must match the active package duration." });
    }

    const classRange = getRangeMinutes(start_time, classDuration);
    if (!classRange) {
      await connection.rollback();
      return res.status(400).json({ message: "Invalid class duration or start time." });
    }
    const computedEndTime = minutesToTimeKey(classRange.end);

    const [availabilityRows] = await connection.query(
      `SELECT status,
              TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
              TIME_FORMAT(break_start, '%H:%i:%s') AS break_start,
              TIME_FORMAT(break_end, '%H:%i:%s') AS break_end
       FROM teacher_availability
       WHERE teacher_id = ? AND available_date = ?
       LIMIT 1`,
      [teacher_id, scheduled_date]
    );

    const availabilityRecord = availabilityRows[0];
    if (!availabilityRecord || availabilityRecord.status !== "available") {
      await connection.rollback();
      return res.status(400).json({ message: "Teacher is not available on the selected date" });
    }

    if (availabilityRecord.start_time && availabilityRecord.end_time) {
      const startMinutes = timeToMinutes(availabilityRecord.start_time);
      const endMinutes = timeToMinutes(availabilityRecord.end_time);
      if (startMinutes == null || endMinutes == null || classRange.start < startMinutes || classRange.end > endMinutes) {
        await connection.rollback();
        return res.status(400).json({ message: "Selected time is outside the teacher's availability window" });
      }
    }

    if (availabilityRecord.break_start && availabilityRecord.break_end) {
      const breakStartMinutes = timeToMinutes(availabilityRecord.break_start);
      const breakEndMinutes = timeToMinutes(availabilityRecord.break_end);
      if (breakStartMinutes != null && breakEndMinutes != null && rangesOverlap(classRange.start, classRange.end, breakStartMinutes, breakEndMinutes)) {
        await connection.rollback();
        return res.status(400).json({ message: "Selected time conflicts with the teacher's break" });
      }
    }

    const [conflictRows] = await connection.query(
      `SELECT class_id, teacher_id, student_id, start_time, end_time, duration
       FROM classes
       WHERE status = 'scheduled'
         AND scheduled_date = ?
         AND (teacher_id = ? OR student_id = ?)`,
      [scheduled_date, teacher_id, student_id]
    );

    if (hasClassConflict(conflictRows, classRange.start, classRange.end)) {
      await connection.rollback();
      return res.status(409).json({ message: `That time overlaps with an existing class or its ${CLASS_BREAK_BUFFER_MINUTES}-minute teacher break.` });
    }

    let classLinkToSave = class_link?.trim();
    if (!classLinkToSave) {
      classLinkToSave = generateJitsiMeetingLink({
        className: class_name,
        scheduledDate: scheduled_date,
        startTime: start_time,
        teacherId: teacher_id,
        studentId: student_id,
      });
    }

    const [result] = await connection.query(
      `INSERT INTO classes (class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, class_link, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [class_name, teacher_id, student_id, scheduled_date, start_time, computedEndTime, classDuration, encryptNullableText(classLinkToSave)]
    );

    await connection.query(
      `INSERT INTO video_sessions (class_id, teacher_id, student_id, teams_meeting_link)
       VALUES (?, ?, ?, ?)`,
      [result.insertId, teacher_id, student_id, encryptNullableText(classLinkToSave)]
    );

    const { package: updatedPackage, bookedClasses: updatedBookedClasses, bookableClasses: updatedBookableClasses } =
      await getStudentPackageAvailability(connection, student_id);

    const [studentRows] = await connection.query(
      `SELECT first_name, last_name FROM users WHERE user_id = ?`,
      [student_id]
    );

    const studentName = studentRows.length > 0 ? `${studentRows[0].first_name} ${studentRows[0].last_name}` : "A student";
    const notificationMessage = `${studentName} booked "${class_name}" for ${scheduled_date} at ${start_time}.`;

    await connection.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [teacher_id, "general", encryptNullableText("New Class Booked"), encryptNullableText(notificationMessage), result.insertId, "class"]
    );

    await connection.commit();
    broadcastCalendarChange([teacher_id, student_id], "class-booked", {
      class_id: result.insertId,
      teacher_id,
      student_id,
      scheduled_date,
      start_time,
      end_time: computedEndTime,
    });
    res.status(201).json({
      class_id: result.insertId,
      class_link: classLinkToSave,
      message: "Class created successfully",
      package: updatedPackage
        ? {
            ...updatedPackage,
            booked_classes: updatedBookedClasses,
            bookable_classes: updatedBookableClasses,
          }
        : null,
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch {}
    console.error(err);
    res.status(500).json({ message: "Error creating class" });
  } finally {
    connection.release();
  }
});

// Get student class package
app.get("/api/calendar/student-package/:student_id", requireSession, async (req, res) => {
  try {
    if (!(await sessionMayReadStudent(req, req.params.student_id))) {
      return res.status(403).json({ message: "You can only view your own records." });
    }
    const { student_id } = req.params;
    await expireFinishedPackages();

    const { package: packageInfo, latestPackage, bookedClasses, bookableClasses } =
      await getStudentPackageAvailability(pool, student_id);

    if (!packageInfo) {
      // An expired or cancelled contract is still a contract, and the student
      // needs to see that it ran out rather than being told there is nothing
      // here. latest_package is display-only; booking still requires an active
      // package, which is why this is a 404 for anyone who had none at all.
      return res.status(404).json({
        message: latestPackage ? "No active package" : "No package found",
        latest_package: latestPackage,
      });
    }

    res.json({
      package: {
        ...packageInfo,
        booked_classes: bookedClasses,
        bookable_classes: bookableClasses,
      },
      latest_package: latestPackage,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching package" });
  }
});

app.put("/api/calendar/classes/:class_id/complete", requireSession, requireClassAccess(), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { class_id } = req.params;
    const { teacher_id, proficiency_level, assessment_notes } = req.body;

    if (!class_id || !teacher_id) {
      return res.status(400).json({ message: "Missing class_id or teacher_id" });
    }

    await connection.beginTransaction();

    const [classRows] = await connection.query(
      `SELECT c.class_id, c.teacher_id, c.student_id, c.class_name, c.status, c.duration,
              cal.teacher_started_at, cal.student_joined_at, cal.teacher_ended_at,
              cal.duration_minutes, cal.proof_url, cal.recording_url, cal.summary, cal.verification_status
       FROM classes c
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE c.class_id = ?
       FOR UPDATE`,
      [class_id]
    );

    if (!classRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    if (String(classInfo.teacher_id) !== String(teacher_id)) {
      await connection.rollback();
      return res.status(403).json({ message: "Only the assigned teacher can confirm this class" });
    }

    if (classInfo.status === "completed") {
      await connection.rollback();
      return res.status(409).json({ message: "This class has already been marked as done" });
    }

    if (classInfo.status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({ message: "Cancelled classes cannot be marked as done" });
    }

    const requiredMinutes = getRequiredClassMinutes(classInfo.duration);
    const hasEvidence = classInfo.proof_url || classInfo.recording_url || classInfo.summary;
    if (
      classInfo.verification_status !== "verified" ||
      !classInfo.teacher_started_at ||
      !classInfo.student_joined_at ||
      !classInfo.teacher_ended_at ||
      Number(classInfo.duration_minutes || 0) < requiredMinutes ||
      !hasEvidence
    ) {
      await connection.rollback();
      return res.status(400).json({
        message: `Class must be verified before it can be marked as done. Required: teacher start, student attendance, teacher end, at least ${requiredMinutes} minute(s), and recording, screenshot, or summary evidence.`,
      });
    }

    const [packageRows] = await connection.query(
      `SELECT package_id, student_id, total_classes, classes_used, classes_left, status
       FROM student_class_packages
       WHERE student_id = ? AND status = 'active'
       FOR UPDATE`,
      [classInfo.student_id]
    );

    if (!packageRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "No active package found for this student" });
    }

    const currentPackage = packageRows[0];
    if (Number(currentPackage.classes_left) <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: "This student has no classes left" });
    }

    const isFinalClass = Number(currentPackage.classes_left) === 1;
    const normalizedAssessmentLevel = normalizeProficiencyLevel(proficiency_level);
    if (isFinalClass && !normalizedAssessmentLevel) {
      await connection.rollback();
      return res.status(400).json({ message: "A proficiency level is required for the student's final class assessment" });
    }

    await connection.query(
      `UPDATE classes SET status = 'completed' WHERE class_id = ?`,
      [class_id]
    );

    await connection.query(
      `UPDATE student_class_packages
       SET classes_used = classes_used + 1,
           status = CASE
             WHEN total_classes - (classes_used + 1) <= 0 THEN 'expired'
             ELSE status
           END
       WHERE package_id = ?`,
      [currentPackage.package_id]
    );

    const [updatedPackageRows] = await connection.query(
      `SELECT package_id, student_id, total_classes, classes_used, classes_left, status
       FROM student_class_packages
       WHERE package_id = ?`,
      [currentPackage.package_id]
    );

    if (isFinalClass) {
      await connection.query(
        `UPDATE student_profiles
         SET proficiency_level = ?
         WHERE user_id = ?`,
        [normalizedAssessmentLevel, classInfo.student_id]
      );

      const trimmedAssessmentNotes = String(assessment_notes || "").trim();
      if (trimmedAssessmentNotes) {
        const [trialRows] = await connection.query(
          `SELECT trial_notes
           FROM student_profiles
           WHERE user_id = ?
           LIMIT 1
           FOR UPDATE`,
          [classInfo.student_id]
        );

        const currentTrialNotes = decryptNullableText(trialRows[0]?.trial_notes || null);
        const finalAssessmentNotes = [
          currentTrialNotes || "",
          `Final assessment (${formatProficiencyLevel(normalizedAssessmentLevel)}):`,
          trimmedAssessmentNotes,
        ]
          .filter((part) => String(part).trim())
          .join("\n\n");

        await connection.query(
          `UPDATE student_profiles
           SET trial_notes = ?
           WHERE user_id = ?`,
          [encryptNullableText(finalAssessmentNotes || null), classInfo.student_id]
        );
      }
    }

    await connection.commit();

    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-completed", {
      class_id: classInfo.class_id,
      status: "completed",
    });

    res.json({
      message: "Class marked as done",
      class: {
        class_id: classInfo.class_id,
        status: "completed",
      },
      package: updatedPackageRows[0],
      assessment_updated: isFinalClass,
      proficiency_level: isFinalClass ? normalizedAssessmentLevel : null,
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Error marking class as done" });
  } finally {
    connection.release();
  }
});

app.put("/api/calendar/classes/:class_id/no-show", requireSession, requireClassAccess(), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { class_id } = req.params;
    const { teacher_id } = req.body;

    if (!class_id || !teacher_id) {
      return res.status(400).json({ message: "Missing class_id or teacher_id" });
    }

    await connection.beginTransaction();

    const [classRows] = await connection.query(
      `SELECT c.class_id, c.teacher_id, c.student_id, c.class_name, c.status
       FROM classes c
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE c.class_id = ?
       FOR UPDATE`,
      [class_id]
    );

    if (!classRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classRows[0];
    if (String(classInfo.teacher_id) !== String(teacher_id)) {
      await connection.rollback();
      return res.status(403).json({ message: "Only the assigned teacher can mark this class as no-show" });
    }

    if (classInfo.status === "completed") {
      await connection.rollback();
      return res.status(409).json({ message: "This class has already been marked as done" });
    }

    if (classInfo.status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({ message: "Cancelled classes cannot be marked as no-show" });
    }

    if (classInfo.status === "no-show") {
      await connection.rollback();
      return res.status(409).json({ message: "This class has already been marked as no-show" });
    }

    await connection.query(
      `UPDATE classes SET status = 'no-show' WHERE class_id = ?`,
      [class_id]
    );

    const { package: updatedPackage, bookedClasses: updatedBookedClasses, bookableClasses: updatedBookableClasses } =
      await getStudentPackageAvailability(connection, classInfo.student_id);

    await connection.commit();

    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-no-show", {
      class_id: classInfo.class_id,
      status: "no-show",
    });

    res.json({
      message: "Class marked as no-show",
      class: {
        class_id: classInfo.class_id,
        status: "no-show",
      },
      package: updatedPackage
        ? {
            ...updatedPackage,
            booked_classes: updatedBookedClasses,
            bookable_classes: updatedBookableClasses,
          }
        : null,
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Error marking class as no-show" });
  } finally {
    connection.release();
  }
});

// Request class reschedule
app.post("/api/calendar/reschedule-request", requireSession, requireBodyIdentity("requested_by_id"), async (req, res) => {
  try {
    const { class_id, requested_by_id, requested_date, requested_time, reason } = req.body;
    const requestedDateKey = normalizeDateKey(requested_date);
    const requestedTimeKey = normalizeTimeKey(requested_time);
    const requestedTimeForDb = requestedTimeKey ? `${requestedTimeKey}:00` : "";

    if (!class_id || !requested_by_id || !requestedDateKey || !requestedTimeKey) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Get class details to determine recipient
    const [classRows] = await pool.query(
      `SELECT c.*,
              tea.timezone AS teacher_timezone,
              stu.timezone AS student_timezone,
              ru.first_name AS requester_first,
              ru.last_name AS requester_last,
              cal.teacher_started_at AS class_started_at
       FROM classes c
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users ru ON ru.user_id = ?
        AND ru.status = 'active' AND (ru.role = 'admin' OR ru.profile_completed = TRUE)
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       WHERE c.class_id = ? AND (c.teacher_id = ? OR c.student_id = ?)`,
      [requested_by_id, class_id, requested_by_id, requested_by_id]
    );

    if (!classRows.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const classData = classRows[0];

    // A class the teacher has already started is not one that can be moved, so
    // neither side can ask for a reschedule for it any more.
    if (isRescheduleClosedByStart(classData.class_started_at)) {
      return res.status(409).json({ message: RESCHEDULE_CLOSED_AFTER_START_MESSAGE });
    }

    const classDuration = parseInt(classData.duration, 10) || DEFAULT_CLASS_DURATION;
    const requestedRange = getRangeMinutes(requestedTimeKey, classDuration);
    if (!requestedRange) {
      return res.status(400).json({ message: "Invalid requested time" });
    }

    const [availabilityRows] = await pool.query(
      `SELECT status,
              TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
              TIME_FORMAT(break_start, '%H:%i:%s') AS break_start,
              TIME_FORMAT(break_end, '%H:%i:%s') AS break_end
       FROM teacher_availability
       WHERE teacher_id = ? AND available_date = ?
       LIMIT 1`,
      [classData.teacher_id, requestedDateKey]
    );

    const availabilityRecord = availabilityRows[0];
    if (!availabilityRecord || availabilityRecord.status !== "available") {
      return res.status(400).json({ message: "Teacher is not available on the requested date" });
    }

    if (availabilityRecord.start_time && availabilityRecord.end_time) {
      const startMinutes = timeToMinutes(availabilityRecord.start_time);
      const endMinutes = timeToMinutes(availabilityRecord.end_time);
      if (startMinutes == null || endMinutes == null || requestedRange.start < startMinutes || requestedRange.end > endMinutes) {
        return res.status(400).json({ message: "Requested time is outside the teacher's availability window" });
      }
    }

    if (availabilityRecord.break_start && availabilityRecord.break_end) {
      const breakStartMinutes = timeToMinutes(availabilityRecord.break_start);
      const breakEndMinutes = timeToMinutes(availabilityRecord.break_end);
      if (breakStartMinutes != null && breakEndMinutes != null && rangesOverlap(requestedRange.start, requestedRange.end, breakStartMinutes, breakEndMinutes)) {
        return res.status(400).json({ message: "Requested time conflicts with the teacher's break" });
      }
    }

    const [teacherConflictRows] = await pool.query(
      `SELECT class_id, teacher_id, student_id, start_time, end_time, duration
       FROM classes
       WHERE class_id <> ?
         AND scheduled_date = ?
         AND status = 'scheduled'
         AND (teacher_id = ? OR student_id = ?)`,
      [class_id, requestedDateKey, classData.teacher_id, classData.student_id]
    );

    if (hasClassConflict(teacherConflictRows, requestedRange.start, requestedRange.end, class_id)) {
      return res.status(409).json({ message: `This time slot overlaps with another booked class or its ${CLASS_BREAK_BUFFER_MINUTES}-minute teacher break.` });
    }

    // Determine recipient: if student requested, notify teacher; if teacher requested, notify student
    const recipientId = classData.student_id === requested_by_id ? classData.teacher_id : classData.student_id;
    const requesterUser = await pool.query(
      `SELECT first_name, last_name FROM users WHERE user_id = ?`,
      [requested_by_id]
    );
    const requesterName = requesterUser[0].length > 0 ? `${requesterUser[0][0].first_name} ${requesterUser[0][0].last_name}` : "User";

    // Create reschedule request
    const [result] = await pool.query(
      `INSERT INTO reschedule_requests (class_id, requested_by_id, requested_date, requested_time, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [class_id, requested_by_id, requestedDateKey, requestedTimeForDb, encryptNullableText(reason || null)]
    );

    // Create notification for the counterparty
    const reasonText = formatNotificationReason(reason);
    const notificationMessage = [
      `Reschedule request from ${requesterName} for "${classData.class_name}" to ${requestedDateKey} at ${requestedTimeKey}`,
      reasonText ? `Reason: ${reasonText}` : "",
    ].filter(Boolean).join("\n");
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [recipientId, "reschedule", encryptNullableText("Reschedule Request"), encryptNullableText(notificationMessage), result.insertId, "reschedule_request"]
    );

    res.status(201).json({ id: result.insertId, message: "Reschedule request sent and notification created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating reschedule request" });
  }
});

// Get booked dates and times for a user (teacher or student)
app.get("/api/calendar/booked-dates/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;
    await autoMarkPastClassesAsNoShow(pool);
    const [bookedDates] = await pool.query(
      `SELECT DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
              c.duration,
              (SELECT cal.verification_status FROM class_attendance_logs cal
               WHERE cal.class_id = c.class_id LIMIT 1) AS verification_status,
              c.teacher_id,
              c.student_id,
              tea.timezone AS teacher_timezone,
              stu.timezone AS student_timezone
       FROM classes c
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       WHERE (teacher_id = ? OR student_id = ?)
       AND c.status = 'scheduled'
       AND c.scheduled_date >= CURDATE()
       ORDER BY c.scheduled_date ASC, c.start_time ASC`,
      [user_id, user_id]
    );

    res.json({ bookedDates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching booked dates" });
  }
});

// Get reschedule requests for a user (that they need to approve/reject)
app.get("/api/calendar/my-reschedule-requests/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;
    const [requests] = await pool.query(
      `SELECT rr.*, c.class_id, c.class_name,
              DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              TIME_FORMAT(c.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(c.end_time, '%H:%i:%s') AS end_time,
              c.duration,
              req.first_name AS requester_first, req.last_name AS requester_last,
              stu.first_name AS student_first, stu.last_name AS student_last,
              stu.timezone AS student_timezone,
              tea.first_name AS teacher_first, tea.last_name AS teacher_last,
              tea.timezone AS teacher_timezone
       FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       JOIN users req ON rr.requested_by_id = req.user_id
        AND req.status = 'active' AND (req.role = 'admin' OR req.profile_completed = TRUE)
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE (c.teacher_id = ? OR c.student_id = ?)
       AND rr.requested_by_id != ?
       AND rr.status = 'pending'
       ORDER BY rr.requested_at DESC`,
      [user_id, user_id, user_id]
    );

    res.json({ requests: decryptRows(requests, ["reason", "decline_reason"]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching reschedule requests" });
  }
});

// Approve a reschedule request (from user, not just admin)
app.post("/api/calendar/reschedule-requests/:id/approve", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.body?.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { id } = req.params;
    const { user_id } = req.body;

    // Verify user is authorized (teacher or student of the class)
    const [authCheck] = await pool.query(
      `SELECT rr.* FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE rr.request_id = ? AND (c.teacher_id = ? OR c.student_id = ?)`,
      [id, user_id, user_id]
    );

    if (!authCheck.length) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Get reschedule request details
    const [rescheduleData] = await pool.query(
      `SELECT class_id, requested_date, requested_time FROM reschedule_requests WHERE request_id = ?`,
      [id]
    );

    if (!rescheduleData.length) {
      return res.status(404).json({ message: "Reschedule request not found" });
    }

    const { class_id, requested_date, requested_time } = rescheduleData[0];

    // Get current class end_time to calculate duration
    const [classData] = await pool.query(
      `SELECT c.teacher_id,
              c.student_id,
              DATE_FORMAT(c.scheduled_date, '%Y-%m-%d') AS scheduled_date,
              c.start_time,
              c.end_time,
              c.duration,
              cal.teacher_started_at AS class_started_at
       FROM classes c
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       LEFT JOIN class_attendance_logs cal ON cal.class_id = c.class_id
       WHERE c.class_id = ?`,
      [class_id]
    );

    if (!classData.length) {
      return res.status(404).json({ message: "Class not found" });
    }

    const classInfo = classData[0];

    // The class has already been held, so moving it now would rewrite a class
    // that already happened. The request stays pending and the other side can
    // still decline it.
    if (isRescheduleClosedByStart(classInfo.class_started_at)) {
      return res.status(409).json({ message: RESCHEDULE_CLOSED_AFTER_START_MESSAGE });
    }

    const previousDate = normalizeDateKey(classInfo.scheduled_date);
    const previousTime = normalizeTimeKey(classInfo.start_time);
    const classDuration = parseInt(classInfo.duration, 10) || DEFAULT_CLASS_DURATION;
    const requestedRange = getRangeMinutes(requested_time, classDuration);
    if (!requestedRange) {
      return res.status(400).json({ message: "Invalid requested time" });
    }

    const [availabilityRows] = await pool.query(
      `SELECT status,
              TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
              TIME_FORMAT(break_start, '%H:%i:%s') AS break_start,
              TIME_FORMAT(break_end, '%H:%i:%s') AS break_end
       FROM teacher_availability
       WHERE teacher_id = ? AND available_date = ?
       LIMIT 1`,
      [classInfo.teacher_id, requested_date]
    );

    const availabilityRecord = availabilityRows[0];
    if (!availabilityRecord || availabilityRecord.status !== "available") {
      return res.status(400).json({ message: "Teacher is not available on the requested date" });
    }

    if (availabilityRecord.start_time && availabilityRecord.end_time) {
      const startMinutes = timeToMinutes(availabilityRecord.start_time);
      const endMinutes = timeToMinutes(availabilityRecord.end_time);
      if (startMinutes == null || endMinutes == null || requestedRange.start < startMinutes || requestedRange.end > endMinutes) {
        return res.status(400).json({ message: "Requested time is outside the teacher's availability window" });
      }
    }

    if (availabilityRecord.break_start && availabilityRecord.break_end) {
      const breakStartMinutes = timeToMinutes(availabilityRecord.break_start);
      const breakEndMinutes = timeToMinutes(availabilityRecord.break_end);
      if (breakStartMinutes != null && breakEndMinutes != null && rangesOverlap(requestedRange.start, requestedRange.end, breakStartMinutes, breakEndMinutes)) {
        return res.status(400).json({ message: "Requested time conflicts with the teacher's break" });
      }
    }

    const [conflictRows] = await pool.query(
      `SELECT class_id, teacher_id, student_id, start_time, end_time, duration
       FROM classes
       WHERE class_id <> ?
         AND scheduled_date = ?
         AND status = 'scheduled'
         AND (teacher_id = ? OR student_id = ?)`,
      [class_id, requested_date, classInfo.teacher_id, classInfo.student_id]
    );

    if (hasClassConflict(conflictRows, requestedRange.start, requestedRange.end, class_id)) {
      return res.status(409).json({ message: `That time overlaps with another booked class or its ${CLASS_BREAK_BUFFER_MINUTES}-minute teacher break.` });
    }

    const newEndTime = minutesToTimeKey(requestedRange.end);

    // Update reschedule request status
    const resolvedAt = new Date();
    await pool.query(
      `UPDATE reschedule_requests SET status = ?, resolved_at = ? WHERE request_id = ?`,
      ["approved", resolvedAt, id]
    );

    // Update class with new date and time
    await pool.query(
      `UPDATE classes SET scheduled_date = ?, start_time = ?, end_time = ? WHERE class_id = ?`,
      [requested_date, requested_time, newEndTime, class_id]
    );

    // Get the requester info for notification
    const [requesterInfo] = await pool.query(
      `SELECT rr.requested_by_id, c.teacher_id, c.student_id, c.class_name 
       FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       WHERE rr.request_id = ?`,
      [id]
    );

    if (requesterInfo.length) {
      const { requested_by_id, teacher_id, student_id, class_name } = requesterInfo[0];
      const otherPartyId = requested_by_id === teacher_id ? student_id : teacher_id;
      
      // Create notification for the requester (they approved the requestor's request)
      const approverName = user_id === teacher_id ? 'Teacher' : 'Student';
      const notificationMessage = `Your reschedule request for "${class_name}" has been approved for ${requested_date} at ${requested_time}`;
      
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [requested_by_id, "reschedule", encryptNullableText("Reschedule Approved"), encryptNullableText(notificationMessage), id, "reschedule_request"]
      );
      
      // Create notification for the other party (to inform them of the change)
      const otherPartyMessage = `${approverName} approved the reschedule request for "${class_name}". New date: ${requested_date} at ${requested_time}`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [otherPartyId, "reschedule", encryptNullableText("Reschedule Approved"), encryptNullableText(otherPartyMessage), id, "reschedule_request"]
      );
    }

    res.json({ 
      message: "Reschedule request approved and calendar updated",
      newDate: requested_date,
      newTime: requested_time,
      newEndTime: newEndTime
    });
    broadcastCalendarChange([classInfo.teacher_id, classInfo.student_id], "class-rescheduled", {
      class_id,
      teacher_id: classInfo.teacher_id,
      student_id: classInfo.student_id,
      previous_date: previousDate,
      previous_time: previousTime,
      scheduled_date: normalizeDateKey(requested_date),
      start_time: normalizeTimeKey(requested_time),
      end_time: newEndTime,
      request_id: id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error approving request" });
  }
});

// Reject a reschedule request (from user, not just admin)
app.post("/api/calendar/reschedule-requests/:id/reject", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.body?.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { id } = req.params;
    const { user_id } = req.body;

    // Declining without a reason leaves the requester guessing, so a reason is
    // mandatory - it is stored on the request and shown back to them.
    const { value: declineReason, error: declineReasonError } = normalizeDeclineReason(req.body?.reason);
    if (declineReasonError) {
      return res.status(400).json({ message: declineReasonError });
    }

    // Verify user is authorized (teacher or student of the class)
    const [authCheck] = await pool.query(
      `SELECT rr.* FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE rr.request_id = ? AND (c.teacher_id = ? OR c.student_id = ?)`,
      [id, user_id, user_id]
    );

    if (!authCheck.length) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const resolvedAt = new Date();
    await pool.query(
      `UPDATE reschedule_requests SET status = ?, resolved_at = ?, decline_reason = ? WHERE request_id = ?`,
      ["declined", resolvedAt, encryptNullableText(declineReason), id]
    );

    // Get the requester info for notification
    const [requesterInfo] = await pool.query(
      `SELECT rr.requested_by_id, c.teacher_id, c.student_id, c.class_name 
       FROM reschedule_requests rr
       JOIN classes c ON rr.class_id = c.class_id
       WHERE rr.request_id = ?`,
      [id]
    );

    if (requesterInfo.length) {
      const { requested_by_id, teacher_id, student_id, class_name } = requesterInfo[0];
      const otherPartyId = requested_by_id === teacher_id ? student_id : teacher_id;

      // Name the person who declined it - "your request was declined" without
      // an explanation of who said so leaves the requester guessing.
      const [declinerRows] = await pool.query(
        `SELECT first_name, last_name FROM users WHERE user_id = ?`,
        [user_id]
      );
      const declinerName = declinerRows.length
        ? `${declinerRows[0].first_name || ""} ${declinerRows[0].last_name || ""}`.trim()
        : "";
      const declinerLabel = declinerName || (user_id === teacher_id ? "Teacher" : "Student");

      // Create notification for the requester, including why it was declined
      const notificationMessage = buildRequesterDeclineMessage(class_name, declineReason, declinerLabel);
      
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [requested_by_id, "reschedule", encryptNullableText("Reschedule Declined"), encryptNullableText(notificationMessage), id, "reschedule_request"]
      );
      
      // Create notification for the other party
      const otherPartyMessage = buildOtherPartyDeclineMessage(class_name, declineReason, declinerLabel);
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [otherPartyId, "reschedule", encryptNullableText("Reschedule Declined"), encryptNullableText(otherPartyMessage), id, "reschedule_request"]
      );
    }

    res.json({ message: "Reschedule request declined", reason: declineReason });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error rejecting request" });
  }
});

// --- admin management of reschedule requests ---
app.get("/api/admin/reschedule-requests", requireAdminSession, async (req, res) => {
  try {
    // optionally filter by status via query param
    const { status } = req.query;
    let query = `SELECT rr.*, c.class_name, c.scheduled_date, c.start_time,
                        req.first_name AS requester_first, req.last_name AS requester_last,
                        stu.first_name AS student_first, stu.last_name AS student_last,
                        tea.first_name AS teacher_first, tea.last_name AS teacher_last
                 FROM reschedule_requests rr
                 JOIN classes c ON rr.class_id = c.class_id
                 JOIN users req ON rr.requested_by_id = req.user_id
                 LEFT JOIN users stu ON c.student_id = stu.user_id
                 LEFT JOIN users tea ON c.teacher_id = tea.user_id`;
    const params = [];
    if (status) {
      query += ` WHERE rr.status = ?`;
      params.push(status);
    }

    const [rows] = await pool.query(query, params);
    res.json({ requests: decryptRows(rows, ["reason", "decline_reason"]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching reschedule requests" });
  }
});

app.delete("/api/admin/reschedule-requests/:id", requireAdminSession, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM reschedule_requests WHERE request_id = ?", [id]);
    res.json({ message: "Request deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting request" });
  }
});

app.delete("/api/admin/reschedule-requests", requireAdminSession, async (req, res) => {
  try {
    await pool.query("DELETE FROM reschedule_requests");
    res.json({ message: "All requests deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting requests" });
  }
});

// NOTE: Admin can no longer approve/reject reschedule requests from here.
// Approval/rejection now happens through user notifications and the dedicated endpoints.

// Submit class remarks
app.post("/api/calendar/remarks", requireSession, async (req, res) => {
  try {
    const { class_id, teacher_id, student_id, remarks, rating } = req.body;

    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only file remarks as yourself." });
    }

    if (!class_id || !teacher_id || !student_id || !remarks) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [visibleClassRows] = await pool.query(
      `SELECT c.class_id
       FROM classes c
       JOIN users stu ON c.student_id = stu.user_id
        AND stu.status = 'active' AND stu.profile_completed = TRUE
       JOIN users tea ON c.teacher_id = tea.user_id
        AND tea.status = 'active' AND tea.profile_completed = TRUE
       WHERE c.class_id = ?
         AND c.teacher_id = ?
         AND c.student_id = ?
       LIMIT 1`,
      [class_id, teacher_id, student_id]
    );

    if (!visibleClassRows.length) {
      return res.status(400).json({ message: "Teacher and student accounts must be active and complete before saving remarks" });
    }

    // Re-submitting revives an archived remark: the teacher is deliberately
    // posting this text again, so it should not stay hidden from the student.
    await pool.query(
      `INSERT INTO class_remarks (class_id, teacher_id, student_id, remarks, rating, status, archived_at)
       VALUES (?, ?, ?, ?, ?, 'active', NULL)
       ON DUPLICATE KEY UPDATE remarks = ?, rating = ?, status = 'active', archived_at = NULL`,
      [class_id, teacher_id, student_id, encryptNullableText(remarks), rating, encryptNullableText(remarks), rating]
    );

    const [classRows] = await pool.query(
      `SELECT class_name, scheduled_date, start_time FROM classes WHERE class_id = ? LIMIT 1`,
      [class_id]
    );
    const className = classRows.length ? classRows[0].class_name : "your class";
    const scheduleDate = classRows.length ? classRows[0].scheduled_date : null;
    const startTime = classRows.length ? classRows[0].start_time : null;

    const formatDate = (dateValue) => {
      if (!dateValue) return null;
      const date = new Date(dateValue);
      return date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    };

    const formatTime = (timeValue) => {
      if (!timeValue) return null;
      const [hour, minute] = timeValue.split(":");
      if (hour == null || minute == null) return timeValue;
      const hourNumber = parseInt(hour, 10);
      const ampm = hourNumber >= 12 ? "PM" : "AM";
      const hour12 = ((hourNumber + 11) % 12) + 1;
      return `${hour12}:${minute}${ampm}`;
    };

    const dateText = scheduleDate ? formatDate(scheduleDate) : null;
    const timeText = startTime ? formatTime(startTime) : null;
    const scheduleText = dateText && timeText ? ` on ${dateText} at ${timeText}` : dateText ? ` on ${dateText}` : timeText ? ` at ${timeText}` : "";

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        student_id,
        "remark",
        encryptNullableText("New teacher remark"),
        encryptNullableText(`Your teacher left a new remark for ${className}${scheduleText}`),
        class_id,
        "class_remarks",
        "/remarks"
      ]
    );

    res.json({ message: "Remarks saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving remarks" });
  }
});

// Get all remarks for a student
app.get("/api/student/:student_id/remarks", requireSession, async (req, res) => {
  try {
    const { student_id } = req.params;
    if (!(await sessionMayReadStudent(req, student_id))) {
      return res.status(403).json({ message: "You can only view your own records." });
    }

    const [rows] = await pool.query(
      `SELECT cr.*, c.class_name, c.scheduled_date, c.start_time, c.end_time,
              t.first_name AS teacher_first, t.last_name AS teacher_last,
              t.profile_image_url AS teacher_profile_image_url
       FROM class_remarks cr
       JOIN classes c ON cr.class_id = c.class_id
       JOIN users t ON cr.teacher_id = t.user_id
       WHERE cr.student_id = ?
         AND cr.status = 'active'
       ORDER BY cr.created_at DESC`,
      [student_id]
    );

    const remarks = rows.map((row) => ({
      remark_id: row.remark_id,
      class_id: row.class_id,
      class_name: row.class_name,
      teacher_name: `${row.teacher_first} ${row.teacher_last}`,
      teacher_profile_image_url: row.teacher_profile_image_url,
      remarks: decryptNullableText(row.remarks),
      rating: row.rating,
      created_at: row.created_at,
      scheduled_date: row.scheduled_date,
      start_time: row.start_time,
      end_time: row.end_time,
    }));

    res.json({ remarks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching student remarks" });
  }
});

// Loads a remark and confirms it belongs to the given teacher. Returns the row
// or null so callers can distinguish "not found / not yours" from a real error.
async function findTeacherOwnedRemark(remarkId, teacherId) {
  const [rows] = await pool.query(
    `SELECT remark_id, status FROM class_remarks WHERE remark_id = ? AND teacher_id = ? LIMIT 1`,
    [remarkId, teacherId]
  );
  return rows.length ? rows[0] : null;
}

// SECURITY NOTE: this app has no session token - it passes teacher_id from the
// client (the same convention as /api/teacher/:id/students). Every mutation
// below re-checks that the remark's teacher_id matches, so a teacher can only
// ever touch their own remarks, but a caller could still spoof the id itself.
// Real authorization needs server-side sessions.

// Get remarks a teacher has written, newest first.
// ?status=active|archived|all (default all) and optional ?student_id=
app.get("/api/teacher/:teacher_id/remarks", requireSession, async (req, res) => {
  try {
    const { teacher_id } = req.params;
    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only view your own students' data." });
    }
    const { status = "all", student_id: studentId } = req.query;

    const clauses = ["cr.teacher_id = ?"];
    const params = [teacher_id];

    if (status === "active" || status === "archived") {
      clauses.push("cr.status = ?");
      params.push(status);
    }

    if (studentId) {
      clauses.push("cr.student_id = ?");
      params.push(studentId);
    }

    const [rows] = await pool.query(
      `SELECT cr.remark_id, cr.class_id, cr.student_id, cr.remarks, cr.rating,
              cr.status, cr.created_at, cr.updated_at, cr.archived_at,
              c.class_name, c.scheduled_date, c.start_time,
              TRIM(CONCAT(COALESCE(stu.first_name, ''), ' ', COALESCE(stu.last_name, ''))) AS student_name,
              stu.profile_image_url AS student_profile_image_url
       FROM class_remarks cr
       LEFT JOIN classes c ON cr.class_id = c.class_id
       LEFT JOIN users stu ON cr.student_id = stu.user_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY cr.created_at DESC`,
      params
    );

    const remarks = rows.map((row) => ({
      remark_id: row.remark_id,
      class_id: row.class_id,
      student_id: row.student_id,
      student_name: row.student_name || "Student",
      student_profile_image_url: row.student_profile_image_url,
      class_name: row.class_name,
      scheduled_date: row.scheduled_date,
      start_time: row.start_time,
      remarks: decryptNullableText(row.remarks),
      rating: row.rating,
      status: row.status || "active",
      created_at: row.created_at,
      updated_at: row.updated_at,
      archived_at: row.archived_at,
      // updated_at is ON UPDATE CURRENT_TIMESTAMP; a real edit moves it past
      // created_at. 1s tolerance absorbs sub-second rounding on MySQL.
      was_edited: Boolean(
        row.updated_at &&
        row.created_at &&
        new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 1000
      ),
    }));

    res.json({ remarks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching teacher remarks" });
  }
});

// Edit the text of a remark the teacher owns
app.patch("/api/teacher/remarks/:remark_id", requireSession, async (req, res) => {
  try {
    const { remark_id } = req.params;
    const { teacher_id, remarks } = req.body;

    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only edit your own remarks." });
    }

    if (!teacher_id) {
      return res.status(400).json({ message: "Missing teacher id" });
    }

    const text = String(remarks ?? "").trim();
    if (!text) {
      return res.status(400).json({ message: "Remark text cannot be empty." });
    }

    const existing = await findTeacherOwnedRemark(remark_id, teacher_id);
    if (!existing) {
      return res.status(404).json({ message: "Remark not found." });
    }

    if (existing.status === "archived") {
      return res.status(400).json({ message: "Restore the remark before editing it." });
    }

    await pool.query(
      `UPDATE class_remarks SET remarks = ? WHERE remark_id = ? AND teacher_id = ?`,
      [encryptNullableText(text), remark_id, teacher_id]
    );

    res.json({ message: "Remark updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating remark" });
  }
});

// Soft-delete: hides the remark from the student but keeps it restorable
app.patch("/api/teacher/remarks/:remark_id/archive", requireSession, async (req, res) => {
  try {
    const { remark_id } = req.params;
    const { teacher_id } = req.body;

    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only archive your own remarks." });
    }

    if (!teacher_id) {
      return res.status(400).json({ message: "Missing teacher id" });
    }

    const existing = await findTeacherOwnedRemark(remark_id, teacher_id);
    if (!existing) {
      return res.status(404).json({ message: "Remark not found." });
    }

    if (existing.status === "archived") {
      return res.json({ message: "Remark is already archived." });
    }

    await pool.query(
      `UPDATE class_remarks
       SET status = 'archived', archived_at = CURRENT_TIMESTAMP
       WHERE remark_id = ? AND teacher_id = ?`,
      [remark_id, teacher_id]
    );

    res.json({ message: "Remark archived." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error archiving remark" });
  }
});

// Undo an archive
app.patch("/api/teacher/remarks/:remark_id/restore", requireSession, async (req, res) => {
  try {
    const { remark_id } = req.params;
    const { teacher_id } = req.body;

    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only restore your own remarks." });
    }

    if (!teacher_id) {
      return res.status(400).json({ message: "Missing teacher id" });
    }

    const existing = await findTeacherOwnedRemark(remark_id, teacher_id);
    if (!existing) {
      return res.status(404).json({ message: "Remark not found." });
    }

    if (existing.status !== "archived") {
      return res.json({ message: "Remark is already active." });
    }

    await pool.query(
      `UPDATE class_remarks
       SET status = 'active', archived_at = NULL
       WHERE remark_id = ? AND teacher_id = ?`,
      [remark_id, teacher_id]
    );

    res.json({ message: "Remark restored." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error restoring remark" });
  }
});

// Permanent delete. Guarded so it can only ever remove an already-archived
// remark - an accidental DELETE on an active one would be unrecoverable.
app.delete("/api/teacher/remarks/:remark_id", requireSession, async (req, res) => {
  try {
    const { remark_id } = req.params;
    const { teacher_id } = req.body || {};

    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only delete your own remarks." });
    }

    if (!teacher_id) {
      return res.status(400).json({ message: "Missing teacher id" });
    }

    const existing = await findTeacherOwnedRemark(remark_id, teacher_id);
    if (!existing) {
      return res.status(404).json({ message: "Remark not found." });
    }

    if (existing.status !== "archived") {
      return res.status(400).json({ message: "Archive the remark before deleting it permanently." });
    }

    await pool.query(
      `DELETE FROM class_remarks WHERE remark_id = ? AND teacher_id = ?`,
      [remark_id, teacher_id]
    );

    res.json({ message: "Remark permanently deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting remark" });
  }
});

// Get class remarks
app.get("/api/calendar/remarks/:class_id", requireSession, async (req, res) => {
  try {
    const { class_id } = req.params;

    if (!(await sessionMayReadClassRemarks(req, class_id))) {
      return res.status(403).json({ message: "You can only view remarks for your own classes." });
    }

    const [rows] = await pool.query(
      `SELECT * FROM class_remarks WHERE class_id = ?`,
      [class_id]
    );

    res.json({ remarks: rows.length ? decryptFields(rows[0], ["remarks"]) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching remarks" });
  }
});

// ==================== VIDEO SESSIONS (MS TEAMS) ====================

// Create a video session with Teams meeting link
app.post("/api/video-sessions", requireSession, requireClassAccess(), async (req, res) => {
  try {
    const { class_id, teacher_id, student_id, teams_meeting_link } = req.body;

    if (!teacher_id || !student_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [result] = await pool.query(
      `INSERT INTO video_sessions (class_id, teacher_id, student_id, teams_meeting_link)
       VALUES (?, ?, ?, ?)`,
      [class_id, teacher_id, student_id, encryptNullableText(teams_meeting_link)]
    );

    res.status(201).json({ id: result.insertId, message: "Video session created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating video session" });
  }
});

// Get video session by class ID
app.get("/api/video-sessions/:class_id", requireSession, requireClassAccess(), async (req, res) => {
  try {
    const { class_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM video_sessions WHERE class_id = ?`,
      [class_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No video session found" });
    }

    res.json({ session: decryptFields(rows[0], ["teams_meeting_link"]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching video session" });
  }
});

// Update Teams meeting link for a session
app.put("/api/video-sessions/:session_id", requireSession, requireVideoSessionOwnership(), async (req, res) => {
  try {
    const { session_id } = req.params;
    const { teams_meeting_link, status } = req.body;

    let query = "UPDATE video_sessions SET ";
    const params = [];

    if (teams_meeting_link) {
      query += "teams_meeting_link = ?, ";
      params.push(encryptNullableText(teams_meeting_link));
    }
    if (status) {
      query += "status = ?, ";
      params.push(status);
    }

    query = query.slice(0, -2); // Remove trailing ", "
    query += " WHERE session_id = ?";
    params.push(session_id);

    await pool.query(query, params);

    res.json({ message: "Video session updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating video session" });
  }
});

// Get all video sessions for a user
app.get("/api/video-sessions/user/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM video_sessions 
       WHERE teacher_id = ? OR student_id = ?
       ORDER BY created_at DESC`,
      [user_id, user_id]
    );

    res.json({ sessions: decryptRows(rows, ["teams_meeting_link"]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching video sessions" });
  }
});

// ==================== CHATS ====================

app.get("/api/chats/stream/:user_id", requireSession, async (req, res) => {
  if (!sessionMayActFor(req, req.params.user_id)) {
    return res.status(403).json({ message: "You can only subscribe to your own messages." });
  }
  try {
    const { user_id } = req.params;

    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    addChatStreamClient(user_id, res);

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
        removeChatStreamClient(user_id, res);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeChatStreamClient(user_id, res);
    });
  } catch (err) {
    console.error("GET /api/chats/stream/:user_id error:", err);
    res.status(500).json({ message: "Error opening chat stream" });
  }
});

app.get("/api/chats/unread-count/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS unread_count
       FROM messages
       WHERE recipient_id = ? AND is_read = 0`,
      [user_id]
    );

    res.json({ unreadCount: Number(rows[0]?.unread_count || 0) });
  } catch (err) {
    console.error("GET /api/chats/unread-count/:user_id error:", err);
    res.status(500).json({ message: "Error fetching unread chat count" });
  }
});

app.get("/api/chats/conversations/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;
    const conversations = await getChatConversationsForUser(user_id);
    res.json({ conversations });
  } catch (err) {
    console.error("GET /api/chats/conversations/:user_id error:", err);
    res.status(500).json({ message: "Error fetching chat conversations" });
  }
});

app.get("/api/chats/conversations/:user_id/:other_user_id/messages", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id, other_user_id } = req.params;
    const messages = await getChatThread(user_id, other_user_id);
    res.json({ messages });
  } catch (err) {
    console.error("GET /api/chats/conversations/:user_id/:other_user_id/messages error:", err);
    res.status(500).json({ message: "Error fetching chat messages" });
  }
});

app.put("/api/chats/conversations/:user_id/:other_user_id/read", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id, other_user_id } = req.params;
    const readAt = new Date();
    await pool.query(
      `UPDATE messages
       SET is_read = 1,
           read_at = CURRENT_TIMESTAMP
       WHERE sender_id = ?
         AND recipient_id = ?
         AND is_read = 0`,
      [other_user_id, user_id]
    );

    const [receiptRows] = await pool.query(
      `SELECT MAX(message_id) AS last_read_message_id,
              MAX(read_at) AS read_at
       FROM messages
       WHERE sender_id = ?
         AND recipient_id = ?
         AND is_read = 1`,
      [other_user_id, user_id]
    );

    const readReceipt = {
      reader_id: Number(user_id),
      sender_id: Number(other_user_id),
      recipient_id: Number(user_id),
      last_read_message_id: Number(receiptRows[0]?.last_read_message_id || 0),
      read_at: receiptRows[0]?.read_at || readAt.toISOString(),
    };

    broadcastChatReadReceipt(readReceipt);

    const conversations = await getChatConversationsForUser(user_id);
    res.json({ message: "Conversation marked as read", conversations, readReceipt });
  } catch (err) {
    console.error("PUT /api/chats/conversations/:user_id/:other_user_id/read error:", err);
    res.status(500).json({ message: "Error marking chat conversation as read" });
  }
});

app.post("/api/chats/messages", requireSession, requireBodyIdentity("sender_id"), async (req, res) => {
  try {
    const { sender_id, recipient_id, subject = null, content } = req.body;

    if (!sender_id || !recipient_id || !String(content || "").trim()) {
      return res.status(400).json({ message: "sender_id, recipient_id, and content are required" });
    }

    const [users] = await pool.query(
      `SELECT user_id
       FROM users
       WHERE user_id IN (?, ?)
         AND status = 'active'
         AND (role = 'admin' OR profile_completed = TRUE)`,
      [sender_id, recipient_id]
    );

    if (users.length < 2) {
      return res.status(404).json({ message: "Sender or recipient not found" });
    }

    const [result] = await pool.query(
      `INSERT INTO messages (sender_id, recipient_id, subject, content, is_read, sent_at)
       VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
      [
        sender_id,
        recipient_id,
        encryptNullableText(subject || null),
        encryptNullableText(String(content).trim()),
      ]
    );

    const [rows] = await pool.query(
      `SELECT
          m.message_id,
          m.sender_id,
          m.recipient_id,
          m.subject,
          m.content,
          m.is_read,
          m.sent_at,
          m.read_at,
          s.first_name AS sender_first_name,
          s.last_name AS sender_last_name,
          s.profile_image_url AS sender_profile_image_url,
          r.first_name AS recipient_first_name,
          r.last_name AS recipient_last_name,
          r.profile_image_url AS recipient_profile_image_url
       FROM messages m
       JOIN users s ON s.user_id = m.sender_id
       JOIN users r ON r.user_id = m.recipient_id
       WHERE m.message_id = ?
       LIMIT 1`,
      [result.insertId]
    );

    const message = rows[0]
      ? {
          message_id: rows[0].message_id,
          sender_id: rows[0].sender_id,
          recipient_id: rows[0].recipient_id,
          subject: decryptNullableText(rows[0].subject),
          content: decryptNullableText(rows[0].content),
          is_read: Boolean(rows[0].is_read),
          sent_at: rows[0].sent_at,
          read_at: rows[0].read_at,
          sender_name: `${rows[0].sender_first_name || ""} ${rows[0].sender_last_name || ""}`.trim(),
          recipient_name: `${rows[0].recipient_first_name || ""} ${rows[0].recipient_last_name || ""}`.trim(),
          sender_profile_image_url: rows[0].sender_profile_image_url || null,
          recipient_profile_image_url: rows[0].recipient_profile_image_url || null,
        }
      : null;

    if (message) {
      broadcastChatMessage(message);
    }

    res.status(201).json({ message, messageId: result.insertId });
  } catch (err) {
    console.error("POST /api/chats/messages error:", err);
    res.status(500).json({ message: "Error sending chat message" });
  }
});

// ==================== NOTIFICATIONS (System-wide) ====================

// Get all unread notifications for a user
app.get("/api/notifications/unread/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM notifications 
       WHERE user_id = ? AND is_read = FALSE`,
      [user_id]
    );

    res.json({ unreadCount: rows[0].count || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching unread notifications" });
  }
});

// Get all notifications for a user (paginated)
app.get("/api/notifications/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const type = req.query.type || null; // optional filter by type

    let query = `SELECT * FROM notifications WHERE user_id = ?`;
    const params = [user_id];

    if (type) {
      query += ` AND type = ?`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM notifications WHERE user_id = ?${type ? ` AND type = ?` : ''}`,
      type ? [user_id, type] : [user_id]
    );

    res.json({ 
      notifications: decryptRows(rows, ["title", "message"]), 
      total: countResult[0].total,
      page,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
});

// Create a new notification (system endpoint)
app.post("/api/notifications", requireSession, async (req, res) => {
  try {
    const { user_id, type, title, message, related_id, related_type, action_url } = req.body;

    if (!user_id || !type || !message) {
      return res.status(400).json({ message: "Missing required fields: user_id, type, message" });
    }

    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, type, encryptNullableText(title || null), encryptNullableText(message), related_id || null, related_type || null, action_url || null]
    );

    res.status(201).json({ id: result.insertId, message: "Notification created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating notification" });
  }
});

// Mark notification as read
app.put("/api/notifications/:notification_id/read", requireSession, requireNotificationOwnership(), async (req, res) => {
  try {
    const { notification_id } = req.params;

    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE notification_id = ?`,
      [notification_id]
    );

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error marking notification as read" });
  }
});

// Mark all notifications as read for a user
app.put("/api/users/:user_id/notifications/read-all", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;

    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND is_read = FALSE`,
      [user_id]
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error marking notifications as read" });
  }
});

// Delete a notification
app.delete("/api/notifications/:notification_id", requireSession, requireNotificationOwnership(), async (req, res) => {
  try {
    const { notification_id } = req.params;

    await pool.query(
      `DELETE FROM notifications WHERE notification_id = ?`,
      [notification_id]
    );

    res.json({ message: "Notification deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting notification" });
  }
});

// Delete all notifications for a user
app.delete("/api/notifications/user/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;

    await pool.query(
      `DELETE FROM notifications WHERE user_id = ?`,
      [user_id]
    );

    res.json({ message: "All notifications deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting notifications" });
  }
});

// Get user notification preferences
app.get("/api/notification-preferences/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = ?`,
      [user_id]
    );

    if (!rows.length) {
      // Create default preferences if they don't exist
      await pool.query(
        `INSERT INTO notification_preferences (user_id) VALUES (?)`,
        [user_id]
      );
      const [newRows] = await pool.query(
        `SELECT * FROM notification_preferences WHERE user_id = ?`,
        [user_id]
      );
      return res.json({ preferences: newRows[0] });
    }

    res.json({ preferences: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching preferences" });
  }
});

// Update user notification preferences
app.put("/api/notification-preferences/:user_id", requireSession, async (req, res) => {
  try {
    if (!sessionMayActFor(req, req.params.user_id)) {
      return res.status(403).json({ message: "You can only act on your own account." });
    }
    const { user_id } = req.params;
    const { class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end } = req.body;

    await pool.query(
      `INSERT INTO notification_preferences (user_id, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       class_reminders = ?, assignment_notifications = ?, remark_notifications = ?, reschedule_notifications = ?, enrollment_notifications = ?, email_on_notification = ?, do_not_disturb_start = ?, do_not_disturb_end = ?`,
      [user_id, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end]
    );

    res.json({ message: "Preferences updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating preferences" });
  }
});

// ==================== STUDENT PROFILE ENDPOINTS ====================

// Get student profile with package info
app.get("/api/student/profile/:student_id", requireSession, async (req, res) => {
  try {
    if (!(await sessionMayReadStudent(req, req.params.student_id))) {
      return res.status(403).json({ message: "You can only view your own records." });
    }
    const { student_id } = req.params;
    await autoMarkPastClassesAsNoShow(pool);

    const [profileRows] = await pool.query(
      `SELECT sp.*, u.first_name, u.last_name, u.email,
              ta.first_name as teacher_first, ta.last_name as teacher_last,
              c.course_id, c.course_name, c.description as course_description, c.duration as course_duration
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.user_id
       LEFT JOIN users ta ON sp.assigned_teacher_id = ta.user_id
        AND ta.status = 'active' AND ta.profile_completed = TRUE
       LEFT JOIN courses c ON sp.course_id = c.course_id
       WHERE sp.user_id = ?`,
      [student_id]
    );

    if (!profileRows.length) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    const [packageRows] = await pool.query(
      `SELECT * FROM student_class_packages
        WHERE student_id = ?
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [student_id]
    );

    const profile = profileRows[0];
    const packageInfo = packageRows.length > 0 ? packageRows[0] : null;
    let bookedClasses = 0;
    let bookableClasses = 0;
    if (packageInfo) {
      const [scheduledRows] = await pool.query(
        `SELECT COUNT(*) AS booked_count
         FROM classes
         WHERE student_id = ?
           AND status = 'scheduled'
           AND scheduled_date >= CURDATE()
           AND NOT EXISTS (
             SELECT 1 FROM class_attendance_logs cal
             WHERE cal.class_id = classes.class_id
               AND cal.verification_status = 'incomplete'
           )
           AND created_at >= ?`,
        [student_id, packageInfo.created_at]
      );
      bookedClasses = Number(scheduledRows[0]?.booked_count || 0);
      const totalClasses = Number(packageInfo.total_classes || 0);
      const classesLeft = Number(packageInfo.classes_left ?? Math.max(0, totalClasses - Number(packageInfo.classes_used || 0)));
      bookableClasses = Math.max(0, classesLeft - bookedClasses);
    }

    res.json({
      profile: {
        user_id: profile.user_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        proficiency_level: profile.proficiency_level,
        assigned_teacher_id: profile.assigned_teacher_id,
        teacher_name: profile.teacher_first && profile.teacher_last ? `${profile.teacher_first} ${profile.teacher_last}` : null,
        trial_notes: decryptNullableText(profile.trial_notes),
        course_id: profile.course_id,
        course_name: profile.course_name,
        course_description: profile.course_description,
        course_duration: profile.course_duration
      },
      package: packageInfo ? {
        package_id: packageInfo.package_id,
        total_classes: packageInfo.total_classes,
        classes_used: packageInfo.classes_used,
        classes_left: packageInfo.classes_left,
        booked_classes: bookedClasses,
        bookable_classes: bookableClasses,
        class_duration: packageInfo.class_duration,
        status: packageInfo.status
      } : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching student profile" });
  }
});

app.get("/api/student/assigned-teacher/:student_id", requireSession, async (req, res) => {
  try {
    if (!(await sessionMayReadStudent(req, req.params.student_id))) {
      return res.status(403).json({ message: "You can only view your own records." });
    }
    const { student_id } = req.params;
    const [rows] = await pool.query(
      `SELECT sp.assigned_teacher_id, t.first_name, t.last_name
       FROM student_profiles sp
       JOIN users t ON t.user_id = sp.assigned_teacher_id
       WHERE sp.user_id = ?
         AND t.status = 'active'
         AND t.profile_completed = TRUE
       LIMIT 1`,
      [student_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Assigned teacher not found" });
    }

    res.json({
      assigned_teacher_id: rows[0].assigned_teacher_id ?? null,
      teacher_name: [rows[0].first_name, rows[0].last_name].filter(Boolean).join(" ").trim(),
    });
  } catch (err) {
    console.error("GET /api/student/assigned-teacher/:student_id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all students assigned to a teacher
app.get("/api/teacher/:teacher_id/students", requireSession, async (req, res) => {
  try {
    const { teacher_id } = req.params;
    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only view your own students' data." });
    }

    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.contact_number AS contact,
              u.profile_image_url,
              sp.proficiency_level, sp.assigned_teacher_id, sp.course_id, sp.trial_notes,
              c.course_name,
              scp.package_id,
              scp.total_classes,
              scp.classes_used,
              scp.classes_left,
              scp.class_duration,
              scp.status AS package_status, scp.expires_at
       FROM users u
       JOIN student_profiles sp ON u.user_id = sp.user_id
       LEFT JOIN courses c ON c.course_id = sp.course_id
       LEFT JOIN student_class_packages scp
         ON scp.student_id = u.user_id
        AND scp.package_id = (
          SELECT latest.package_id
          FROM student_class_packages latest
          WHERE latest.student_id = u.user_id
          ORDER BY latest.status = 'active' DESC, latest.created_at DESC, latest.package_id DESC
          LIMIT 1
        )
       WHERE sp.assigned_teacher_id = ?
         AND u.role = 'student'
         AND u.status = 'active'
         AND u.profile_completed = TRUE`,
      [teacher_id]
    );

    const students = rows.map((student) => ({
      user_id: student.user_id,
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      contact: decryptNullableText(student.contact),
      profileImageUrl: student.profile_image_url,
      profile_image_url: student.profile_image_url,
      proficiency_level: student.proficiency_level,
      assigned_teacher_id: student.assigned_teacher_id,
      course_id: student.course_id,
      course_name: student.course_name,
      package_id: student.package_id,
      total_classes: student.total_classes,
      classes_used: student.classes_used,
      classes_left: student.classes_left,
      class_duration: student.class_duration,
      package_status: student.package_status,
      // The teacher sees the same deadline the student does. Without it a teacher
      // can see a student has classes left and has no way to know whether those
      // classes are still bookable.
      expires_at: student.expires_at,
      trial_notes: decryptNullableText(student.trial_notes),
    }));

    res.json({ students });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/students error:", err);
    res.status(500).json({ message: "Error fetching assigned students" });
  }
});

// ==================== ASSIGNMENTS ====================

app.get("/api/teacher/:teacher_id/assignments", requireSession, async (req, res) => {
  try {
    const { teacher_id } = req.params;
    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only view your own students' data." });
    }
    const [rows] = await pool.query(
      `${assignmentSelect}
       WHERE a.teacher_id = ?
       ORDER BY a.created_at DESC, a.assignment_id DESC`,
      [teacher_id]
    );

    res.json({ assignments: decryptRows(rows, ["instructions", "description", "comments", "feedback"]) });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/assignments error:", err);
    res.status(500).json({ message: "Error fetching teacher assignments" });
  }
});

app.get("/api/teacher/:teacher_id/submissions", requireSession, async (req, res) => {
  try {
    const { teacher_id } = req.params;
    if (!sessionMayActFor(req, teacher_id)) {
      return res.status(403).json({ message: "You can only view your own students' data." });
    }
    const [rows] = await pool.query(
      `${submissionSelect}
       WHERE a.teacher_id = ?
       ORDER BY s.submitted_at DESC, s.submission_id DESC`,
      [teacher_id]
    );

    res.json({ submissions: decryptRows(rows, ["comments", "feedback", "assignmentInstructions"]) });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/submissions error:", err);
    res.status(500).json({ message: "Error fetching assignment submissions" });
  }
});

app.get("/api/student/:student_id/assignments", requireSession, async (req, res) => {
  try {
    const { student_id } = req.params;
    if (!(await sessionMayReadStudent(req, student_id))) {
      return res.status(403).json({ message: "You can only view your own records." });
    }
    const [rows] = await pool.query(
      `${assignmentSelect}
       WHERE a.student_id = ?
       ORDER BY a.due_date ASC, a.due_time ASC, a.created_at DESC`,
      [student_id]
    );

    res.json({ assignments: decryptRows(rows, ["instructions", "description", "comments", "feedback"]) });
  } catch (err) {
    console.error("GET /api/student/:student_id/assignments error:", err);
    res.status(500).json({ message: "Error fetching student assignments" });
  }
});

app.get("/api/assignments/:assignment_id", requireSession, async (req, res) => {
  try {
    const { assignment_id } = req.params;

    if (!(await sessionMayReadAssignment(req, assignment_id))) {
      return res.status(403).json({ message: "You can only view your own assignments." });
    }
    const [rows] = await pool.query(
      `${assignmentSelect}
       WHERE a.assignment_id = ?
       LIMIT 1`,
      [assignment_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.json({ assignment: decryptFields(rows[0], ["instructions", "description", "comments", "feedback"]) });
  } catch (err) {
    console.error("GET /api/assignments/:assignment_id error:", err);
    res.status(500).json({ message: "Error fetching assignment" });
  }
});

app.patch("/api/assignments/:assignment_id", requireSession, optionalFileUpload, async (req, res) => {
  const uploadedAttachmentUrl = uploadedFileUrl(req, req.file);
  let attachmentSaved = false;
  try {
    const { assignment_id } = req.params;
    const session = req.session || {};
    const hasInstructions = Object.prototype.hasOwnProperty.call(req.body || {}, "instructions");
    const hasArchiveState = Object.prototype.hasOwnProperty.call(req.body || {}, "isArchived");
    const hasAttachment = Boolean(req.file);

    if (!hasInstructions && !hasArchiveState && !hasAttachment) {
      return res.status(400).json({ message: "Provide assignment instructions, an attachment, or archive state to update." });
    }
    if (hasInstructions && (typeof req.body.instructions !== "string" || !req.body.instructions.trim())) {
      return res.status(400).json({ message: "Assignment instructions cannot be empty." });
    }
    if (hasArchiveState && typeof req.body.isArchived !== "boolean") {
      return res.status(400).json({ message: "Archive state must be true or false." });
    }

    const [assignmentRows] = await pool.query(
      "SELECT teacher_id, attachment_url FROM assignments WHERE assignment_id = ? LIMIT 1",
      [assignment_id]
    );
    const assignment = assignmentRows[0];
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found." });
    }

    const mayManage =
      session.role === "admin" ||
      (session.role === "teacher" && String(assignment.teacher_id) === String(session.userId));
    if (!mayManage) {
      return res.status(403).json({ message: "You can only manage assignments you posted." });
    }

    const updates = [];
    const values = [];
    if (hasInstructions) {
      updates.push("instructions = ?");
      values.push(encryptNullableText(req.body.instructions.trim()));
    }
    if (hasArchiveState) {
      updates.push("is_archived = ?");
      values.push(req.body.isArchived ? 1 : 0);
    }
    if (hasAttachment) {
      updates.push("attachment_url = ?", "attachment_name = ?");
      values.push(uploadedAttachmentUrl, req.file.originalname);
    }

    await pool.query(
      `UPDATE assignments SET ${updates.join(", ")} WHERE assignment_id = ?`,
      [...values, assignment_id]
    );
    attachmentSaved = hasAttachment;
    if (hasAttachment && assignment.attachment_url) {
      removeUploadedFile(assignment.attachment_url);
    }

    const [rows] = await pool.query(
      `${assignmentSelect} WHERE a.assignment_id = ? LIMIT 1`,
      [assignment_id]
    );
    res.json({
      assignment: decryptFields(rows[0], ["instructions", "description", "comments", "feedback"]),
      message: hasArchiveState
        ? (req.body.isArchived ? "Assignment archived." : "Assignment restored.")
        : hasAttachment
          ? "Assignment instructions and attachment updated."
          : "Assignment instructions updated.",
    });
  } catch (err) {
    console.error("PATCH /api/assignments/:assignment_id error:", err);
    res.status(500).json({ message: "Could not update the assignment." });
  } finally {
    if (uploadedAttachmentUrl && !attachmentSaved) {
      removeUploadedFile(uploadedAttachmentUrl);
    }
  }
});

// Mint a short-lived link for opening an assignment attachment in a new tab.
//
// The caller names the file it wants; the database decides whether it gets it.
// Resolving the row first is also what scopes the signed link to one
// assignment, so a leaked link cannot be edited into a different file's.
app.post("/api/assignment-attachments/link", requireSession, async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ message: "A file url is required" });
    }

    const [rows] = await pool.query(
      `SELECT assignment_id, attachment_name
       FROM assignments
       WHERE attachment_url = ?
       LIMIT 1`,
      [url]
    );

    const assignment = rows[0];
    if (!assignment) {
      return res.status(404).json({ message: "That file is no longer available." });
    }
    if (!(await sessionMayReadAssignment(req, assignment.assignment_id))) {
      return res.status(403).json({ message: "You can only open files on your own assignments." });
    }

    res.json(
      fileLinkResponse(req, {
        kind: "assignment",
        id: assignment.assignment_id,
        filename: assignment.attachment_name || "Attachment",
      })
    );
  } catch (err) {
    console.error("POST /api/assignment-attachments/link error:", err);
    res.status(500).json({
      message: "Could not open that file",
      ...(process.env.NODE_ENV !== "production" ? { error: err.message } : {}),
    });
  }
});

// The same, for the work a student sent back. Separate endpoint rather than a
// kind on the assignment one, so neither can be used to probe the other's table.
app.post("/api/submission-files/link", requireSession, async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ message: "A file url is required" });
    }

    const [rows] = await pool.query(
      `SELECT submission_id, file_name
       FROM assignment_submissions
       WHERE file_url = ?
       LIMIT 1`,
      [url]
    );

    const submission = rows[0];
    if (!submission) {
      return res.status(404).json({ message: "That file is no longer available." });
    }
    if (!(await sessionMayReadSubmission(req, submission.submission_id))) {
      return res.status(403).json({ message: "You can only open submitted work on your own assignments." });
    }

    res.json(
      fileLinkResponse(req, {
        kind: "submission",
        id: submission.submission_id,
        // file_name is null for work submitted before this column existed. The
        // stored path still carries the sanitised original as its last segment,
        // which is a better title than "Submission".
        filename: submission.file_name || fileNameFromStoredUrl(url) || "Submission",
      })
    );
  } catch (err) {
    console.error("POST /api/submission-files/link error:", err);
    res.status(500).json({
      message: "Could not open that file",
      ...(process.env.NODE_ENV !== "production" ? { error: err.message } : {}),
    });
  }
});

/** Build the signed link response body shared by both mint endpoints. */
function fileLinkResponse(req, { kind, id, filename }) {
  const token = signFileLink({ kind, id, filename }, { secret: SESSION_SECRET });
  return {
    // The filename is a URL segment so the browser titles the tab with it.
    // It is display only - nothing reads the file from it.
    url: `${req.protocol}://${req.get("host")}/f/${token}/${encodeURIComponent(filename)}`,
    filename,
  };
}

/**
 * Recover a usable name from a stored upload path.
 *
 * The stored filename is <timestamp>-<sanitised original>, so this drops the
 * timestamp prefix and puts the spaces back. Only a fallback for rows with no
 * file_name - underscores are already lost at write time and cannot be
 * distinguished from names the user actually typed with underscores.
 */
function fileNameFromStoredUrl(storedUrl) {
  if (!storedUrl) return "";
  const last = String(storedUrl).split(/[/?#]/).filter(Boolean).pop() || "";
  const trimmed = last.replace(/^\d{10,}-/, "");
  if (!trimmed) return "";
  return trimmed.replace(/_/g, " ");
}

/**
 * Serve one assignment file by signed link, for viewing in a new tab.
 *
 * Deliberately NOT behind requireSession. A tab navigation cannot send an
 * Authorization header - that is the entire reason the rest of the app fetches
 * files and hands over a blob: URL - and a blob: URL's path is a random ID that
 * the PDF viewer shows as the tab title instead of the real filename. The signed
 * link is what stands in for the header here. See fileLink.js for what it does
 * and does not authorise.
 */
app.get("/f/:token/:filename", async (req, res) => {
  const link = verifyFileLink(req.params.token, { secret: SESSION_SECRET });
  if (!link) {
    return res.status(401).json({ message: "This link has expired. Please open the file again." });
  }

  let storedUrl;
  let storedName;
  if (link.kind === "assignment") {
    const [rows] = await pool.query(
      `SELECT attachment_url, attachment_name
       FROM assignments
       WHERE assignment_id = ?
       LIMIT 1`,
      [link.id]
    );
    storedUrl = rows[0]?.attachment_url;
    storedName = rows[0]?.attachment_name;
  } else {
    const [rows] = await pool.query(
      `SELECT file_url, file_name
       FROM assignment_submissions
       WHERE submission_id = ?
       LIMIT 1`,
      [link.id]
    );
    storedUrl = rows[0]?.file_url;
    storedName = rows[0]?.file_name;
  }

  if (!storedUrl) {
    return res.status(404).json({ message: "That file is no longer available." });
  }

  // Resolved from the stored path in the database, never from the :filename
  // segment. The stored value is server-generated, and uploadPathFromStoredUrl
  // refuses anything outside UPLOAD_ROOT, so nothing in the request can steer
  // the read out of uploads.
  const absolute = uploadPathFromStoredUrl(storedUrl);

  if (!absolute || !fs.existsSync(absolute)) {
    return res.status(404).json({ message: "That file is no longer available." });
  }

  // Prefer the database name; the signed copy is only a fallback for rows
  // written before the name column existed.
  const name = storedName || link.fn || "Attachment";
  const ext = path.extname(name).toLowerCase();

  res.setHeader("Content-Type", MIME_BY_EXTENSION[ext] || "application/octet-stream");
  // Both forms of the header: the quoted one for older readers, RFC 5987's for
  // names with spaces or non-ASCII characters, which is the common case here.
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${name.replace(/["\\\r\n]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`
  );
  res.setHeader("Cache-Control", "private, no-store");

  const stream = fs.createReadStream(absolute);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500);
    res.end();
  });
  stream.pipe(res);
});

/**
 * Delete an assignment, and the submitted work attached to it.
 *
 * Not a plain DELETE, per BOOK_DISTRIBUTION.md: "Require an explicit
 * confirmation token." The caller must send the assignment's exact title back,
 * so this cannot be triggered by a URL being visited or a request being
 * replayed - only by a UI that has shown the teacher what is about to go.
 *
 * Irreversible, and it takes the student's submissions with it. That is the
 * documented behaviour (BOOK_DISTRIBUTION.md: a plain DELETE would be the
 * "sharpest edge in the app"), and the UI states the submission count before
 * the teacher commits.
 *
 * The teacher who posted it, or an admin. A student cannot delete their own
 * assignment even though they can read it.
 */
app.delete("/api/assignments/:assignment_id", requireSession, async (req, res) => {
  const conn = await pool.getConnection();
  let transactionStarted = false;
  try {
    const { assignment_id } = req.params;
    const { confirm } = req.body || {};

    const [assignmentRows] = await conn.query(
      `SELECT assignment_id, teacher_id, student_id, title, attachment_url
       FROM assignments
       WHERE assignment_id = ?
       LIMIT 1`,
      [assignment_id]
    );

    const assignment = assignmentRows[0];
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const session = req.session || {};
    const mayDelete =
      session.role === "admin" ||
      String(assignment.teacher_id) === String(session.userId);
    if (!mayDelete) {
      return res.status(403).json({ message: "You can only delete assignments you posted." });
    }

    if (String(confirm || "") !== String(assignment.title)) {
      return res.status(400).json({
        message: "Type the assignment title exactly to confirm deletion.",
      });
    }

    const [submissionRows] = await conn.query(
      `SELECT submission_id, file_url
       FROM assignment_submissions
       WHERE assignment_id = ?`,
      [assignment_id]
    );
    const submissionFiles = submissionRows.map((row) => row.file_url).filter(Boolean);

    await conn.beginTransaction();
    transactionStarted = true;

    // Notifications point at the assignment through related_id, which is not a
    // foreign key, so they have to be removed explicitly or the student keeps
    // a link to something that no longer exists.
    await conn.query(
      `DELETE FROM notifications
       WHERE related_type = 'assignment' AND related_id = ?`,
      [assignment_id]
    );

    await conn.query(
      "DELETE FROM assignment_submissions WHERE assignment_id = ?",
      [assignment_id]
    );

    await conn.query("DELETE FROM assignments WHERE assignment_id = ?", [assignment_id]);

    await conn.commit();
    transactionStarted = false;

    // Only after the rows are gone, so a failure here cannot leave the database
    // pointing at a file that no longer exists.
    removeUploadedFile(assignment.attachment_url);
    submissionFiles.forEach(removeUploadedFile);

    res.json({
      message: "Assignment deleted",
      deletedSubmissions: submissionRows.length,
    });
  } catch (err) {
    if (transactionStarted) await conn.rollback();
    console.error("DELETE /api/assignments/:assignment_id error:", err);
    res.status(500).json({
      message: "Could not delete the assignment",
      ...(process.env.NODE_ENV !== "production" ? { error: err.message } : {}),
    });
  } finally {
    conn.release();
  }
});

app.post("/api/assignments", requireSession, optionalFileUpload, async (req, res) => {
  try {
    const {
      teacherId,
      teacher_id,
      studentId,
      student_id,
      title,
      name,
      instructions,
      due,
      courseId,
      course_id,
      attemptLimit,
      attempt_limit,
      attachmentUrl,
      attachment_url,
      attachmentName,
      attachment_name,
    } = req.body;
    const resolvedTeacherId = teacherId ?? teacher_id;
    const resolvedStudentId = studentId ?? student_id;
    if (!sessionMayActFor(req, resolvedTeacherId)) {
      return res.status(403).json({ message: "You can only create assignments as yourself." });
    }
    const assignmentTitle = (title || name || "").trim();
    const assignmentInstructions = (instructions || "").trim();
    const { dueDate, dueTime } = splitAssignmentDue(due);
    const rawAttemptLimit = attemptLimit ?? attempt_limit ?? null;
    const parsedAttemptLimit =
      rawAttemptLimit === null || rawAttemptLimit === "" ? null : Number(rawAttemptLimit);
    let resolvedCourseId = courseId ?? course_id ?? null;
    // An uploaded worksheet wins over anything in the body: the file is what was
    // actually put in the uploads folder, so trusting a URL sent alongside it
    // would let a caller point an assignment at somebody else's file, or at
    // nothing at all after a successful upload.
    const uploadedAttachmentUrl = uploadedFileUrl(req, req.file);
    const resolvedAttachmentUrl = uploadedAttachmentUrl ?? attachmentUrl ?? attachment_url ?? null;
    const resolvedAttachmentName = (
      uploadedAttachmentUrl ? req.file.originalname : attachmentName ?? attachment_name
    ) || null;

    if (!resolvedTeacherId || !resolvedStudentId || !assignmentTitle || !assignmentInstructions) {
      return res.status(400).json({
        message: "Teacher, student, title, and instructions are required",
      });
    }

    if (isDueDatePast(dueDate, dueTime)) {
      return res.status(400).json({
        message: "Due date must be in the future. Please select a current or future date and time.",
      });
    }

    if (
      parsedAttemptLimit !== null &&
      (!Number.isInteger(parsedAttemptLimit) || parsedAttemptLimit < 1)
    ) {
      return res.status(400).json({
        message: "Attempt limit must be a whole number greater than 0.",
      });
    }

    if (!resolvedCourseId) {
      const [profileRows] = await pool.query(
        "SELECT course_id FROM student_profiles WHERE user_id = ? LIMIT 1",
        [resolvedStudentId]
      );
      resolvedCourseId = profileRows[0]?.course_id ?? null;
    }

    const [result] = await pool.query(
      `INSERT INTO assignments (teacher_id, student_id, course_id, title, instructions, due_date, due_time, attempt_limit, attachment_url, attachment_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedTeacherId,
        resolvedStudentId,
        resolvedCourseId,
        assignmentTitle,
        encryptNullableText(assignmentInstructions),
        dueDate,
        dueTime,
        parsedAttemptLimit,
        resolvedAttachmentUrl,
        resolvedAttachmentName,
      ]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'assignment', 'New Assignment', ?, ?, 'assignment', ?)`,
      [
        resolvedStudentId,
        encryptNullableText(`New assignment posted: "${assignmentTitle}"${dueDate ? ` due ${dueDate}${dueTime ? ` ${dueTime.slice(0, 5)}` : ""}` : ""}.`),
        result.insertId,
        `/assignmentsDropbox?assignmentId=${result.insertId}`,
      ]
    );

    const [rows] = await pool.query(
      `${assignmentSelect}
       WHERE a.assignment_id = ?
       LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json({ assignment: decryptFields(rows[0], ["instructions", "description", "comments", "feedback"]), message: "Assignment created" });
  } catch (err) {
    // Same reasoning as the advisor routes: a bare "Error creating assignment"
    // cannot be told apart from a missing column, a bad request, or a database
    // outage without reading the Railway log. The message is not secret, so it
    // is attached outside production only.
    console.error("POST /api/assignments error:", err);
    res.status(500).json({
      message: "Error creating assignment",
      ...(process.env.NODE_ENV !== "production" ? { error: err.message } : {}),
    });
  }
});

app.post("/api/assignments/:assignment_id/submissions", requireSession, optionalFileUpload, async (req, res) => {
  const conn = await pool.getConnection();
  let transactionStarted = false;
  try {
    const { assignment_id } = req.params;
    const { studentId, student_id, submissionText, comments, fileUrl, file_url } = req.body || {};
    // A student is pinned to their own id; staff keep the ability to record on
    // someone's behalf. Ignores a forged studentId in the body.
    const resolvedStudentId = sessionIdentity(req).studentId ?? studentId ?? student_id;
    const text = (submissionText ?? comments ?? "").trim();
    const uploadedFile = uploadedFileUrl(req, req.file);
    const finalFileUrl = uploadedFile ?? fileUrl ?? file_url ?? null;
    // Only from the upload: a body-supplied URL has no trustworthy name behind
    // it, and inventing one would put a wrong title in the teacher's tab.
    const finalFileName = uploadedFile ? req.file.originalname : null;

    if (!resolvedStudentId || (!text && !finalFileUrl)) {
      return res.status(400).json({ message: "Student and submission text or file are required" });
    }

    await conn.beginTransaction();
    transactionStarted = true;

    const [assignmentRows] = await conn.query(
      `      SELECT assignment_id, teacher_id, student_id, title, due_date, due_time, attempt_limit, is_archived
       FROM assignments
       WHERE assignment_id = ?
       LIMIT 1`,
      [assignment_id]
    );

    if (!assignmentRows.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Assignment not found" });
    }

    const assignment = assignmentRows[0];
    if (String(assignment.student_id) !== String(resolvedStudentId)) {
      await conn.rollback();
      return res.status(403).json({ message: "This assignment is not assigned to the selected student" });
    }

    if (assignment.is_archived) {
      await conn.rollback();
      return res.status(400).json({ message: "This assignment has been archived and can no longer be submitted." });
    }

    if (isDueDatePast(assignment.due_date, assignment.due_time)) {
      await conn.rollback();
      return res.status(400).json({ message: "This assignment is past due and can no longer be submitted." });
    }

    const [existingSubmissionRows] = await conn.query(
      `SELECT submission_id, attempt_count, submission_text, file_url, file_name, submitted_at
       FROM assignment_submissions
       WHERE assignment_id = ? AND student_id = ?
       LIMIT 1
       FOR UPDATE`,
      [assignment_id, resolvedStudentId]
    );
    const attemptsUsed = Number(existingSubmissionRows[0]?.attempt_count || 0);
    const attemptLimit = assignment.attempt_limit === null ? null : Number(assignment.attemptLimit ?? assignment.attempt_limit);

    if (attemptLimit !== null && attemptsUsed >= attemptLimit) {
      await conn.rollback();
      return res.status(400).json({
        message: `Attempt limit reached. This assignment only allows ${attemptLimit} submission${attemptLimit === 1 ? "" : "s"}.`,
      });
    }

    // Archive the current submission into history before it gets overwritten.
    if (existingSubmissionRows.length > 0) {
      const prev = existingSubmissionRows[0];
      await conn.query(
        `INSERT INTO submission_history (assignment_id, student_id, submission_text, file_url, file_name, submitted_at, attempt_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [assignment_id, resolvedStudentId, prev.submission_text, prev.file_url, prev.file_name, prev.submitted_at, prev.attempt_count]
      );
    }

    const [result] = await conn.query(
      `INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_url, file_name)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE submission_text = VALUES(submission_text),
                                file_url = VALUES(file_url),
                                file_name = VALUES(file_name),
                                attempt_count = attempt_count + 1,
                                submitted_at = CURRENT_TIMESTAMP,
                                grade = NULL,
                                feedback = NULL,
                               graded_at = NULL`,
      [assignment_id, resolvedStudentId, encryptNullableText(text || null), finalFileUrl, finalFileName]
    );

    await conn.query(
      `UPDATE assignments SET status = 'submitted' WHERE assignment_id = ?`,
      [assignment_id]
    );

    await conn.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
       VALUES (?, 'assignment', 'Assignment Submitted', ?, ?, 'assignment', ?)`,
      [
        assignment.teacher_id,
        encryptNullableText(`A student submitted "${assignment.title}".`),
        assignment_id,
        `/teacherAssignment`,
      ]
    );

    await conn.commit();
    transactionStarted = false;

    const [rows] = await conn.query(
      `${submissionSelect}
       WHERE s.assignment_id = ? AND s.student_id = ?
       LIMIT 1`,
      [assignment_id, resolvedStudentId]
    );

    res.status(result.insertId ? 201 : 200).json({ submission: decryptFields(rows[0], ["comments", "feedback"]), message: "Assignment submitted" });
  } catch (err) {
    if (transactionStarted) {
      await conn.rollback();
    }
    console.error("POST /api/assignments/:assignment_id/submissions error:", err);
    res.status(500).json({
      message: "Error submitting assignment",
      ...(process.env.NODE_ENV !== "production" ? { error: err.message } : {}),
    });
  } finally {
    conn.release();
  }
});

// Get submission history for an assignment (past attempts when resubmitted).
app.get("/api/assignments/:assignment_id/submission-history", requireSession, async (req, res) => {
  try {
    const { assignment_id } = req.params;

    if (!(await sessionMayReadAssignment(req, assignment_id))) {
      return res.status(403).json({ message: "You can only view your own assignments." });
    }

    const [rows] = await pool.query(
      `SELECT history_id, submission_text, file_url, file_name, submitted_at, attempt_count, created_at
       FROM submission_history
       WHERE assignment_id = ? AND student_id = ?
       ORDER BY created_at DESC`,
      [assignment_id, sessionIdentity(req).studentId]
    );

    res.json({ history: decryptRows(rows, ["submission_text"]) });
  } catch (err) {
    console.error("GET /api/assignments/:assignment_id/submission-history error:", err);
    res.status(500).json({ message: "Error fetching submission history" });
  }
});

// Get latest class for a teacher and student pair
app.get("/api/teacher/:teacher_id/student/:student_id/latest-class", requireSession, async (req, res) => {
  try {
    const { teacher_id, student_id } = req.params;
    if (!sessionMayActFor(req, teacher_id) || !(await sessionMayReadStudent(req, student_id))) {
      return res.status(403).json({ message: "You can only view your own students' data." });
    }
    const [rows] = await pool.query(
      `SELECT class_id, class_name, scheduled_date, start_time, end_time, status
       FROM classes
       WHERE teacher_id = ? AND student_id = ?
       ORDER BY scheduled_date DESC, class_id DESC
       LIMIT 1`,
      [teacher_id, student_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No class found for this student" });
    }

    res.json({ class: rows[0] });
  } catch (err) {
    console.error("GET /api/teacher/:teacher_id/student/:student_id/latest-class error:", err);
    res.status(500).json({ message: "Error fetching latest class" });
  }
});

// Get all courses
app.get("/api/courses", async (req, res) => {
  try {
    const [courses] = await pool.query(
      `SELECT course_id, course_name, description, duration
       FROM courses
       ORDER BY course_name ASC`
    );

    res.json({ courses });
  } catch (err) {
    console.error("GET /api/courses error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/admin/student-profile", requireAdminSession, async (req, res) => {
  try {
    const { user_id, proficiency_level, assigned_teacher_id, course_id, trial_notes } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "user_id is required" });
    }

    // Insert into student_profiles
    await pool.query(
      `INSERT INTO student_profiles (user_id, proficiency_level, assigned_teacher_id, course_id, trial_notes)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, normalizeProficiencyLevel(proficiency_level) || "novice-low", assigned_teacher_id || null, course_id || null, encryptNullableText(trial_notes || null)]
    );

    res.json({ message: "Student profile created successfully" });
  } catch (err) {
    console.error("POST /api/admin/student-profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/student/package/:student_id/use-class", requireSession, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!(await sessionMayReadStudent(req, req.params.student_id))) {
      return res.status(403).json({ message: "You can only view your own records." });
    }
    const { student_id } = req.params;

    await connection.beginTransaction();

    const [packageRows] = await connection.query(
      `SELECT package_id
       FROM student_class_packages
       WHERE student_id = ? AND status = 'active' AND classes_left > 0
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [student_id]
    );

    if (!packageRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "No active package found" });
    }

    const packageId = packageRows[0].package_id;
    await connection.query(
      `UPDATE student_class_packages
       SET classes_used = classes_used + 1,
           status = CASE
             WHEN total_classes - (classes_used + 1) <= 0 THEN 'expired'
             ELSE status
           END
       WHERE package_id = ?`,
      [packageId]
    );

    const [updatedPackageRows] = await connection.query(
      `SELECT * FROM student_class_packages WHERE package_id = ?`,
      [packageId]
    );

    await connection.commit();
    res.json({ message: "Class usage recorded", package: updatedPackageRows[0] });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Error updating package" });
  } finally {
    connection.release();
  }
});

// Get teacher availability records for a specific month
app.get("/api/calendar/teacher-availability-records", requireSession, requireTeacherAvailabilityScope(), async (req, res) => {
  try {
    const { teacher_id, year, month } = req.query;

    if (!teacher_id || !year || !month) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    await deletePastTeacherAvailability(teacher_id);

    const monthIndex = parseInt(month, 10);
    const yearValue = parseInt(year, 10);
    const daysInMonth = new Date(yearValue, monthIndex, 0).getDate();
    const startDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-01`;
    const endDate = `${yearValue}-${String(monthIndex).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const sourceStartDate = addDaysToDateKey(startDate, -1) || startDate;
    const sourceEndDate = addDaysToDateKey(endDate, 1) || endDate;

    const [rows] = await pool.query(
      `SELECT ta.availability_id as id,
              ta.teacher_id,
              DATE_FORMAT(ta.available_date, '%Y-%m-%d') as available_date,
              ta.status,
              ta.notes,
              TIME_FORMAT(ta.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(ta.end_time, '%H:%i:%s') AS end_time,
              TIME_FORMAT(ta.break_start, '%H:%i:%s') AS break_start,
              TIME_FORMAT(ta.break_end, '%H:%i:%s') AS break_end,
              u.timezone AS teacher_timezone,
              EXISTS (
                SELECT 1 FROM classes c
                WHERE c.teacher_id = ta.teacher_id
                  AND c.scheduled_date = ta.available_date
                  AND c.status = 'scheduled'
              ) AS has_booked_class
       FROM teacher_availability ta
       JOIN users u ON u.user_id = ta.teacher_id
       WHERE ta.teacher_id = ?
         AND u.status = 'active'
         AND u.profile_completed = TRUE
         AND ta.available_date BETWEEN ? AND ?
       ORDER BY ta.available_date ASC`,
      [teacher_id, sourceStartDate, sourceEndDate]
    );

    res.json({ records: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching availability records" });
  }
});

// Get teacher availability record for a specific date
app.get("/api/calendar/teacher-availability-record", requireSession, requireTeacherAvailabilityScope(), async (req, res) => {
  try {
    const { teacher_id, available_date } = req.query;
    if (!teacher_id || !available_date) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    await deletePastTeacherAvailability(teacher_id);

    const [rows] = await pool.query(
      `SELECT ta.availability_id as id,
              ta.teacher_id,
              DATE_FORMAT(ta.available_date, '%Y-%m-%d') as available_date,
              ta.status,
              ta.notes,
              TIME_FORMAT(ta.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(ta.end_time, '%H:%i:%s') AS end_time,
              TIME_FORMAT(ta.break_start, '%H:%i:%s') AS break_start,
              TIME_FORMAT(ta.break_end, '%H:%i:%s') AS break_end,
              u.timezone AS teacher_timezone
       FROM teacher_availability ta
       JOIN users u ON u.user_id = ta.teacher_id
       WHERE ta.teacher_id = ?
         AND u.status = 'active'
         AND u.profile_completed = TRUE
         AND DATE(ta.available_date) = ?
       LIMIT 1`,
      [teacher_id, available_date]
    );

    res.json({ record: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching availability record" });
  }
});

// Set teacher availability with validation
app.post("/api/calendar/set-availability", requireSession, requireBodyIdentity("teacher_id"), async (req, res) => {
  try {
    const { teacher_id, available_date, status, start_time, end_time, break_start, break_end } = req.body;

    if (!teacher_id || !available_date || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [teacherRows] = await pool.query(
      `SELECT user_id
       FROM users
       WHERE user_id = ?
         AND role = 'teacher'
         AND status = 'active'
         AND profile_completed = TRUE
       LIMIT 1`,
      [teacher_id]
    );

    if (!teacherRows.length) {
      return res.status(400).json({ message: "Teacher account must be active and complete before setting availability." });
    }

    // Validate date is not in the past
    const today = new Date();
    // Parse date without timezone issues (YYYY-MM-DD format)
    const [selYear, selMonth, selDay] = available_date.split('-').map(Number);
    const selectedDate = new Date(selYear, selMonth - 1, selDay, 0, 0, 0, 0);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    
    if (selectedDate < todayMidnight) {
      return res.status(400).json({ message: "Cannot set availability for past dates" });
    }

    const maxScheduleDate = addMonthsClamped(todayMidnight, SCHEDULE_WINDOW_MONTHS);
    if (selectedDate > maxScheduleDate) {
      return res.status(400).json({ message: `Can only set availability up to ${SCHEDULE_WINDOW_MONTHS} months ahead` });
    }

    // If setting availability for today, validate that times are after current time
    if (selectedDate.getTime() === todayMidnight.getTime()) {
      const currentHours = today.getHours();
      const currentMins = today.getMinutes();
      const currentTotalMins = currentHours * 60 + currentMins;

      if (status === "available") {
        const [startHours, startMins] = start_time.split(":").map(Number);
        const startTotalMins = startHours * 60 + startMins;

        if (startTotalMins <= currentTotalMins) {
          return res.status(400).json({ message: "Start time must be after the current time" });
        }

        const [endHours, endMins] = end_time.split(":").map(Number);
        const endTotalMins = endHours * 60 + endMins;

        if (endTotalMins <= currentTotalMins) {
          return res.status(400).json({ message: "End time must be after the current time" });
        }
      }
    }

    // Validate time range if available status
    if (status === "available") {
      if (!start_time || !end_time) {
        return res.status(400).json({ message: "Start time and end time are required when setting available" });
      }

      // Validate end time is after start time
      const startMinutes = parseInt(start_time.split(":")[0]) * 60 + parseInt(start_time.split(":")[1]);
      const endMinutes = parseInt(end_time.split(":")[0]) * 60 + parseInt(end_time.split(":")[1]);
      
      if (endMinutes <= startMinutes) {
        return res.status(400).json({ message: "End time must be after start time" });
      }

      // Validate break times if provided
      if (break_start || break_end) {
        if (!break_start || !break_end) {
          return res.status(400).json({ message: "Both break start and break end times are required" });
        }

        const breakStartMin = parseInt(break_start.split(":")[0]) * 60 + parseInt(break_start.split(":")[1]);
        const breakEndMin = parseInt(break_end.split(":")[0]) * 60 + parseInt(break_end.split(":")[1]);

        // Break end must be after break start
        if (breakEndMin <= breakStartMin) {
          return res.status(400).json({ message: "Break end time must be after break start time" });
        }

        // Break must be within availability window
        if (breakStartMin < startMinutes || breakEndMin > endMinutes) {
          return res.status(400).json({ message: "Break time must be within your availability window" });
        }
      }

      // Check if there's already a booked class during this time window
      const [existingClasses] = await pool.query(
        `SELECT class_id, start_time, end_time FROM classes 
         WHERE teacher_id = ? AND scheduled_date = ? AND status = 'scheduled'`,
        [teacher_id, available_date]
      );

      if (existingClasses.length > 0) {
        return res.status(409).json({ message: "Cannot update availability: a student has a booked class on this day." });
      }
    } else {
      const [existingClassesAny] = await pool.query(
        `SELECT class_id FROM classes 
         WHERE teacher_id = ? AND scheduled_date = ? AND status = 'scheduled' LIMIT 1`,
        [teacher_id, available_date]
      );
      if (existingClassesAny.length > 0) {
        return res.status(409).json({ message: "Cannot update availability: a student has a booked class on this day." });
      }
    }

    // Insert or update availability
    const [result] = await pool.query(
      `INSERT INTO teacher_availability (teacher_id, available_date, status, start_time, end_time, break_start, break_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?, start_time = ?, end_time = ?, break_start = ?, break_end = ?, updated_at = CURRENT_TIMESTAMP`,
      [teacher_id, available_date, status, start_time || null, end_time || null, break_start || null, break_end || null, status, start_time || null, end_time || null, break_start || null, break_end || null]
    );

    const [availabilityRows] = await pool.query(
      `SELECT availability_id
       FROM teacher_availability
       WHERE teacher_id = ? AND available_date = ?
       LIMIT 1`,
      [teacher_id, available_date]
    );

    const availabilityId = availabilityRows[0]?.availability_id || result.insertId || null;

    const [notificationTeacherRows] = await pool.query(
      `SELECT first_name, last_name
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [teacher_id]
    );

    const teacherName = notificationTeacherRows.length
      ? `${notificationTeacherRows[0].first_name || ""} ${notificationTeacherRows[0].last_name || ""}`.trim() || "Your teacher"
      : "Your teacher";

    const [studentRows] = await pool.query(
      `SELECT u.user_id
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.assigned_teacher_id = ?
         AND u.role = 'student'
         AND u.status = 'active'
         AND u.profile_completed = TRUE`,
      [teacher_id]
    );

    if (studentRows.length) {
      const notificationTitle = status === "available"
        ? "Teacher Availability Updated"
        : "Teacher Availability Changed";
      const notificationMessage = status === "available"
        ? `${teacherName} is available on ${humanDate(available_date)} from ${humanTime(start_time)} to ${humanTime(end_time)}.`
        : `${teacherName} marked ${humanDate(available_date)} as unavailable.`;

      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
         VALUES ${studentRows.map(() => "(?, 'announcement', ?, ?, ?, 'teacher_availability', '/Calendar')").join(", ")}`,
        studentRows.flatMap((student) => [
          student.user_id,
          encryptNullableText(notificationTitle),
          encryptNullableText(notificationMessage),
          availabilityId,
        ])
      );
    }

    broadcastCalendarChange([teacher_id, ...studentRows.map((student) => student.user_id)], "availability-changed", {
      availability_id: availabilityId,
      teacher_id,
      available_date,
      status,
      start_time: start_time || null,
      end_time: end_time || null,
      break_start: break_start || null,
      break_end: break_end || null,
    });

    res.json({ message: "Availability updated successfully", id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error setting availability" });
  }
});

// Set teacher availability for selected weekdays in a visible month.
app.post("/api/calendar/set-availability-bulk", requireSession, requireBodyIdentity("teacher_id"), async (req, res) => {
  try {
    const { teacher_id, year, month, weekdays, status, start_time, end_time, break_start, break_end } = req.body;

    if (!teacher_id || !year || !month || !status || !Array.isArray(weekdays)) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const selectedYear = Number(year);
    const selectedMonth = Number(month);
    const selectedWeekdays = [...new Set(weekdays.map(Number))]
      .filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6);

    if (!Number.isInteger(selectedYear) || !Number.isInteger(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) {
      return res.status(400).json({ message: "Invalid month or year" });
    }

    if (!selectedWeekdays.length) {
      return res.status(400).json({ message: "Please select at least one weekday" });
    }

    if (!["available", "unavailable"].includes(status)) {
      return res.status(400).json({ message: "Invalid availability status" });
    }

    const [teacherRows] = await pool.query(
      `SELECT user_id, first_name, last_name
       FROM users
       WHERE user_id = ?
         AND role = 'teacher'
         AND status = 'active'
         AND profile_completed = TRUE
       LIMIT 1`,
      [teacher_id]
    );

    if (!teacherRows.length) {
      return res.status(400).json({ message: "Teacher account must be active and complete before setting availability." });
    }

    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const maxScheduleDate = addMonthsClamped(todayMidnight, SCHEDULE_WINDOW_MONTHS);

    let startMinutes = null;
    let endMinutes = null;
    let breakStartMinutes = null;
    let breakEndMinutes = null;

    if (status === "available") {
      startMinutes = timeToMinutes(start_time);
      endMinutes = timeToMinutes(end_time);

      if (startMinutes == null || endMinutes == null) {
        return res.status(400).json({ message: "Start time and end time are required when setting available" });
      }

      if (endMinutes <= startMinutes) {
        return res.status(400).json({ message: "End time must be after start time" });
      }

      if (break_start || break_end) {
        breakStartMinutes = timeToMinutes(break_start);
        breakEndMinutes = timeToMinutes(break_end);

        if (breakStartMinutes == null || breakEndMinutes == null) {
          return res.status(400).json({ message: "Both break start and break end times are required" });
        }

        if (breakEndMinutes <= breakStartMinutes) {
          return res.status(400).json({ message: "Break end time must be after break start time" });
        }

        if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
          return res.status(400).json({ message: "Break time must be within your availability window" });
        }
      }
    }

    const savedDates = [];
    const skippedDates = [];
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const selectedDate = new Date(selectedYear, selectedMonth - 1, day, 0, 0, 0, 0);
      const availableDate = `${selectedYear}-${pad(selectedMonth)}-${pad(day)}`;

      if (!selectedWeekdays.includes(selectedDate.getDay())) continue;

      if (selectedDate < todayMidnight) {
        skippedDates.push({ date: availableDate, reason: "past_date" });
        continue;
      }

      if (selectedDate > maxScheduleDate) {
        skippedDates.push({ date: availableDate, reason: "outside_schedule_window" });
        continue;
      }

      if (status === "available" && selectedDate.getTime() === todayMidnight.getTime()) {
        const currentMinutes = today.getHours() * 60 + today.getMinutes();
        if (startMinutes <= currentMinutes || endMinutes <= currentMinutes) {
          skippedDates.push({ date: availableDate, reason: "time_has_passed" });
          continue;
        }
      }

      const [existingClasses] = await pool.query(
        `SELECT class_id FROM classes
         WHERE teacher_id = ?
           AND scheduled_date = ?
           AND status IN ('scheduled', 'completed')
         LIMIT 1`,
        [teacher_id, availableDate]
      );

      if (existingClasses.length > 0) {
        skippedDates.push({ date: availableDate, reason: "has_booked_class" });
        continue;
      }

      await pool.query(
        `INSERT INTO teacher_availability (teacher_id, available_date, status, start_time, end_time, break_start, break_end)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = ?, start_time = ?, end_time = ?, break_start = ?, break_end = ?, updated_at = CURRENT_TIMESTAMP`,
        [
          teacher_id,
          availableDate,
          status,
          status === "available" ? normalizeTimeKey(start_time) : null,
          status === "available" ? normalizeTimeKey(end_time) : null,
          status === "available" ? normalizeTimeKey(break_start) : null,
          status === "available" ? normalizeTimeKey(break_end) : null,
          status,
          status === "available" ? normalizeTimeKey(start_time) : null,
          status === "available" ? normalizeTimeKey(end_time) : null,
          status === "available" ? normalizeTimeKey(break_start) : null,
          status === "available" ? normalizeTimeKey(break_end) : null,
        ]
      );
      savedDates.push(availableDate);
    }

    const [studentRows] = await pool.query(
      `SELECT u.user_id
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.assigned_teacher_id = ?
         AND u.role = 'student'
         AND u.status = 'active'
         AND u.profile_completed = TRUE`,
      [teacher_id]
    );

    if (savedDates.length && studentRows.length) {
      const teacherName = `${teacherRows[0].first_name || ""} ${teacherRows[0].last_name || ""}`.trim() || "Your teacher";
      const monthName = new Date(selectedYear, selectedMonth - 1, 1).toLocaleString("default", { month: "long" });
      const notificationTitle = "Teacher Availability Updated";
      const notificationMessage = status === "available"
        ? `${teacherName} updated availability for ${savedDates.length} date${savedDates.length === 1 ? "" : "s"} in ${monthName} ${selectedYear} from ${humanTime(start_time)} to ${humanTime(end_time)}.`
        : `${teacherName} marked ${savedDates.length} date${savedDates.length === 1 ? "" : "s"} unavailable in ${monthName} ${selectedYear}.`;

      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url)
         VALUES ${studentRows.map(() => "(?, 'announcement', ?, ?, NULL, 'teacher_availability', '/Calendar')").join(", ")}`,
        studentRows.flatMap((student) => [
          student.user_id,
          encryptNullableText(notificationTitle),
          encryptNullableText(notificationMessage),
        ])
      );
    }

    broadcastCalendarChange([teacher_id, ...studentRows.map((student) => student.user_id)], "availability-changed", {
      teacher_id,
      status,
      saved_dates: savedDates,
      skipped_dates: skippedDates,
    });

    res.json({
      message: "Bulk availability updated successfully",
      saved_dates: savedDates,
      skipped_dates: skippedDates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error setting bulk availability" });
  }
});

// Delete teacher availability record
app.delete("/api/calendar/availability/:availability_id", requireSession, requireAvailabilityOwnership(), async (req, res) => {
  try {
    const { availability_id } = req.params;
    const [availabilityRows] = await pool.query(
      `SELECT teacher_id, DATE_FORMAT(available_date, '%Y-%m-%d') AS available_date
       FROM teacher_availability
       WHERE availability_id = ?
       LIMIT 1`,
      [availability_id]
    );

    if (!availabilityRows.length) {
      return res.status(404).json({ message: "Availability record not found" });
    }

    const { teacher_id, available_date } = availabilityRows[0];

    const [bookedClasses] = await pool.query(
      `SELECT class_id FROM classes
       WHERE teacher_id = ? AND scheduled_date = ? AND status = 'scheduled'
       LIMIT 1`,
      [teacher_id, available_date]
    );

    if (bookedClasses.length > 0) {
      return res.status(409).json({ message: "Cannot delete availability: a student has a booked class on this day." });
    }

    const [result] = await pool.query(
      `DELETE FROM teacher_availability WHERE availability_id = ?`,
      [availability_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Availability record not found" });
    }

    if (availabilityRows.length) {
      const { teacher_id, available_date } = availabilityRows[0];
      const [studentRows] = await pool.query(
        `SELECT u.user_id
         FROM student_profiles sp
         JOIN users u ON u.user_id = sp.user_id
         WHERE sp.assigned_teacher_id = ?
           AND u.role = 'student'
           AND u.status = 'active'
           AND u.profile_completed = TRUE`,
        [teacher_id]
      );

      broadcastCalendarChange([teacher_id, ...studentRows.map((student) => student.user_id)], "availability-changed", {
        availability_id,
        teacher_id,
        available_date,
        status: "deleted",
      });
    }

    res.json({ message: "Availability deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting availability" });
  }
});

// ========== BOOKS/LESSONS MODULE ==========

// Create multer storage for lessons (separate from assignments)
const lessonUploadDir = path.join(UPLOAD_ROOT, "lessons");
fs.mkdirSync(lessonUploadDir, { recursive: true });

const lessonStorage = multer.diskStorage({
  destination: lessonUploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const lessonUpload = multer({ 
  storage: lessonStorage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'), false);
    }
  }
});

// Create multer storage for book covers
const bookCoverUploadDir = path.join(UPLOAD_ROOT, "books");
fs.mkdirSync(bookCoverUploadDir, { recursive: true });

const bookCoverStorage = multer.diskStorage({
  destination: bookCoverUploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const bookCoverUpload = multer({
  storage: bookCoverStorage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image/jpeg, image/png, and image/webp are allowed for book covers'), false);
    }
  },
});



// ===== BOOKS ENDPOINTS =====

async function getStudentProfile(studentId) {
  if (!studentId) return null;

  const [rows] = await pool.query(
    "SELECT assigned_teacher_id, course_id FROM student_profiles WHERE user_id = ? LIMIT 1",
    [studentId]
  );
  return rows[0] || null;
}

async function getStudentAssignedTeacherId(studentId) {
  const profile = await getStudentProfile(studentId);
  return profile?.assigned_teacher_id || null;
}

async function canStudentAccessBook(studentId, bookId) {
  const profile = await getStudentProfile(studentId);
  if (!profile?.assigned_teacher_id) return false;

  // A student inherits access from their assigned teacher, and only for books
  // that teacher was actually distributed.
  const assignedTeacherId = profile.assigned_teacher_id;
  const params = [studentId, assignedTeacherId, bookId];
  let query = `SELECT b.book_id
     FROM books b
     JOIN student_profiles sp ON sp.user_id = ?
     JOIN users student ON student.user_id = sp.user_id
      AND student.status = 'active' AND student.profile_completed = TRUE
     JOIN book_teachers bt ON bt.book_id = b.book_id
     JOIN users teacher ON teacher.user_id = bt.teacher_id
      AND teacher.status = 'active' AND teacher.profile_completed = TRUE
     WHERE sp.assigned_teacher_id = ?
       AND b.book_id = ?`;

  if (profile.course_id) {
    query += ' AND b.course_id = ?';
    params.push(profile.course_id);
  }

  query += '\n     LIMIT 1';

  const [rows] = await pool.query(query, params);
  return rows.length > 0;
}

async function canStudentAccessLesson(studentId, lessonId) {
  const profile = await getStudentProfile(studentId);
  if (!profile?.assigned_teacher_id) return false;

  const assignedTeacherId = profile.assigned_teacher_id;
  const params = [studentId, assignedTeacherId, lessonId];
  let query = `SELECT l.lesson_id
     FROM lessons l
     JOIN books b ON l.book_id = b.book_id
     JOIN student_profiles sp ON sp.user_id = ?
     JOIN users student ON student.user_id = sp.user_id
      AND student.status = 'active' AND student.profile_completed = TRUE
     JOIN book_teachers bt ON bt.book_id = b.book_id
     JOIN users teacher ON teacher.user_id = bt.teacher_id
      AND teacher.status = 'active' AND teacher.profile_completed = TRUE
     WHERE sp.assigned_teacher_id = ?
       AND l.lesson_id = ?`;

  if (profile.course_id) {
    query += ' AND b.course_id = ?';
    params.push(profile.course_id);
  }

  query += '\n     LIMIT 1';

  const [rows] = await pool.query(query, params);
  return rows.length > 0;
}

async function getAssignedStudentIds(teacherId, courseId) {
  if (!teacherId) return [];

  let query = `SELECT u.user_id
     FROM users u
     JOIN student_profiles sp ON sp.user_id = u.user_id
     WHERE u.role = 'student'
       AND u.status = 'active'
       AND u.profile_completed = TRUE
       AND sp.assigned_teacher_id = ?`;
  const params = [teacherId];

  if (courseId) {
    query += ' AND sp.course_id = ?';
    params.push(courseId);
  }

  const [rows] = await pool.query(query, params);
  return rows.map((row) => row.user_id);
}

async function createNotificationsForUsers(userIds, type, title, message, relatedId = null, relatedType = null, actionUrl = null) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const values = userIds.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];

  userIds.forEach((userId) => {
    params.push(
      userId,
      type,
      encryptNullableText(title || null),
      encryptNullableText(message),
      relatedId,
      relatedType,
      actionUrl
    );
  });

  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, related_id, related_type, action_url) VALUES ${values}`,
    params
  );
}

function formatChatUser(row, fallbackRole = null) {
  const name = `${row?.first_name || ""} ${row?.last_name || ""}`.trim() || row?.email || "Unknown";
  return {
    user_id: row?.user_id,
    first_name: row?.first_name || "",
    last_name: row?.last_name || "",
    name,
    email: row?.email || null,
    role: row?.role || fallbackRole || null,
    status: row?.status || null,
    profile_image_url: row?.profile_image_url || null,
    profileImageUrl: row?.profile_image_url || null,
  };
}

async function getActiveAdminChatContacts(excludeUserId = null) {
  const params = [];
  let query = `SELECT user_id, first_name, last_name, email, profile_image_url, role, status
       FROM users
       WHERE role = 'admin'
         AND status = 'active'`;

  if (excludeUserId) {
    query += " AND user_id <> ?";
    params.push(excludeUserId);
  }

  query += " ORDER BY first_name ASC, last_name ASC";

  const [rows] = await pool.query(query, params);
  return rows.map((row) => formatChatUser(row, "admin"));
}

async function getDefaultChatContacts(userId, role) {
  const normalizedRole = String(role || "").toLowerCase();
  if (!userId || !normalizedRole) return [];

  if (normalizedRole === "student") {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.profile_image_url, u.role, u.status
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.assigned_teacher_id
       WHERE sp.user_id = ? AND u.status = 'active' AND u.profile_completed = TRUE
       LIMIT 1`,
      [userId]
    );
    const admins = await getActiveAdminChatContacts(userId);
    return [...rows.map((row) => formatChatUser(row, "teacher")), ...admins];
  }

  if (normalizedRole === "teacher") {
    const [rows] = await pool.query(
      `SELECT DISTINCT u.user_id, u.first_name, u.last_name, u.email, u.profile_image_url, u.role, u.status
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.assigned_teacher_id = ?
         AND u.role = 'student'
         AND u.status = 'active'
         AND u.profile_completed = TRUE
       ORDER BY u.first_name ASC, u.last_name ASC`,
      [userId]
    );
    const admins = await getActiveAdminChatContacts(userId);
    return [...rows.map((row) => formatChatUser(row, "student")), ...admins];
  }

  if (normalizedRole === "admin") {
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, email, profile_image_url, role, status
       FROM users
       WHERE status = 'active' AND profile_completed = TRUE AND role IN ('teacher', 'student')
       ORDER BY role ASC, first_name ASC, last_name ASC
       LIMIT 50`
    );
    return rows.map((row) => formatChatUser(row));
  }

  return [];
}

async function getChatConversationSummaries(userId) {
  if (!userId) return [];

  const [rows] = await pool.query(
    `SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.profile_image_url,
        u.role,
        u.status,
        lm.message_id AS last_message_id,
        lm.content AS last_message,
        lm.sent_at AS last_message_at,
        lm.sender_id AS last_sender_id,
        (
          SELECT COUNT(*)
          FROM messages unread
          WHERE unread.sender_id = u.user_id
            AND unread.recipient_id = ?
            AND unread.is_read = 0
        ) AS unread_count
     FROM users u
     JOIN (
       SELECT other_id, MAX(message_id) AS latest_message_id
       FROM (
         SELECT recipient_id AS other_id, message_id
         FROM messages
         WHERE sender_id = ?
         UNION ALL
         SELECT sender_id AS other_id, message_id
         FROM messages
         WHERE recipient_id = ?
       ) related_messages
       GROUP BY other_id
     ) conv ON conv.other_id = u.user_id
     JOIN messages lm ON lm.message_id = conv.latest_message_id
     WHERE u.status = 'active'
       AND (u.role = 'admin' OR u.profile_completed = TRUE)
     ORDER BY lm.sent_at DESC, lm.message_id DESC`,
    [userId, userId, userId]
  );

  return rows.map((row) => ({
    ...formatChatUser(row),
    last_message_id: row.last_message_id,
    last_message: decryptNullableText(row.last_message) || "",
    last_message_at: row.last_message_at || null,
    last_sender_id: row.last_sender_id || null,
    unread_count: Number(row.unread_count || 0),
    online: isUserChatActive(row.user_id),
    status_label: isUserChatActive(row.user_id) ? "Active now" : "Not active",
  }));
}

async function getChatConversationsForUser(userId) {
  const currentUser = await pool.query(
    `SELECT user_id, role, status, profile_completed FROM users WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const [userRows] = currentUser;
  if (!userRows.length) return [];

  const current = userRows[0];
  const role = current.role;
  if (current.status !== "active" || (role !== "admin" && !current.profile_completed)) {
    return [];
  }

  const [summaryRows, defaultContacts] = await Promise.all([
    getChatConversationSummaries(userId),
    getDefaultChatContacts(userId, role),
  ]);

  const byId = new Map();
  summaryRows.forEach((row) => byId.set(String(row.user_id), row));

  defaultContacts.forEach((contact) => {
    const key = String(contact.user_id);
    if (!byId.has(key)) {
      byId.set(key, {
        ...contact,
        last_message_id: null,
        last_message: "",
        last_message_at: null,
        last_sender_id: null,
        unread_count: 0,
        online: isUserChatActive(contact.user_id),
        status_label: isUserChatActive(contact.user_id) ? "Active now" : "Not active",
      });
    }
  });

  return Array.from(byId.values()).sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    if (bTime !== aTime) return bTime - aTime;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

async function getChatThread(userId, otherUserId) {
  const [rows] = await pool.query(
    `SELECT
        m.message_id,
        m.sender_id,
        m.recipient_id,
        m.subject,
        m.content,
        m.is_read,
        m.sent_at,
        m.read_at,
        s.first_name AS sender_first_name,
        s.last_name AS sender_last_name,
        r.first_name AS recipient_first_name,
        r.last_name AS recipient_last_name
     FROM messages m
     JOIN users s ON s.user_id = m.sender_id
      AND s.status = 'active' AND (s.role = 'admin' OR s.profile_completed = TRUE)
     JOIN users r ON r.user_id = m.recipient_id
      AND r.status = 'active' AND (r.role = 'admin' OR r.profile_completed = TRUE)
     WHERE (m.sender_id = ? AND m.recipient_id = ?)
        OR (m.sender_id = ? AND m.recipient_id = ?)
     ORDER BY m.sent_at ASC, m.message_id ASC`,
    [userId, otherUserId, otherUserId, userId]
  );

  return rows.map((row) => ({
    message_id: row.message_id,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    subject: decryptNullableText(row.subject),
    content: decryptNullableText(row.content),
    is_read: Boolean(row.is_read),
    sent_at: row.sent_at,
    read_at: row.read_at,
    sender_name: `${row.sender_first_name || ""} ${row.sender_last_name || ""}`.trim(),
    recipient_name: `${row.recipient_first_name || ""} ${row.recipient_last_name || ""}`.trim(),
  }));
}

// ========== BOOK ACCESS CONTROL & SECURITY HELPERS ==========
// Books are authored by an admin and distributed to teachers. Teachers no
// longer own the books they can see, so ownership checks were replaced by two
// narrower gates: requireAdmin for every write, and distribution membership for
// reads.

/**
 * Extract teacher ID from request (query, body, or headers)
 * Priority: query param > body > header
 */
function getTeacherIdFromRequest(req) {
  return req.query.teacher_id || req.body?.teacher_id || req.headers?.['x-teacher-id'];
}

/**
 * Extract admin ID from request (query, body, or headers)
 * Priority: query param > body > header
 */
function getAdminIdFromRequest(req) {
  return req.query.admin_id || req.body?.admin_id || req.headers?.['x-admin-id'];
}

/**
 * Normalise a list of IDs arriving from a form field. Accepts a JSON array
 * ('[1,2,3]'), a comma separated string ("1,2,3"), a real array (repeated form
 * fields, or a JSON request body), or a bare single value.
 *
 * Recursion must terminate on a value with no comma: splitting "5" yields
 * ["5"], and recursing on that hands the same string straight back. An earlier
 * version had no such guard and threw "Maximum call stack size exceeded" on
 * every non-empty input - silently returning [] when a JSON parse was in
 * progress, because the try/catch swallowed the overflow.
 *
 * @param {string|string[]|number|undefined} value
 * @returns {number[]} unique positive integers
 */
function parseIdList(value) {
  const collect = (input) => {
    if (input === undefined || input === null) return [];
    if (Array.isArray(input)) return input.flatMap(collect);

    const trimmed = String(input).trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[")) {
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return [];
      }
      // Parsing must not swallow a downstream failure - only handle the parse.
      return Array.isArray(parsed) ? parsed.flatMap(collect) : [];
    }

    // Base case: a single value with no comma. Anything else is split, and each
    // part reaches this branch.
    if (!trimmed.includes(",")) return [trimmed];

    return trimmed.split(",").flatMap(collect);
  };

  const ids = collect(value).map((part) => Number(part));
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

async function isActiveAdmin(userId) {
  if (!userId) return false;

  const [rows] = await pool.query(
    `SELECT user_id FROM users
     WHERE user_id = ? AND role = 'admin' AND status = 'active'
     LIMIT 1`,
    [userId]
  );

  return rows.length > 0;
}

/**
 * Check whether a book has been distributed to a teacher.
 * @param {number} bookId
 * @param {number} teacherId
 * @returns {Promise<boolean>}
 */
async function isBookDistributedToTeacher(bookId, teacherId) {
  if (!teacherId) return false;

  const [rows] = await pool.query(
    "SELECT 1 FROM book_teachers WHERE book_id = ? AND teacher_id = ? LIMIT 1",
    [bookId, teacherId]
  );

  return rows.length > 0;
}

/**
 * Secondary check for book and lesson routes, plus the "does this book exist"
 * half of the original guard.
 *
 * !! THIS IS NOT AN AUTH GATE. It trusts an admin_id supplied in the request,
 * !! which proves nothing - any caller can pass an admin id. It was the only
 * !! admin check in the app until every admin route moved onto
 * !! requireAdminSession, which verifies a signed token and re-reads the
 * !! account. Every route calling this now also sits behind that gate, so the
 * !! admin_id check is redundant defence in depth rather than what keeps the
 * !! door shut.
 * !!
 * !! Do not add a route that relies on this alone, and do not read the name as
 * !! a promise. Real authentication is requireSession / requireAdminSession.
 *
 * @param {Object} res - Express response object
 * @param {number} adminId - The admin ID making the request
 * @param {number|null} bookId - When given, also asserts the book exists
 * @returns {Promise<boolean>} True if authorized; sends 401/403/404 otherwise
 */
async function requireAdmin(res, adminId, bookId = null) {
  if (!adminId) {
    res.status(401).json({ message: "Unauthorized: admin_id is required" });
    return false;
  }

  if (!(await isActiveAdmin(adminId))) {
    res.status(403).json({
      message: "Forbidden: Only an administrator can manage books and lessons.",
    });
    return false;
  }

  if (bookId) {
    const [books] = await pool.query(
      "SELECT book_id FROM books WHERE book_id = ? LIMIT 1",
      [bookId]
    );

    if (books.length === 0) {
      res.status(404).json({ message: "Book not found" });
      return false;
    }
  }

  return true;
}

/**
 * Read access to a book: the admin who owns the library, or a teacher the book
 * has been distributed to. Students are handled separately by
 * canStudentAccessBook, since they inherit access through their teacher.
 * @returns {Promise<boolean>} True if authorized; sends 401/403/404 otherwise
 */
async function validateBookReadAccess(res, bookId, adminId, teacherId) {
  if (adminId) {
    return requireAdmin(res, adminId, bookId);
  }

  if (!teacherId) {
    res.status(401).json({ message: "Unauthorized: teacher_id or admin_id is required" });
    return false;
  }

  const [books] = await pool.query(
    "SELECT book_id FROM books WHERE book_id = ? LIMIT 1",
    [bookId]
  );

  if (books.length === 0) {
    res.status(404).json({ message: "Book not found" });
    return false;
  }

  if (!(await isBookDistributedToTeacher(bookId, teacherId))) {
    res.status(403).json({
      message: "Forbidden: This book has not been distributed to you.",
    });
    return false;
  }

  return true;
}

/**
 * Read access to a lesson, resolved through the book that contains it.
 * @returns {Promise<boolean>} True if authorized; sends 401/403/404 otherwise
 */
async function validateLessonReadAccess(res, lessonId, adminId, teacherId) {
  const [lessons] = await pool.query(
    "SELECT lesson_id, book_id FROM lessons WHERE lesson_id = ? LIMIT 1",
    [lessonId]
  );

  if (lessons.length === 0) {
    res.status(404).json({ message: "Lesson not found" });
    return false;
  }

  return validateBookReadAccess(res, lessons[0].book_id, adminId, teacherId);
}

/**
 * The teachers a book is currently distributed to.
 * @returns {Promise<number[]>}
 */
async function getBookTeacherIds(bookId) {
  const [rows] = await pool.query(
    "SELECT teacher_id FROM book_teachers WHERE book_id = ? ORDER BY teacher_id",
    [bookId]
  );

  return rows.map((row) => row.teacher_id);
}

/**
 * Narrow a list of teacher IDs down to the ones that can actually be assigned a
 * book: real, active teacher accounts.
 * @returns {Promise<{ valid: number[], invalid: number[] }>}
 */
async function validateTeacherIds(teacherIds) {
  const unique = [...new Set(teacherIds.map((id) => Number(id)).filter(Boolean))];
  if (unique.length === 0) return { valid: [], invalid: [] };

  const [rows] = await pool.query(
    `SELECT user_id FROM users
     WHERE user_id IN (?)
       AND role = 'teacher'
       AND status = 'active'`,
    [unique]
  );

  const found = new Set(rows.map((row) => row.user_id));
  return {
    valid: unique.filter((id) => found.has(id)),
    invalid: unique.filter((id) => !found.has(id)),
  };
}

/**
 * Teacher roll-up used by every book list, so the UI can show who a book was
 * distributed to without a second request.
 *
 * The names are aggregated with DISTINCT and no ORDER BY on a different
 * expression: MySQL rejects `GROUP_CONCAT(DISTINCT x ORDER BY y)` unless y is
 * in the select list, and ordering by an unrelated id is not worth the risk.
 */
const BOOK_TEACHER_NAMES_SUBQUERY = `(
         SELECT GROUP_CONCAT(
                  DISTINCT TRIM(CONCAT(COALESCE(bt_user.first_name, ''), ' ', COALESCE(bt_user.last_name, '')))
                  SEPARATOR ', '
                )
         FROM book_teachers bt
         JOIN users bt_user ON bt_user.user_id = bt.teacher_id
         WHERE bt.book_id = b.book_id AND bt_user.status = 'active'
       )`;

const BOOK_TEACHER_IDS_SUBQUERY = `(
       SELECT GROUP_CONCAT(bt2.teacher_id ORDER BY bt2.teacher_id)
       FROM book_teachers bt2
       WHERE bt2.book_id = b.book_id
     )`;

/**
 * Shared SELECT for book lists. The roll-ups are correlated subqueries rather
 * than joins so lesson counts and teacher lists never multiply each other.
 */
const bookListSelectFields = `SELECT b.*, c.course_name,
       ${BOOK_TEACHER_NAMES_SUBQUERY} AS teacher_names,
       ${BOOK_TEACHER_IDS_SUBQUERY} AS teacher_ids,
       COALESCE(NULLIF(b.author, ''), NULLIF(${BOOK_TEACHER_NAMES_SUBQUERY}, '')) AS author,
       (SELECT COUNT(*) FROM lessons l WHERE l.book_id = b.book_id) AS lesson_count
     FROM books b
     JOIN courses c ON c.course_id = b.course_id`;

// GET all books (admin: whole library; teacher: distributed to them; student:
// distributed to their assigned teacher)
app.get("/api/books", requireSession, async (req, res) => {
  try {
    const { course_id, status = "active" } = req.query;
    const { adminId: admin_id, teacherId: teacher_id, studentId: student_id } = sessionIdentity(req);

    let query = bookListSelectFields;
    const params = [];

    const whereClauses = [];

    if (status === "active" || status === "archived") {
      whereClauses.push("b.status = ?");
      params.push(status);
    }

    if (admin_id) {
      if (!(await isActiveAdmin(admin_id))) {
        return res.status(403).json({ message: "Forbidden: admin access required" });
      }
    } else if (student_id) {
      const profile = await getStudentProfile(student_id);
      if (!profile?.assigned_teacher_id) {
        return res.json({ books: [] });
      }

      whereClauses.push(
        "EXISTS (SELECT 1 FROM book_teachers sbt WHERE sbt.book_id = b.book_id AND sbt.teacher_id = ?)"
      );
      params.push(profile.assigned_teacher_id);

      if (profile.course_id) {
        whereClauses.push("b.course_id = ?");
        params.push(profile.course_id);
      } else if (course_id) {
        whereClauses.push("b.course_id = ?");
        params.push(course_id);
      }
    } else if (teacher_id) {
      whereClauses.push(
        "EXISTS (SELECT 1 FROM book_teachers tbt WHERE tbt.book_id = b.book_id AND tbt.teacher_id = ?)"
      );
      params.push(teacher_id);
    } else if (course_id) {
      whereClauses.push("b.course_id = ?");
      params.push(course_id);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }
    query += " ORDER BY b.created_at DESC";

    const [books] = await pool.query(query, params);
    res.json({ books });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching books" });
  }
});

// GET single book with lesson count
// SECURITY: The admin can read any book; a teacher only books distributed to
// them; a student only books distributed to their assigned teacher.
app.get("/api/books/:book_id", requireSession, async (req, res) => {
  try {
    const { book_id } = req.params;
    const { adminId: admin_id, teacherId: teacher_id, studentId: student_id } = sessionIdentity(req);

    if (student_id) {
      if (!(await canStudentAccessBook(student_id, book_id))) {
        return res.status(403).json({ message: "You do not have access to this book" });
      }
    } else if (!admin_id && !teacher_id) {
      return res.status(401).json({ message: "student_id, teacher_id or admin_id is required" });
    } else if (!(await validateBookReadAccess(res, book_id, admin_id, teacher_id))) {
      return;
    }

    const [books] = await pool.query(
      `${bookListSelectFields} WHERE b.book_id = ? LIMIT 1`,
      [book_id]
    );

    if (books.length === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json({ book: books[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching book" });
  }
});

// GET teacher-facing student progress for a book
// SECURITY: readable by the admin, and by any teacher the book was distributed
// to. Progress is read-only for teachers, so no write gate is involved.
app.get("/api/teacher/book/:bookId/progress", requireSession, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { adminId: admin_id, teacherId: teacher_id } = sessionIdentity(req);

    if (!admin_id && !teacher_id) {
      return res.status(401).json({ message: "Unauthorized: teacher_id or admin_id is required" });
    }

    const [bookRows] = await pool.query(
      "SELECT book_id, title, course_id FROM books WHERE book_id = ? LIMIT 1",
      [bookId]
    );

    if (bookRows.length === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    if (!(await validateBookReadAccess(res, bookId, admin_id, teacher_id))) {
      return;
    }

    const book = bookRows[0];

    const [lessons] = await pool.query(
      `SELECT lesson_id, lesson_number, title
       FROM lessons
       WHERE book_id = ?
       ORDER BY order_number ASC, lesson_number ASC`,
      [bookId]
    );

    // A book can sit with several teachers, so progress is aggregated across
    // every student of the course who is assigned to one of them.
    const [students] = await pool.query(
      `SELECT DISTINCT u.user_id AS student_id, u.first_name, u.last_name, u.email, u.profile_image_url,
              sp.course_id, sp.assigned_teacher_id
       FROM users u
       JOIN student_profiles sp ON sp.user_id = u.user_id
       JOIN book_teachers bt ON bt.teacher_id = sp.assigned_teacher_id
       WHERE u.role = 'student'
         AND u.status = 'active'
         AND u.profile_completed = TRUE
         AND sp.course_id = ?
         AND bt.book_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [book.course_id, bookId]
    );

    if (students.length === 0) {
      return res.json({
        book,
        lessons,
        students: [],
      });
    }

    const studentIds = students.map((student) => student.student_id);
    const placeholders = studentIds.map(() => "?").join(",");
    const [progressRows] = await pool.query(
      `SELECT lp.student_id, lp.lesson_id, lp.is_completed, lp.progress_percentage, lp.completed_at
       FROM lesson_progress lp
       JOIN lessons l ON l.lesson_id = lp.lesson_id
       WHERE l.book_id = ?
         AND lp.student_id IN (${placeholders})`,
      [bookId, ...studentIds]
    );

    const [courseProgressRows] = await pool.query(
      `SELECT student_id, status, completed_lessons, total_lessons, progress_percentage, completed_at
       FROM student_course_progress
       WHERE book_id = ?
         AND student_id IN (${placeholders})`,
      [bookId, ...studentIds]
    );

    const progressByStudent = new Map();
    progressRows.forEach((row) => {
      if (!progressByStudent.has(row.student_id)) {
        progressByStudent.set(row.student_id, new Map());
      }
      progressByStudent.get(row.student_id).set(row.lesson_id, row);
    });

    const courseProgressByStudent = new Map();
    courseProgressRows.forEach((row) => {
      courseProgressByStudent.set(row.student_id, row);
    });

    const totalLessons = lessons.length;
    const studentProgress = students.map((student) => {
      const lessonMap = progressByStudent.get(student.student_id) || new Map();
      const courseProgress = courseProgressByStudent.get(student.student_id);
      const lessonProgress = lessons.map((lesson) => {
        const progress = lessonMap.get(lesson.lesson_id);
        const completed = Boolean(progress?.is_completed) || Number(progress?.progress_percentage || 0) >= 100;

        return {
          lessonId: lesson.lesson_id,
          lessonNumber: lesson.lesson_number,
          title: lesson.title,
          isCompleted: completed,
          completedAt: progress?.completed_at || null,
        };
      });
      const completedLessons = lessonProgress.filter((lesson) => lesson.isCompleted).length;
      const progressPercentage = totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;
      const courseCompleted = totalLessons > 0 && completedLessons === totalLessons;

      return {
        studentId: student.student_id,
        name: `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.email,
        email: student.email,
        profileImageUrl: student.profile_image_url,
        completedLessons,
        totalLessons,
        progressPercentage,
        status: courseCompleted ? "Course Completed" : "In Progress",
        courseCompleted,
        courseCompletedAt: courseCompleted ? courseProgress?.completed_at || null : null,
        lessons: lessonProgress,
      };
    });

    res.json({
      book,
      lessons,
      students: studentProgress,
    });
  } catch (err) {
    console.error("GET /api/teacher/book/:bookId/progress error:", err);
    res.status(500).json({ message: "Error fetching book progress" });
  }
});

/**
 * Tell every teacher who now has a book about it, and their students about the
 * book itself. Called on creation and on every distribution change so a teacher
 * who is added to a book finds out without having to refresh and notice.
 */
async function notifyBookDistribution(bookId, bookTitle, courseId, teacherIds, { notifyStudents }) {
  if (!teacherIds.length) return;

  await createNotificationsForUsers(
    teacherIds,
    'general',
    `New book assigned: ${bookTitle}`,
    `The administrator assigned you the book "${bookTitle}". View it under Books / Lessons.`,
    bookId,
    'book',
    `/teacherBooksLessons/${bookId}`
  );

  if (!notifyStudents) return;

  for (const teacherId of teacherIds) {
    const studentIds = await getAssignedStudentIds(teacherId, courseId);
    if (!studentIds.length) continue;

    await createNotificationsForUsers(
      studentIds,
      'general',
      `New book available: ${bookTitle}`,
      `A new book titled "${bookTitle}" is now available in your course. Check it out in Books & Lessons.`,
      bookId,
      'book',
      `/bookscontent/${bookId}`
    );
  }
}

// CREATE new book
// SECURITY: admin only. Books belong to the library, and the admin decides which
// teachers receive them.
app.post("/api/books", bookCoverUpload.single("cover"), requireAdminSession, async (req, res) => {
  try {
    const { title, description, course_id, author } = req.body;
    const admin_id = getAdminIdFromRequest(req);

    if (!(await requireAdmin(res, admin_id))) {
      return;
    }

    if (!title || !course_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const { valid: teacherIds, invalid } = await validateTeacherIds(parseIdList(req.body.teacher_ids));
    if (invalid.length > 0) {
      return res.status(400).json({
        message: `These teachers cannot be assigned books: ${invalid.join(", ")}.`,
      });
    }

    const [courseRows] = await pool.query(
      "SELECT course_id FROM courses WHERE course_id = ? LIMIT 1",
      [course_id]
    );

    if (courseRows.length === 0) {
      return res.status(400).json({ message: "Invalid course" });
    }

    const cover_url = req.file ? `/uploads/books/${req.file.filename}` : null;

    try {
      const [result] = await pool.query(
        `INSERT INTO books (title, description, course_id, author, cover_url)
         VALUES (?, ?, ?, ?, ?)`,
        [title, description || null, course_id, author || null, cover_url]
      );

      const bookId = result.insertId;

      if (teacherIds.length > 0) {
        await pool.query(
          `INSERT INTO book_teachers (book_id, teacher_id, assigned_by) VALUES ${teacherIds
            .map(() => "(?, ?, ?)")
            .join(", ")}`,
          teacherIds.flatMap((teacherId) => [bookId, teacherId, admin_id])
        );

        await notifyBookDistribution(bookId, title, course_id, teacherIds, {
          notifyStudents: true,
        });
      }

      res.status(201).json({
        message: "Book created successfully",
        book_id: bookId,
        cover_url,
        teacher_ids: teacherIds,
      });
    } catch (dbErr) {
      console.error('DB ERROR creating book:', dbErr && dbErr.message, dbErr);
      return res.status(500).json({ message: "DB error creating book", error: dbErr.message });
    }
  } catch (err) {
    console.error('CREATE BOOK ERROR', err && err.stack || err);
    res.status(500).json({ message: "Error creating book", error: err && err.message });
  }
});

// Distribute (or redistribute) a book to teachers
// SECURITY: admin only. Replaces the current set outright, so removing a
// teacher immediately revokes their access.
app.put("/api/books/:book_id/teachers", requireAdminSession, async (req, res) => {
  try {
    const { book_id } = req.params;
    const admin_id = getAdminIdFromRequest(req);

    if (!(await requireAdmin(res, admin_id, book_id))) {
      return;
    }

    const { valid: teacherIds, invalid } = await validateTeacherIds(parseIdList(req.body.teacher_ids));
    if (invalid.length > 0) {
      return res.status(400).json({
        message: `These teachers cannot be assigned books: ${invalid.join(", ")}.`,
      });
    }

    const previousTeacherIds = await getBookTeacherIds(book_id);
    const addedTeacherIds = teacherIds.filter((id) => !previousTeacherIds.includes(id));

    await pool.query("DELETE FROM book_teachers WHERE book_id = ?", [book_id]);

    if (teacherIds.length > 0) {
      await pool.query(
        `INSERT INTO book_teachers (book_id, teacher_id, assigned_by) VALUES ${teacherIds
          .map(() => "(?, ?, ?)")
          .join(", ")}`,
        teacherIds.flatMap((teacherId) => [book_id, teacherId, admin_id])
      );
    }

    const [bookRows] = await pool.query(
      "SELECT title, course_id FROM books WHERE book_id = ? LIMIT 1",
      [book_id]
    );
    const book = bookRows[0];

    if (addedTeacherIds.length > 0) {
      await notifyBookDistribution(book_id, book.title, book.course_id, addedTeacherIds, {
        notifyStudents: true,
      });
    }

    res.json({
      message: "Book distribution updated",
      teacher_ids: teacherIds,
      added_teacher_ids: addedTeacherIds,
      removed_teacher_ids: previousTeacherIds.filter((id) => !teacherIds.includes(id)),
    });
  } catch (err) {
    console.error('DISTRIBUTE BOOK ERROR', err && err.stack || err);
    res.status(500).json({ message: "Error updating book distribution", error: err && err.message });
  }
});

// UPDATE book
// SECURITY: admin only. Teachers are read-only on books.
app.put("/api/books/:book_id", bookCoverUpload.single("cover"), requireAdminSession, async (req, res) => {
  try {
    const { book_id } = req.params;
    const { title, description, author } = req.body;
    const admin_id = getAdminIdFromRequest(req);

    if (!(await requireAdmin(res, admin_id, book_id))) {
      return;
    }

    const cover_url = req.file ? `/uploads/books/${req.file.filename}` : null;

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push("title = ?");
      params.push(title);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description || null);
    }
    if (author !== undefined) {
      updates.push("author = ?");
      params.push(author || null);
    }
    if (cover_url !== null) {
      updates.push("cover_url = ?");
      params.push(cover_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No update fields provided" });
    }

    const query = `UPDATE books SET ${updates.join(", ")} WHERE book_id = ?`;
    params.push(book_id);

    try {
      const [result] = await pool.query(query, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Book not found" });
      }

      res.json({ message: "Book updated successfully" });
    } catch (dbErr) {
      console.error('DB ERROR updating book:', dbErr && dbErr.message, dbErr);
      return res.status(500).json({ message: "DB error updating book", error: dbErr.message });
    }
  } catch (err) {
    console.error('UPDATE BOOK ERROR', err && err.stack || err);
    res.status(500).json({ message: "Error updating book", error: err && err.message });
  }
});

// There is deliberately no DELETE /api/books/:book_id.
//
// Archive is the only way a book leaves the library, and it is reversible, so a
// mistake costs one click to undo. A hard delete would cascade through lessons,
// lesson progress and the course-progress rollup, and it cannot be undone.
//
// It was also the sharpest edge in the app: authorisation here is just an
// admin_id query parameter, with no session token to verify, so anyone who could
// reach the URL could have destroyed the whole library by guessing admin_id=1.
// Removing the affordance and the endpoint together keeps the UI and the API
// telling the same story.

// Archive a book without deleting lessons or progress
// SECURITY: admin only
app.put("/api/books/:book_id/archive", requireAdminSession, async (req, res) => {
  try {
    const { book_id } = req.params;
    const admin_id = getAdminIdFromRequest(req);

    if (!(await requireAdmin(res, admin_id, book_id))) {
      return;
    }

    const [result] = await pool.query(
      "UPDATE books SET status = 'archived', archived_at = CURRENT_TIMESTAMP WHERE book_id = ?",
      [book_id]
    );

    if (result.affectedRows === 0) {
      // affectedRows counts rows CHANGED, not rows matched, so 0 here is
      // ambiguous: either the book is already archived, or someone else got
      // there first. requireAdmin already proved the book exists, so this is a
      // no-op success rather than a 404.
      const [current] = await pool.query(
        "SELECT status, archived_at FROM books WHERE book_id = ? LIMIT 1",
        [book_id]
      );

      return res.json({
        message: "Book is already archived",
        status: current[0]?.status || "archived",
        archived_at: current[0]?.archived_at || null,
        changed: false,
      });
    }

    res.json({ message: "Book archived successfully", changed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error archiving book" });
  }
});

// Restore a previously archived book. Archiving is a soft delete, so this is
// the only way back - without it an archived book is unreachable from the UI.
// SECURITY: admin only
app.put("/api/books/:book_id/restore", requireAdminSession, async (req, res) => {
  try {
    const { book_id } = req.params;
    const admin_id = getAdminIdFromRequest(req);

    if (!(await requireAdmin(res, admin_id, book_id))) {
      return;
    }

    const [result] = await pool.query(
      "UPDATE books SET status = 'active', archived_at = NULL WHERE book_id = ?",
      [book_id]
    );

    if (result.affectedRows === 0) {
      // Same ambiguity as archive: the book exists, it is just already active.
      const [current] = await pool.query(
        "SELECT status, archived_at FROM books WHERE book_id = ? LIMIT 1",
        [book_id]
      );

      return res.json({
        message: "Book is already active",
        status: current[0]?.status || "active",
        archived_at: current[0]?.archived_at || null,
        changed: false,
      });
    }

    res.json({ message: "Book restored successfully", changed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error restoring book" });
  }
});

// ===== LESSONS ENDPOINTS =====

// GET all lessons for a book
// SECURITY: readable by the admin and by teachers the book was distributed to.
app.get("/api/lessons", requireSession, async (req, res) => {
  try {
    const { book_id } = req.query;
    const { adminId: admin_id, teacherId: teacher_id, studentId: student_id } = sessionIdentity(req);

    if (!book_id) {
      return res.status(400).json({ message: "book_id is required" });
    }

    if (student_id) {
      if (!(await canStudentAccessBook(student_id, book_id))) {
        return res.status(403).json({ message: "You do not have access to this book" });
      }
    } else if (!admin_id && !teacher_id) {
      return res.status(401).json({ message: "student_id, teacher_id or admin_id is required" });
    } else if (!(await validateBookReadAccess(res, book_id, admin_id, teacher_id))) {
      return;
    }

    const [lessons] = await pool.query(
      "SELECT * FROM lessons WHERE book_id = ? ORDER BY order_number ASC, lesson_number ASC",
      [book_id]
    );

    res.json({ lessons });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching lessons" });
  }
});

// GET single lesson with progress info
// SECURITY: readable by the admin and by teachers the book was distributed to.
app.get("/api/lessons/:lesson_id", requireSession, async (req, res) => {
  try {
    const { lesson_id } = req.params;
    const { adminId: admin_id, teacherId: teacher_id, studentId: student_id } = sessionIdentity(req);

    const [lessons] = await pool.query(
      "SELECT * FROM lessons WHERE lesson_id = ?",
      [lesson_id]
    );

    if (lessons.length === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (student_id) {
      if (!(await canStudentAccessLesson(student_id, lesson_id))) {
        return res.status(403).json({ message: "You do not have access to this lesson" });
      }
    } else if (!admin_id && !teacher_id) {
      return res.status(401).json({ message: "student_id, teacher_id or admin_id is required" });
    } else if (!(await validateLessonReadAccess(res, lesson_id, admin_id, teacher_id))) {
      return;
    }

    let progress = null;
    if (student_id) {
      const [progressRows] = await pool.query(
        "SELECT * FROM lesson_progress WHERE lesson_id = ? AND student_id = ?",
        [lesson_id, student_id]
      );
      progress = progressRows[0] || null;
    }

    res.json({ 
      lesson: lessons[0],
      progress
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching lesson" });
  }
});

// CREATE new lesson (with file upload)
// SECURITY: admin only. Lessons ship with the book, so teachers are read-only.
app.post("/api/lessons", lessonUpload.single("file"), requireAdminSession, async (req, res) => {
  try {
    const { book_id, title, content, is_published } = req.body;
    const admin_id = getAdminIdFromRequest(req);

    if (!book_id || !title) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!(await requireAdmin(res, admin_id, book_id))) {
      return;
    }

    const file_path = req.file ? `/uploads/lessons/${req.file.filename}` : null;
    const [lessonNumberRows] = await pool.query(
      `SELECT COALESCE(MAX(lesson_number), 0) + 1 AS next_lesson_number,
              COALESCE(MAX(order_number), 0) + 1 AS next_order_number
       FROM lessons
       WHERE book_id = ?`,
      [book_id]
    );
    const lessonNumber = Number(lessonNumberRows[0]?.next_lesson_number || 1);
    const orderNumber = Number(lessonNumberRows[0]?.next_order_number || lessonNumber);

    const [result] = await pool.query(
      `INSERT INTO lessons (book_id, lesson_number, title, content, file_path, order_number, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [book_id, lessonNumber, title, content || null, file_path, orderNumber, is_published || 1]
    );

    const [bookRows] = await pool.query(
      "SELECT title, course_id FROM books WHERE book_id = ? LIMIT 1",
      [book_id]
    );

    if (bookRows.length > 0) {
      const bookTitle = bookRows[0].title || 'your book';
      const courseIdForNotification = bookRows[0].course_id;

      // Only the students of teachers who actually hold this book.
      const teacherIds = await getBookTeacherIds(book_id);
      for (const teacherId of teacherIds) {
        const studentIds = await getAssignedStudentIds(teacherId, courseIdForNotification);
        if (!studentIds.length) continue;

        await createNotificationsForUsers(
          studentIds,
          'general',
          `New lesson added to ${bookTitle}`,
          `A new lesson "${title}" has been added to the book ${bookTitle}. Visit Books & Lessons to review it.`,
          book_id,
          'book',
          `/bookscontent/${book_id}`
        );
      }
    }

    res.status(201).json({ 
      message: "Lesson created successfully",
      lesson_id: result.insertId,
      lesson_number: lessonNumber,
      file_path
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating lesson" });
  }
});

// UPDATE lesson (with optional file replacement)
// SECURITY: admin only
app.put("/api/lessons/:lesson_id", lessonUpload.single("file"), requireAdminSession, async (req, res) => {
  try {
    const { lesson_id } = req.params;
    const { lesson_number, title, content, order_number, is_published } = req.body;
    const admin_id = getAdminIdFromRequest(req);

    // Get current lesson to resolve its book and keep the old file
    const [lessons] = await pool.query(
      "SELECT * FROM lessons WHERE lesson_id = ?",
      [lesson_id]
    );

    if (lessons.length === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (!(await requireAdmin(res, admin_id, lessons[0].book_id))) {
      return;
    }

    let file_path = lessons[0].file_path;
    if (req.file) {
      file_path = `/uploads/lessons/${req.file.filename}`;
    }

    const [result] = await pool.query(
      `UPDATE lessons SET lesson_number = ?, title = ?, content = ?, file_path = ?, order_number = ?, is_published = ? WHERE lesson_id = ?`,
      [lesson_number, title, content || null, file_path, order_number || lesson_number, is_published, lesson_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    res.json({ 
      message: "Lesson updated successfully",
      file_path
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating lesson" });
  }
});

// DELETE lesson
// SECURITY: admin only
app.delete("/api/lessons/:lesson_id", requireAdminSession, async (req, res) => {
  try {
    const { lesson_id } = req.params;
    const admin_id = getAdminIdFromRequest(req);

    const [lessons] = await pool.query(
      "SELECT lesson_id, book_id FROM lessons WHERE lesson_id = ? LIMIT 1",
      [lesson_id]
    );

    if (lessons.length === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (!(await requireAdmin(res, admin_id, lessons[0].book_id))) {
      return;
    }

    // Delete lesson progress records
    await pool.query(
      "DELETE FROM lesson_progress WHERE lesson_id = ?",
      [lesson_id]
    );

    // Delete lesson
    const [result] = await pool.query(
      "DELETE FROM lessons WHERE lesson_id = ?",
      [lesson_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    res.json({ message: "Lesson deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting lesson" });
  }
});

// ===== LESSON PROGRESS ENDPOINTS =====

// GET student's lesson progress
app.get("/api/lesson-progress", requireSession, async (req, res) => {
  try {
    const { book_id } = req.query;
    const student_id = progressStudentId(req);

    if (!student_id) {
      return res.status(400).json({ message: "student_id is required" });
    }

    let query = `
      SELECT lp.* FROM lesson_progress lp
      JOIN lessons l ON lp.lesson_id = l.lesson_id
    `;
    let params = [student_id];

    if (book_id) {
      query += " WHERE lp.student_id = ? AND l.book_id = ?";
      params.push(book_id);
    } else {
      query += " WHERE lp.student_id = ?";
    }

    query += " ORDER BY lp.updated_at DESC";

    const [progress] = await pool.query(query, params);
    res.json({ progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching lesson progress" });
  }
});

function normalizeLessonProgress(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed >= 100) return 100;
  return Math.max(0, Math.min(99, Math.floor(parsed)));
}

async function refreshStudentBookProgress(studentId, lessonId) {
  const [lessonRows] = await pool.query(
    `SELECT l.book_id, b.course_id, b.title AS book_title
     FROM lessons l
     JOIN books b ON b.book_id = l.book_id
     WHERE l.lesson_id = ?
     LIMIT 1`,
    [lessonId]
  );

  if (lessonRows.length === 0) return null;

  const { book_id: bookId, course_id: courseId, book_title: bookTitle } = lessonRows[0];
  const [existingProgressRows] = await pool.query(
    "SELECT status FROM student_course_progress WHERE student_id = ? AND book_id = ? LIMIT 1",
    [studentId, bookId]
  );
  const wasCompleted = existingProgressRows.length > 0 && existingProgressRows[0].status === 'Completed';

  const [lessonCountRows] = await pool.query(
    "SELECT COUNT(*) AS totalLessons FROM lessons WHERE book_id = ?",
    [bookId]
  );
  const totalLessons = Number(lessonCountRows[0]?.totalLessons || 0);

  const [completedRows] = await pool.query(
    `SELECT COUNT(DISTINCT lp.lesson_id) AS completedLessons
     FROM lesson_progress lp
     JOIN lessons l ON l.lesson_id = lp.lesson_id
     WHERE lp.student_id = ?
       AND l.book_id = ?
       AND (lp.is_completed = 1 OR lp.progress_percentage >= 100)`,
    [studentId, bookId]
  );
  const completedLessons = Number(completedRows[0]?.completedLessons || 0);
  const progressPercentage = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;
  const isCompleted = totalLessons > 0 && completedLessons === totalLessons;
  const status = isCompleted ? "Completed" : "In Progress";
  const completedAt = isCompleted ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;

  await pool.query(
    `INSERT INTO student_course_progress
       (student_id, book_id, course_id, status, completed_lessons, total_lessons, progress_percentage, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       course_id = VALUES(course_id),
       status = VALUES(status),
       completed_lessons = VALUES(completed_lessons),
       total_lessons = VALUES(total_lessons),
       progress_percentage = VALUES(progress_percentage),
       completed_at = CASE
         WHEN VALUES(status) = 'Completed' THEN COALESCE(student_course_progress.completed_at, VALUES(completed_at))
         ELSE NULL
       END`,
    [studentId, bookId, courseId, status, completedLessons, totalLessons, progressPercentage, completedAt]
  );

  if (status === 'Completed' && !wasCompleted) {
    // Every teacher holding the book hears about it, since any of them could be
    // the one teaching that student.
    const teacherIds = await getBookTeacherIds(bookId);
    if (teacherIds.length > 0) {
      const [studentRows] = await pool.query(
        "SELECT first_name, last_name FROM users WHERE user_id = ? LIMIT 1",
        [studentId]
      );
      const studentName = studentRows.length
        ? `${studentRows[0].first_name || ''} ${studentRows[0].last_name || ''}`.trim() || `Student ${studentId}`
        : `Student ${studentId}`;

      const notificationTitle = `Student completed ${bookTitle}`;
      const notificationMessage = `${studentName} has completed 100% of lessons in "${bookTitle}".`;

      await createNotificationsForUsers(
        teacherIds,
        'general',
        notificationTitle,
        notificationMessage,
        bookId,
        'book',
        `/teacherBooksLessons/${bookId}`
      );
    }
  }

  return {
    student_id: studentId,
    book_id: bookId,
    course_id: courseId,
    status,
    completed_lessons: completedLessons,
    total_lessons: totalLessons,
    progress_percentage: progressPercentage,
    completed_at: completedAt,
  };
}

// Save manual lesson completion for one student/lesson
app.post("/api/lesson-progress", requireSession, async (req, res) => {
  try {
    const { lesson_id, is_completed, progress_percentage, time_spent_minutes } = req.body;
    // Ignores any student_id in the body for a student session, so a forged id
    // cannot mark somebody else's lessons complete.
    const student_id = progressStudentId(req);

    if (!student_id || !lesson_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const manualComplete = is_completed === true || is_completed === 1 || is_completed === "1";
    const progressPercentage = manualComplete ? 100 : normalizeLessonProgress(progress_percentage);
    const isCompleted = progressPercentage >= 100 ? 1 : 0;
    const completedAt = isCompleted ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;

    // Check if record exists
    const [existing] = await pool.query(
      "SELECT progress_id, progress_percentage, is_completed, completed_at FROM lesson_progress WHERE student_id = ? AND lesson_id = ?",
      [student_id, lesson_id]
    );

    let savedProgress;

    if (existing.length > 0) {
      const savedProgressValue = normalizeLessonProgress(existing[0].progress_percentage);
      const nextProgress = Math.max(savedProgressValue, progressPercentage);
      const nextCompleted = existing[0].is_completed || nextProgress >= 100 ? 1 : 0;
      const nextCompletedAt = existing[0].completed_at || (nextCompleted ? completedAt : null);

      // Update existing
      await pool.query(
        `UPDATE lesson_progress 
         SET progress_percentage = ?, is_completed = ?, time_spent_minutes = GREATEST(COALESCE(time_spent_minutes, 0), ?), completed_at = ?
         WHERE student_id = ? AND lesson_id = ?`,
        [nextProgress, nextCompleted, time_spent_minutes || 0, nextCompletedAt, student_id, lesson_id]
      );

      savedProgress = {
        progress_id: existing[0].progress_id,
        student_id,
        lesson_id,
        progress_percentage: nextProgress,
        is_completed: nextCompleted,
        completed_at: nextCompletedAt,
      };
    } else {
      // Create new
      const [result] = await pool.query(
        `INSERT INTO lesson_progress (student_id, lesson_id, progress_percentage, is_completed, time_spent_minutes, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [student_id, lesson_id, progressPercentage, isCompleted, time_spent_minutes || 0, completedAt]
      );

      savedProgress = {
        progress_id: result.insertId,
        student_id,
        lesson_id,
        progress_percentage: progressPercentage,
        is_completed: isCompleted,
        completed_at: completedAt,
      };
    }

    const bookProgress = await refreshStudentBookProgress(student_id, lesson_id);
    const statusCode = existing.length > 0 ? 200 : 201;

    res.status(statusCode).json({
      message: existing.length > 0 ? "Lesson progress updated" : "Lesson progress created",
      progress: savedProgress,
      bookProgress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating lesson progress" });
  }
});

// GET teacher's books with lesson stats
// SECURITY: Only returns books owned by the requesting teacher
app.get("/api/teacher/books", requireSession, async (req, res) => {
  try {
    const { adminId: admin_id, teacherId: teacher_id } = sessionIdentity(req);
    // Defaults to 'active' so existing callers keep seeing only live books.
    // 'archived' powers the recycle bin; 'all' returns both.
    const { status = "active" } = req.query;

    if (!teacher_id) {
      return res.status(401).json({ message: "Unauthorized: teacher_id is required" });
    }

    // Defaults to 'active' so existing callers keep seeing only live books.
    // 'archived' powers the recycle bin and 'all' returns both.
    const whereClauses = [
      `EXISTS (
         SELECT 1 FROM book_teachers btc
         WHERE btc.book_id = b.book_id AND btc.teacher_id = ?
       )`,
    ];
    const params = [teacher_id];

    if (status === "active" || status === "archived") {
      whereClauses.push("b.status = ?");
      params.push(status);
    }

    // Read-only view of what the admin distributed to this teacher. Teachers
    // cannot add or change books, so nothing here exposes a write path.
    const [books] = await pool.query(
      `${bookListSelectFields}
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY b.created_at DESC`,
      params
    );

    res.json({ books });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching teacher books" });
  }
});

// GET the whole book library for the admin
// SECURITY: admin only. Unlike /api/books this also returns archived books and
// works without a status filter defaulting to 'active', because the admin is
// the one who recycles and restores.
app.get("/api/admin/books", requireAdminSession, async (req, res) => {
  try {
    const admin_id = getAdminIdFromRequest(req);

    if (!(await requireAdmin(res, admin_id))) {
      return;
    }

    const { status = "all", course_id } = req.query;
    const params = [];
    const whereClauses = [];

    if (status === "active" || status === "archived") {
      whereClauses.push("b.status = ?");
      params.push(status);
    }

    if (course_id) {
      whereClauses.push("b.course_id = ?");
      params.push(course_id);
    }

    let query = bookListSelectFields;
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }
    query += " ORDER BY b.created_at DESC";

    const [books] = await pool.query(query, params);
    res.json({ books });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching books" });
  }
});

app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`));
reportUploadPersistence();

const runClassStatusSweep = async () => {
  try {
    await Promise.all([
      expireFinishedPackages(pool),
      autoMarkPastClassesAsNoShow(pool),
      cleanupExpiredClassRecordings(pool),
      // After the expiry pass, so a package that has just expired is not warned
      // about on its way out.
      notifyUpcomingContractExpirations(pool),
      // Last, because it is the only task here that reads the package state the
      // expiry pass just settled. It throttles itself to hourly - it is called
      // every minute but only decides anything once an hour.
      archiveDormantAccounts(pool),
    ]);
  } catch (err) {
    console.error("Class status sweep error:", err);
  }
};

runClassStatusSweep();
setInterval(runClassStatusSweep, 60 * 1000);

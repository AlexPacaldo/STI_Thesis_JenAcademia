import fs from "fs";
import { google } from "googleapis";

const DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL || "";
const DRIVE_PRIVATE_KEY = (process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

const DRIVE_OAUTH_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID || "";
const DRIVE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET || "";
const DRIVE_OAUTH_REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "";

export function isGoogleDriveConfigured() {
  const serviceAccount = Boolean(DRIVE_CLIENT_EMAIL && DRIVE_PRIVATE_KEY);
  const oauth = Boolean(DRIVE_OAUTH_CLIENT_ID && DRIVE_OAUTH_CLIENT_SECRET && DRIVE_OAUTH_REFRESH_TOKEN);
  return serviceAccount || oauth;
}

function getDrive() {
  if (DRIVE_OAUTH_CLIENT_ID && DRIVE_OAUTH_CLIENT_SECRET && DRIVE_OAUTH_REFRESH_TOKEN) {
    const auth = new google.auth.OAuth2(DRIVE_OAUTH_CLIENT_ID, DRIVE_OAUTH_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: DRIVE_OAUTH_REFRESH_TOKEN });
    return google.drive({ version: "v3", auth });
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: "service_account",
      client_email: DRIVE_CLIENT_EMAIL,
      private_key: DRIVE_PRIVATE_KEY,
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

export async function uploadRecordingToDrive({ filePath, filename, mimeType }) {
  const drive = getDrive();
  let response;
  try {
    response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: DRIVE_FOLDER_ID ? [DRIVE_FOLDER_ID] : undefined,
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath),
      },
      fields: "id, webViewLink, webContentLink",
    });
  } catch (err) {
    const reason = err?.response?.data?.error || err?.message || "";
    if (err?.errors?.[0]?.reason === "authError" || /invalid_grant|serviceAccount|credentials/i.test(String(reason))) {
      if (DRIVE_OAUTH_REFRESH_TOKEN) {
        throw new Error("Google Drive authorization expired or was revoked. Re-run driveOAuthSetup.js and update GOOGLE_DRIVE_REFRESH_TOKEN in Railway.");
      }
      throw new Error("Google Drive auth failed. Check GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY.");
    }
    if (err?.response?.status === 404) {
      throw new Error(`Google Drive folder not found or not accessible. Check GOOGLE_DRIVE_FOLDER_ID (got "${DRIVE_FOLDER_ID}") and share that folder with ${DRIVE_OAUTH_REFRESH_TOKEN ? "the authorized Google account" : DRIVE_CLIENT_EMAIL}.`);
    }
    throw err;
  }

  const fileId = response.data.id;

  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch (err) {
    console.warn("Could not share recording with link:", err?.message || err);
  }

  const webContentLink =
    response.data.webContentLink || `https://drive.google.com/uc?id=${fileId}&export=download`;

  return { fileId, webViewLink: response.data.webViewLink || null, webContentLink };
}

export async function deleteRecordingFromDrive(recordingUrl) {
  if (!recordingUrl || !String(recordingUrl).startsWith("http")) return;

  const fileId = extractDriveFileId(String(recordingUrl));
  if (!fileId) return;

  try {
    const drive = getDrive();
    await drive.files.delete({ fileId });
  } catch (err) {
    if (err?.response?.status === 404) return;
    console.warn("Could not delete Google Drive recording:", err?.message || err);
  }
}

export function extractDriveFileId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("drive.google.com")) {
      const idParam = parsed.searchParams.get("id");
      if (idParam) return idParam;
      const dMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      if (dMatch) return dMatch[1];
    }
  } catch (err) {
    // ignore malformed URL
  }
  return "";
}
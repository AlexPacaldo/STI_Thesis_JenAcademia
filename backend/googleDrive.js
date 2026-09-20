import fs from "fs";
import { google } from "googleapis";

const DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL || "";
const DRIVE_PRIVATE_KEY = (process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

export function isGoogleDriveConfigured() {
  return Boolean(DRIVE_CLIENT_EMAIL && DRIVE_PRIVATE_KEY);
}

function getDrive() {
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
    if (err?.errors?.[0]?.reason === "authError" || /invalid_grant|serviceAccount|credentials/i.test(err?.message || "")) {
      throw new Error("Google Drive auth failed. Check GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY.");
    }
    if (err?.response?.status === 404) {
      throw new Error(`Google Drive folder not found or not accessible by the service account. Check GOOGLE_DRIVE_FOLDER_ID (got "${DRIVE_FOLDER_ID}") and share that folder with ${DRIVE_CLIENT_EMAIL}.`);
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
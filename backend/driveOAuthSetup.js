import http from "http";
import { google } from "googleapis";
import readline from "readline";

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const REDIRECT_PORT = 5378;

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n=== Google Drive OAuth setup ===");
  console.log("This lets your app upload recordings into YOUR Google Drive (15GB free).\n");

  const clientId = await ask(
    "Paste GOOGLE_DRIVE_CLIENT_ID (from Google Cloud Console): "
  );
  const clientSecret = await ask(
    "Paste GOOGLE_DRIVE_CLIENT_SECRET (from Google Cloud Console): "
  );

  if (!clientId || !clientSecret) {
    console.error("\nMissing client ID/secret. Aborting.");
    process.exit(1);
  }

  const oauth = new google.auth.OAuth2(clientId, clientSecret, `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`);
  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\nOpen this URL in a browser and sign in with the Google account you want to use:\n");
  console.log(authUrl);

  const authCode = await new Promise((resolve, reject) => {
    let responded = false;
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
        if (!responded && url.pathname === "/oauth2callback") {
          responded = true;
          const code = url.searchParams.get("code");
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Authorization complete. You can close this tab and return to the terminal.");
          server.close();
          resolve(code);
        } else {
          res.writeHead(404).end();
        }
      } catch (err) {
        reject(err);
      }
    });
    server.listen(REDIRECT_PORT, "127.0.0.1");
  });

  const { tokens } = await oauth.getToken(authCode);
  oauth.setCredentials(tokens);

  if (!tokens.refresh_token) {
    console.error("\nNo refresh token returned. Re-run and approve again (the 'consent' prompt forces it).");
    process.exit(1);
  }

  console.log("\n=== SUCCESS ===\n");
  console.log("Add these to Railway (Service -> Variables). KEEP THE REFRESH TOKEN PRIVATE:\n");
  console.log(`GOOGLE_DRIVE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_DRIVE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);

  let testFile;
  try {
    const drive = google.drive({ version: "v3", auth: oauth });
    testFile = await drive.files.create({
      requestBody: { name: "jen-academia-oauth-test", mimeType: "text/plain", parents: [] },
      media: { mimeType: "text/plain", body: "ok" },
      fields: "id",
    });
    console.log("\nOAuth works (uploaded a test file, id)", testFile.data.id);
  } catch (err) {
    console.error("\nOAuth token valid but Drive upload test failed:", err?.message || err);
  }
}

main().catch((err) => {
  console.error("\nSetup failed:", err?.message || err);
  process.exit(1);
});
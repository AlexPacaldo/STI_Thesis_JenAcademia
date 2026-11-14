// Isolated browser regression: every API response is mocked; no real account is used.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve("vite")));
const root = fileURLToPath(new URL("../frontend", import.meta.url));
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0 } });
let browser;
const temp = await mkdtemp(path.join(tmpdir(), "jen-account-qa-"));
const svgPath = path.join(temp, "invalid.svg");
const corruptPath = path.join(temp, "damaged.jpg");
try {
  await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await writeFile(corruptPath, "not an image");
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const crashes = [];
  page.on("pageerror", error => crashes.push(error.message));
  const user = { id: 999, firstName: "Profile", lastName: "Tester", email: "qa@example.invalid", role: "student", country: "Philippines",
    birthDate: "2000-01-01", timezone: "Asia/Manila", profileCompleted: true, passwordChanged: true, stayLoggedIn: true,
    status: "active", profileImageUrl: "", roleDetails: {} };
  await page.evaluateOnNewDocument(user => {
    localStorage.setItem("JenAcademia.user", JSON.stringify(user));
    localStorage.setItem("jen-academia.session-token", "isolated-ui-test");
  }, user);
  let releaseLine;
  const linePending = new Promise(resolve => { releaseLine = resolve; });
  let updates = 0;
  await page.setRequestInterception(true);
  page.on("request", async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) {
      if (url.origin === base || ["data:", "blob:"].includes(url.protocol)) return request.continue();
      return request.abort();
    }
    const headers = { "access-control-allow-origin": base, "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "content-type": "application/json" };
    if (request.method() === "OPTIONS") return request.respond({ status: 204, headers });
    let status = 200;
    let body = {};
    if (url.pathname === "/api/users/999/line") {
      await linePending;
      status = 503; body = { message: "LINE temporarily unavailable" };
    } else if (url.pathname === "/api/users/999" && request.method() === "GET") body = { user };
    else if (["/api/users/999", "/api/users/999/password"].includes(url.pathname) && request.method() === "PUT") {
      updates++;
      status = 400; body = { code: "INCORRECT_PASSWORD", message: "That password is not correct. Please try again." };
    } else if (url.pathname.includes("notifications")) body = { notifications: [], unreadCount: 0, total: 0 };
    else if (url.pathname.includes("contract-reviews")) body = { reviews: [] };
    await request.respond({ status, headers, body: JSON.stringify(body) });
  });
  await page.goto(`${base}/account`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("h1")?.textContent.includes("Profile"));
  assert.equal(new URL(page.url()).pathname, "/account");
  console.log("Account renders while the LINE request is still pending.");
  releaseLine();
  await page.waitForFunction(() => document.body.textContent.includes("Your account details are still available."));
  assert(await page.$("h1"));

  async function clickButton(text) {
    await page.waitForFunction(label => [...document.querySelectorAll("button")].some(button => button.textContent.trim() === label), { timeout: 5000 }, text).catch(async error => {
      console.log(await page.evaluate(() => ({ path: location.pathname,
        buttons: [...document.querySelectorAll("button")].map(button => button.textContent.trim()),
        invalid: [...document.querySelectorAll("input:invalid,select:invalid")].map(input => ({ name: input.name, message: input.validationMessage })),
        alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map(node => node.textContent) })));
      throw error;
    });
    const buttons = await page.$$("button");
    for (const button of buttons) {
      if ((await button.evaluate(node => node.textContent.trim())) === text) { await button.click(); return; }
    }
    throw new Error(`Button not found: ${text}`);
  }
  async function fill(selector, text) {
    await page.waitForSelector(selector, { visible: true });
    await page.focus(selector);
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.type(selector, text);
    assert.equal(await page.$eval(selector, node => node.value), text);
  }
  await clickButton("Change my details");
  await fill('input[name="firstName"]', "Bad123");
  await page.waitForSelector('#profile-firstName-error[role="alert"]');
  assert.equal(updates, 0);
  await fill('input[name="firstName"]', "José");
  const password = 'input[autocomplete="current-password"]';
  await fill(password, "wrong-password");
  assert.equal(await page.$$eval('button[aria-label="Show current password"]', nodes => nodes.length), 1);
  await page.click('button[aria-label="Show current password"]');
  assert.equal(await page.$eval(password, node => node.type), "text");
  await page.click('button[aria-label="Hide current password"]');
  assert.equal(await page.$eval(password, node => node.type), "password");
  await clickButton("Save my details");
  await clickButton("Save Changes");
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(node => node.textContent.includes("password is not correct")));
  assert.equal(new URL(page.url()).pathname, "/account");
  assert.equal(await page.evaluate(() => localStorage.getItem("jen-academia.session-token")), "isolated-ui-test");
  assert.equal(await page.$eval('input[name="firstName"]', node => node.value), "José");
  await clickButton("Cancel");
  console.log("Name validation, a single password toggle, and wrong-password session preservation passed.");

  await clickButton("Change my password");
  await fill('input[name="currentPassword"]', "wrong-password");
  await fill('input[name="newPassword"]', "a-new-password");
  await fill('input[name="confirmPassword"]', "a-new-password");
  assert.equal(await page.$$eval('button[aria-label^="Show "]', nodes => nodes.length), 3);
  await page.click('button[aria-label="Show new password"]');
  assert.equal(await page.$eval('input[name="newPassword"]', node => node.type), "text");
  assert.equal(await page.$eval('input[name="currentPassword"]', node => node.type), "password");
  assert.equal(await page.$eval('input[name="confirmPassword"]', node => node.type), "password");
  await clickButton("Save my password");
  await clickButton("Update Password");
  await page.waitForFunction(() => document.querySelector('input[name="currentPassword"]')?.value === "");
  assert.equal(updates, 2);
  assert.equal(await page.evaluate(() => localStorage.getItem("jen-academia.session-token")), "isolated-ui-test");
  assert.equal(await page.$eval('input[name="newPassword"]', node => node.value), "a-new-password");
  await clickButton("Cancel");
  console.log("Password-change rejection preserves the session; each visibility toggle controls only its own field.");

  const fileInput = await page.$('input[type="file"][aria-label="Choose a profile picture"]');
  await fileInput.uploadFile(svgPath);
  await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(node => node.textContent.includes("JPG, PNG, WebP, or GIF")));
  assert.equal(await page.$('img[alt="Crop preview"]'), null);
  await fileInput.uploadFile(corruptPath);
  await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(node => node.textContent.includes("damaged")));
  assert.equal(await page.$('img[alt="Crop preview"]'), null);
  assert.deepEqual(crashes, []);
  console.log("Unsupported and damaged profile pictures produce clear errors; no render crashes.");
} finally {
  await browser?.close();
  await server.close();
  await unlink(svgPath).catch(() => {});
  await unlink(corruptPath).catch(() => {});
  await rmdir(temp);
}

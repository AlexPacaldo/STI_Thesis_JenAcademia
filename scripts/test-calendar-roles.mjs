/**
 * A functional sweep of the Calendar page, for every role.
 *
 *   node scripts/test-calendar-roles.mjs
 *
 * !! The Calendar page is the busiest screen in the app and it serves three
 * !! audiences - a student, a teacher and an admin - from one component. A
 * !! redesign of the student half can quietly break the teacher half, and
 * !! nothing in the repo would notice, because no test drives a browser.
 * !!
 * !! So this drives a real browser and checks the things that have to work:
 * !! the student's booking form finds the teacher's free times, the teacher's
 * !! grid and availability manager still open, the admin's calendar still
 * !! loads, and the rule about which requests a student may make is still
 * !! enforced.
 * !!
 * !! READ-ONLY. It opens panels, picks days and times, and checks that
 * !! things happen. It never submits - the API points at a live database, and
 * !! a check that books a class would leave rubbish in somebody's account.
 * !!
 * !! It needs a browser driver:
 * !!
 * !!   npm i -D puppeteer-core
 * !!
 * !! and a browser. It uses the Edge that is already installed on Windows.
 * !! Without the driver it says so and passes, so it never blocks a commit.
 * !!
 * !! It talks to a backend on http://localhost:3001 by default. The frontend's
 * !! .env points at the deployed API, so the requests are rewritten - that is
 * !! how you check a backend fix before deploying it. Set API_LOCAL=0 to
 * !! check the deployed backend instead.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.BASE_URL || "http://localhost:5173";
const PROD_API = process.env.PROD_API_URL || "https://stithesisjenacademia-production.up.railway.app";
const LOCAL_API = process.env.LOCAL_API_URL || "http://localhost:3001";
const USE_LOCAL_API = process.env.API_LOCAL !== "0";

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
];

const edgePath = EDGE_PATHS.find((p) => existsSync(p));

let puppeteer = null;
try {
  puppeteer = (await import("puppeteer-core")).default;
} catch {
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    puppeteer = require("puppeteer-core");
  } catch {
    console.log("puppeteer-core is not installed - skipping the browser sweep.");
    console.log("  npm i -D puppeteer-core   (then run this again)");
    process.exit(0);
  }
}

if (!edgePath) {
  console.log("No browser found - skipping the browser sweep.");
  process.exit(0);
}

let passed = 0;
const failures = [];

function ok(label, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push(`  - ${label}${detail ? `\n      ${detail}` : ""}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A fresh browser per role. Signing one role out and the next one in
 * inside one browser is a race with the app's own session handling, and a
 * flaky check is worse than no check.
 */
async function asRole(email, password, run) {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    if (USE_LOCAL_API) {
      await page.setRequestInterception(true);
      page.on("request", (r) => {
        if (r.url().startsWith(PROD_API)) r.continue({ url: r.url().replace(PROD_API, LOCAL_API) });
        else r.continue();
      });
    }

    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));

    await page.setViewport({ width: 1440, height: 1000 });

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    for (const b of await page.$$("button")) {
      const t = await page.evaluate((el) => el.textContent.trim(), b);
      if (t === "Log In") {
        await b.click();
        break;
      }
    }

    // Wait for the session to land rather than guessing at a delay.
    await page
      .waitForFunction(() => !!localStorage.getItem("jen-academia.session-token"), { timeout: 30000 })
      .catch(() => {});

    await run({
      page,
      body: () => page.evaluate(() => document.body.innerText),
      labels: () =>
        page.evaluate(() =>
          [...document.querySelectorAll("button")].map((b) => b.textContent.replace(/\s+/g, " ").trim())
        ),
      clickButton: async (label) => {
        for (const b of await page.$$("button")) {
          const t = await page.evaluate((el) => el.textContent.replace(/\s+/g, " ").trim(), b);
          if (t === label) {
            await b.click();
            return true;
          }
        }
        return false;
      },
      clickButtonMatching: async (needle) => {
        for (const b of await page.$$("button")) {
          const t = await page.evaluate((el) => el.textContent.replace(/\s+/g, " ").trim(), b);
          if (t.includes(needle)) {
            await b.click();
            return true;
          }
        }
        return false;
      },
      errors: pageErrors,
      /** Wait for the page to have rendered its content, not for a guess. */
      waitFor: (text, timeout = 30000) =>
        page.waitForFunction(
          (needle) => document.body.innerText.includes(needle),
          { timeout },
          text
        ),
      /** Wait for something to go away - a loading state, usually. */
      waitForGone: (text, timeout = 30000) =>
        page.waitForFunction(
          (needle) => !document.body.innerText.includes(needle),
          { timeout },
          text
        ),
    });
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------- the student */

// A student with a LIVE plan: 20 classes, ending in January.
await asRole("AlexPacaldo@gmail.com", "JEN2026!", async (t) => {
  await t.page.goto(`${BASE}/Calendar`, { waitUntil: "domcontentloaded" });
  await t.waitFor("Classes left");
  await t.waitForGone("Loading your plan...");
  await wait(500);

  let body = await t.body();
  ok("the student's page loads", body.includes("My classes"));
  ok("the counter is on it", body.includes("Classes left"));
  ok("the book button is on it", (await t.labels()).includes("Book a class"));

  // The booking form.
  ok("the booking form opens", await t.clickButton("Book a class"));
  await wait(2500);
  body = await t.body();
  ok("it asks which day", body.includes("Which day?"));
  ok("it asks which time", body.includes("Times"));

  // The strip has to know which days the teacher is free. It is the month
  // grid's colours, in a form that fits a phone.
  const dayTitles = await t.page.evaluate(() =>
    [...document.querySelectorAll("button[title]")]
      .map((el) => el.getAttribute("title"))
      .filter((x) => x && x.includes("teacher"))
  );
  ok("the strip knows which days the teacher is free", dayTitles.some((x) => x.includes("free on this day")), JSON.stringify(dayTitles.slice(0, 3)));
  ok("and which days they are not", dayTitles.some((x) => x.includes("no classes set")));

  // Pick the free day; the times must appear.
  for (const b of await t.page.$$("button[title]")) {
    const title = await t.page.evaluate((el) => el.getAttribute("title"), b);
    if (title && title.includes("free on this day")) {
      await b.click();
      break;
    }
  }
  await wait(2500);
  const times = (await t.labels()).filter((x) => /^\d{1,2}:\d{2} (AM|PM)$/.test(x));
  ok("the free times appear", times.length > 0, JSON.stringify(times));

  if (times.length) {
    await t.clickButton(times[0]);
    await wait(1200);
    ok("the time is added to the picks", (await t.body()).includes("Your picks"));
  }

  await t.clickButton("Cancel");
  await wait(1200);

  // The rule: a live plan means neither ask is offered. A new plan would
  // replace the contract and throw the unused classes away.
  const labels = await t.labels();
  ok(
    "a student with a live plan is offered neither ask",
    !labels.some((x) => x.includes("more time")) && !labels.some((x) => x.includes("new plan")),
    JSON.stringify(labels)
  );

  ok("no page errors on the student's page", t.errors.length === 0, JSON.stringify(t.errors));
});

/* ------------------------------------- a student whose plan has ended */

await asRole("danica.pope@student.jenacademia.local", "JEN2026!", async (t) => {
  await t.page.goto(`${BASE}/Calendar`, { waitUntil: "domcontentloaded" });
  await t.waitFor("Classes left");
  await t.waitForGone("Loading your plan...");
  await wait(500);

  const labels = await t.labels();
  ok(
    "a student whose plan ended is offered more time",
    labels.some((x) => x.includes("more time")),
    JSON.stringify(labels)
  );

  await t.clickButtonMatching("more time");
  await wait(2000);
  const body = await t.body();
  ok("the more-time window asks one question", body.includes("Why do you need more time?"));
  ok("and has a way to send it", body.includes("Send"));
});

/* ------------------------------------------------------------ the teacher */

await asRole("gina.delacruz@jenacademia.local", "JEN2026!", async (t) => {
  await t.page.goto(`${BASE}/Calendar`, { waitUntil: "domcontentloaded" });
  await t.waitFor("Actions");
  await wait(500);

  const body = await t.body();
  const labels = await t.labels();
  ok("the teacher still gets the month grid", /Sun\s+Mon\s+Tue/.test(body.replace(/\s+/g, " ")));
  ok("the teacher still gets the Actions panel", body.includes("Actions"));
  ok("the teacher can still set availability", labels.includes("Set Availability"));
  ok("the teacher can still jump to today", labels.includes("Jump to Today"));
  ok("the colour key is there for the teacher", body.includes("What the colours mean"));

  await t.clickButton("Set Availability");
  await wait(2500);
  ok("the availability manager still opens", /availability/i.test(await t.body()));

  ok("no page errors on the teacher's page", t.errors.length === 0, JSON.stringify(t.errors));
});

/* -------------------------------------------------------------- the admin */

await asRole("admin@jenacademia.local", "JEN2026!", async (t) => {
  await t.page.goto(`${BASE}/AdminDashboard?tab=calendar`, { waitUntil: "domcontentloaded" });
  await t.waitFor("Sun");
  await wait(1000);

  const body = await t.body();
  ok("the admin's calendar loads", body.length > 200);
  ok("and still has the month grid", /Sun\s+Mon\s+Tue/.test(body.replace(/\s+/g, " ")));

  ok("no page errors on the admin's calendar", t.errors.length === 0, JSON.stringify(t.errors));
});

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.log("FAILED:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("All good.");

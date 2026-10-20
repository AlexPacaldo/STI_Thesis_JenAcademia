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
  await t.waitFor("CLASSES LEFT");
  await t.waitForGone("Loading your plan...");
  await wait(500);

  let body = await t.body();
  ok("the student's page loads", body.includes("My classes"));
  ok("the counter is on it", body.includes("CLASSES LEFT"));
  ok("the book button is on it", (await t.labels()).some((x) => x.includes("Book a class")));

  // When the student's plan ends, read off the page.
  //
  // !! Read BEFORE the wizard opens, because the wizard replaces the home
  // !! screen and the badge goes with it. And read it rather than writing the
  // !! date down here, because the demo's plan moves as the days pass and a
  // !! test that hard-codes a date fails for a reason that has nothing to do
  // !! with the thing it is testing.
  const planEnd = await t.page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((x) =>
      /^Your plan ends on /.test((x.textContent || "").trim())
    );
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  });
  ok("the student is told when their plan ends", /Your plan ends on /.test(planEnd), planEnd);

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const planMatch = planEnd.match(/Your plan ends on ([A-Za-z]+) (\d{1,2}), (\d{4})/);
  const planLastDay = planMatch
    ? `${new Date(Date.UTC(2020, MONTHS.indexOf(planMatch[1]), 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} ${planMatch[2]}`
    : "";

  // The booking wizard.
  //
  // !! The booking form is a wizard now: one question per screen, big
  // !! buttons, and the class shown in full before anything is booked. This
  // !! check walks it the way a child would - press the big card, press the
  // !! day, press the time, press Next, read the class, and leave.
  ok("the booking form opens", await t.clickButtonMatching("Book a class"));
  await wait(1200);
  body = await t.body();
  ok("it asks how to book", body.includes("How do you want to book?"));
  ok("and offers one time", body.includes("One time"));
  ok("or every week", body.includes("Every week"));

  ok("the one-time way opens the day screen", await t.clickButtonMatching("One time"));
  await wait(1200);
  body = await t.body();
  ok("it asks which day", body.includes("Which day?"));
  ok("and says which step it is", body.includes("Step 1 of 3"));

  // The month picker.
  //
  // !! The days a student books from used to be a strip of fourteen days, so
  // !! a student whose plan runs for three months was shown two weeks of it -
  // !! and a free Saturday in November was a day they could not see. The
  // !! picker moves month by month now, and it stops at the end of the plan:
  // !! a day past it is a day they cannot book.
  const monthPicker = async () =>
    t.page.evaluate(() => {
      const wizard = document.querySelector("div[class*='wizard']");
      if (!wizard) return null;
      const name = wizard.querySelector("span[class*='monthName']");
      const back = wizard.querySelector('[aria-label="Previous month"]');
      const next = wizard.querySelector('[aria-label="Next month"]');
      const days = [...wizard.querySelectorAll("button[class*='dayCard']")];
      const last = days[days.length - 1];
      const lastNumber = last?.querySelector("span[class*='dayNumber']")?.textContent.trim();
      const lastMonth = last?.querySelector("span[class*='dayMonth']")?.textContent.trim();
      return {
        month: name?.textContent.trim() || "",
        backOn: back ? !back.disabled : false,
        nextOn: next ? !next.disabled : false,
        loading: Boolean(wizard.querySelector("div[class*='loading']")),
        dayCount: days.length,
        lastDay: lastNumber ? `${lastMonth} ${lastNumber}` : "",
      };
    });

  // Wait for the days of the month to arrive.
  //
  // !! Changing month asks the server which days the teacher works in that
  // !! month, and the screen shows a placeholder while it waits. A test that
  // !! reads the screen before the answer lands sees an empty month and
  // !! blames the month picker.
  const settle = async () => {
    for (let i = 0; i < 40; i += 1) {
      const state = await monthPicker();
      if (state && !state.loading) return state;
      await wait(400);
    }
    return monthPicker();
  };

  const firstMonth = await settle();
  ok("the day screen has a month picker", Boolean(firstMonth?.month), JSON.stringify(firstMonth));
  ok("and it starts on this month", /\d{4}$/.test(firstMonth?.month || ""), firstMonth?.month);
  ok("and it cannot go back before today", firstMonth?.backOn === false, JSON.stringify(firstMonth));

  // Walk forward until the picker refuses to go further.
  let lastMonth = firstMonth;
  let monthsWalked = 0;
  while (lastMonth?.nextOn && monthsWalked < 8) {
    await t.page.evaluate(() => {
      const wizard = document.querySelector("div[class*='wizard']");
      wizard?.querySelector('[aria-label="Next month"]')?.click();
    });
    await wait(600);
    lastMonth = await settle();
    monthsWalked += 1;
  }
  ok("the picker can move between months", monthsWalked >= 1, `walked ${monthsWalked}`);
  ok("and it stops at the end of the plan", lastMonth?.nextOn === false, JSON.stringify(lastMonth));
  ok(
    "and the last day offered is the day the plan ends",
    Boolean(planLastDay) && (lastMonth?.lastDay || "") === planLastDay,
    `${lastMonth?.lastDay} / ${planLastDay}`
  );

  // Back to this month, where the free days are.
  for (let i = 0; i < monthsWalked; i += 1) {
    await t.page.evaluate(() => {
      const wizard = document.querySelector("div[class*='wizard']");
      wizard?.querySelector('[aria-label="Previous month"]')?.click();
    });
    await wait(600);
    await settle();
  }
  const backHome = await monthPicker();
  ok("and it can come back to this month", backHome?.month === firstMonth?.month, JSON.stringify(backHome));

  // The strip has to know which days the teacher is free. It is the month
  // grid's colours, in a form that fits a phone.
  const dayTitles = await t.page.evaluate(() =>
    [...document.querySelectorAll("button[title]")]
      .map((el) => el.getAttribute("title"))
      .filter((x) => x && x.includes("teacher"))
  );
  ok("the strip knows which days the teacher is free", dayTitles.some((x) => x.includes("free on this day")), JSON.stringify(dayTitles.slice(0, 3)));
  ok("and which days they are not", dayTitles.some((x) => x.includes("no classes set")));

  // Pick the free day; the times must appear on the next screen.
  for (const b of await t.page.$$("button[title]")) {
    const title = await t.page.evaluate((el) => el.getAttribute("title"), b);
    if (title && title.includes("free on this day")) {
      await b.click();
      break;
    }
  }
  await wait(2500);
  ok("the day screen has a next button", await t.clickButton("Next"));
  await wait(2500);

  body = await t.body();
  ok("it asks which time", body.includes("Which time?"));
  ok("and says which step it is now", body.includes("Step 2 of 3"));

  const times = (await t.labels()).filter((x) => /^\d{1,2}:\d{2} (AM|PM)/.test(x));
  ok("the free times appear", times.length > 0, JSON.stringify(times));

  if (times.length) {
    await t.clickButtonMatching(times[0]);
    await wait(1200);
    ok("the next button is live once a time is picked", await t.clickButton("Next"));
    await wait(1200);

    body = await t.body();
    ok("the class is shown before it is booked", body.includes("Is this right?"));
    ok("and there is a book button", (await t.labels()).includes("Book it"));
  }

  await t.clickButton("Cancel");
  await wait(1200);

  // The weekly way: every free time across the whole plan.
  //
  // !! The search used to stop at the end of the booking window, and it
  // !! offered every one of those days to a student whose plan ended in the
  // !! middle of them. A class booked on a day the plan does not reach is a
  // !! class nobody can pay for, so the plan is the end of the search.
  ok("the booking form opens again", await t.clickButtonMatching("Book a class"));
  await wait(1200);
  ok("the weekly way opens", await t.clickButtonMatching("Every week"));
  await wait(1500);

  // Every day of the week, so the search does not depend on which days the
  // demo teacher happens to work.
  await t.page.evaluate(() => {
    const cards = [...document.querySelectorAll("button[class*='weekdayCard']")];
    cards.forEach((card) => {
      if (card.getAttribute("aria-pressed") !== "true") card.click();
    });
  });
  await wait(800);

  ok("it goes on to the time step", await t.clickButton("Next"));
  await wait(1500);
  body = await t.body();
  ok("and asks what time", body.includes("What time?"));

  // An exact time, so the answer does not depend on which part of the day the
  // demo teacher works.
  ok("it offers another time", await t.clickButtonMatching("Another time"));
  await wait(800);
  await t.page.evaluate(() => {
    const input = document.querySelector("input[type='time']");
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "10:00");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(800);

  ok("the times are found", await t.clickButtonMatching("Find my times"));

  // Wait for the times to arrive rather than guessing.
  let foundDates = [];
  for (let i = 0; i < 60; i += 1) {
    foundDates = await t.page.evaluate(() =>
      [...document.querySelectorAll("div[class*='foundDate']")].map((x) => x.textContent.trim())
    );
    if (foundDates.length) break;
    await wait(1000);
  }
  ok("the times are shown", foundDates.length > 0, JSON.stringify(foundDates.slice(0, 3)));

  // None of them may be on a day the student's plan does not reach.
  const planEndDate = planMatch ? new Date(`${planMatch[1]} ${planMatch[2]}, ${planMatch[3]}`) : null;
  const tooLate = foundDates.filter((text) => {
    const when = new Date(text);
    return planEndDate && !Number.isNaN(when.getTime()) && when > planEndDate;
  });
  ok("and none of them is past the end of the plan", tooLate.length === 0, JSON.stringify(tooLate.slice(0, 3)));

  // And they must reach beyond the first month when the teacher works later.
  const months = new Set(
    foundDates.map((text) => {
      const when = new Date(text);
      return Number.isNaN(when.getTime()) ? "" : when.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    })
  );
  ok("and they cover more than one month", months.size > 1 || foundDates.length === 0, JSON.stringify([...months]));

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
  await t.waitFor("CLASSES LEFT");
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
  await t.waitFor("ACTIONS");
  await wait(500);

  const body = await t.body();
  const labels = await t.labels();
  ok("the teacher still gets the month grid", /SUN\s+MON\s+TUE/.test(body.replace(/\s+/g, " ")));
  ok("the teacher still gets the Actions panel", body.includes("ACTIONS"));
  ok("the teacher can still set availability", labels.some((x) => x.includes("Set Availability")));
  ok("the teacher can still jump to today", labels.some((x) => x.includes("Jump to Today")));
  ok("the colour key is there for the teacher", body.includes("What the colours mean"));

  await t.clickButtonMatching("Set Availability");
  await wait(2500);
  ok("the availability manager still opens", /Set Your Schedule/i.test(await t.body()));

  ok("no page errors on the teacher's page", t.errors.length === 0, JSON.stringify(t.errors));
});

/* -------------------------------------------------------------- the admin */

await asRole("admin@jenacademia.local", "JEN2026!", async (t) => {
  await t.page.goto(`${BASE}/AdminDashboard?tab=calendar`, { waitUntil: "domcontentloaded" });
  await t.waitFor("SUN");
  await wait(1000);

  const body = await t.body();
  ok("the admin's calendar loads", body.length > 200);
  ok("and still has the month grid", /SUN\s+MON\s+TUE/.test(body.replace(/\s+/g, " ")));

  ok("no page errors on the admin's calendar", t.errors.length === 0, JSON.stringify(t.errors));
});

console.log(`${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.log("FAILED:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("All good.");

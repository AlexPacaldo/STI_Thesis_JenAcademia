import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

// Local browser regression with a completed contract and delayed API responses.
// All API traffic is mocked; no student records are read or changed.
const executablePath = process.env.BROWSER_PATH || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
].find(existsSync);
assert(executablePath, "Set BROWSER_PATH to an installed Chromium browser.");
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const user = { id: 3, role: "student", firstName: "Test", profileCompleted: true,
    assignedTeacherId: 2, timezone: "Asia/Manila", stayLoggedIn: true };
  const cls = { id: 187, class_id: 187, student_id: 3, teacher_id: 2,
    scheduled_date: date, start_time: "09:40:00", end_time: "10:30:00", duration: 50,
    teacher_timezone: "Asia/Manila", status: "scheduled", class_name: "Conversational English",
    teacher_name: "Test Teacher" };
  let submitted = false;
  let activePlan = false;
  let availabilityRequests = 0;
  let releaseClassroom;
  let classroomRequested = false;
  const classroomGate = new Promise(resolve => { releaseClassroom = resolve; });
  await page.evaluateOnNewDocument(value => {
    localStorage.setItem("JenAcademia.user", JSON.stringify(value));
    localStorage.setItem("jen-academia.session-token", "mock-session");
  }, user);
  await page.setRequestInterception(true);
  page.on("request", async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) {
      if (url.origin === "http://127.0.0.1:5173") return request.continue();
      return request.abort();
    }
    const path = url.pathname;
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS" };
    const respond = body => request.respond({ status: 200, contentType: "application/json",
      headers, body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return respond({});
    if (path.endsWith("/stream/3")) return request.respond({ status: 200, headers,
      contentType: "text/event-stream", body: ": mock\n\n" });
    if (path === "/api/contract-reviews/1/student") {
      submitted = true;
      return respond({ message: "Review submitted." });
    }
    if (path === "/api/contract-reviews") return respond({ reviews: [{
      review_id: 1, package_id: 1, teacher_name: "Test Teacher", student_name: "Test",
      total_classes: 1, pending_for_you: !submitted, review_complete: submitted,
      student_review: submitted ? { average: 5, scores: {}, submitted_at: date } : null,
    }] });
    if (path === "/api/users/3") return respond({ user });
    if (path.endsWith("/line")) return respond({ setupRequired: false });
    if (path.endsWith("/guide-progress")) return respond({ progress: {
      calendarCompleted: true, firstStepsCompleted: true } });
    if (path.includes("assigned-teacher")) return respond({ assigned_teacher_id: 2, teacher_name: "Test Teacher" });
    if (path.includes("/student/profile/")) return respond({ profile: { course_duration: 50 } });
    if (path.includes("student-package")) return respond({ package: activePlan ? {
      total_classes: 10, classes_used: 1, booked_classes: 1, classes_left: 9,
      expires_at: "2099-01-01", class_duration: 50,
    } : null,
      latest_package: { total_classes: 1, classes_used: 1, expires_at: "2099-01-01" } });
    if (path.endsWith("classes-by-month")) return respond({ classesByDate: { [date]: [cls] } });
    if (path.endsWith("upcoming-classes")) {
      await new Promise(resolve => setTimeout(resolve, 250));
      return respond({ classes: [cls] });
    }
    if (path.endsWith("teacher-booking-conflicts")) availabilityRequests++;
    if (path.endsWith("/187/schedule")) {
      classroomRequested = true;
      await classroomGate;
      return respond({ class: cls });
    }
    return respond({ classes: [], records: [], requests: [], bookedDates: [],
      notifications: [], unreadCount: 0, messages: [], proposals: [], invitations: [] });
  });
  const base = process.env.BASE_URL || "http://127.0.0.1:5173";
  await page.goto(`${base}/ContractReview`);
  await page.waitForSelector('input[type="radio"]');
  await page.$$eval('input[type="radio"][value="5"]', inputs => inputs.forEach(input => input.click()));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find(button => /submit/i.test(button.textContent)).click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert(submitted, "The required student review was submitted.");
  await page.evaluate(() => document.querySelector('a[href="/Calendar"]').click());
  await page.waitForFunction(() => document.body.textContent.includes("Conversational English"));
  assert.equal(new URL(page.url()).search, "", "Loading classes must keep the calendar list open.");
  assert.equal(availabilityRequests, 0, "The class list must not load booking conflicts or calculate booking slots.");

  // Direct notification links must still open, but a late schedule lookup
  // must not restore a class after the student returns to the list.
  await page.goto(`${base}/Calendar?classId=187`);
  await page.waitForFunction(() => document.querySelector('a[href="/Calendar"]'));
  const deadline = Date.now() + 10000;
  while (!classroomRequested && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert(classroomRequested, "The class link started its date lookup.");
  await page.evaluate(() => document.querySelector('a[href="/Calendar"]').click());
  await page.waitForFunction(() => !location.search);
  releaseClassroom();
  await page.waitForNetworkIdle({ idleTime: 300 });
  assert.equal(new URL(page.url()).search, "");
  assert.equal(await page.evaluate(() => document.body.textContent.includes("Back to my classes")), false,
    "A stale schedule response must not reopen details on the class list.");

  await page.goto(`${base}/Calendar?classId=187`);
  await page.waitForFunction(() => document.body.textContent.includes("Back to my classes"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find(button => button.textContent.includes("Back to my classes")).click());
  await page.waitForFunction(() => !location.search);
  await page.waitForSelector('[data-calendar-guide="class"]');
  await page.click('[data-calendar-guide="class"]');
  await page.waitForFunction(() => location.search.includes("classId=187")
    && document.body.textContent.includes("Back to my classes"));
  assert.equal(new URL(page.url()).searchParams.get("date"), date);

  activePlan = true;
  await page.goto(`${base}/Calendar`);
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some(button => button.textContent.includes("Book a class") && !button.disabled));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find(button => button.textContent.includes("Book a class")).click());
  await page.waitForNetworkIdle({ idleTime: 300 });
  assert(availabilityRequests > 0, "Opening booking still loads teacher availability and conflicts.");
  assert.deepEqual(errors, []);
  console.log("Review submission, calendar list, stale responses, class links, and booking checks passed.");
} finally {
  await browser.close();
}

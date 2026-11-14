// Uses real React/CSS and mocked APIs; no real conversations are read or changed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve("vite")));
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import {createRoot} from '/node_modules/.vite/deps/react-dom_client.js';
import ChatPanel from '/src/components/ChatPanel.jsx';
import '/src/index.css';
function Fixture(){const [open,setOpen]=React.useState(true);return React.createElement(React.Fragment,null,
React.createElement('button',{id:'open-chats',onClick:()=>setOpen(true)},'Open chats'),
React.createElement(ChatPanel,{user:{id:1,role:'student'},isOpen:open,onClose:()=>setOpen(false)}));}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`;
const server = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)),
  server: { host: "127.0.0.1", port: 0 },
  plugins: [{ name: "chat-qa-fixture", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__chat-qa")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml("/__chat-qa", fixture));
    });
  } }],
});
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const crashes = [];
  page.on("pageerror", error => crashes.push(error.message));
  await page.setViewport({ width: 375, height: 667, isMobile: true });
  let loads = [];
  let id = 1000;
  await page.setRequestInterception(true);
  page.on("request", async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return url.origin === base ? request.continue() : request.abort();
    const headers = { "access-control-allow-origin": base, "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,PUT,POST,OPTIONS", "content-type": "application/json" };
    if (request.method() === "OPTIONS") return request.respond({ status: 204, headers });
    if (url.pathname.includes("/stream/")) return; // Keep the mocked stream pending.
    let body = {};
    if (url.pathname.endsWith("/messages") && request.method() === "GET") {
      assert.equal(url.searchParams.get("limit"), "40");
      const before = Number(url.searchParams.get("before") || id + 1);
      const last = Math.min(id, before - 1);
      const first = Math.max(1, last - 39);
      loads.push({ before: url.searchParams.get("before"), count: last - first + 1 });
      body = { messages: Array.from({ length: last - first + 1 }, (_, index) => ({
        message_id: first + index, sender_id: 2, recipient_id: 1,
        content: `Message ${first + index}: ${"A long conversation with readable messages. ".repeat(2)}`,
        sent_at: "2026-11-14T10:00:00Z", is_read: true,
      })), hasMore: first > 1, nextBefore: first > 1 ? String(first) : null };
    } else if (url.pathname === "/api/chats/messages" && request.method() === "POST") {
      const sent = JSON.parse(request.postData());
      body = { message: { message_id: ++id, sender_id: 1, recipient_id: sent.recipient_id, content: sent.content, sent_at: "2026-11-14T10:00:00Z" } };
    } else if (/\/conversations\/1$/.test(url.pathname)) body = { conversations: [2, 3, 4].map(user_id => ({
      user_id, first_name: `Teacher ${user_id}`, last_name: "With a particularly long name", role: "teacher", online: true, last_message: "Hello", unread_count: 0,
    })) };
    await request.respond({ status: 200, headers, body: JSON.stringify(body) });
  });
  await page.goto(`${base}/__chat-qa`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-chat-contact="2"]', { visible: true });
  await page.click('[data-chat-contact="2"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-message-id]').length === 40);
  assert.equal(loads.length, 1);
  const position = () => page.$eval('[data-chat-thread]', node => ({ top: node.scrollTop, bottom: node.scrollHeight - node.clientHeight - node.scrollTop }));
  assert((await position()).bottom < 2);
  await page.$eval('[data-chat-thread]', node => { node.scrollTop = 0; });
  const beforeTop = await page.$eval('[data-message-id="961"]', node => node.getBoundingClientRect().top);
  await page.$eval('[data-chat-thread] button', node => node.click());
  await page.waitForFunction(() => document.querySelectorAll('[data-message-id]').length === 80);
  const afterTop = await page.$eval('[data-message-id="961"]', node => node.getBoundingClientRect().top);
  assert(Math.abs(afterTop - beforeTop) < 3, `History moved by ${afterTop - beforeTop}px`);
  assert.equal(loads[1].before, "961");
  console.log("Only 40 latest messages load; older pages preserve the reading position.");

  await page.click('button[aria-label="Minimize chat"]');
  assert.equal(await page.$('[data-chat-thread]'), null);
  const minimized = await page.$eval('section[aria-label^="Chat with"]', node => ({ height: node.getBoundingClientRect().height, bottom: node.getBoundingClientRect().bottom }));
  assert(minimized.height <= 70);
  assert(minimized.bottom <= 667);
  await page.click('button[aria-label^="Restore chat with"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-message-id]').length === 40);
  assert((await position()).bottom < 2);
  await page.click('button[aria-label="Close chat"]');
  await page.click("#open-chats");
  await page.click('[data-chat-contact="2"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-message-id]').length === 40);
  assert((await position()).bottom < 2);
  await page.click("#open-chats");
  await page.click('[data-chat-contact="3"]');
  await page.waitForSelector('section[aria-label^="Chat with Teacher 3"]');
  assert.equal(await page.$$eval('section[aria-label^="Chat with"]', nodes => nodes.length), 1);
  console.log("Reopen/restore shows the latest message; mobile keeps one compact, restorable chat.");

  for (const width of [320, 375, 640, 900, 1280]) {
    await page.setViewport({ width, height: 667 });
    await page.waitForFunction(expected => innerWidth === expected, {}, width);
    const overflowing = await page.$$eval('section[aria-label^="Chat with"], section[aria-label^="Chat with"] button', nodes => nodes
      .filter(node => { const box = node.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > innerWidth + 1); })
      .map(node => node.getAttribute("aria-label") || node.textContent));
    assert.deepEqual(overflowing, [], `Overflow at ${width}px`);
  }
  assert.deepEqual(crashes, []);
  console.log("Chat windows and controls fit 320px–1280px viewports without render errors.");
} finally {
  await browser?.close();
  await server.close();
}

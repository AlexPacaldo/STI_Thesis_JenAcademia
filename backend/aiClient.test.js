import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAiConfigured, requestAiJson } from "./aiClient.js";

const payload = { systemInstruction: { parts: [{ text: "Extract data" }] }, contents: [{ parts: [{ text: "sample" }] }], generationConfig: { responseSchema: { type: "OBJECT", properties: { result: { type: "STRING" } }, required: ["result"] } } };
const envNames = ["GOOGLE_GEMINI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "GROQ_MODEL", "OPENROUTER_MODEL"];
const ok = (value) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) });

test("AI fallback order, validation, configuration and PDF handling", async (t) => {
  const original = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; for (const name of envNames) original[name] === undefined ? delete process.env[name] : process.env[name] = original[name]; });
  for (const name of envNames) delete process.env[name];
  assert.equal(isAiConfigured(), false);
  await assert.rejects(requestAiJson({ payload }), /not configured/);
  process.env.GOOGLE_GEMINI_API_KEY = "gemini-test";
  process.env.GROQ_API_KEY = "groq-test";
  process.env.OPENROUTER_API_KEY = "router-test";
  assert.equal(isAiConfigured(), true);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("googleapis")) return { ok: false, status: 429, json: async () => ({ error: { message: "quota" } }) };
    if (url.includes("groq.com")) return ok({ wrong: "bad" });
    return ok({ result: "success" });
  };
  const result = await requestAiJson({ payload, timeoutMs: 3000 });
  assert.equal(JSON.parse(result.candidates[0].content.parts[0].text).result, "success");
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /groq/);
  assert.match(calls[2].url, /openrouter/);
  assert.equal(JSON.parse(calls[2].options.body).model, "openrouter/free");
  assert.equal(calls[2].options.headers.Authorization, "Bearer router-test");

  // A hung first provider must leave time for the second provider.
  calls.length = 0;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("googleapis")) return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
    return ok({ result: "after timeout" });
  };
  assert.equal(JSON.parse((await requestAiJson({ payload, timeoutMs: 600 })).candidates[0].content.parts[0].text).result, "after timeout");
  assert.equal(calls.length, 2);

  delete process.env.GOOGLE_GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  process.env.OPENROUTER_MODEL = "paid/model";
  await assert.rejects(requestAiJson({ payload }), /must be openrouter\/free or end in :free/);
  delete process.env.OPENROUTER_MODEL;
  process.env.GROQ_API_KEY = "groq-test";
  delete process.env.GOOGLE_GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  calls.length = 0;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return ok({ result: "success" }); };
  const pdf = await readFile(new URL("../docs/THESIS_PRESENTATION_GUIDE.pdf", import.meta.url));
  const pdfPayload = { ...payload, contents: [{ parts: [{ inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } }, { text: "extract" }] }] };
  await requestAiJson({ payload: pdfPayload, timeoutMs: 15000 });
  const content = JSON.parse(calls[0].options.body).messages[1].content;
  assert.match(content, /Resume text:/);
  assert.ok(content.length > 100);
});

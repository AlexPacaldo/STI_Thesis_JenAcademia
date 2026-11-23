import test from "node:test";
import assert from "node:assert/strict";
import { requestGeminiJson } from "./geminiClient.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;
const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });
const error = (status, message) => reply(status, { error: { message } });

test("Gemini request handling", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_GEMINI_API_KEY; else process.env.GOOGLE_GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel;
  });
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "retired-test-model";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return url.includes("retired-test-model") ? error(404, "model missing") : reply(200, { result: true });
  };
  assert.deepEqual(await requestGeminiJson({ payload: {} }), { result: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["x-goog-api-key"], "test-key");
  assert.ok(!calls[0].url.includes("test-key"));
  calls.length = 0;
  await requestGeminiJson({ payload: {} });
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].url.includes("retired-test-model"));

  process.env.GEMINI_MODEL = "invalid-payload-test";
  let count = 0;
  globalThis.fetch = async () => { count++; return error(400, "Invalid schema"); };
  await assert.rejects(requestGeminiJson({ payload: {} }), /Invalid schema/);
  assert.equal(count, 1);

  globalThis.fetch = async () => { count++; return error(403, "permission denied"); };
  await assert.rejects(requestGeminiJson({ payload: {} }), /API key or its permissions/);

  count = 0;
  globalThis.fetch = async () => ++count === 1 ? error(503, "overloaded") : reply(200, { result: true });
  assert.deepEqual(await requestGeminiJson({ payload: {}, timeoutMs: 2000 }), { result: true });
  assert.equal(count, 2);

  count = 0;
  globalThis.fetch = async () => { count++; return error(429, "quota exhausted"); };
  await assert.rejects(requestGeminiJson({ payload: {} }), /rate limit/);
  assert.equal(count, 1);

  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
  await assert.rejects(requestGeminiJson({ payload: {}, timeoutMs: 50 }), /too long/);
});

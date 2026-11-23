import { isGeminiConfigured, requestGeminiJson } from "./geminiClient.js";

const key = (name) => String(process.env[name] || "").trim();
export function isAiConfigured() {
  return isGeminiConfigured() || Boolean(key("GROQ_API_KEY") || key("OPENROUTER_API_KEY"));
}

// Gemini's schemas use OpenAPI-style uppercase types and nullable. Validate the
// fields the caller depends on before treating any provider response as success.
function matchesSchema(value, schema) {
  if (!schema) return true;
  if (value === null) return Boolean(schema.nullable);
  const type = String(schema.type || "").toLowerCase();
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if ((schema.required || []).some((name) => !(name in value))) return false;
    return Object.entries(schema.properties || {}).every(([name, child]) => !(name in value) || matchesSchema(value[name], child));
  }
  if (type === "array") return Array.isArray(value) && value.every((item) => matchesSchema(item, schema.items));
  if (type === "string" && typeof value !== "string") return false;
  if ((type === "number" || type === "integer") && (typeof value !== "number" || !Number.isFinite(value))) return false;
  if (type === "boolean" && typeof value !== "boolean") return false;
  return !schema.enum || schema.enum.includes(value);
}

function validText(text, schema) {
  try {
    const parsed = JSON.parse(String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
    return matchesSchema(parsed, schema);
  } catch { return false; }
}

async function textParts(payload) {
  const parts = payload.contents?.flatMap((entry) => entry.parts || []) || [];
  const texts = [];
  for (const part of parts) {
    if (part.text) texts.push(part.text);
    if (part.inlineData?.mimeType === "application/pdf") {
      const { default: parsePdf } = await import("pdf-parse/lib/pdf-parse.js");
      const result = await parsePdf(Buffer.from(part.inlineData.data, "base64"));
      const text = String(result.text || "").trim();
      if (!text) throw new Error("This PDF has no readable text for the backup providers. Try a text-based PDF or DOCX.");
      texts.push(`Resume text:\n${text.slice(0, 60000)}`);
    }
  }
  return texts.join("\n\n");
}

async function requestBackup({ provider, apiKey, model, payload, timeoutMs, content }) {
  const schema = payload.generationConfig?.responseSchema;
  if (provider === "OpenRouter" && model !== "openrouter/free" && !model.endsWith(":free")) {
    throw new Error("OpenRouter model must be openrouter/free or end in :free.");
  }
  const response = await fetch(provider === "Groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${payload.systemInstruction?.parts?.map((p) => p.text || "").join(" ") || ""}\nReturn only a JSON object matching this schema: ${JSON.stringify(schema)}` },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}.`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!validText(text, schema)) throw new Error(`${provider} returned an unreadable or incomplete result.`);
  return { candidates: [{ content: { parts: [{ text: text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim() }] } }] };
}

/** Gemini first, then Groq, then OpenRouter, all within one request deadline. */
export async function requestAiJson({ payload, timeoutMs = 60000, timeoutMessage, label = "AI" }) {
  const providers = [];
  if (isGeminiConfigured()) providers.push({ name: "Gemini" });
  if (key("GROQ_API_KEY")) providers.push({ name: "Groq", apiKey: key("GROQ_API_KEY"), model: key("GROQ_MODEL") || "openai/gpt-oss-20b" });
  if (key("OPENROUTER_API_KEY")) providers.push({ name: "OpenRouter", apiKey: key("OPENROUTER_API_KEY"), model: key("OPENROUTER_MODEL") || "openrouter/free" });
  if (!providers.length) throw new Error("AI features are not configured. Set a Gemini, Groq, or OpenRouter API key on the backend.");
  const deadline = Date.now() + timeoutMs;
  const failures = [];
  let content;
  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    // Leave time for every configured provider, including when an earlier one hangs.
    const budget = Math.max(1, Math.floor(remaining / (providers.length - index)));
    try {
      if (provider.name === "Gemini") {
        const response = await requestGeminiJson({ payload, timeoutMs: budget, timeoutMessage, label });
        const text = response?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
        if (!validText(text, payload.generationConfig?.responseSchema)) throw new Error("Gemini returned an unreadable or incomplete result.");
        return response;
      }
      if (content === undefined) content = await textParts(payload);
      const available = deadline - Date.now();
      if (available <= 0) break;
      return await requestBackup({ provider: provider.name, apiKey: provider.apiKey, model: provider.model, payload, content, timeoutMs: Math.min(budget, available) });
    } catch (err) {
      // Do not log model output, prompts, resumes, or keys.
      const message = err?.name === "TimeoutError" || err?.name === "AbortError" ? `${provider.name} took too long.` : String(err?.message || "request failed");
      failures.push(`${provider.name}: ${message}`);
      console.error(`${label}: ${provider.name} failed: ${message}`);
    }
  }
  throw new Error(failures.length ? `AI providers could not complete the request. ${failures.join(" ")}` : (timeoutMessage || "The AI took too long to respond. Try again."));
}

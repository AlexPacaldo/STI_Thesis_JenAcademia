import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { normalizePersonName, personNameError, profilePictureContentError } from "../backend/profileValidation.js";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const routes = new Map();
let writes = [];
let deleted = [];
let uploadBytes = Buffer.from("not an image");
const pool = { async query(sql, params) {
  if (sql.includes("SELECT password_hash")) return [[{ password_hash: "stored-password" }]];
  if (sql.includes("SELECT profile_image_url")) return [[{ profile_image_url: null }]];
  if (sql.includes("UPDATE")) { writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
  throw new Error(`Unexpected query: ${sql}`);
} };
const context = vm.createContext({
  app: { put: (path, ...handlers) => routes.set(path, handlers.at(-1)), post: (path, ...handlers) => routes.set(path, handlers.at(-1)) },
  pool, normalizePersonName, personNameError, profilePictureContentError, Buffer,
  requireSession() {}, limitDetailConfirmations() {}, receiveProfilePicture() {},
  sessionMayActFor: (req, id) => String(req.session.userId) === String(id),
  bcrypt: { compare: async value => value === "correct-password", hash: async () => "new-hash" },
  normalizeTimezone: value => value || "Asia/Manila", timezoneFromCountry: () => "Asia/Manila",
  encryptNullableText: value => value, refreshProfileCompletion: async () => {},
  fs: { promises: { readFile: async () => uploadBytes } },
  deleteLocalProfileImage: async url => { deleted.push(url); }, console,
});
const verifyStart = source.indexOf("async function verifySessionPassword(");
const verifyEnd = source.indexOf("async function sessionMayReadStudent(", verifyStart);
vm.runInContext(source.slice(verifyStart, verifyEnd), context);
for (const [method, path] of [["put", "/api/users/:id"], ["put", "/api/users/:id/password"], ["post", "/api/users/:id/profile-picture"]]) {
  const start = source.indexOf(`app.${method}("${path}",`);
  const end = source.indexOf("\n});", start) + 4;
  assert(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
}
async function call(path, body = {}, extra = {}) {
  const result = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await routes.get(path)({ body, params: { id: "9" }, session: { userId: 9 }, ...extra }, result);
  return result;
}
const profile = { firstName: "José", lastName: "O'Connor", timezone: "Asia/Manila", currentPassword: "wrong-password" };
assert.equal((await call("/api/users/:id", { ...profile, firstName: "Bad123" })).code, 400);
assert.equal(writes.length, 0);
const wrongProfile = await call("/api/users/:id", profile);
assert.equal(wrongProfile.code, 400);
assert.equal(wrongProfile.body.code, "INCORRECT_PASSWORD");
assert.equal(writes.length, 0);
assert.equal((await call("/api/users/:id", { ...profile, firstName: "  José  Maria  ", currentPassword: "correct-password" })).code, 200);
assert.equal(writes[0].params[0], "José Maria");
writes = [];
const wrongPassword = await call("/api/users/:id/password", { current: "wrong-password", next: "valid-new-password" });
assert.equal(wrongPassword.code, 400);
assert.equal(wrongPassword.body.code, "INCORRECT_PASSWORD");
assert.equal(writes.length, 0);
assert.equal((await call("/api/users/:id/password", { current: "correct-password", next: "short" })).code, 400);
assert.equal((await call("/api/users/:id/password", { current: "correct-password", next: "valid-new-password" })).code, 200);
assert.equal(writes.length, 1);
assert.equal((await call("/api/users/:id", profile, { session: { userId: 10 } })).code, 403);
writes = [];
const file = { filename: "test.png", path: "test.png", mimetype: "image/png" };
assert.equal((await call("/api/users/:id/profile-picture", {}, { file })).code, 400);
assert.equal(writes.length, 0);
assert.deepEqual(deleted, ["/uploads/profiles/test.png"]);
uploadBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
deleted = [];
assert.equal((await call("/api/users/:id/profile-picture", {}, { file })).code, 200);
assert.equal(writes.length, 2);
assert.equal(deleted.length, 0);

let uploadError = null;
context.profileUpload = { single: () => (_req, _res, done) => done(uploadError) };
const uploadStart = source.indexOf("function receiveProfilePicture(");
const uploadEnd = source.indexOf("const classProofStorage", uploadStart);
vm.runInContext(source.slice(uploadStart, uploadEnd) + "globalThis.receivePicture = receiveProfilePicture;", context);
function receive(error, userId = 9) {
  uploadError = error;
  const result = { code: 200, passed: false, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  context.receivePicture({ params: { id: "9" }, session: { userId } }, result, () => { result.passed = true; });
  return result;
}
assert.equal(receive(null).passed, true);
assert.equal(receive(null, 10).code, 403);
assert.equal(receive({ code: "LIMIT_FILE_SIZE" }).code, 413);
assert.match(receive({ code: "LIMIT_FILE_SIZE" }).body.message, /2 MB/);
assert.match(receive({ code: "LIMIT_UNEXPECTED_FILE" }).body.message, /one profile picture/);
assert.equal(receive({ message: "Unsupported image format" }).code, 400);

// Drive the real response interceptor: a wrong update password keeps the token,
// while an expired session still clears it and invokes the sign-in redirect.
const auth = readFileSync(new URL("../frontend/src/utils/apiAuth.js", import.meta.url), "utf8");
const interceptorStart = auth.indexOf("export function installAuthInterceptor(");
const interceptorEnd = auth.indexOf("export async function apiFetch(", interceptorStart);
let onResponseError;
let cleared = 0;
let redirected = 0;
vm.runInNewContext(auth.slice(interceptorStart, interceptorEnd).replace("export function", "function") + "installAuthInterceptor({ onUnauthorized: redirect });", {
  axios: { interceptors: { request: { use() {} }, response: { use: (_ok, error) => { onResponseError = error; } } } },
  clearSessionToken: () => { cleared++; }, redirect: () => { redirected++; },
});
await assert.rejects(onResponseError({ response: { status: wrongProfile.code } }));
assert.equal(cleared, 0); assert.equal(redirected, 0);
await assert.rejects(onResponseError({ response: { status: 401 } }));
assert.equal(cleared, 1); assert.equal(redirected, 1);
console.log("Profile routes enforce names, preserve sessions on wrong passwords, reject damaged images and retain ownership checks.");

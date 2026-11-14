import test from "node:test";
import assert from "node:assert/strict";
import * as api from "./profileValidation.js";
import * as ui from "../frontend/src/utils/profileValidation.js";

test("profile names accept international letters and customary punctuation", () => {
  for (const name of ["José", "李明", "Nguyễn", "O’Connor", "Anne-Marie", "J. R.", "D'Angelo", "A", "Иван", "김민수"]) {
    assert.equal(api.personNameError(name, "First name", true), "", name);
    assert.equal(ui.personNameError(name, "First name", true), "", name);
  }
  assert.equal(api.normalizePersonName("  Jose\u0301  Maria  "), "José Maria");
  assert.equal(ui.normalizePersonName("  Jose\u0301  Maria  "), "José Maria");
});

test("client and server reject invalid names and preserve optional surnames", () => {
  for (const name of ["Alice1", "<script>", "hello@example.com", "😀", "_Alice", "Jane\nDoe", "A\u202eB", "-Jane", "A".repeat(101), {}, 123]) {
    assert(api.personNameError(name, "First name", true));
    assert.equal(api.personNameError(name, "First name", true), ui.personNameError(name, "First name", true));
  }
  assert(api.personNameError("  ", "First name", true));
  assert.equal(api.personNameError("", "Last name"), "");
  assert.equal(ui.personNameError("", "Last name"), "");
});

test("profile image formats and source size produce clear validation messages", () => {
  for (const [ext, mime] of [["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"], ["gif", "image/gif"]]) {
    assert.equal(api.profilePictureFormatError({ originalname: `photo.${ext.toUpperCase()}`, mimetype: mime }), "");
    assert.equal(ui.profilePictureFileError({ name: `photo.${ext}`, type: mime, size: 100 }), "");
  }
  assert(api.profilePictureFormatError({ originalname: "photo.svg", mimetype: "image/svg+xml" }));
  assert(api.profilePictureFormatError({ originalname: "photo.exe", mimetype: "image/jpeg" }));
  assert(ui.profilePictureFileError({ name: "photo.jpg", type: "application/pdf", size: 100 }));
  assert.match(ui.profilePictureFileError({ name: "photo.png", type: "image/png", size: 0 }), /empty/);
  assert.match(ui.profilePictureFileError({ name: "photo.png", type: "image/png", size: ui.MAX_PROFILE_SOURCE_BYTES + 1 }), /10 MB/);
});

test("uploaded picture contents must match the declared format", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
  assert.equal(api.profilePictureContentError(png, "image/png"), "");
  assert(api.profilePictureContentError(png, "image/jpeg"));
  for (const mime of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    assert(api.profilePictureContentError(Buffer.from("not an image"), mime));
    assert(api.profilePictureContentError(Buffer.alloc(0), mime));
  }
});

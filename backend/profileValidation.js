export const MAX_NAME_LENGTH = 100;

export function normalizePersonName(value) {
  return typeof value === "string" ? value.normalize("NFC").trim().replace(/ +/g, " ") : "";
}

export function personNameError(value, label = "Name", required = false) {
  const name = normalizePersonName(value);
  if (required && !name) return `${label} is required.`;
  if (name.length > MAX_NAME_LENGTH) return `${label} must be ${MAX_NAME_LENGTH} characters or fewer.`;
  if (value != null && typeof value !== "string") return `${label} must be text.`;
  if ((typeof value === "string" && /[\p{Cc}\p{Cf}]/u.test(value))
    || (name && !/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(name))) {
    return `${label} can contain letters, spaces, apostrophes, hyphens, and periods only.`;
  }
  return "";
}

export const MAX_PROFILE_UPLOAD_BYTES = 2 * 1024 * 1024;
const IMAGE_EXTENSIONS = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"],
  "image/webp": ["webp"], "image/gif": ["gif"],
};

export function profilePictureFormatError(file) {
  const extension = String(file?.originalname || "").split(".").pop().toLowerCase();
  return IMAGE_EXTENSIONS[file?.mimetype]?.includes(extension) ? ""
    : "Choose a JPG, PNG, WebP, or GIF profile picture with a matching file extension.";
}

export function profilePictureContentError(bytes, mime) {
  const starts = values => values.every((value, index) => bytes[index] === value);
  const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  const valid = mime === "image/jpeg" ? bytes.length >= 4 && starts([255, 216, 255])
    : mime === "image/png" ? bytes.length >= 24 && starts([137, 80, 78, 71, 13, 10, 26, 10]) && ascii(12, 16) === "IHDR"
    : mime === "image/webp" ? bytes.length >= 20 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
    : mime === "image/gif" ? bytes.length >= 13 && ["GIF87a", "GIF89a"].includes(ascii(0, 6)) : false;
  return valid ? "" : "This file is not a valid image in the selected format. Choose another JPG, PNG, WebP, or GIF picture.";
}

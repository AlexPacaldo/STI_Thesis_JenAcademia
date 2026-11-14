// Keep name rules in sync with backend/profileValidation.js; parity is tested.
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

export const PROFILE_PICTURE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";
export const MAX_PROFILE_SOURCE_BYTES = 10 * 1024 * 1024;
export function profilePictureFileError(file) {
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  const formats = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  if (!formats[extension] || (file.type && file.type !== formats[extension])) {
    return "Choose a JPG, PNG, WebP, or GIF profile picture.";
  }
  if (!file.size) return "This picture is empty. Choose another image.";
  if (file.size > MAX_PROFILE_SOURCE_BYTES) return "Choose a profile picture smaller than 10 MB.";
  return "";
}

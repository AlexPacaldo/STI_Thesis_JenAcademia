// Keep in sync with the frontend copy; Railway deploys from this directory.
export const MAX_ASSIGNMENT_FILES = 5;
export const MAX_ASSIGNMENT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ASSIGNMENT_TOTAL_BYTES = 25 * 1024 * 1024;
export const ASSIGNMENT_UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.mp3,.wav,.m4a,.mp4,.webm,.mov";

const ACCEPTED_ASSIGNMENT_EXTENSIONS = new Set(ASSIGNMENT_UPLOAD_ACCEPT.split(","));

export function getAssignmentFileTypeError(file) {
  const filename = String(file?.name ?? file?.originalname ?? "").split(/[\\/]/).pop();
  const extension = `.${filename.split(".").pop().toLowerCase()}`;
  if (filename.includes(".") && ACCEPTED_ASSIGNMENT_EXTENSIONS.has(extension)) return "";
  return "Unsupported file type. Allowed: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT/RTF, JPG/JPEG/PNG, MP3/WAV/M4A, MP4/WEBM/MOV.";
}

export function getAssignmentUploadError(files) {
  if (!Array.isArray(files)) return "";

  if (files.length > MAX_ASSIGNMENT_FILES) {
    return `Choose no more than ${MAX_ASSIGNMENT_FILES} files.`;
  }

  const unsupportedFile = files.find((file) => getAssignmentFileTypeError(file));
  if (unsupportedFile) return getAssignmentFileTypeError(unsupportedFile);

  if (files.some((file) => Number(file?.size) > MAX_ASSIGNMENT_FILE_BYTES)) {
    return "Each file must be 10 MiB or smaller.";
  }

  const totalBytes = files.reduce((total, file) => total + Number(file?.size || 0), 0);
  if (totalBytes > MAX_ASSIGNMENT_TOTAL_BYTES) {
    return "All files together must be 25 MiB or smaller.";
  }

  return "";
}

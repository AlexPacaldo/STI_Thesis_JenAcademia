// Keep in sync with the backend copy; each service deploys from its own root.
export const MAX_ASSIGNMENT_FILES = 5;
export const MAX_ASSIGNMENT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ASSIGNMENT_TOTAL_BYTES = 25 * 1024 * 1024;

export function getAssignmentUploadError(files) {
  if (!Array.isArray(files)) return "";

  if (files.length > MAX_ASSIGNMENT_FILES) {
    return `Choose no more than ${MAX_ASSIGNMENT_FILES} files.`;
  }

  if (files.some((file) => Number(file?.size) > MAX_ASSIGNMENT_FILE_BYTES)) {
    return "Each file must be 10 MiB or smaller.";
  }

  const totalBytes = files.reduce((total, file) => total + Number(file?.size || 0), 0);
  if (totalBytes > MAX_ASSIGNMENT_TOTAL_BYTES) {
    return "All files together must be 25 MiB or smaller.";
  }

  return "";
}

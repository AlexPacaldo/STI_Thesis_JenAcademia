export const APP_STORAGE_PREFIX = "JenAcademia";

export const STORAGE_KEYS = {
  user: `${APP_STORAGE_PREFIX}.user`,
  teacherId: `${APP_STORAGE_PREFIX}.teacher_id`,
  studentId: `${APP_STORAGE_PREFIX}.student_id`,
  courseId: `${APP_STORAGE_PREFIX}.course_id`,
  lastActivityAt: `${APP_STORAGE_PREFIX}.lastActivityAt`,
  localNotifications: `${APP_STORAGE_PREFIX}.localNotifications`,
};

export const LEGACY_STORAGE_KEYS = {
  user: "user",
  teacherId: "teacher_id",
  studentId: "student_id",
  courseId: "course_id",
  lastActivityAt: "lastActivityAt",
  localNotifications: "localNotifications",
};

export function readNamespacedStorageValue(key, legacyKey) {
  const stored = localStorage.getItem(key);
  if (stored !== null) return stored;
  const legacyStored = legacyKey ? localStorage.getItem(legacyKey) : null;
  if (legacyStored !== null) {
    localStorage.setItem(key, legacyStored);
    localStorage.removeItem(legacyKey);
  }
  return legacyStored;
}

export function writeNamespacedStorageValue(key, value, legacyKey) {
  localStorage.setItem(key, String(value));
  if (legacyKey) {
    localStorage.removeItem(legacyKey);
  }
}

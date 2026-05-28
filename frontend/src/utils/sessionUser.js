import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "./storageKeys.js";

const USER_KEY = STORAGE_KEYS.user;

export function sanitizeUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    id: user.id ?? user.user_id ?? user.userId ?? null,
    firstName: user.firstName ?? user.first_name ?? "",
    lastName: user.lastName ?? user.last_name ?? "",
    role: user.role ?? "",
    profileCompleted: Boolean(user.profileCompleted ?? user.profile_completed ?? false),
    passwordChanged: Boolean(user.passwordChanged ?? user.password_changed ?? false),
    profileImageUrl: user.profileImageUrl ?? user.profile_image_url ?? "",
    assignedTeacherId: user.assignedTeacherId ?? user.assigned_teacher_id ?? null,
    courseId: user.courseId ?? user.course_id ?? null,
    timezone: user.timezone ?? "Asia/Manila",
    status: user.status ?? "active",
    stayLoggedIn: Boolean(user.stayLoggedIn ?? false),
  };
}

export function readStoredUser() {
  try {
    const stored = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_STORAGE_KEYS.user);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    const sanitized = sanitizeUser(parsed);
    if (sanitized) {
      localStorage.setItem(USER_KEY, JSON.stringify(sanitized));
      localStorage.removeItem(LEGACY_STORAGE_KEYS.user);
    }
    return sanitized;
  } catch {
    return null;
  }
}

export function writeStoredUser(user) {
  const sanitized = sanitizeUser(user);
  if (!sanitized) return null;
  localStorage.setItem(USER_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.teacherId);
  localStorage.removeItem(STORAGE_KEYS.studentId);
  localStorage.removeItem(STORAGE_KEYS.courseId);
  localStorage.removeItem(LEGACY_STORAGE_KEYS.teacherId);
  localStorage.removeItem(LEGACY_STORAGE_KEYS.studentId);
  localStorage.removeItem(LEGACY_STORAGE_KEYS.courseId);
}

import { API_BASE_URL } from "./api.js";
import { apiFetch } from "./apiAuth.js";

const GUIDE_FIELDS = {
  firstSteps: "firstStepsCompleted",
  calendar: "calendarCompleted",
};

function readLocalCompletion(storageKey) {
  try {
    return localStorage.getItem(storageKey) === "done";
  } catch (error) {
    console.warn("Could not read locally stored guide progress:", error);
    return false;
  }
}

function cacheLocalCompletion(storageKey) {
  try {
    localStorage.setItem(storageKey, "done");
  } catch (error) {
    console.warn("Could not cache guide progress in this browser:", error);
  }
}

export async function saveGuideCompletion(guide, storageKey) {
  const field = GUIDE_FIELDS[guide];
  if (!field) throw new Error(`Unknown guide: ${guide}`);

  cacheLocalCompletion(storageKey);
  const response = await apiFetch(`${API_BASE_URL}/api/me/guide-progress`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: true }),
  });
  if (!response.ok) {
    throw new Error(`Could not save guide progress (${response.status})`);
  }
}

export async function readGuideCompletion(guide, storageKey) {
  const field = GUIDE_FIELDS[guide];
  if (!field) throw new Error(`Unknown guide: ${guide}`);

  const response = await apiFetch(`${API_BASE_URL}/api/me/guide-progress`);
  if (!response.ok) {
    throw new Error(`Could not load guide progress (${response.status})`);
  }
  const result = await response.json();
  if (result?.progress?.[field] === true) {
    cacheLocalCompletion(storageKey);
    return true;
  }

  if (readLocalCompletion(storageKey)) {
    await saveGuideCompletion(guide, storageKey);
    return true;
  }
  return false;
}

export function hasLocalGuideCompletion(storageKey) {
  return readLocalCompletion(storageKey);
}

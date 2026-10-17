import { API_BASE_URL } from "./api.js";
import { apiFetch } from "./apiAuth.js";
import { openAuthenticatedFile } from "./authenticatedFile.js";

/**
 * Open a class recording through the session.
 *
 * The recording route sits behind requireSession, and neither <a href> nor
 * <video src> can send an Authorization header, so the three "View Recording"
 * links were dead - they 401'd before the handler's own Drive redirect could
 * ever run. Asking the server where the file lives sidesteps that:
 *
 *   drive -> navigated to directly, which is what the 302 did. It cannot be
 *            read with fetch(), because the hop to Google is cross-origin.
 *   local -> fetched with the header and rendered from a blob: URL. That
 *            buffers the whole recording in memory, which is not free near the
 *            500 MB cap; streaming it would need a token in the query string,
 *            which is a wider leak than it is worth here.
 *
 * @param {string|number} classId
 * @param {(message: string, level?: string) => void} [notify] Error reporter.
 * @returns {Promise<boolean>} whether the recording was opened.
 */
export async function openClassRecording({ classId, notify }) {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}/api/calendar/classes/${encodeURIComponent(classId)}/recording-link`
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || `Could not open the recording (${response.status})`);
    }

    const { kind, url } = await response.json();

    if (kind === "drive" && url) {
      window.open(url, "_blank", "noopener");
      return true;
    }

    if (kind === "local" && url) {
      await openAuthenticatedFile(url);
      return true;
    }

    throw new Error("No recording is available for this class");
  } catch (err) {
    if (notify) notify(err?.message || "Could not open the recording", "error");
    return false;
  }
}
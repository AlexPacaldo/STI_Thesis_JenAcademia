import { useEffect, useState } from "react";
import { apiFetch } from "./apiAuth.js";
import { API_BASE_URL } from "./api.js";

/**
 * Loading stored uploads through the session token.
 *
 * Uploaded files are rendered as <img src>, <audio>, <video> and <iframe>, plus
 * plain <a href> download links, and none of those can send an Authorization
 * header. So the file is fetched with the header and handed to the page as a
 * blob: URL, which the browser treats as same-origin and renders normally.
 *
 * This is the fix for serving /uploads behind a session. The alternative -
 * a cookie - fails because the frontend and API are on different sites, so
 * SameSite=Lax is never sent on an image request. A SameSite=None cookie would
 * work but lets any site the user visits make authenticated requests.
 *
 * The trade-off of blob URLs is that the browser can no longer cache these the
 * way it caches plain image URLs, and each render fetches again. That is why
 * this is used for submitted work and other sensitive files rather than being
 * forced on every avatar in the app.
 */

/**
 * Turn a stored path into an absolute URL, leaving real URLs alone.
 *
 * Stored paths are not consistent: they turn up with and without a leading
 * slash, and with Windows separators. Every page had its own helper for this,
 * most of them getting it subtly wrong, so the normalisation lives here once.
 */
export function absoluteUploadUrl(path) {
  if (!path) return "";
  const cleaned = String(path).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/uploads/")) return `${API_BASE_URL}${cleaned}`;
  if (cleaned.startsWith("uploads/")) return `${API_BASE_URL}/${cleaned}`;
  return cleaned;
}

/**
 * True when a src points at a stored upload, and so needs the session.
 *
 * Anything else - a bundled asset such as an imported placeholder image, or a
 * URL on another host - is handed straight back, so it keeps normal browser
 * caching and costs no request. This is what lets callers pass a src without
 * first checking whether it happens to be protected.
 *
 * An absolute URL only counts when it is one of ours: a third-party host with
 * "/uploads/" in its path must not be pulled through the session.
 */
export function isStoredUpload(path) {
  if (!path) return false;
  const cleaned = String(path).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned.startsWith(API_BASE_URL) && cleaned.includes("/uploads/");
  }
  return cleaned.startsWith("/uploads/") || cleaned.startsWith("uploads/");
}

async function fetchObjectUrl(path) {
  const response = await apiFetch(absoluteUploadUrl(path));
  if (!response.ok) throw new Error(`Could not load file (${response.status})`);
  return URL.createObjectURL(await response.blob());
}

/**
 * Resolve a stored upload path to a blob: URL.
 *
 * @param {string} path Stored path such as /uploads/assignments/foo.pdf
 * @returns {{url: string|null, error: Error|null, loading: boolean}}
 */
export function useAuthenticatedFileUrl(path) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setError(null);
      return undefined;
    }

    // Not a stored upload: a bundled asset or another host. Returned as-is so
    // it is rendered as a plain URL, with no request and normal caching.
    if (!isStoredUpload(path)) {
      setUrl(path);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    let created = null;

    setUrl(null);
    setError(null);

    fetchObjectUrl(path)
      .then((next) => {
        // A blob URL that nobody will use still has to be released, otherwise
        // every re-render leaks the whole file into memory.
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        created = next;
        setUrl(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);

  return {
    url,
    error,
    // isStoredUpload is part of the condition so a bundled asset or external
    // URL never flashes a loading state on the render before this settles.
    loading: Boolean(path) && isStoredUpload(path) && !url && !error,
  };
}

/**
 * Open a stored file in a new tab, through the session.
 *
 * Two things had to be right here, and both were wrong before.
 *
 * The tab is opened BEFORE the first await. Firefox and Safari only honour
 * window.open when it runs in the same task as the click that triggered it, and
 * awaiting the fetch first throws that user-gesture context away - the call is
 * then treated as a pop-up and blocked. So the file is fetched into the tab
 * afterwards, rather than the tab being opened onto the finished URL.
 *
 * It is opened WITHOUT the noopener feature, because noopener makes window.open
 * return null by spec, and that null was being read as "pop-ups are blocked" -
 * so this navigated the current tab on every browser, not just the ones that
 * actually block. opener is cleared by hand instead, which is the same
 * protection without the unusable return value.
 */
export async function openAuthenticatedFile(path) {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;

  let objectUrl;
  try {
    objectUrl = await fetchObjectUrl(path);
  } catch (err) {
    // Don't leave a blank tab behind for a file that was never going to load.
    tab?.close();
    throw err;
  }

  if (tab) {
    tab.location.href = objectUrl;
  } else {
    // Pop-ups genuinely blocked, so there is no tab to fill and no way to reach
    // one. Hand the file over as a download instead: it keeps the student on the
    // assignment page, which is the whole point of not navigating away here.
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Mint a signed link and open it in a new tab.
 *
 * Shared by openAssignmentFile and openSubmissionFile - the only difference is
 * which endpoint the link comes from. The tab is opened before the first await,
 * because Firefox and Safari only honour window.open in the same task as the
 * click that triggered it, and minting a link needs a round trip.
 */
async function openSignedFile(endpoint, path) {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;

  let link;
  try {
    const res = await apiFetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: path }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Could not open that file");
    link = data.url;
  } catch (err) {
    // No point leaving an empty tab behind.
    tab?.close();
    throw err;
  }

  if (!tab) {
    throw new Error(
      "Your browser is blocking pop-ups for this site. Allow them for this site to open the file in a new tab."
    );
  }

  tab.location.href = link;
}

/**
 * Open an assignment attachment in a new tab, titled with its real filename.
 *
 * openAuthenticatedFile cannot do this. It has to work through a blob: URL,
 * because /uploads is behind the session token and a tab navigation cannot
 * send the header - and a blob URL's path is a random ID the browser uses as
 * the filename, so the PDF viewer titles the tab "3463429d-9273-..." instead of
 * the teacher's filename. So this asks the backend for a short-lived signed URL
 * that carries the name in its last segment. See backend/fileLink.js.
 *
 * The filename is deliberately not sent from here: the server reads it from the
 * database, so what the tab ends up called cannot be decided by the caller.
 */
export function openAssignmentFile(path) {
  return openSignedFile("/api/assignment-attachments/link", path);
}

/** The same, for the work a student sent back. */
export function openSubmissionFile(path) {
  return openSignedFile("/api/submission-files/link", path);
}

/** Save a stored file, through the session. */
export async function downloadAuthenticatedFile(path, filename) {
  const objectUrl = await fetchObjectUrl(path);
  const link = document.createElement("a");
  link.href = objectUrl;
  if (filename) link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
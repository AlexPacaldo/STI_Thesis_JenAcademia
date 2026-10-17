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

/** Turn a stored path into an absolute URL, leaving real URLs alone. */
export function absoluteUploadUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/uploads/")) return `${API_BASE_URL}${path}`;
  return path;
}

/**
 * True when a src points at a stored upload, and so needs the session.
 *
 * Anything else - a bundled asset such as an imported placeholder image, or a
 * URL on another host - is handed straight back, so it keeps normal browser
 * caching and costs no request. This is what lets callers pass a src without
 * first checking whether it happens to be protected.
 */
export function isStoredUpload(path) {
  if (!path) return false;
  if (/^https?:\/\//i.test(path)) return path.startsWith(`${API_BASE_URL}/uploads/`);
  return path.startsWith("/uploads/");
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

/** Open a stored file in a new tab, through the session. */
export async function openAuthenticatedFile(path) {
  const objectUrl = await fetchObjectUrl(path);
  const tab = window.open(objectUrl, "_blank", "noopener,noreferrer");
  if (!tab) {
    // Pop-up blocked: fall back to navigating the current tab rather than
    // silently doing nothing.
    window.location.assign(objectUrl);
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
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
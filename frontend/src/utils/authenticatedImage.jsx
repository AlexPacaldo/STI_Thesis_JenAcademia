import { useAuthenticatedFileUrl } from "./authenticatedFile.js";
import styles from "./authenticatedImage.module.css";

/**
 * Image and iframe sources for stored uploads, fetched through the session.
 *
 * Neither <img src> nor <iframe src> can send an Authorization header, so these
 * resolve the file to a blob: URL first. Anything that is not a stored upload -
 * a bundled asset, an external URL - is passed through untouched and keeps
 * normal browser caching, so callers do not have to check which it is.
 *
 * Props mirror the underlying element; `fallback` renders when there is no src
 * or the fetch fails, which is how avatars keep their initials/placeholder.
 */
export function AuthenticatedImage({
  src,
  alt = "",
  className,
  fallback = null,
  loadingText = "Loading…",
  errorText = "This image could not be loaded.",
  ...rest
}) {
  const { url, error, loading } = useAuthenticatedFileUrl(src);

  if (!src) return fallback;
  // A supplied fallback doubles as the loading placeholder. Avatars sit inside
  // fixed-size slots, so swapping in a text label while the fetch is in flight
  // would shift the layout; the placeholder is the better thing to wait with.
  if (loading) return fallback ?? <p className={styles.status}>{loadingText}</p>;
  if (error) return fallback ?? <p className={styles.status}>{errorText}</p>;

  return <img src={url} alt={alt} className={className} {...rest} />;
}

export function AuthenticatedFrame({
  src,
  title,
  className,
  loadingText = "Loading…",
  errorText = "This file could not be loaded.",
  ...rest
}) {
  const { url, error, loading } = useAuthenticatedFileUrl(src);

  if (!src) return null;
  if (loading) return <p className={styles.status}>{loadingText}</p>;
  if (error) return <p className={styles.status}>{errorText}</p>;

  return <iframe title={title} src={url} className={className} {...rest} />;
}
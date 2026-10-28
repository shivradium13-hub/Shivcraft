/**
 * Bump this whenever the way /api/media renders an image changes (e.g. the
 * watermark), so next/image treats it as a new source and re-fetches instead of
 * serving a cached, unstamped variant.
 */
const MEDIA_VERSION = "wm1";

/**
 * Appends the media version to `/api/media/*` URLs only. Other srcs — local SVG
 * placeholders, blob URLs, absolute URLs — are returned unchanged, so the
 * caller's own `.endsWith(".svg")` passthrough check must run on the ORIGINAL
 * src, not on the value this returns.
 */
export function mediaSrc(src: string): string {
  if (!src.startsWith("/api/media/")) return src;
  return `${src}${src.includes("?") ? "&" : "?"}v=${MEDIA_VERSION}`;
}

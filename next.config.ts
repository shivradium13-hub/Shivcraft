import type { NextConfig } from "next";

/**
 * Security headers sent on every response.
 *
 * Deliberately conservative: a full script/style Content-Security-Policy is NOT
 * set here because it has to be validated against the live Razorpay checkout
 * flow first (a wrong `script-src` would silently break payments). The one CSP
 * directive included is `frame-ancestors 'none'`, which only governs who may
 * frame the site (clickjacking) and cannot break page scripts — it reinforces
 * X-Frame-Options for browsers that honour CSP over the older header.
 */
const securityHeaders = [
  // Clickjacking: the admin panel especially must never be framed.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Stop MIME sniffing (defends the image/media proxies).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Do not leak full URLs (which can carry order numbers) to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Force HTTPS for a year, including subdomains (Vercel serves HTTPS only).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // The site uses none of these device APIs; deny them outright.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  images: {
    // Next 16 requires local image sources that carry a query string to be
    // allow-listed here. Our only optimised local images come from the media
    // route — plain `/api/media/<id>` (category tiles, live preview) and the
    // version-stamped product photos (`?v=wm1`, bumped in
    // src/lib/mediaVersion.ts when the media rendering changes, e.g. the
    // watermark, so next/image re-fetches the freshly stamped file). Omitting
    // `search` allows this path with or without a query; the media route only
    // serves PUBLIC rows for valid UUIDs, so an extra param can't enumerate
    // anything.
    localPatterns: [{ pathname: "/api/media/**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // Admin URLs that were never real routes (left in browser history /
      // autocomplete) 404 otherwise — send them where they were meant to go.
      { source: "/admin/login", destination: "/admin", permanent: false },
      { source: "/admin/dashboard", destination: "/admin", permanent: false },
    ];
  },
};

export default nextConfig;

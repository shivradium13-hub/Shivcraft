import type { NextRequest } from "next/server";

import { googleFamilyName } from "@/lib/customizer/schema";

/**
 * Google Fonts CSS with the font files inlined as data URLs.
 *
 * The browser cannot read `fonts.googleapis.com` stylesheet rules directly
 * (cross-origin CSSOM is blocked), so a client that needs the actual @font-face
 * faces — the order page's "download exact image", which rasterises the preview
 * and must embed every glyph so nothing falls back to a system font — cannot
 * build them itself. This route does it server-side, where there is no CORS:
 * fetch the family CSS, then fetch each gstatic font binary and splice it in as
 * a `data:` URL, so the result is fully self-contained and safe to hand to a
 * canvas capture.
 *
 * Only Google's own hosts are ever contacted, and only the `families` the caller
 * names are requested, so this is not an open proxy.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A desktop Chrome UA, so Google returns woff2 @font-face rules (it varies the
// response by user agent).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("families") ?? "";
  const families = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20); // A design cannot use more than a handful; cap to be safe.

  const emptyCss = () =>
    new Response("", {
      headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" },
    });

  if (families.length === 0) return emptyCss();

  // Optional: restrict the download to exactly the glyphs the snapshot uses.
  // Google then returns a single, tiny subset font per family instead of the
  // full latin + latin-ext + devanagari files — which keeps the embedded CSS
  // small enough for the canvas rasteriser to handle quickly.
  const text = (req.nextUrl.searchParams.get("text") ?? "").slice(0, 2000);
  const uniqueText = Array.from(new Set(Array.from(text))).join("");

  const query = families
    .map((f) => `family=${encodeURIComponent(googleFamilyName(f)).replace(/%20/g, "+")}`)
    .join("&");
  const cssUrl =
    `https://fonts.googleapis.com/css2?${query}&display=swap` +
    (uniqueText ? `&text=${encodeURIComponent(uniqueText)}` : "");

  try {
    const cssRes = await fetch(cssUrl, { headers: { "user-agent": UA } });
    if (!cssRes.ok) return emptyCss();
    let css = await cssRes.text();

    // Every font binary the CSS points at — only ever on Google's own CDN.
    const urls = Array.from(
      new Set(
        Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)).map(
          (m) => m[1],
        ),
      ),
    );

    const inlined = new Map<string, string>();
    await Promise.all(
      urls.map(async (u) => {
        try {
          const r = await fetch(u);
          if (!r.ok) return;
          const buf = Buffer.from(await r.arrayBuffer());
          // The subset endpoint (/l/font) has no extension; detect by the file's
          // magic bytes, else fall back to woff2 (what the Chrome UA is served).
          const magic = buf.subarray(0, 4).toString("ascii");
          const type = u.endsWith(".woff") || magic === "wOFF"
            ? "font/woff"
            : u.endsWith(".ttf") || magic === "\x00\x01\x00\x00"
              ? "font/ttf"
              : "font/woff2";
          inlined.set(u, `data:${type};base64,${buf.toString("base64")}`);
        } catch {
          /* Skip a font that will not fetch; the face just stays a remote url. */
        }
      }),
    );

    for (const [u, data] of inlined) css = css.split(u).join(data);

    return new Response(css, {
      headers: {
        "content-type": "text/css; charset=utf-8",
        // Font binaries for a family are immutable; cache hard.
        "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return emptyCss();
  }
}

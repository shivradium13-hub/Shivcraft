"use client";

import { fontsToLoad, type CustomizerConfig } from "@/lib/customizer/schema";

/**
 * Loads the fonts a product's Frame Designer allows.
 *
 * Google families are pulled from Google Fonts by name; uploaded families are
 * declared with @font-face pointing at the stored file. React hoists the
 * <link> and <style> into <head>, so this can be dropped anywhere the preview
 * is shown — the customizer, the account previews, the admin builder — and the
 * chosen font actually renders rather than silently falling back.
 *
 * Nothing is loaded when the product offers no fonts, so an ordinary product
 * pulls in no third-party request at all.
 */
export function CustomizerFonts({ config }: { config: CustomizerConfig }) {
  const fonts = fontsToLoad(config);
  if (fonts.length === 0) return null;

  const google = fonts.filter((f) => f.source === "google" && f.name);
  const uploaded = fonts.filter((f) => f.source === "upload" && f.url);

  const googleHref =
    google.length > 0
      ? `https://fonts.googleapis.com/css2?${google
          .map((f) => `family=${encodeURIComponent(f.name).replace(/%20/g, "+")}`)
          .join("&")}&display=swap`
      : null;

  const faces = uploaded
    .map(
      (f) =>
        `@font-face{font-family:"${f.name.replace(/"/g, "")}";src:url("${f.url}")${
          f.format ? ` format("${f.format}")` : ""
        };font-display:swap;}`,
    )
    .join("\n");

  return (
    <>
      {googleHref ? <link rel="stylesheet" href={googleHref} /> : null}
      {faces ? <style>{faces}</style> : null}
    </>
  );
}

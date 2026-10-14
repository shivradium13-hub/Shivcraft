"use client";

import { useEffect, useRef, useState } from "react";

import { readStoredDesign, type CustomerDesign } from "@/lib/customizer/design";
import {
  fontStack,
  fontsToLoad,
  isZoneVisible,
  readConfig,
  resolveTextStyle,
  zonesForView,
} from "@/lib/customizer/schema";
import type { CustomizerConfig } from "@/lib/customizer/schema";
import { CustomizerCanvas } from "@/components/shop/customizer/CustomizerCanvas";
import { CustomizerFonts } from "@/components/shop/customizer/CustomizerFonts";

/** Side, in CSS pixels, of the off-screen canvas captured for the print image.
 *  Captured at 2× (below), so the PNG is 2400px square — print-grade for a
 *  composited gift (a 200mm piece at 2400px is 300dpi). */
const EXPORT_SIDE = 1200;

/**
 * Self-contained @font-face CSS for every font the design uses, with the font
 * files inlined as data URLs — so the capture embeds the real glyphs and nothing
 * falls back to a system font.
 *
 * html-to-image cannot read Google's cross-origin stylesheet itself, so Google
 * families are inlined by our server route; uploaded faces are same-origin and
 * inlined here. Any one font that fails is skipped rather than failing the whole
 * capture — the picture is more important than one typeface being perfect.
 */
async function buildFontEmbedCss(config: CustomizerConfig, glyphs: string): Promise<string> {
  const fonts = fontsToLoad(config);
  const google = fonts.filter((f) => f.source === "google" && f.name).map((f) => f.name);
  const uploaded = fonts.filter((f) => f.source === "upload" && f.url);

  let css = "";

  if (google.length > 0) {
    try {
      const params = new URLSearchParams({ families: google.join(",") });
      // Subset to the glyphs actually used, so the embedded font stays tiny.
      if (glyphs) params.set("text", glyphs);
      const res = await fetch(`/api/customizer/font-embed?${params.toString()}`);
      if (res.ok) css += (await res.text()) + "\n";
    } catch {
      /* Google faces just fall back if the inlining route is unreachable. */
    }
  }

  for (const f of uploaded) {
    try {
      const r = await fetch(f.url);
      if (!r.ok) continue;
      const blob = await r.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const fmt = f.format ? ` format("${f.format}")` : "";
      css += `@font-face{font-family:"${f.name.replace(/"/g, "")}";src:url(${dataUrl})${fmt};font-display:swap;}\n`;
    } catch {
      /* Skip an uploaded face that will not fetch. */
    }
  }

  return css;
}

/**
 * A proof-sheet SVG wrapping the exact capture.
 *
 * The proof is a visual reference of the finished piece, so it uses the same
 * pixel-exact capture as the print image (every font, size, colour and texture
 * exactly as the customer approved) rather than a second, drifting renderer.
 * On top of that it draws the workshop's safe-area guides — the margin printing
 * is guaranteed to reach — as vector rectangles on their own, deletable layer.
 * The SVG declares the capture's pixel size so a viewer opens it 1:1.
 */
function buildProofSvg(pngDataUrl: string, config: CustomizerConfig, design: CustomerDesign): string {
  const S = EXPORT_SIDE * 2; // matches the capture's pixelRatio of 2
  const r = (n: number) => Math.round(n * 100) / 100;
  const view = config.views.find((v) => v.id === design.viewId) ?? config.views[0];

  const guides = view
    ? zonesForView(config, view.id)
        .filter((z) => !z.hidden && z.safeInset > 0 && isZoneVisible(config, z, design.options))
        .map((z) => {
          const x = (z.x / 100) * S;
          const y = (z.y / 100) * S;
          const w = (z.width / 100) * S;
          const h = (z.height / 100) * S;
          const inset = (z.safeInset / 100) * Math.min(w, h);
          return `<rect x="${r(x + inset)}" y="${r(y + inset)}" width="${r(w - inset * 2)}" height="${r(h - inset * 2)}" fill="none" stroke="#ff00ff" stroke-width="2" stroke-dasharray="14 10"/>`;
        })
        .join("")
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<title>Proof sheet</title>
<desc>Shiv Radium proof sheet — the finished piece exactly as approved. The dashed guides are the safe print margin and are not part of the artwork.</desc>
<image x="0" y="0" width="${S}" height="${S}" xlink:href="${pngDataUrl}" href="${pngDataUrl}"/>
<g data-print="false">${guides}</g>
</svg>`;
}

/** Wait until every <img> inside a node has finished loading, so the capture
 *  never races the customer's photo or the product artwork. */
function imagesReady(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll("img"));
  return Promise.all(
    imgs.map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
    ),
  ).then(() => undefined);
}

/**
 * What the workshop needs in order to actually make a customised item.
 *
 * Rendered from the snapshot frozen at checkout — the design AND the
 * configuration it was built against — so this shows what the customer
 * approved, not what the product happens to look like today (§32, §33).
 *
 * The originals are linked at full resolution rather than shown only as a
 * thumbnail, because a preview is not a print file: the whole point of storing
 * a transform instead of a re-crop is that the untouched photo is still there.
 */
export function OrderDesignPanel({
  raw,
  lineLabel,
  orderNumber,
  itemId,
}: {
  raw: unknown;
  lineLabel: string;
  orderNumber: string;
  itemId: string;
}) {
  // Read before the hooks so the effect can reference them; the early return
  // that depends on them stays below the hooks, so the rules of hooks hold.
  const stored = readStoredDesign(raw);
  const config = stored ? readConfig(stored.config) : null;

  const [showData, setShowData] = useState(false);
  /* The high-resolution capture. Setting a mode mounts a large, off-screen copy
     of the exact preview; the effect below captures it once its fonts and images
     are ready, then downloads it — as a PNG ("png") or wrapped in a proof-sheet
     SVG with the safe-area guides ("proof"). */
  const [exportMode, setExportMode] = useState<null | "png" | "proof">(null);
  const exporting = exportMode !== null;
  const [exportError, setExportError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMode) return;
    const mode = exportMode;
    let cancelled = false;

    (async () => {
      const node = exportRef.current;
      if (!node) return;
      try {
        // Fonts first (so script/uploaded fonts render, not a fallback), then
        // the images, so the capture is the finished picture — not a half-loaded
        // one. document.fonts.ready resolves once the @font-face faces are in.
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await document.fonts.ready;
        }
        await imagesReady(node);
        // Every character the design's text uses, so the embedded Google font
        // can be subset to just those glyphs (small and fast to rasterise).
        const glyphs = stored
          ? Array.from(
              new Set(
                Object.values(stored.design.zones).flatMap((z) =>
                  z.kind === "TEXT" ? Array.from(z.text.value) : [],
                ),
              ),
            ).join("")
          : "";
        // Build the embedded font CSS (real glyphs, no fallback) before capture.
        const fontEmbedCSS = config ? await buildFontEmbedCss(config, glyphs) : "";
        // One more frame so the just-loaded fonts/images have painted.
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        const { toPng } = await import("html-to-image");
        const dataUrl = await toPng(node, {
          // 2× the 1200px layout → a 2400px PNG. cacheBust avoids a stale
          // cached photo; a white backdrop matches the on-screen preview.
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: "#ffffff",
          width: EXPORT_SIDE,
          height: EXPORT_SIDE,
          // Provided CSS makes html-to-image skip its own (CORS-blocked) web-font
          // extraction and embed exactly these faces instead.
          ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
        });
        if (cancelled) return;

        const viewId = stored?.design.viewId ?? "design";
        const link = document.createElement("a");
        if (mode === "proof" && config && stored) {
          // Wrap the exact capture in a proof-sheet SVG with the print guides.
          const svg = buildProofSvg(dataUrl, config, stored.design);
          const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
          const objUrl = URL.createObjectURL(blob);
          link.href = objUrl;
          link.download = `${orderNumber}-${viewId}-proof.svg`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
        } else {
          link.href = dataUrl;
          link.download = `${orderNumber}-${viewId}-print.png`;
          link.click();
        }
      } catch {
        if (!cancelled) {
          setExportError(
            mode === "proof"
              ? "The proof sheet could not be created. Please try again."
              : "The print image could not be created. Please try again.",
          );
        }
      } finally {
        if (!cancelled) setExportMode(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // orderNumber and the frozen design are stable for a given order row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportMode]);

  if (!stored || !config) return null;

  const { design } = stored;

  const photos = Object.entries(design.zones).flatMap(([zoneId, value]) =>
    value.kind === "PHOTO" ? [{ zoneId, photo: value.photo }] : [],
  );
  const texts = Object.entries(design.zones).flatMap(([zoneId, value]) =>
    value.kind === "TEXT" ? [{ zoneId, text: value.text }] : [],
  );

  const zoneLabel = (id: string) => config.zones.find((z) => z.id === id)?.label ?? id;

  return (
    <div className="mt-2.5 rounded-lg border border-sr-line bg-sr-soft p-3">
      {/* Load the same fonts the customer's preview used, so BOTH the preview
          below and the font samples render in the real chosen fonts here —
          not a fallback. This is what makes the admin view match the customer. */}
      <CustomizerFonts config={config} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-sr-700 uppercase">
          Personalised design
        </p>
        <span className="text-[11px] text-sr-muted">
          Built against customizer version {design.configVersion}
        </span>
      </div>

      {config.enabled && config.views.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* The exact finished picture, captured from the very same preview the
              customer approved (same fonts, same fit, same colours) at print
              resolution — this is the file to print directly for frame-insert
              items. */}
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              setExportMode("png");
            }}
            disabled={exporting}
            className="inline-flex rounded-lg bg-sr-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sr-700 disabled:opacity-60"
          >
            {exportMode === "png" ? "Preparing image…" : "Download exact image (for print)"}
          </button>
          {/* The proof sheet: the SAME exact capture, wrapped in an SVG with the
              safe-area print guides for the workshop. */}
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              setExportMode("proof");
            }}
            disabled={exporting}
            className="inline-flex rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400 disabled:opacity-60"
          >
            {exportMode === "proof" ? "Preparing proof…" : "Proof sheet (SVG)"}
          </button>
          {exportError ? (
            <span className="text-[11px] font-medium text-danger">{exportError}</span>
          ) : null}
        </div>
      ) : null}

      {/* Off-screen, print-size copy of the exact preview, mounted only while a
          snapshot is being taken, then captured to a PNG by the effect above. */}
      {exporting ? (
        <div
          aria-hidden
          style={{ position: "fixed", left: -99999, top: 0, width: EXPORT_SIDE, pointerEvents: "none" }}
        >
          <div ref={exportRef} style={{ width: EXPORT_SIDE }}>
            <CustomizerFonts config={config} />
            <CustomizerCanvas config={config} design={design} viewId={design.viewId} />
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        {/* What the customer approved, rendered from the frozen configuration. */}
        {config.enabled && config.views.length > 0 ? (
          <div>
            <CustomizerCanvas config={config} design={design} viewId={design.viewId} />
            <p className="mt-1 text-center text-[11px] text-sr-muted">Customer&rsquo;s preview</p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-field bg-sr-surface p-4 text-xs text-sr-muted">
            This order was placed before configurations were frozen onto orders, so it cannot be
            re-rendered here. The values below are the complete record of what was ordered.
          </p>
        )}

        <div className="grid gap-3">
          {texts.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold text-sr-muted uppercase">Text</p>
              <div className="mt-1 grid gap-2">
                {texts.map(({ zoneId, text }) => {
                  const zone = config.zones.find((z) => z.id === zoneId);
                  const style = zone ? resolveTextStyle(config, zone, design) : null;
                  const colour = (text.color ?? style?.color ?? "#000000").toUpperCase();
                  const sizePct = Math.round(text.fontSizePct ?? style?.fontSizePct ?? 0);
                  // The real height on the printed piece: the chosen size is a
                  // percentage of the area's height, so at the area's configured
                  // print height it is a concrete millimetre value. Shown as the
                  // set size — long wording is shrunk to fit in the preview/image.
                  const printH = zone?.printHeightMm ?? null;
                  const sizeMm =
                    printH != null ? Math.round((sizePct / 100) * printH * 10) / 10 : null;
                  const flags = [
                    text.bold ? "Bold" : null,
                    text.italic ? "Italic" : null,
                    text.underline ? "Underline" : null,
                    text.align && text.align !== "center" ? `Align ${text.align}` : null,
                  ].filter((f): f is string => Boolean(f));
                  return (
                    <div key={zoneId} className="rounded-lg border border-sr-line bg-sr-surface p-2">
                      <div className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="text-sr-muted">{zoneLabel(zoneId)}:</span>
                        <span
                          className="font-semibold text-sr-ink"
                          style={style ? { fontFamily: fontStack(style.fontFamily) } : undefined}
                        >
                          {text.value}
                        </span>
                      </div>
                      {style ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-sr-muted">
                          <span>
                            Font:{" "}
                            <span
                              className="font-semibold text-sr-ink"
                              style={{ fontFamily: fontStack(style.fontFamily) }}
                            >
                              {style.fontFamily}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            Colour:
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-sm border border-sr-line"
                              style={{ backgroundColor: colour }}
                            />
                            <span className="font-mono text-sr-ink">{colour}</span>
                          </span>
                          <span>
                            Size: <span className="font-semibold text-sr-ink">{sizePct}%</span> of box
                            {sizeMm != null ? (
                              <>
                                {" · "}
                                <span className="font-semibold text-sr-ink">≈ {sizeMm}mm</span> tall
                              </>
                            ) : null}
                          </span>
                          {flags.map((flag) => (
                            <span key={flag} className="rounded bg-sr-soft px-1.5 py-0.5 text-sr-body">
                              {flag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {photos.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold text-sr-muted uppercase">
                Customer photos — originals, full resolution
              </p>
              <ul className="mt-2 grid gap-2">
                {photos.map(({ zoneId, photo }) => (
                  <li
                    key={zoneId}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-sr-line bg-sr-surface p-2"
                  >
                    {/* Private upload, served through the proxy that checks the
                        viewer — readable here because this viewer is an admin. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/uploads/${photo.uploadId}`}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-md border border-sr-line object-cover"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-semibold text-sr-ink">{zoneLabel(zoneId)}</p>
                      <p className="text-sr-muted">
                        {photo.naturalWidth && photo.naturalHeight
                          ? `${photo.naturalWidth} × ${photo.naturalHeight}px`
                          : "Size not recorded"}
                        {" · "}
                        zoom {photo.scale.toFixed(2)}×, offset {photo.offsetX.toFixed(1)}% /{" "}
                        {photo.offsetY.toFixed(1)}%, rotation {photo.rotation}°
                        {photo.flipH ? ", flipped" : ""}
                      </p>
                    </div>
                    <span className="flex shrink-0 gap-1.5">
                      <a
                        href={`/api/uploads/${photo.uploadId}`}
                        download
                        className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400"
                      >
                        Original
                      </a>
                      {/* The artwork at its real physical size, with the crop
                          already applied. This is the file to send to press. */}
                      <a
                        href={`/api/admin/orders/${orderNumber}/production?item=${itemId}&zone=${zoneId}`}
                        download
                        className="rounded-lg bg-sr-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sr-700"
                      >
                        Print file
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <button
              type="button"
              onClick={() => setShowData((v) => !v)}
              className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
            >
              {showData ? "Hide" : "Show"} full design data
            </button>
            {showData ? (
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-sr-line bg-sr-surface p-3 text-[11px] leading-relaxed text-sr-body">
                {JSON.stringify({ line: lineLabel, design, config }, null, 2)}
              </pre>
            ) : null}
          </div>

          <p className="text-[11px] text-sr-muted">
            Placement is stored as a transform, not a re-crop, so the originals above are untouched.
            Reproduce the crop by applying the zoom, offset and rotation to the printable area of
            each zone.
          </p>
        </div>
      </div>
    </div>
  );
}

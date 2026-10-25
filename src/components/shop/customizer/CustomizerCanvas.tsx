"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { CustomerDesign } from "@/lib/customizer/design";
import {
  acrylicMirrorOn,
  isZoneVisible,
  ledGlowOn,
  ledTint,
  resolveFrameFill,
  resolveGradient,
  resolveLogoUrl,
  resolveTextStyle,
  fontStack,
  zoneAcrylicText,
  zoneBoxShadow,
  zoneGradientCss,
  zoneTextMirror,
  zoneTextShadow,
  zoneTextDropShadow,
  zoneTextTexture,
  zonesForView,
  type CustomizerConfig,
  type CustomizerZone,
  type ResolvedGradient,
} from "@/lib/customizer/schema";

/**
 * The layered product preview.
 *
 * Built from positioned elements and CSS transforms rather than a canvas
 * library: a masked box per zone, the customer's photo inside it, and the
 * product's own artwork over the top. That keeps the preview sharp at every
 * size, costs no dependency, and lets the browser composite it on the GPU —
 * which is what makes dragging smooth on a phone.
 *
 * Layer order, bottom to top:
 *   base  →  zones (frames / photos / text, in configuration order)  →  overlay  →  glow
 *
 * The same component renders the editor and the clean fullscreen preview; only
 * `interactive` differs, so what the customer drags is exactly what they get.
 */

export function CustomizerCanvas({
  config,
  design,
  viewId,
  activeZoneId = null,
  interactive = false,
  showGuides = false,
  highlightActive = false,
  onZoneSelect,
  className = "",
}: {
  config: CustomizerConfig;
  design: CustomerDesign;
  viewId: string;
  activeZoneId?: string | null;
  interactive?: boolean;
  showGuides?: boolean;
  /** A subtle, temporary outline on the currently-selected area — used on the
   *  customer preview to show which element the focused field edits. Separate
   *  from `showGuides` (the admin builder's full guides), so the customer sees
   *  only this one indicator on the active element and nothing else. */
  highlightActive?: boolean;
  onZoneSelect?: (zoneId: string) => void;
  className?: string;
}) {
  const view = config.views.find((v) => v.id === viewId) ?? config.views[0];
  if (!view) return null;

  /* A zone hidden by the admin, or by the customer's option choices, is not
     drawn — the preview shows exactly what the current configuration
     produces (§18, Frame Designer layers). */
  const zones = zonesForView(config, view.id).filter(
    (z) => !z.hidden && isZoneVisible(config, z, design.options),
  );
  /* An LED group tints the glow layer, so choosing "warm white" or "blue"
     changes the light rather than only the wording. */
  const tint = view.isLit ? ledTint(config, design.options) : null;
  const showGlow = view.glow && ledGlowOn(config, design);
  const gradient = resolveGradient(config, design);

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden rounded-card bg-soft select-none ${className}`}
    >
      {view.base ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.base}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {zones.map((zone) => (
        <ZoneLayer
          key={zone.id}
          config={config}
          zone={zone}
          design={design}
          gradient={gradient}
          active={activeZoneId === zone.id}
          interactive={interactive}
          showGuides={showGuides}
          highlightActive={highlightActive}
          onSelect={onZoneSelect}
        />
      ))}

      {/* Sits above the customer's content, which is what makes a frame read as
          being in front of the photo rather than beside it. */}
      {view.overlay ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.overlay}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {/* Screen blending is what makes an LED layer read as light rather than
          as a pale sticker over the product. */}
      {showGlow ? (
        <span className="pointer-events-none absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={view.glow}
            alt=""
            draggable={false}
            style={{ mixBlendMode: "screen" }}
            className="absolute inset-0 h-full w-full object-contain"
          />
          {tint ? (
            <span
              aria-hidden="true"
              style={{
                background: tint,
                mixBlendMode: "color",
                WebkitMaskImage: `url(${view.glow})`,
                maskImage: `url(${view.glow})`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
              className="absolute inset-0"
            />
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function ZoneLayer({
  config,
  zone,
  design,
  gradient,
  active,
  interactive,
  showGuides,
  highlightActive,
  onSelect,
}: {
  config: CustomizerConfig;
  zone: CustomizerZone;
  design: CustomerDesign;
  gradient: ResolvedGradient | null;
  active: boolean;
  interactive: boolean;
  showGuides: boolean;
  highlightActive: boolean;
  onSelect?: (zoneId: string) => void;
}) {
  const value = design.zones[zone.id];

  const opacity = zone.opacity ?? 100;
  const box: CSSProperties = {
    left: `${zone.x}%`,
    top: `${zone.y}%`,
    width: `${zone.width}%`,
    height: `${zone.height}%`,
    transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
    borderRadius: zone.shape === "CIRCLE" ? "9999px" : `${zone.cornerRadius}%`,
    // The element's own opacity; 100 leaves it untouched.
    opacity: opacity < 100 ? opacity / 100 : undefined,
    /* Makes the zone a container, so the text below can be sized as a
       percentage of the ZONE's height rather than the viewport's. Without it
       `cqh` resolves against the small viewport and the text comes out the
       same size whatever the preview is scaled to. */
    containerType: "size",
  };

  const selectable = interactive && onSelect && !zone.locked;

  /* -------------------------------------------------------------- LOGO
     The customer's chosen preset logo, fit inside the box like a frame image.
     The picker lives in the controls; here the logo only displays. */
  if (zone.kind === "LOGO") {
    const logoUrl = resolveLogoUrl(zone, design);
    return (
      <div style={box} className="pointer-events-none absolute overflow-hidden">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            draggable={false}
            style={maskStyle(zone.maskUrl)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
      </div>
    );
  }

  /* ------------------------------------------------------------- FRAME */
  if (zone.kind === "FRAME") {
    const fill = resolveFrameFill(config, zone, design);
    const grad = zoneGradientCss(zone);
    const shadow = zoneBoxShadow(zone);
    const outerShadow = shadow && !zone.shadow.inset ? shadow : undefined;
    const innerShadow = shadow && zone.shadow.inset ? shadow : undefined;
    return (
      <div
        style={{
          ...box,
          // A gradient fills the shape; otherwise the solid fill, as before.
          background: !zone.imageUrl ? (grad ?? fill ?? undefined) : undefined,
          border:
            !zone.imageUrl && zone.strokeWidth > 0 && zone.stroke
              ? `${zone.strokeWidth}px solid ${zone.stroke}`
              : undefined,
          boxShadow: outerShadow,
        }}
        /* Frames are the admin's decoration only — never selectable or
           uploadable by the customer. pointer-events-none also lets a photo area
           sitting behind a frame stay tappable. (Admin editing uses the separate
           handle overlay, not this element.) */
        className="pointer-events-none absolute overflow-hidden"
      >
        {zone.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={zone.imageUrl}
            alt=""
            draggable={false}
            style={maskStyle(zone.maskUrl)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
        {/* Over an image frame, the gradient washes on top rather than replacing it. */}
        {grad && zone.imageUrl ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: grad, opacity: zone.gradient.opacity / 100, mixBlendMode: "overlay" }}
          />
        ) : null}
        {innerShadow ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: innerShadow, borderRadius: "inherit" }}
          />
        ) : null}
      </div>
    );
  }

  /* --------------------------------------------------------- PHOTO / TEXT */
  const text = value?.kind === "TEXT" ? resolveTextStyle(config, zone, design) : null;

  /* Per-element effects, read from this zone alone so they never leak to another. */
  const zoneGrad = zoneGradientCss(zone);
  const boxShadowVal = zone.kind === "PHOTO" ? zoneBoxShadow(zone) : null;
  const photoOuterShadow = boxShadowVal && !zone.shadow.inset ? boxShadowVal : undefined;
  const photoInnerShadow = boxShadowVal && zone.shadow.inset ? boxShadowVal : undefined;
  /* Text is coloured by this element's own gradient first, then any global one. */
  const textGradient =
    zoneGrad ??
    (gradient ? `linear-gradient(${gradient.direction}deg, ${gradient.color1}, ${gradient.color2})` : null);
  /* An acrylic-mirror finish, when set, overrides the colour/gradient entirely. */
  const acrylic = zoneAcrylicText(zone);
  /* A texture image clipped inside the letters — top of the fill precedence. */
  const texture = zoneTextTexture(zone);

  /* A photo box may carry a border, like a frame does. */
  const photoBorder =
    zone.kind === "PHOTO" && zone.strokeWidth > 0 && zone.stroke
      ? `${zone.strokeWidth}px solid ${zone.stroke}`
      : undefined;

  return (
    <div
      style={{ ...box, boxShadow: photoOuterShadow, border: photoBorder }}
      onPointerDown={selectable ? () => onSelect!(zone.id) : undefined}
      /* No selection outline on the product image — selecting a zone shows no
         dashed border; the controls panel already shows which area is active. */
      className={`absolute overflow-hidden ${selectable ? "cursor-pointer" : ""}`}
    >
      {value?.kind === "PHOTO" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/uploads/${value.photo.uploadId}`}
            alt=""
            draggable={false}
            style={{
              /* Centre first, then apply the customer's offset, zoom and turn.
                 Percentages are of the ZONE, so the same numbers reproduce this
                 crop at any output size, including the production render. */
              transform: [
                `translate(-50%, -50%)`,
                `translate(${value.photo.offsetX}%, ${value.photo.offsetY}%)`,
                `rotate(${value.photo.rotation}deg)`,
                `scale(${value.photo.scale * (value.photo.flipH ? -1 : 1)}, ${value.photo.scale * (value.photo.flipV ? -1 : 1)})`,
              ].join(" "),
              transformOrigin: "center",
              filter: `brightness(${value.photo.brightness}%) contrast(${value.photo.contrast}%) saturate(${value.photo.saturation}%)`,
              // Fit / Fill: "contain" shows the whole photo inside the shape,
              // "cover" (default) fills and crops it to the shape.
              objectFit: value.photo.fit === "contain" ? "contain" : "cover",
              // The admin's custom shape / clipping mask clips the customer photo.
              ...maskStyle(zone.maskUrl),
            }}
            className="absolute top-1/2 left-1/2 h-full w-full max-w-none"
          />
          {/* This element's own gradient wash wins; otherwise the global one the
              admin extended to photos and the customer turned on. */}
          {zoneGrad ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background: zoneGrad,
                mixBlendMode: "overlay",
                opacity: zone.gradient.opacity / 100,
              }}
            />
          ) : gradient?.applyToPhotos ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(${gradient.direction}deg, ${gradient.color1}, ${gradient.color2})`,
                mixBlendMode: "overlay",
                opacity: 0.55,
              }}
            />
          ) : null}
        </>
      ) : zone.kind === "PHOTO" && zone.imageUrl ? (
        /* The admin's default image: shown in an empty photo box until the
           customer uploads their own. `imageZoom` scales how it fills the box. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={zone.imageUrl}
          alt=""
          draggable={false}
          style={{
            transform: `translate(-50%, -50%) scale(${(zone.imageZoom ?? 100) / 100})`,
            transformOrigin: "center",
            ...maskStyle(zone.maskUrl),
          }}
          className="absolute top-1/2 left-1/2 h-full w-full max-w-none object-cover"
        />
      ) : null}

      {value?.kind === "TEXT" && value.text.value.trim() && text ? (
        <FitText
          text={value.text.value}
          align={value.text.align ?? zone.align}
          /* The customer's own placement inside the area: move from centre,
             then turn. Percentages are of the area, so the same numbers
             reproduce the layout at preview and print size. */
          containerStyle={{
            transform:
              [
                value.text.offsetX || value.text.offsetY
                  ? `translate(${value.text.offsetX ?? 0}%, ${value.text.offsetY ?? 0}%)`
                  : "",
                value.text.rotation ? `rotate(${value.text.rotation}deg)` : "",
                // Admin's default mirror, optionally toggled by the customer.
                zoneTextMirror(zone, { mirrorH: value.text.mirrorH, mirrorV: value.text.mirrorV }) ?? "",
              ]
                .filter(Boolean)
                .join(" ") || undefined,
          }}
          textStyle={{
            // resolveTextStyle already resolves the per-box font (the customer's
            // pick clamped to this box's allowed fonts, else the admin default).
            fontFamily: fontStack(text.fontFamily),
            fontSize: `${value.text.fontSizePct ?? text.fontSizePct}cqh`,
            lineHeight: 1.15,
            fontWeight: value.text.bold ? 700 : zone.fontWeight ?? undefined,
            fontStyle: value.text.italic ? "italic" : undefined,
            textDecoration: value.text.underline ? "underline" : undefined,
            // Colour precedence: texture image → acrylic-mirror finish →
            // element gradient → global gradient → plain colour.
            ...(texture
              ? {
                  backgroundImage: texture.backgroundImage,
                  backgroundSize: texture.backgroundSize,
                  backgroundPosition: texture.backgroundPosition,
                  backgroundRepeat: texture.backgroundRepeat,
                  backgroundBlendMode: texture.backgroundBlendMode,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  WebkitTextFillColor: "transparent",
                }
              : acrylic
              ? {
                  backgroundImage: acrylic.backgroundImage,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  WebkitTextFillColor: "transparent",
                }
              : textGradient
                ? {
                    backgroundImage: textGradient,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    WebkitTextFillColor: "transparent",
                  }
                : { color: value.text.color ?? text.color }),
            // Shadow precedence. Textured letters take a different path: a
            // text-shadow paints over the clipped background (in FRONT of the
            // letters), so an outer shadow is rendered as a drop-shadow FILTER
            // that sits behind the glyphs; an engraved (inset) shadow stays a
            // surface text-shadow. Non-textured text is unchanged:
            // acrylic emboss → element shadow → global acrylic.
            ...(texture
              ? zoneTextDropShadow(zone)
                ? { filter: zoneTextDropShadow(zone)! }
                : zone.shadow?.enabled && zone.shadow.inset
                  ? { textShadow: zoneTextShadow(zone)! }
                  : null
              : acrylic
                ? { textShadow: acrylic.textShadow }
                : zoneTextShadow(zone)
                  ? { textShadow: zoneTextShadow(zone)! }
                  : acrylicMirrorOn(config)
                    ? {
                        textShadow:
                          "0 1px 0 rgba(255,255,255,0.65), 0 -1px 0 rgba(0,0,0,0.25), 0 2px 3px rgba(0,0,0,0.35)",
                      }
                    : null),
          }}
        />
      ) : null}

      {/* Admin only: a faint outline on every text box, so it is clear where
          the wording must sit. The text is fitted to this box (ink included), so
          it stays inside the outline rather than crossing it. Never shown to the
          customer or in the print snapshot (showGuides is the builder only). */}
      {showGuides && zone.kind === "TEXT" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ border: "1px dashed rgba(120,120,130,0.5)", borderRadius: "inherit" }}
        />
      ) : null}

      {/* Inner shadow sits above the photo so it reads as recessed. */}
      {photoInnerShadow ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: photoInnerShadow, borderRadius: "inherit" }}
        />
      ) : null}

      {/* Guides — the safe-area margin and the empty-slot hint — show only for
          the selected area, so the canvas is not covered in outlines. */}
      {showGuides && active && zone.safeInset > 0 ? (
        <span
          style={{ inset: `${zone.safeInset}%` }}
          className="pointer-events-none absolute border border-dashed border-white/70"
        />
      ) : null}

      {showGuides && active && !value ? (
        // A faint label only — no filled "shade" over the box, which hid the
        // product art behind it and made positioning an empty area hard.
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[10px] leading-tight font-semibold text-brand-700/55">
          {zone.kind === "PHOTO" ? "Add photo" : zone.label}
        </span>
      ) : null}

      {/* Customer side: a faint label on the selected, still-empty photo area so
          it is clear where the upload will land — no white "shade" fill over the
          box, so the product art stays fully visible. A soft text-shadow keeps
          the label legible over any image. */}
      {highlightActive && !showGuides && active && !value && zone.kind === "PHOTO" ? (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[10px] leading-tight font-semibold text-brand-700/70"
          style={{ textShadow: "0 1px 2px rgba(255,255,255,0.7)" }}
        >
          Add photo
        </span>
      ) : null}
    </div>
  );
}

/** CSS to clip an image to a mask PNG's shape (the admin's custom shape). The
 *  mask is fit inside the area, centred, so the shape is not distorted. */
function maskStyle(url: string): CSSProperties | undefined {
  if (!url) return undefined;
  const u = `url("${url}")`;
  return {
    WebkitMaskImage: u,
    maskImage: u,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };
}

/* useLayoutEffect on the client, useEffect on the server — the measurement can
   only run in the browser, and this keeps the fit from writing before hydration
   while avoiding React's SSR warning. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* One shared canvas for measuring glyph ink — created lazily, reused forever. */
let inkCanvas: HTMLCanvasElement | null = null;

/**
 * The real ink bounds of the tallest line, in px, for a given CSS font.
 *
 * `scrollHeight` is only the line box (~font-size × line-height); a script or
 * display font draws well above and below that, so sizing by the line box lets
 * the glyphs spill out of the area — which both overflows the box and, when the
 * letters are filled by a clipped background (a texture/gradient/acrylic),
 * leaves the overflowing parts unpainted so the text looks cut off. Canvas
 * `measureText` reports the actual ascent/descent of the drawn glyphs, which is
 * what we need to fit and to size the paint box. Returns null when the browser
 * does not expose the bounding-box metrics, so the caller can fall back.
 */
function measureInk(font: string, lines: string[]): { ascent: number; descent: number } | null {
  if (typeof document === "undefined") return null;
  try {
    if (!inkCanvas) inkCanvas = document.createElement("canvas");
    const ctx = inkCanvas.getContext("2d");
    if (!ctx) return null;
    ctx.font = font;
    let ascent = 0;
    let descent = 0;
    for (const line of lines) {
      const m = ctx.measureText(line || " ");
      if (m.actualBoundingBoxAscent == null || m.actualBoundingBoxDescent == null) return null;
      ascent = Math.max(ascent, m.actualBoundingBoxAscent);
      descent = Math.max(descent, m.actualBoundingBoxDescent);
    }
    return { ascent, descent };
  } catch {
    return null;
  }
}

/**
 * Text that shrinks to fit its area.
 *
 * The wording is laid out at the size the admin/customer chose and then scaled
 * down — never up — until it fits the area's width and height, so a long name or
 * a long house number stays on the plate instead of spilling past its edge or
 * being clipped (the behaviour customers expect from a name-plate preview).
 *
 * The fit is measured as a ratio of the (unscaled) text box to the area, both of
 * which scale together with the preview, so the resulting size is a proportion
 * of the area — the same at a 320px phone preview and a 4000px print render, and
 * reproducible rather than pixel-dependent.
 *
 * Height is fitted to the glyphs' real ink (measured on a canvas), not the line
 * box, so tall script/display letters stay inside the area instead of spilling
 * over its edge. The same measurement sets a little vertical padding on the text
 * box, so a texture/gradient/acrylic fill (painted by `background-clip:text`)
 * covers the whole glyph — ascenders and descenders included — rather than being
 * cut off at the line box.
 */
function FitText({
  text,
  align,
  containerStyle,
  textStyle,
}: {
  text: string;
  align: "left" | "center" | "right";
  containerStyle?: CSSProperties;
  textStyle?: CSSProperties;
}) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  /* Vertical padding (in em) that extends the fill's paint box above and below
     the line box to cover the glyph ink. 0 for ordinary fonts. */
  const [padEm, setPadEm] = useState(0);

  useIsoLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    // Measured synchronously (before paint) so the size is right on the first
    // frame — no flash of oversized text — and so it never depends on a rAF that
    // a later render might cancel. Width uses `scrollWidth` (the natural, pre-
    // transform layout width); height uses the glyphs' measured ink.
    const fit = () => {
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      const iw = inner.scrollWidth;
      const boxH = inner.scrollHeight; // line-box height, the fallback
      if (!ow || !oh || !iw || !boxH) return;

      let ih = boxH;
      let pad = 0;

      const cs = getComputedStyle(inner);
      const fontSizePx = parseFloat(cs.fontSize) || 0;
      if (fontSizePx > 0) {
        const lines = text.split("\n");
        const ink = measureInk(
          `${cs.fontStyle} ${cs.fontWeight} ${fontSizePx}px ${cs.fontFamily}`,
          lines,
        );
        if (ink) {
          const lineGap = fontSizePx * 1.15; // matches line-height below
          // Full ink height across the lines: the gaps between baselines, plus
          // the top line's ascent and the bottom line's descent.
          const inkHeight = (lines.length - 1) * lineGap + ink.ascent + ink.descent;
          // Fit to the LARGER of the line box and the ink, so a tall script or
          // display font (ink taller than the line box) is shrunk to stay inside
          // the area, while ordinary text — whose ink fits the line box — keeps
          // exactly the size it had before (no surprise resizing of old designs).
          if (inkHeight > boxH) ih = inkHeight;
          // How far the ink reaches past the line box on either side → padding
          // so the clipped-background fill covers it. Small safety margin.
          const half = lineGap / 2;
          const over = Math.max(0, ink.ascent - half, ink.descent - half);
          pad = (over / fontSizePx) * 1.04;
        }
      }

      const next = Math.min(1, ow / iw, oh / ih);
      // Thresholds stop a sub-pixel measurement wobble from re-rendering forever.
      setScale((prev) => (Math.abs(prev - next) > 0.004 ? next : prev));
      setPadEm((prev) => (Math.abs(prev - pad) > 0.01 ? pad : prev));
    };

    fit();

    // Re-fit whenever the area resizes (preview scaling) or the text box's own
    // natural size changes (new wording, or a web font arriving); the text box
    // keeps its natural size via flex-shrink:0, so this fires on content change
    // rather than being pinned to the area's width.
    let done = false;
    const ro = new ResizeObserver(() => {
      if (!done) fit();
    });
    ro.observe(outer);
    ro.observe(inner);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => !done && fit()).catch(() => {});
    }

    return () => {
      done = true;
      ro.disconnect();
    };
  }, [text, textStyle?.fontFamily, textStyle?.fontSize, textStyle?.fontWeight, textStyle?.fontStyle]);

  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  return (
    <span
      ref={outerRef}
      style={{ justifyContent: justify, ...containerStyle }}
      className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-[2%]"
    >
      <span
        ref={innerRef}
        style={{
          ...textStyle,
          display: "inline-block",
          // Keep the text box at its natural size (never shrunk by the flex
          // parent) so the measurement reflects the real text width.
          flexShrink: 0,
          flexGrow: 0,
          // Preserve deliberate line breaks but never auto-wrap: a long line
          // shrinks to fit rather than breaking onto another line.
          whiteSpace: "pre",
          textAlign: align,
          // Extend the fill's paint box to cover the glyph ink (set above). The
          // default `background-origin: padding-box` means the texture/gradient
          // now paints over this taller box, so the letters are filled fully.
          paddingTop: padEm ? `${padEm}em` : undefined,
          paddingBottom: padEm ? `${padEm}em` : undefined,
          transform: `scale(${scale})`,
          transformOrigin:
            justify === "flex-start" ? "left center" : justify === "flex-end" ? "right center" : "center",
        }}
      >
        {text}
      </span>
    </span>
  );
}

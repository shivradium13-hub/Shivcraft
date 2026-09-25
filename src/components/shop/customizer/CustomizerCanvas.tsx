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
  resolveTextStyle,
  fontStack,
  zoneBoxShadow,
  zoneGradientCss,
  zoneTextShadow,
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

  const box: CSSProperties = {
    left: `${zone.x}%`,
    top: `${zone.y}%`,
    width: `${zone.width}%`,
    height: `${zone.height}%`,
    transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
    borderRadius: zone.shape === "CIRCLE" ? "9999px" : `${zone.cornerRadius}%`,
    /* Makes the zone a container, so the text below can be sized as a
       percentage of the ZONE's height rather than the viewport's. Without it
       `cqh` resolves against the small viewport and the text comes out the
       same size whatever the preview is scaled to. */
    containerType: "size",
  };

  const selectable = interactive && onSelect && !zone.locked;

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
        onPointerDown={selectable ? () => onSelect!(zone.id) : undefined}
        className={`absolute overflow-hidden ${selectable ? "cursor-pointer" : ""} ${
          showGuides && active ? "outline-2 outline-dashed outline-brand-500" : ""
        }`}
      >
        {zone.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={zone.imageUrl}
            alt=""
            draggable={false}
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

  return (
    <div
      style={{ ...box, boxShadow: photoOuterShadow }}
      onPointerDown={selectable ? () => onSelect!(zone.id) : undefined}
      className={`absolute overflow-hidden ${selectable ? "cursor-pointer" : ""} ${
        // Admin builder guides: full dashed outline on the selected photo area.
        showGuides && active && zone.kind === "PHOTO" ? "outline-2 outline-dashed outline-brand-500" : ""
      } ${
        // Customer selection indicator: a subtle, temporary dashed outline on the
        // area the focused field edits (photo or text). Only the active one.
        highlightActive && active ? "outline-2 outline-dashed outline-brand-500/45 outline-offset-2" : ""
      }`}
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
            }}
            className="absolute top-1/2 left-1/2 h-full w-full max-w-none object-cover"
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
              value.text.offsetX || value.text.offsetY || value.text.rotation
                ? `translate(${value.text.offsetX ?? 0}%, ${value.text.offsetY ?? 0}%) rotate(${value.text.rotation ?? 0}deg)`
                : undefined,
          }}
          textStyle={{
            fontFamily: fontStack(value.text.fontFamily ?? text.fontFamily),
            fontSize: `${value.text.fontSizePct ?? text.fontSizePct}cqh`,
            lineHeight: 1.15,
            fontWeight: value.text.bold ? 700 : undefined,
            fontStyle: value.text.italic ? "italic" : undefined,
            textDecoration: value.text.underline ? "underline" : undefined,
            ...(textGradient
              ? {
                  backgroundImage: textGradient,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  WebkitTextFillColor: "transparent",
                }
              : { color: value.text.color ?? text.color }),
            // This element's own shadow wins; else the acrylic-mirror treatment.
            ...(zoneTextShadow(zone)
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
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-brand-50/70 text-center text-[10px] leading-tight font-semibold text-brand-700">
          {zone.kind === "PHOTO" ? "Add photo" : zone.label}
        </span>
      ) : null}

      {/* Customer side: a faint hint on the selected, still-empty photo area so
          it is clear where the upload will land. Text areas get no fill. */}
      {highlightActive && !showGuides && active && !value && zone.kind === "PHOTO" ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-brand-50/40 text-center text-[10px] leading-tight font-semibold text-brand-700/80">
          Add photo
        </span>
      ) : null}
    </div>
  );
}

/* useLayoutEffect on the client, useEffect on the server — the measurement can
   only run in the browser, and this keeps the fit from writing before hydration
   while avoiding React's SSR warning. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
 * reproducible rather than pixel-dependent. `scrollWidth`/`scrollHeight` are the
 * pre-transform layout size, so applying the scale never feeds back into the
 * measurement.
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

  useIsoLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    // Measured synchronously (before paint) so the size is right on the first
    // frame — no flash of oversized text — and so it never depends on a rAF that
    // a later render might cancel. `scrollWidth`/`scrollHeight` are the natural,
    // pre-transform layout size, so applying the scale never feeds back in.
    const fit = () => {
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      if (!ow || !oh || !iw || !ih) return;
      const next = Math.min(1, ow / iw, oh / ih);
      // A threshold stops a sub-pixel measurement wobble from re-rendering forever.
      setScale((prev) => (Math.abs(prev - next) > 0.004 ? next : prev));
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

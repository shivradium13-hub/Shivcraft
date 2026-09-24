"use client";

import type { CSSProperties } from "react";

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
  onZoneSelect,
  className = "",
}: {
  config: CustomizerConfig;
  design: CustomerDesign;
  viewId: string;
  activeZoneId?: string | null;
  interactive?: boolean;
  showGuides?: boolean;
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
  onSelect,
}: {
  config: CustomizerConfig;
  zone: CustomizerZone;
  design: CustomerDesign;
  gradient: ResolvedGradient | null;
  active: boolean;
  interactive: boolean;
  showGuides: boolean;
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
    return (
      <div
        style={{
          ...box,
          background: !zone.imageUrl && fill ? fill : undefined,
          border:
            !zone.imageUrl && zone.strokeWidth > 0 && zone.stroke
              ? `${zone.strokeWidth}px solid ${zone.stroke}`
              : undefined,
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
      </div>
    );
  }

  /* --------------------------------------------------------- PHOTO / TEXT */
  const text = value?.kind === "TEXT" ? resolveTextStyle(config, zone, design) : null;

  return (
    <div
      style={box}
      onPointerDown={selectable ? () => onSelect!(zone.id) : undefined}
      className={`absolute overflow-hidden ${selectable ? "cursor-pointer" : ""} ${
        showGuides && active ? "outline-2 outline-dashed outline-brand-500" : ""
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
          {/* A gradient wash over photos, when the admin extended the gradient
              to photos and the customer turned it on. */}
          {gradient?.applyToPhotos ? (
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
        <span
          style={{
            fontFamily: fontStack(value.text.fontFamily ?? text.fontFamily),
            textAlign: value.text.align ?? zone.align,
            fontSize: `${value.text.fontSizePct ?? text.fontSizePct}cqh`,
            lineHeight: 1.15,
            ...(gradient
              ? {
                  backgroundImage: `linear-gradient(${gradient.direction}deg, ${gradient.color1}, ${gradient.color2})`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  WebkitTextFillColor: "transparent",
                }
              : { color: value.text.color ?? text.color }),
            ...(acrylicMirrorOn(config)
              ? {
                  textShadow:
                    "0 1px 0 rgba(255,255,255,0.65), 0 -1px 0 rgba(0,0,0,0.25), 0 2px 3px rgba(0,0,0,0.35)",
                }
              : null),
          }}
          className="absolute inset-0 flex items-center justify-center overflow-hidden px-[2%] break-words whitespace-pre-wrap"
        >
          {value.text.value}
        </span>
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
    </div>
  );
}

"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { emptyDesign, type TextPlacement } from "@/lib/customizer/design";
import type { CustomizerConfig } from "@/lib/customizer/schema";

import { CustomizerCanvas } from "./customizer/CustomizerCanvas";
import { RepositionBox } from "./customizer/RepositionBox";
import { useCustomizerSnapshot } from "./customizer/customizerBridge";

type GalleryImage = { id: string; url: string; alt: string | null };

/**
 * The product image *is* the live personalization preview.
 *
 * Shown in the product-image column for Frame-Designer products. The main area
 * is the live design (the admin's template composited with the customer's
 * content — the same `CustomizerCanvas` the controls used to render inline),
 * updating as the customer types. The admin's uploaded photos are kept as
 * thumbnails beside it, so the live design is the first thumbnail and the
 * example/marketing shots are still browsable; picking one shows that photo,
 * picking the design returns to the editable preview.
 *
 * The live state is mirrored from the controls island through the bridge; until
 * that island mounts and publishes, the bare template shows as a placeholder so
 * the column is never blank.
 */
export function ProductLivePreview({
  productId,
  config,
  name,
  images,
}: {
  productId: string;
  config: CustomizerConfig;
  name: string;
  images: GalleryImage[];
}) {
  const snap = useCustomizerSnapshot(productId);
  const overlayRef = useRef<HTMLDivElement>(null);
  /* "live" shows the editable design; a number shows that uploaded photo. */
  const [selected, setSelected] = useState<"live" | number>("live");

  const firstView = config.views[0];
  const showLive = selected === "live";
  const staticImage = typeof selected === "number" ? images[selected] : null;

  const rep = snap?.reposition ?? null;
  const placement =
    rep && snap && snap.design.zones[rep]?.kind === "TEXT"
      ? (snap.design.zones[rep] as { kind: "TEXT"; text: TextPlacement }).text
      : null;

  const liveMain = snap ? (
    <div className="relative rounded-card border border-line bg-paper p-2" {...snap.gestureHandlers}>
      <CustomizerCanvas
        config={snap.config}
        design={snap.design}
        viewId={snap.design.viewId}
        activeZoneId={snap.activeZoneId}
        interactive
        onZoneSelect={snap.onZoneSelect}
      />
      {/* The reposition handle box only exists while placing text, so the product
          image carries no box otherwise. */}
      {rep && snap.repositionZone ? (
        <div ref={overlayRef} className="pointer-events-none absolute inset-2">
          <RepositionBox
            zone={snap.repositionZone}
            placement={placement}
            overlayRef={overlayRef}
            onChange={(patch, live) => snap.setTextProps(rep, patch, live)}
          />
        </div>
      ) : null}
    </div>
  ) : (
    // Placeholder before the controls publish: the bare template.
    <div className="rounded-card border border-line bg-paper p-2">
      {firstView ? (
        <CustomizerCanvas
          config={config}
          design={emptyDesign(config.version, firstView.id)}
          viewId={firstView.id}
        />
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-card bg-brand-50 text-sm text-muted">
          {name}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {showLive ? (
        liveMain
      ) : staticImage ? (
        <div className="relative aspect-square overflow-hidden rounded-card border border-line bg-brand-50">
          <Image
            key={staticImage.id}
            src={staticImage.url}
            alt={staticImage.alt ?? name}
            fill
            priority
            sizes="(min-width: 1024px) 520px, 100vw"
            unoptimized={staticImage.url.endsWith(".svg")}
            className="object-cover"
          />
        </div>
      ) : (
        liveMain
      )}

      {/* Template views (front/back/…), shown only while editing the design. */}
      {showLive && snap && snap.config.views.length > 1 ? (
        <div className="gc-hide-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {snap.config.views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => snap.setViewId(view.id)}
              aria-pressed={snap.design.viewId === view.id}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                snap.design.viewId === view.id
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line-strong bg-paper text-ink-soft hover:border-brand-400"
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Thumbnails: the live design first, then the admin's uploaded photos. */}
      {images.length > 0 ? (
        <div className="gc-hide-scrollbar mt-3 flex gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelected("live")}
            aria-current={showLive}
            aria-label="Your design"
            title="Your design"
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-paper transition ${
              showLive ? "border-brand-500" : "border-line hover:border-brand-300"
            }`}
          >
            {snap ? (
              <CustomizerCanvas config={snap.config} design={snap.design} viewId={snap.design.viewId} />
            ) : firstView ? (
              <CustomizerCanvas
                config={config}
                design={emptyDesign(config.version, firstView.id)}
                viewId={firstView.id}
              />
            ) : null}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-brand-600/85 py-0.5 text-center text-[9px] font-semibold text-white">
              Design
            </span>
          </button>

          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelected(i)}
              aria-current={selected === i}
              aria-label={`View photo ${i + 1} of ${images.length}`}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                selected === i ? "border-brand-500" : "border-line hover:border-brand-300"
              }`}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="64px"
                unoptimized={image.url.endsWith(".svg")}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

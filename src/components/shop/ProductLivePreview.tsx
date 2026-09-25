"use client";

import { useRef } from "react";

import { emptyDesign, type TextPlacement } from "@/lib/customizer/design";
import type { CustomizerConfig } from "@/lib/customizer/schema";

import { CustomizerCanvas } from "./customizer/CustomizerCanvas";
import { RepositionBox } from "./customizer/RepositionBox";
import { useCustomizerSnapshot } from "./customizer/customizerBridge";

/**
 * The product image *is* the live personalization preview.
 *
 * Shown in the product-image column for Frame-Designer products in place of the
 * static gallery. It renders the admin's template composited with the customer's
 * content — the same `CustomizerCanvas` the controls used to render inline — by
 * mirroring the live state the controls publish through the bridge. So the
 * customer edits the actual product: their text/photo appear in the designer's
 * exact positions and layers, updating as they type.
 *
 * Until the controls island (a client-only dynamic import) has mounted and
 * published, it shows the bare template as an instant placeholder so the column
 * is never blank.
 */
export function ProductLivePreview({
  productId,
  config,
  name,
}: {
  productId: string;
  config: CustomizerConfig;
  name: string;
}) {
  const snap = useCustomizerSnapshot(productId);
  const overlayRef = useRef<HTMLDivElement>(null);

  const firstView = config.views[0];

  // Placeholder before the controls publish: the template with no content yet.
  if (!snap) {
    return (
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
  }

  const rep = snap.reposition;
  const placement =
    rep && snap.design.zones[rep]?.kind === "TEXT"
      ? (snap.design.zones[rep] as { kind: "TEXT"; text: TextPlacement }).text
      : null;

  return (
    <div>
      <div className="relative rounded-card border border-line bg-paper p-2" {...snap.gestureHandlers}>
        <CustomizerCanvas
          config={snap.config}
          design={snap.design}
          viewId={snap.design.viewId}
          activeZoneId={snap.activeZoneId}
          interactive
          onZoneSelect={snap.onZoneSelect}
        />

        {/* The reposition handle box only exists while the customer is placing
            text, so the product image carries no box otherwise. */}
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

      {/* Template views (front/back/…) act as the thumbnails. */}
      {snap.config.views.length > 1 ? (
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
    </div>
  );
}

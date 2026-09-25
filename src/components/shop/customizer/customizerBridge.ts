"use client";

import { useSyncExternalStore, type CSSProperties, type DOMAttributes } from "react";

import type { CustomerDesign, TextPlacement } from "@/lib/customizer/design";
import type { CustomizerConfig, CustomizerZone } from "@/lib/customizer/schema";

/**
 * A tiny bridge between the customization controls and the product image.
 *
 * The controls (`ProductCustomizer`, right column) own the design and all its
 * state. The product image (`ProductLivePreview`, left column) must render that
 * same live design so the picture the customer edits *is* the product. They sit
 * in two separate client islands, so rather than lift state through the server
 * page or duplicate it, the owner publishes a snapshot here and the preview
 * subscribes to it. Keyed by product id so the right snapshot is read even if
 * more than one ever mounts.
 *
 * This holds only in-memory UI state for the current view; nothing here is
 * persisted or sent anywhere — the design that reaches the cart is still the one
 * the owner sends on add-to-cart.
 */

export type CustomizerSnapshot = {
  config: CustomizerConfig;
  design: CustomerDesign;
  activeZoneId: string | null;
  /** The id of the text area being repositioned, or null. */
  reposition: string | null;
  repositionZone: CustomizerZone | null;
  onZoneSelect: (zoneId: string) => void;
  setViewId: (viewId: string) => void;
  setTextProps: (zoneId: string, patch: Partial<TextPlacement>, live?: boolean) => void;
  /** Photo pan/pinch/zoom handlers, spread onto the preview's canvas wrapper so
   *  dragging a photo works wherever the live preview is rendered. */
  gestureHandlers: DOMAttributes<HTMLDivElement> & { style?: CSSProperties };
};

const snapshots = new Map<string, CustomizerSnapshot>();
const listeners = new Map<string, Set<() => void>>();

function notify(id: string) {
  const set = listeners.get(id);
  if (set) for (const l of set) l();
}

/** Called by the owner to publish the current state, or `null` to clear it. */
export function publishCustomizer(id: string, snapshot: CustomizerSnapshot | null) {
  if (snapshot) snapshots.set(id, snapshot);
  else snapshots.delete(id);
  notify(id);
}

function subscribe(id: string, cb: () => void) {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) listeners.delete(id);
  };
}

/** Subscribe to the current snapshot for a product, or `null` until one is
 *  published (e.g. before the controls island has mounted). */
export function useCustomizerSnapshot(id: string): CustomizerSnapshot | null {
  return useSyncExternalStore(
    (cb) => subscribe(id, cb),
    () => snapshots.get(id) ?? null,
    () => null,
  );
}

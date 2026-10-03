"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny bridge so the headline product price can reflect the chosen variants.
 *
 * `ProductPurchase` (the controls) owns the variant selection and computes what
 * one unit costs. The big price shown above it sits in the server-rendered page,
 * a separate island, so rather than lift that state up, the controls publish the
 * current unit price here and `ProductPriceDisplay` subscribes. Keyed by product
 * id. In-memory only; the price that reaches the cart is still computed server
 * side from the selected variants.
 */

export type PriceSnapshot = {
  /** What one unit costs with the chosen options (paise). */
  unitP: number;
  /** The struck-through "was" price with the same options (paise). */
  mrpP: number;
  /** Whole-number percent off, or 0 when there is no genuine discount. */
  offPercent: number;
};

const snapshots = new Map<string, PriceSnapshot>();
const listeners = new Map<string, Set<() => void>>();

function notify(id: string) {
  const set = listeners.get(id);
  if (set) for (const l of set) l();
}

/** Called by the controls to publish the current price, or `null` to clear it. */
export function publishPrice(id: string, snapshot: PriceSnapshot | null) {
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

/** The current price for a product, or `null` until the controls publish one. */
export function usePriceSnapshot(id: string): PriceSnapshot | null {
  return useSyncExternalStore(
    (cb) => subscribe(id, cb),
    () => snapshots.get(id) ?? null,
    () => null,
  );
}

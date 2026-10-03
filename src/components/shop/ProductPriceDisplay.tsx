"use client";

import { formatPaise } from "@/lib/money";

import { usePriceSnapshot } from "./pricingBridge";

/**
 * The headline price above the buy controls. It shows the server-seeded price for
 * the default selection, then follows the customer's variant choices live (via the
 * pricing bridge) so the price, the struck-through "was" and the % off all move
 * together with the Total below.
 */
export function ProductPriceDisplay({
  productId,
  unitP,
  mrpP,
  offPercent,
}: {
  productId: string;
  unitP: number;
  mrpP: number;
  offPercent: number;
}) {
  const snap = usePriceSnapshot(productId);
  const price = snap?.unitP ?? unitP;
  const was = snap?.mrpP ?? mrpP;
  const off = snap?.offPercent ?? offPercent;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <span className="font-display text-3xl font-semibold text-brand-600">{formatPaise(price)}</span>
        {off > 0 ? (
          <>
            <span className="text-base text-muted line-through">{formatPaise(was)}</span>
            <span className="rounded-md bg-brand-600 px-2 py-0.5 text-sm font-semibold text-white">
              {off}% OFF
            </span>
          </>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted">Inclusive of all taxes</p>
    </>
  );
}

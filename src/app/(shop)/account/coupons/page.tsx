import type { Metadata } from "next";
import Link from "next/link";

import { formatPaise } from "@/lib/money";
import { getMyCoupons } from "@/server/account/queries";
import { requireUser } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coupons", robots: { index: false, follow: false } };

export default async function CouponsPage() {
  const user = await requireUser();
  const coupons = await getMyCoupons(user.id);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Coupons</h1>
      <p className="mt-1 mb-5 max-w-prose text-sm text-muted">
        Only coupons you can actually use right now are listed — nothing expired, exhausted, or
        already used up by you.
      </p>

      {coupons.length === 0 ? (
        <div className="rounded-card border border-dashed border-field bg-field-bg px-6 py-14 text-center">
          <span aria-hidden="true" className="text-3xl">🎟</span>
          <h2 className="mt-3 font-display text-xl font-semibold text-ink">No coupons available</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Nothing you can redeem at the moment. New offers appear here on their own.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {coupons.map((coupon) => (
            <li key={coupon.id} className="rounded-card border border-marigold-200 bg-marigold-50 p-4">
              <p className="font-mono text-base font-bold tracking-wider text-brand-800">
                {coupon.code}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {coupon.description ??
                  (coupon.discountType === "PERCENT"
                    ? `${coupon.discountValue}% off`
                    : `${formatPaise(coupon.discountValue)} off`)}
              </p>

              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                <li>
                  {coupon.minOrderP > 0
                    ? `Minimum order ${formatPaise(coupon.minOrderP)}`
                    : "No minimum order"}
                </li>
                {coupon.maxDiscountP ? <li>Up to {formatPaise(coupon.maxDiscountP)} off</li> : null}
                {coupon.endsAt ? (
                  <li>
                    Valid until{" "}
                    {new Date(coupon.endsAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </li>
                ) : null}
              </ul>

              <Link
                href="/cart"
                className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
              >
                Apply in cart →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

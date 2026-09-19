import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { coupons } from "@/server/db/schema";

export type LiveOffer = {
  code: string;
  description: string | null;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minOrderP: number;
  maxDiscountP: number | null;
};

/**
 * Coupons worth advertising on a product page.
 *
 * Read from the table rather than written into the page, so a code the admin
 * ends, exhausts or deletes stops being advertised. Anything shown here will
 * actually work when typed — the same window, stock of uses and category limit
 * that checkCoupon applies at the till is applied here.
 *
 * Per-customer limits are deliberately not considered: that depends on who is
 * looking, and this list is cached-friendly and identical for everyone.
 */
export async function getLiveOffers(categoryId: string | null, limit = 3): Promise<LiveOffer[]> {
  const now = new Date();

  const rows = await db
    .select({
      code: coupons.code,
      description: coupons.description,
      discountType: coupons.discountType,
      discountValue: coupons.discountValue,
      minOrderP: coupons.minOrderP,
      maxDiscountP: coupons.maxDiscountP,
    })
    .from(coupons)
    .where(
      and(
        eq(coupons.isActive, true),
        or(isNull(coupons.startsAt), lte(coupons.startsAt, now)),
        or(isNull(coupons.endsAt), gt(coupons.endsAt, now)),
        or(isNull(coupons.usageLimit), sql`${coupons.usedCount} < ${coupons.usageLimit}`),
        // Either it applies to everything, or to the category this product is in.
        categoryId
          ? or(isNull(coupons.categoryId), eq(coupons.categoryId, categoryId))
          : isNull(coupons.categoryId),
      ),
    )
    .orderBy(asc(coupons.minOrderP))
    .limit(limit);

  return rows;
}

/** One line of plain English describing what a coupon does. */
export function describeOffer(offer: LiveOffer): string {
  if (offer.description) return offer.description;

  const amount =
    offer.discountType === "PERCENT"
      ? `${offer.discountValue}% off`
      : `₹${Math.round(offer.discountValue / 100).toLocaleString("en-IN")} off`;

  const cap =
    offer.discountType === "PERCENT" && offer.maxDiscountP
      ? ` up to ₹${Math.round(offer.maxDiscountP / 100).toLocaleString("en-IN")}`
      : "";

  const minimum =
    offer.minOrderP > 0
      ? ` on orders above ₹${Math.round(offer.minOrderP / 100).toLocaleString("en-IN")}`
      : "";

  return `${amount}${cap}${minimum}`;
}

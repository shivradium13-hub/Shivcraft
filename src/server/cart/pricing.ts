import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { couponRedemptions, coupons } from "@/server/db/schema";
import type { ShopSettings } from "@/server/settings/shop";

/* Settings now live in one place, so the admin form and the till cannot drift
   apart. Re-exported here because the cart and order paths already import from
   this module. */
export { getShopSettings, type ShopSettings } from "@/server/settings/shop";

export type CouponFailure =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "BELOW_MINIMUM"
  | "EXHAUSTED"
  | "USER_LIMIT"
  | "CATEGORY_MISMATCH";

export type CouponCheck =
  | { ok: true; code: string; description: string | null; discountP: number }
  | { ok: false; reason: CouponFailure; message: string };

/**
 * Validates a coupon against the live cart. Called on every cart read, not only
 * when the code is typed, so a coupon that later expires, runs out or stops
 * qualifying stops applying instead of being carried to checkout at a stale
 * value. Discounts are computed here on the server — never trusted from the
 * client.
 */
export async function checkCoupon(
  rawCode: string,
  context: { userId: string | null; subtotalP: number; categoryIds: string[] },
): Promise<CouponCheck> {
  const code = rawCode.trim().toUpperCase();

  const rows = await db
    .select()
    .from(coupons)
    .where(sql`upper(${coupons.code}) = ${code}`)
    .limit(1);

  const coupon = rows[0];
  if (!coupon) {
    return { ok: false, reason: "NOT_FOUND", message: `“${code}” is not a valid coupon code.` };
  }
  if (!coupon.isActive) {
    return { ok: false, reason: "INACTIVE", message: `“${code}” is no longer available.` };
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    return { ok: false, reason: "NOT_STARTED", message: `“${code}” is not active yet.` };
  }
  if (coupon.endsAt && coupon.endsAt <= now) {
    return { ok: false, reason: "EXPIRED", message: `“${code}” has expired.` };
  }
  if (context.subtotalP < coupon.minOrderP) {
    const short = (coupon.minOrderP - context.subtotalP) / 100;
    return {
      ok: false,
      reason: "BELOW_MINIMUM",
      message: `Add ₹${Math.ceil(short).toLocaleString("en-IN")} more to use “${code}”.`,
    };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: "EXHAUSTED", message: `“${code}” has been fully claimed.` };
  }
  if (coupon.categoryId && !context.categoryIds.includes(coupon.categoryId)) {
    return {
      ok: false,
      reason: "CATEGORY_MISMATCH",
      message: `“${code}” only applies to certain categories.`,
    };
  }

  if (context.userId && coupon.perUserLimit != null) {
    const used = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(couponRedemptions)
      .where(
        and(
          eq(couponRedemptions.couponId, coupon.id),
          eq(couponRedemptions.userId, context.userId),
        ),
      );
    if ((used[0]?.n ?? 0) >= coupon.perUserLimit) {
      return { ok: false, reason: "USER_LIMIT", message: `You have already used “${code}”.` };
    }
  }

  let discountP =
    coupon.discountType === "PERCENT"
      ? Math.round((context.subtotalP * coupon.discountValue) / 100)
      : coupon.discountValue;

  if (coupon.maxDiscountP != null) discountP = Math.min(discountP, coupon.maxDiscountP);
  // Never let a discount exceed the cart, which would produce a negative total.
  discountP = Math.max(0, Math.min(discountP, context.subtotalP));

  return { ok: true, code: coupon.code, description: coupon.description, discountP };
}

export type CartTotals = {
  subtotalP: number;
  discountP: number;
  shippingP: number;
  taxP: number;
  totalP: number;
  freeShippingShortfallP: number;
};

export function computeTotals(
  subtotalP: number,
  discountP: number,
  shop: ShopSettings,
): CartTotals {
  const afterDiscount = Math.max(0, subtotalP - discountP);

  const shippingP =
    afterDiscount === 0 || afterDiscount >= shop.freeAboveP ? 0 : shop.flatRateP;

  // Catalogue prices are GST-inclusive by default, so tax is shown as already
  // contained rather than added again on top.
  const taxP = shop.pricesIncludeTax
    ? 0
    : Math.round((afterDiscount * shop.gstPercent) / 100);

  return {
    subtotalP,
    discountP,
    shippingP,
    taxP,
    totalP: afterDiscount + shippingP + taxP,
    freeShippingShortfallP:
      shippingP > 0 ? Math.max(0, shop.freeAboveP - afterDiscount) : 0,
  };
}

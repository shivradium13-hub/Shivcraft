import { asc, count, desc, eq, sql, sum } from "drizzle-orm";

import type { CouponInput } from "@/lib/adminValidation";
import { ApiError } from "@/server/api/http";
import { db } from "@/server/db";
import { banners, categories, couponRedemptions, coupons } from "@/server/db/schema";

/* ---------------------------------------------------------------- coupons */

/**
 * Every coupon, with what it has actually cost.
 *
 * `usedCount` is the counter the order path increments; `redemptions` and
 * `givenAwayP` are read back from coupon_redemptions. They are shown side by
 * side rather than merged, because if the two ever disagree that is worth
 * seeing rather than hiding behind one number.
 */
export async function listAdminCoupons() {
  const rows = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      description: coupons.description,
      discountType: coupons.discountType,
      discountValue: coupons.discountValue,
      minOrderP: coupons.minOrderP,
      maxDiscountP: coupons.maxDiscountP,
      startsAt: coupons.startsAt,
      endsAt: coupons.endsAt,
      usageLimit: coupons.usageLimit,
      perUserLimit: coupons.perUserLimit,
      usedCount: coupons.usedCount,
      categoryId: coupons.categoryId,
      categoryName: categories.name,
      isActive: coupons.isActive,
      createdAt: coupons.createdAt,
      redemptions: sql<number>`(
        SELECT count(*)::int FROM coupon_redemptions cr
        WHERE cr.coupon_id = "coupons"."id"
      )`,
      givenAwayP: sql<number>`(
        SELECT coalesce(sum(cr.amount_p), 0)::int FROM coupon_redemptions cr
        WHERE cr.coupon_id = "coupons"."id"
      )`,
    })
    .from(coupons)
    .leftJoin(categories, eq(categories.id, coupons.categoryId))
    .orderBy(desc(coupons.createdAt));

  const now = Date.now();

  return rows.map((row) => ({
    ...row,
    /* The same test checkCoupon applies at the till, so the badge in the admin
       list matches what a shopper typing the code would actually get. */
    live:
      row.isActive &&
      (!row.startsAt || row.startsAt.getTime() <= now) &&
      (!row.endsAt || row.endsAt.getTime() > now) &&
      (row.usageLimit == null || row.usedCount < row.usageLimit),
    exhausted: row.usageLimit != null && row.usedCount >= row.usageLimit,
    expired: Boolean(row.endsAt && row.endsAt.getTime() <= now),
    scheduled: Boolean(row.startsAt && row.startsAt.getTime() > now),
  }));
}

export type AdminCoupon = Awaited<ReturnType<typeof listAdminCoupons>>[number];

/**
 * Refuses to delete a coupon somebody has already used.
 *
 * coupon_redemptions cascades from coupons, so the delete would silently take
 * the redemption history with it — rows that say what discount was applied to
 * which order. Deactivating stops the coupon working and keeps the record.
 */
export async function assertCouponDeletable(id: string) {
  const rows = await db
    .select({ n: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, id));

  const used = Number(rows[0]?.n ?? 0);
  if (used > 0) {
    throw new ApiError(
      "CONFLICT",
      `This coupon has been used on ${used} ${used === 1 ? "order" : "orders"}. Deleting it would erase that from the order history — switch it off instead.`,
    );
  }
}

/** Totals for the header strip. */
export async function couponSummary() {
  const rows = await db
    .select({ redemptions: count(), givenAwayP: sum(couponRedemptions.amountP) })
    .from(couponRedemptions);

  return {
    redemptions: Number(rows[0]?.redemptions ?? 0),
    givenAwayP: Number(rows[0]?.givenAwayP ?? 0),
  };
}

/**
 * Maps the form's rupees onto the column's paise.
 *
 * discountValue carries two different units depending on the type: a plain
 * percentage for PERCENT, paise for FIXED. maxDiscountP is forced to null for
 * FIXED, where a cap on a fixed amount means nothing and would only confuse
 * whoever reads the row next.
 */
export function toCouponRow(input: CouponInput) {
  return {
    code: input.code,
    description: input.description || null,
    discountType: input.discountType,
    discountValue:
      input.discountType === "PERCENT"
        ? Math.round(input.discountValue)
        : Math.round(input.discountValue * 100),
    minOrderP: Math.round(input.minOrder * 100),
    maxDiscountP:
      input.discountType === "PERCENT" && input.maxDiscount
        ? Math.round(input.maxDiscount * 100)
        : null,
    usageLimit: input.usageLimit ?? null,
    perUserLimit: input.perUserLimit ?? null,
    categoryId: input.categoryId ?? null,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    isActive: input.isActive,
  };
}

/* ---------------------------------------------------------------- banners */

/**
 * Where a banner can go, and how many of each the homepage actually renders.
 *
 * Only these two are listed because only these two are read by getHomepage().
 * The `banners` table also accepts "STRIP", but nothing renders it, so offering
 * it here would be a control that quietly does nothing.
 */
export const BANNER_PLACEMENTS = [
  {
    value: "HERO",
    label: "Hero",
    shown: 1,
    note: "The big panel at the top of the homepage. The first live one is used.",
  },
  {
    value: "OFFER",
    label: "Offer card",
    shown: 2,
    note: "The pair of offer cards below the categories. The first two live ones are used.",
  },
] as const;

export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number]["value"];

export async function listAdminBanners() {
  const rows = await db
    .select()
    .from(banners)
    .orderBy(asc(banners.placement), asc(banners.position), asc(banners.createdAt));

  const now = Date.now();
  const shownSoFar = new Map<string, number>();

  return rows.map((row) => {
    const live =
      row.isActive &&
      (!row.startsAt || row.startsAt.getTime() <= now) &&
      (!row.endsAt || row.endsAt.getTime() > now);

    const slots = BANNER_PLACEMENTS.find((p) => p.value === row.placement)?.shown ?? 0;
    const used = shownSoFar.get(row.placement) ?? 0;

    /* The homepage takes the first N live banners per placement. A live banner
       past that cut is not on the site, and the list says so rather than
       leaving the admin to wonder why it never appeared. */
    const onSite = live && used < slots;
    if (live) shownSoFar.set(row.placement, used + 1);

    return {
      ...row,
      live,
      onSite,
      expired: Boolean(row.endsAt && row.endsAt.getTime() <= now),
      scheduled: Boolean(row.startsAt && row.startsAt.getTime() > now),
    };
  });
}

export type AdminBanner = Awaited<ReturnType<typeof listAdminBanners>>[number];

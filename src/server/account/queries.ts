import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { effectivePriceP } from "@/lib/money";
import { db } from "@/server/db";
import {
  addresses,
  coupons,
  notifications,
  orderItems,
  orders,
  productImages,
  products,
  reviews,
  wishlistItems,
} from "@/server/db/schema";

/** Everything the account landing page shows at a glance. */
export async function getAccountSummary(userId: string) {
  const [orderRows, wishRows, addressRows, unreadRows, reviewRows, spendRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.userId, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(wishlistItems).where(eq(wishlistItems.userId, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(addresses).where(eq(addresses.userId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    db.select({ n: sql<number>`count(*)::int` }).from(reviews).where(eq(reviews.userId, userId)),
    db
      .select({ total: sql<number>`coalesce(sum(${orders.totalP}), 0)::int` })
      .from(orders)
      .where(and(eq(orders.userId, userId), sql`${orders.status} <> 'CANCELLED'`)),
  ]);

  return {
    orders: orderRows[0]?.n ?? 0,
    wishlist: wishRows[0]?.n ?? 0,
    addresses: addressRows[0]?.n ?? 0,
    unread: unreadRows[0]?.n ?? 0,
    reviews: reviewRows[0]?.n ?? 0,
    lifetimeSpendP: spendRows[0]?.total ?? 0,
  };
}

/** Orders with a thumbnail and item summary, for the list page. */
export async function getMyOrders(userId: string) {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalP: orders.totalP,
      placedAt: orders.placedAt,
      itemCount: sql<number>`(
        SELECT coalesce(sum(oi.quantity), 0)::int FROM order_items oi
        WHERE oi.order_id = "orders"."id"
      )`,
      firstItem: sql<string | null>`(
        SELECT oi.product_name FROM order_items oi
        WHERE oi.order_id = "orders"."id" LIMIT 1
      )`,
      firstImage: sql<string | null>`(
        SELECT oi.image_url FROM order_items oi
        WHERE oi.order_id = "orders"."id" AND oi.image_url IS NOT NULL LIMIT 1
      )`,
      paymentStatus: sql<string | null>`(
        SELECT p.status FROM payments p WHERE p.order_id = "orders"."id"
        ORDER BY p.created_at DESC LIMIT 1
      )`,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.placedAt))
    .limit(50);

  return rows;
}

export type WishlistEntry = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceP: number;
  unitPriceP: number;
  stock: number;
  isActive: boolean;
};

export async function getMyWishlist(userId: string): Promise<WishlistEntry[]> {
  const rows = await db
    .select({
      id: wishlistItems.id,
      productId: products.id,
      name: products.name,
      slug: products.slug,
      priceP: products.priceP,
      discountPriceP: products.discountPriceP,
      stock: products.stock,
      isActive: products.isActive,
      imageUrl: productImages.url,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .leftJoin(
      productImages,
      and(eq(productImages.productId, products.id), eq(productImages.isPrimary, true)),
    )
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));

  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageUrl,
    priceP: row.priceP,
    unitPriceP: effectivePriceP({ priceP: row.priceP, discountPriceP: row.discountPriceP }),
    stock: row.stock,
    isActive: row.isActive,
  }));
}

/** Just the product ids, for deciding which hearts render filled. */
export async function getWishlistProductIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return new Set(rows.map((r) => r.productId));
}

export async function getMyNotifications(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function getMyReviews(userId: string) {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
      productName: products.name,
      productSlug: products.slug,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.userId, userId))
    .orderBy(desc(reviews.createdAt));
}

/**
 * Coupons a customer can actually use right now: active, inside their date
 * window, not exhausted, and not already used up by this customer. A coupon
 * they cannot redeem is worse than showing nothing.
 */
export async function getMyCoupons(userId: string) {
  const now = new Date();

  const rows = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      description: coupons.description,
      discountType: coupons.discountType,
      discountValue: coupons.discountValue,
      minOrderP: coupons.minOrderP,
      maxDiscountP: coupons.maxDiscountP,
      endsAt: coupons.endsAt,
      perUserLimit: coupons.perUserLimit,
      usedByMe: sql<number>`(
        SELECT count(*)::int FROM coupon_redemptions cr
        WHERE cr.coupon_id = "coupons"."id" AND cr.user_id = ${userId}
      )`,
    })
    .from(coupons)
    .where(
      and(
        eq(coupons.isActive, true),
        or(isNull(coupons.startsAt), lte(coupons.startsAt, now)),
        or(isNull(coupons.endsAt), gt(coupons.endsAt, now)),
        or(isNull(coupons.usageLimit), sql`${coupons.usedCount} < ${coupons.usageLimit}`),
      ),
    )
    .orderBy(coupons.minOrderP);

  return rows.filter(
    (row) => row.perUserLimit == null || Number(row.usedByMe) < row.perUserLimit,
  );
}

/** Products this customer bought and has not reviewed — the only ones they may
 *  review, which is what makes "Verified purchase" mean something. */
export async function getReviewableProducts(userId: string) {
  const rows = await db
    .selectDistinct({
      productId: products.id,
      name: products.name,
      slug: products.slug,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, "DELIVERED"),
        sql`NOT EXISTS (
          SELECT 1 FROM reviews r
          WHERE r.product_id = ${products.id} AND r.user_id = ${userId}
        )`,
      ),
    );

  return rows;
}

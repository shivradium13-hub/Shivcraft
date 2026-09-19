import { and, eq, sql } from "drizzle-orm";

import { ApiError } from "@/server/api/http";
import { db, type Db } from "@/server/db";
import { orderItems, orders, reviews } from "@/server/db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Recomputes a product's rating from its APPROVED reviews.
 *
 * Deliberately a full recount rather than incrementing counters: a review can
 * be created, edited, rejected, re-approved or deleted, and every one of those
 * paths would need its own correct delta. One query that asks the database what
 * is actually true cannot drift.
 */
export async function recomputeRating(tx: Tx | Db, productId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE products SET
      rating_sum = COALESCE((
        SELECT sum(r.rating)::int FROM reviews r
        WHERE r.product_id = ${productId} AND r.status = 'APPROVED'
      ), 0),
      rating_count = COALESCE((
        SELECT count(*)::int FROM reviews r
        WHERE r.product_id = ${productId} AND r.status = 'APPROVED'
      ), 0),
      updated_at = now()
    WHERE id = ${productId}
  `);
}

export type Eligibility =
  | { canReview: true; orderId: string; orderNumber: string }
  | { canReview: false; reason: "NOT_PURCHASED" | "NOT_DELIVERED" | "ALREADY_REVIEWED"; existingReviewId?: string };

/**
 * Whether this customer may review this product.
 *
 * Requires a DELIVERED order containing it. Someone who ordered but has not
 * received it yet cannot review, because they have nothing to report.
 */
export async function checkEligibility(
  userId: string,
  productId: string,
): Promise<Eligibility> {
  const existing = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)))
    .limit(1);

  if (existing[0]) {
    return { canReview: false, reason: "ALREADY_REVIEWED", existingReviewId: existing[0].id };
  }

  const delivered = await db
    .select({ orderId: orders.id, orderNumber: orders.orderNumber })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.productId, productId),
        eq(orders.status, "DELIVERED"),
      ),
    )
    .limit(1);

  if (delivered[0]) {
    return { canReview: true, orderId: delivered[0].orderId, orderNumber: delivered[0].orderNumber };
  }

  // Distinguish "never bought it" from "bought it, not arrived yet", so the
  // UI can say something useful instead of a flat refusal.
  const anyOrder = await db
    .select({ id: orders.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.productId, productId),
        sql`${orders.status} <> 'CANCELLED'`,
      ),
    )
    .limit(1);

  return { canReview: false, reason: anyOrder[0] ? "NOT_DELIVERED" : "NOT_PURCHASED" };
}

export async function createReview(input: {
  userId: string;
  productId: string;
  rating: number;
  title?: string;
  body?: string;
}) {
  const eligibility = await checkEligibility(input.userId, input.productId);

  if (!eligibility.canReview) {
    const message =
      eligibility.reason === "ALREADY_REVIEWED"
        ? "You have already reviewed this product. Edit your review instead."
        : eligibility.reason === "NOT_DELIVERED"
          ? "You can review this once your order has been delivered."
          : "Only customers who have received this product can review it.";
    throw new ApiError("FORBIDDEN", message);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(reviews)
      .values({
        productId: input.productId,
        userId: input.userId,
        // Links the review to the order, which is what earns the badge.
        orderId: eligibility.orderId,
        rating: input.rating,
        title: input.title || null,
        body: input.body || null,
        // Published straight away: only verified buyers get this far, and the
        // admin can take one down. Holding every review for approval would
        // leave honest customers waiting.
        status: "APPROVED",
      })
      .returning({ id: reviews.id });

    await recomputeRating(tx, input.productId);
    return row;
  });
}

export async function updateOwnReview(
  reviewId: string,
  userId: string,
  input: { rating: number; title?: string; body?: string },
) {
  const rows = await db
    .select({ id: reviews.id, productId: reviews.productId })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
    .limit(1);

  const review = rows[0];
  if (!review) throw new ApiError("NOT_FOUND", "That review could not be found.");

  return db.transaction(async (tx) => {
    await tx
      .update(reviews)
      .set({ rating: input.rating, title: input.title || null, body: input.body || null })
      .where(eq(reviews.id, reviewId));

    await recomputeRating(tx, review.productId);
    return { id: reviewId };
  });
}

export async function deleteReview(reviewId: string, options: { userId?: string }) {
  const rows = await db
    .select({ id: reviews.id, productId: reviews.productId, userId: reviews.userId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  const review = rows[0];
  if (!review) throw new ApiError("NOT_FOUND", "That review could not be found.");

  // A customer may only delete their own; an admin passes no userId.
  if (options.userId && review.userId !== options.userId) {
    throw new ApiError("NOT_FOUND", "That review could not be found.");
  }

  return db.transaction(async (tx) => {
    await tx.delete(reviews).where(eq(reviews.id, reviewId));
    await recomputeRating(tx, review.productId);
    return { deleted: true };
  });
}

/** Admin moderation: taking a review down removes it from the rating too. */
export async function setReviewStatus(
  reviewId: string,
  status: "APPROVED" | "PENDING" | "REJECTED",
) {
  const rows = await db
    .select({ id: reviews.id, productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  const review = rows[0];
  if (!review) throw new ApiError("NOT_FOUND", "That review could not be found.");

  return db.transaction(async (tx) => {
    await tx.update(reviews).set({ status }).where(eq(reviews.id, reviewId));
    await recomputeRating(tx, review.productId);
    return { id: reviewId, status };
  });
}

/**
 * The viewer's own review of a product, whatever its status.
 *
 * Read separately from the public list because a review the admin has taken
 * down still belongs to its author — they must be able to see and edit it
 * rather than be told they never wrote one.
 */
export async function getOwnReview(userId: string, productId: string) {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      status: reviews.status,
    })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)))
    .limit(1);

  return rows[0] ?? null;
}

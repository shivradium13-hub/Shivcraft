import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/server/db";
import { products, reviews, users } from "@/server/db/schema";

export type ReviewStatus = "APPROVED" | "PENDING" | "REJECTED";

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  APPROVED: "Published",
  PENDING: "Held",
  REJECTED: "Taken down",
};

export async function listAdminReviews(options: {
  status: ReviewStatus | "ALL";
  rating: number | null;
  query: string;
  page: number;
  limit: number;
}) {
  const filters: SQL[] = [];

  if (options.status !== "ALL") filters.push(eq(reviews.status, options.status));
  if (options.rating) filters.push(eq(reviews.rating, options.rating));

  if (options.query) {
    const term = `%${options.query}%`;
    const match = or(
      ilike(products.name, term),
      ilike(users.name, term),
      ilike(users.email, term),
      ilike(reviews.title, term),
      ilike(reviews.body, term),
    );
    if (match) filters.push(match);
  }

  const where = filters.length ? and(...filters) : undefined;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        status: reviews.status,
        createdAt: reviews.createdAt,
        verified: sql<boolean>`${reviews.orderId} IS NOT NULL`,
        authorName: users.name,
        authorEmail: users.email,
        productName: products.name,
        productSlug: products.slug,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .innerJoin(products, eq(products.id, reviews.productId))
      .where(where)
      .orderBy(desc(reviews.createdAt))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db
      .select({ total: count() })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .innerJoin(products, eq(products.id, reviews.productId))
      .where(where),
  ]);

  return { rows, total: Number(totals[0]?.total ?? 0) };
}

/** Counts for the filter chips. A status with no reviews still shows 0. */
export async function reviewStatusCounts() {
  const rows = await db
    .select({ status: reviews.status, total: count() })
    .from(reviews)
    .groupBy(reviews.status);

  const map = new Map<string, number>();
  let all = 0;
  for (const row of rows) {
    const n = Number(row.total);
    map.set(row.status, n);
    all += n;
  }

  return { all, map };
}

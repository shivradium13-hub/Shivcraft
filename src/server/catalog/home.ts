import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { banners, categories, products, reviews, users } from "@/server/db/schema";

import type { ProductCard } from "./queries";

const primaryImage = sql<string | null>`(
  SELECT pi.url FROM product_images pi
  WHERE pi.product_id = ${products.id}
  ORDER BY pi.is_primary DESC, pi.position ASC
  LIMIT 1
)`;

const cardColumns = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  priceP: products.priceP,
  discountPriceP: products.discountPriceP,
  imageUrl: primaryImage,
  ratingSum: products.ratingSum,
  ratingCount: products.ratingCount,
  stock: products.stock,
  isBestSeller: products.isBestSeller,
  isPersonalizable: products.isPersonalizable,
  categorySlug: categories.slug,
};

type CardRow = {
  id: string;
  name: string;
  slug: string;
  priceP: number;
  discountPriceP: number | null;
  imageUrl: string | null;
  ratingSum: number;
  ratingCount: number;
  stock: number;
  isBestSeller: boolean;
  isPersonalizable: boolean;
  categorySlug: string;
};

function toCard(row: CardRow): ProductCard {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    priceP: row.priceP,
    discountPriceP: row.discountPriceP,
    imageUrl: row.imageUrl,
    rating: row.ratingCount > 0 ? Number((row.ratingSum / row.ratingCount).toFixed(1)) : 0,
    ratingCount: row.ratingCount,
    stock: row.stock,
    isBestSeller: row.isBestSeller,
    isPersonalizable: row.isPersonalizable,
    categorySlug: row.categorySlug,
  };
}

function shelf(extra: ReturnType<typeof eq> | ReturnType<typeof sql>, limit: number) {
  return db
    .select(cardColumns)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.isActive, true), extra))
    .orderBy(desc(products.ratingCount), desc(products.createdAt))
    .limit(limit);
}

/** Everything the homepage renders, in one parallel batch. All of it comes
 *  from tables the admin controls — banners, flags and categories. */
export async function getHomepage() {
  const now = new Date();
  const liveWindow = and(
    eq(banners.isActive, true),
    or(isNull(banners.startsAt), lte(banners.startsAt, now)),
    or(isNull(banners.endsAt), gt(banners.endsAt, now)),
  );

  const [heroRows, offerRows, homeCategories, trending, bestSellers, personalised, testimonials] =
    await Promise.all([
      db
        .select()
        .from(banners)
        .where(and(liveWindow, eq(banners.placement, "HERO")))
        .orderBy(banners.position)
        .limit(1),
      db
        .select()
        .from(banners)
        .where(and(liveWindow, eq(banners.placement, "OFFER")))
        .orderBy(banners.position)
        .limit(2),
      db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          icon: categories.icon,
          imageUrl: categories.imageUrl,
        })
        .from(categories)
        .where(and(eq(categories.isActive, true), eq(categories.showOnHome, true)))
        .orderBy(categories.position)
        .limit(8),
      shelf(eq(products.isTrending, true), 10),
      shelf(eq(products.isBestSeller, true), 10),
      shelf(eq(products.isPersonalizable, true), 10),
      db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          title: reviews.title,
          body: reviews.body,
          createdAt: reviews.createdAt,
          author: users.name,
          productName: products.name,
          productSlug: products.slug,
          verified: sql<boolean>`${reviews.orderId} IS NOT NULL`,
        })
        .from(reviews)
        .innerJoin(users, eq(users.id, reviews.userId))
        .innerJoin(products, eq(products.id, reviews.productId))
        .where(and(eq(reviews.status, "APPROVED"), sql`${reviews.rating} >= 4`))
        .orderBy(desc(reviews.createdAt))
        .limit(6),
    ]);

  return {
    hero: heroRows[0] ?? null,
    offers: offerRows,
    categories: homeCategories,
    trending: trending.map(toCard),
    bestSellers: bestSellers.map(toCard),
    personalised: personalised.map(toCard),
    testimonials,
  };
}

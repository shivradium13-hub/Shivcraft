import { and, desc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  categories,
  customizationFields,
  productImages,
  productVariants,
  products,
  reviews,
  users,
} from "@/server/db/schema";

import type { ProductCard } from "./queries";

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function getProductBySlug(slug: string) {
  const rows = await db
    .select({
      product: products,
      categoryName: categories.name,
      categorySlug: categories.slug,
      parentId: categories.parentId,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.slug, slug))
    .limit(1);

  const found = rows[0];
  // A product the admin has disabled must not be reachable or purchasable.
  if (!found || !found.product.isActive) return null;

  const product = found.product;

  const [images, variants, fields, reviewRows, parentRows] = await Promise.all([
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(desc(productImages.isPrimary), productImages.position),
    db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)))
      .orderBy(productVariants.name, productVariants.position),
    db
      .select()
      .from(customizationFields)
      .where(eq(customizationFields.productId, product.id))
      .orderBy(customizationFields.position),
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        createdAt: reviews.createdAt,
        author: users.name,
        verified: sql<boolean>`${reviews.orderId} IS NOT NULL`,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(and(eq(reviews.productId, product.id), eq(reviews.status, "APPROVED")))
      .orderBy(desc(reviews.createdAt))
      .limit(8),
    found.parentId
      ? db
          .select({ name: categories.name, slug: categories.slug })
          .from(categories)
          .where(eq(categories.id, found.parentId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  /** Variants arrive flat; the page renders one row of choices per axis. */
  const variantGroups = new Map<string, typeof variants>();
  for (const variant of variants) {
    const group = variantGroups.get(variant.name) ?? [];
    group.push(variant);
    variantGroups.set(variant.name, group);
  }

  return {
    ...product,
    rating: product.ratingCount > 0 ? Number((product.ratingSum / product.ratingCount).toFixed(1)) : 0,
    category: { name: found.categoryName, slug: found.categorySlug },
    parent: parentRows[0] ?? null,
    images,
    variantGroups: [...variantGroups.entries()].map(([name, options]) => ({ name, options })),
    customizationFields: fields,
    reviews: reviewRows,
  };
}

/** Other things from the same category, for the bottom of the page. */
export async function getRelatedProducts(
  categoryId: string,
  excludeId: string,
  limit = 6,
): Promise<ProductCard[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      priceP: products.priceP,
      discountPriceP: products.discountPriceP,
      imageUrl: sql<string | null>`(
        SELECT pi.url FROM product_images pi
        WHERE pi.product_id = ${products.id}
        ORDER BY pi.is_primary DESC, pi.position ASC LIMIT 1
      )`,
      ratingSum: products.ratingSum,
      ratingCount: products.ratingCount,
      stock: products.stock,
      isBestSeller: products.isBestSeller,
      isPersonalizable: products.isPersonalizable,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(eq(products.isActive, true), eq(products.categoryId, categoryId), ne(products.id, excludeId)),
    )
    .orderBy(desc(products.ratingCount))
    .limit(limit);

  return rows.map((row) => ({
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
  }));
}

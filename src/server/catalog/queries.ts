import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import type { ProductQuery } from "@/lib/validation";
import { db } from "@/server/db";
import { categories, productImages, products } from "@/server/db/schema";

export type ProductCard = {
  id: string;
  name: string;
  slug: string;
  priceP: number;
  discountPriceP: number | null;
  imageUrl: string | null;
  rating: number;
  ratingCount: number;
  stock: number;
  isBestSeller: boolean;
  isPersonalizable: boolean;
  categorySlug: string;
};

/** A category slug plus every descendant id, so browsing "Photo Frames"
 *  returns products filed under "LED Photo Frames" too. */
export async function categoryIdsForSlug(slug: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM categories WHERE slug = ${slug} AND is_active = true
      UNION ALL
      SELECT c.id FROM categories c
      JOIN tree t ON c.parent_id = t.id
      WHERE c.is_active = true
    )
    SELECT id FROM tree
  `);
  return rows.rows.map((r) => r.id);
}

function sortClause(sort: ProductQuery["sort"], term?: string): SQL[] {
  // With a search term and no explicit sort, rank by relevance. Falling back to
  // popularity here puts a best-seller that merely mentions the word above the
  // product actually named it.
  if (term && sort === "popularity") {
    return [
      desc(sql`ts_rank(
        to_tsvector('english',
          ${products.name} || ' ' ||
          coalesce(${products.shortDescription}, '') || ' ' ||
          coalesce(${products.occasion}, '')
        ),
        websearch_to_tsquery('english', ${term})
      ) + CASE WHEN lower(${products.name}) LIKE ${"%" + term.toLowerCase() + "%"} THEN 1 ELSE 0 END`),
      desc(products.ratingCount),
    ];
  }

  switch (sort) {
    case "newest":
      return [desc(products.createdAt)];
    case "price_asc":
      return [asc(sql`coalesce(${products.discountPriceP}, ${products.priceP})`)];
    case "price_desc":
      return [desc(sql`coalesce(${products.discountPriceP}, ${products.priceP})`)];
    case "rating":
      return [
        desc(sql`
          CASE WHEN ${products.ratingCount} = 0 THEN 0
          ELSE ${products.ratingSum}::numeric / ${products.ratingCount} END
        `),
        desc(products.ratingCount),
      ];
    case "discount":
      return [
        desc(sql`
          CASE WHEN ${products.discountPriceP} IS NULL OR ${products.priceP} = 0 THEN 0
          ELSE (${products.priceP} - ${products.discountPriceP})::numeric / ${products.priceP} END
        `),
      ];
    case "popularity":
    default:
      return [desc(products.isBestSeller), desc(products.ratingCount), desc(products.createdAt)];
  }
}

export async function findProducts(
  query: ProductQuery,
  paging: { limit: number; offset: number },
): Promise<{ items: ProductCard[]; total: number }> {
  const filters: SQL[] = [eq(products.isActive, true)];

  if (query.category) {
    const ids = await categoryIdsForSlug(query.category);
    // An unknown slug must return nothing, not the whole catalogue.
    filters.push(ids.length > 0 ? inArray(products.categoryId, ids) : sql`false`);
  }

  if (query.q) {
    const term = `%${query.q.toLowerCase()}%`;
    const websearch = sql`
      to_tsvector('english',
        ${products.name} || ' ' ||
        coalesce(${products.shortDescription}, '') || ' ' ||
        coalesce(${products.occasion}, '')
      ) @@ websearch_to_tsquery('english', ${query.q})
    `;
    const clause = or(
      websearch,
      sql`lower(${products.name}) LIKE ${term}`,
      sql`EXISTS (SELECT 1 FROM unnest(${products.tags}) tag WHERE lower(tag) LIKE ${term})`,
    );
    if (clause) filters.push(clause);
  }

  const effective = sql`coalesce(${products.discountPriceP}, ${products.priceP})`;
  if (query.minPrice != null) filters.push(gte(effective, query.minPrice * 100));
  if (query.maxPrice != null) filters.push(lte(effective, query.maxPrice * 100));

  if (query.rating != null) {
    filters.push(sql`
      ${products.ratingCount} > 0 AND
      (${products.ratingSum}::numeric / ${products.ratingCount}) >= ${query.rating}
    `);
  }

  if (query.color) filters.push(sql`lower(${products.color}) = ${query.color.toLowerCase()}`);
  if (query.material) filters.push(sql`lower(${products.material}) = ${query.material.toLowerCase()}`);
  if (query.size) filters.push(sql`lower(${products.size}) = ${query.size.toLowerCase()}`);
  if (query.occasion) filters.push(sql`lower(${products.occasion}) = ${query.occasion.toLowerCase()}`);
  if (query.personalized === "true") filters.push(eq(products.isPersonalizable, true));
  if (query.inStock === "true") filters.push(sql`${products.stock} > 0`);

  const where = and(...filters);

  /** The primary image, fetched as a correlated scalar so one product cannot
   *  duplicate its row when it has several images. */
  const primaryImage = sql<string | null>`(
    SELECT pi.url FROM product_images pi
    WHERE pi.product_id = ${products.id}
    ORDER BY pi.is_primary DESC, pi.position ASC
    LIMIT 1
  )`;

  const [items, counted] = await Promise.all([
    db
      .select({
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
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(...sortClause(query.sort, query.q))
      .limit(paging.limit)
      .offset(paging.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(products).where(where),
  ]);

  return {
    total: counted[0]?.count ?? 0,
    items: items.map((row) => ({
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
    })),
  };
}

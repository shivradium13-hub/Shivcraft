import { and, eq, sql } from "drizzle-orm";

import { ok, route } from "@/server/api/http";
import { db } from "@/server/db";
import { categories, products } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type Suggestion = {
  kind: "product" | "category";
  label: string;
  href: string;
  hint?: string;
};

/**
 * Type-ahead for the header search. Typing "mug" must surface Photo Mug,
 * Couple Mug, Magic Mug and so on (section 22), so this matches product names
 * and tags as well as category names.
 */
export const GET = route(async (request: Request) => {
  const term = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (term.length < 2) {
    return ok({ suggestions: [] as Suggestion[] });
  }

  const like = `%${term.toLowerCase()}%`;
  const prefix = `${term.toLowerCase()}%`;

  const [categoryRows, productRows] = await Promise.all([
    db
      .select({ name: categories.name, slug: categories.slug })
      .from(categories)
      .where(and(eq(categories.isActive, true), sql`lower(${categories.name}) LIKE ${like}`))
      .orderBy(sql`CASE WHEN lower(${categories.name}) LIKE ${prefix} THEN 0 ELSE 1 END`)
      .limit(4),
    db
      .select({
        name: products.name,
        slug: products.slug,
        category: categories.name,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.isActive, true),
          sql`(
            lower(${products.name}) LIKE ${like}
            OR EXISTS (SELECT 1 FROM unnest(${products.tags}) t WHERE lower(t) LIKE ${like})
          )`,
        ),
      )
      // Names that start with the term feel like the "right" answer, so they
      // come before names that merely contain it.
      .orderBy(
        sql`CASE WHEN lower(${products.name}) LIKE ${prefix} THEN 0 ELSE 1 END`,
        sql`length(${products.name})`,
      )
      .limit(7),
  ]);

  const suggestions: Suggestion[] = [
    ...categoryRows.map((c) => ({
      kind: "category" as const,
      label: c.name,
      href: `/category/${c.slug}`,
      hint: "in Categories",
    })),
    ...productRows.map((p) => ({
      kind: "product" as const,
      label: p.name,
      href: `/product/${p.slug}`,
      hint: p.category,
    })),
  ];

  return ok({ suggestions });
});

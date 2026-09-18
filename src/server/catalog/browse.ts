import { asc, eq, sql } from "drizzle-orm";

import type { Category, Subcategory } from "@/types/category";
import { db } from "@/server/db";
import { categories, categoryCrossLinks } from "@/server/db/schema";

/**
 * The full browse tree: active categories in admin order, each with the
 * subcategories shown beneath it and a real product count.
 *
 * One call builds everything the Categories screen needs, so switching the
 * selected parent is local state rather than another round trip.
 */
export async function getBrowseTree(): Promise<Category[]> {
  const [rows, counts, links] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.position), asc(categories.name)),

    /* Products in a category *and everything under it*, so a parent shows the
       total rather than the handful filed directly against it. */
    db.execute<{ category_id: string; n: number }>(sql`
      WITH RECURSIVE tree AS (
        SELECT id, id AS root FROM categories WHERE is_active = true
        UNION ALL
        SELECT c.id, t.root FROM categories c
        JOIN tree t ON c.parent_id = t.id
        WHERE c.is_active = true
      )
      SELECT t.root AS category_id, count(p.id)::int AS n
      FROM tree t
      LEFT JOIN products p ON p.category_id = t.id AND p.is_active = true
      GROUP BY t.root
    `),

    db
      .select({
        categoryId: categoryCrossLinks.categoryId,
        parentId: categoryCrossLinks.parentId,
        position: categoryCrossLinks.position,
      })
      .from(categoryCrossLinks)
      .orderBy(asc(categoryCrossLinks.position)),
  ]);

  const countById = new Map<string, number>();
  for (const row of counts.rows) countById.set(row.category_id, Number(row.n));

  const byId = new Map(rows.map((row) => [row.id, row]));

  const toSubcategory = (id: string, sortOrder: number, linked: boolean): Subcategory | null => {
    const row = byId.get(id);
    if (!row) return null; // disabled or deleted — drop it silently
    const count = countById.get(row.id);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      image: row.imageUrl,
      icon: row.icon,
      sortOrder,
      ...(count && count > 0 ? { productCount: count } : {}),
      ...(linked ? { linked: true } : {}),
    };
  };

  const tops = rows.filter((row) => row.parentId === null);

  return tops.map((top, index) => {
    const direct = rows
      .filter((row) => row.parentId === top.id)
      .map((row, i) => toSubcategory(row.id, i, false));

    const crossed = links
      .filter((link) => link.parentId === top.id)
      .map((link, i) => toSubcategory(link.categoryId, direct.length + i, true));

    // A cross-link must never duplicate a direct child of the same parent.
    const seen = new Set<string>();
    const subcategories = [...direct, ...crossed].filter((sub): sub is Subcategory => {
      if (!sub || seen.has(sub.id)) return false;
      seen.add(sub.id);
      return true;
    });

    const count = countById.get(top.id);

    return {
      id: top.id,
      name: top.name,
      slug: top.slug,
      icon: top.icon,
      image: top.imageUrl,
      isActive: top.isActive,
      sortOrder: index,
      ...(count && count > 0 ? { productCount: count } : {}),
      subcategories,
    };
  });
}

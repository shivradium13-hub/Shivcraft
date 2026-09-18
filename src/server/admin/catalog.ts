import { and, asc, eq, ne, sql } from "drizzle-orm";

import { ApiError } from "@/server/api/http";
import { db } from "@/server/db";
import { categories, products } from "@/server/db/schema";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

/** Appends -2, -3 … until the slug is free. `exceptId` lets a row keep its own. */
export async function uniqueCategorySlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base) || "category";
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const clash = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        exceptId
          ? and(eq(categories.slug, candidate), ne(categories.id, exceptId))
          : eq(categories.slug, candidate),
      )
      .limit(1);
    if (clash.length === 0) return candidate;
  }
  throw new ApiError("CONFLICT", "Could not find a free URL for that name. Try a different one.");
}

export async function uniqueProductSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base) || "product";
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const clash = await db
      .select({ id: products.id })
      .from(products)
      .where(
        exceptId
          ? and(eq(products.slug, candidate), ne(products.id, exceptId))
          : eq(products.slug, candidate),
      )
      .limit(1);
    if (clash.length === 0) return candidate;
  }
  throw new ApiError("CONFLICT", "Could not find a free URL for that name.");
}

/** The whole tree, INCLUDING disabled rows — the admin must see what it hid. */
export async function adminCategoryTree() {
  const rows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      slug: categories.slug,
      icon: categories.icon,
      imageUrl: categories.imageUrl,
      position: categories.position,
      isActive: categories.isActive,
      showOnHome: categories.showOnHome,
      /* The outer query has no join, so Drizzle would render a column
         reference here unqualified as "id" — which inside these subqueries
         binds to the SUBQUERY table and silently matches nothing. The
         correlation is therefore written out explicitly. */
      directProducts: sql<number>`(
        SELECT count(*)::int FROM products p WHERE p.category_id = "categories"."id"
      )`,
      childCount: sql<number>`(
        SELECT count(*)::int FROM categories c WHERE c.parent_id = "categories"."id"
      )`,
    })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));

  const tops = rows.filter((r) => r.parentId === null);
  return tops.map((top) => ({
    ...top,
    children: rows.filter((r) => r.parentId === top.id),
  }));
}

/**
 * A category may only be deleted when nothing depends on it. The database
 * would refuse anyway (the foreign keys are RESTRICT), but a raw constraint
 * error is not something to show an admin.
 */
export async function assertCategoryDeletable(id: string): Promise<void> {
  const [childRows, productRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(categories).where(eq(categories.parentId, id)),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.categoryId, id)),
  ]);

  const children = childRows[0]?.n ?? 0;
  const owned = productRows[0]?.n ?? 0;

  if (children > 0) {
    throw new ApiError(
      "CONFLICT",
      `This category still has ${children} subcategor${children === 1 ? "y" : "ies"}. Move or delete them first.`,
    );
  }
  if (owned > 0) {
    throw new ApiError(
      "CONFLICT",
      `${owned} product${owned === 1 ? "" : "s"} still sit in this category. Move them first, or disable the category instead of deleting it.`,
    );
  }
}

/** Flat list of subcategories for the product form's category picker.
 *  Top-level categories are deliberately excluded: a product filed on one would
 *  not appear when browsing. */
export async function subcategoryOptions() {
  const tree = await adminCategoryTree();
  return tree.flatMap((top) =>
    top.children.map((child) => ({ id: child.id, label: `${top.name} → ${child.name}` })),
  );
}

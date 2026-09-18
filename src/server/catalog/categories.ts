import { asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { categories } from "@/server/db/schema";

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  showOnHome: boolean;
  children: CategoryNode[];
};

/**
 * The whole active category tree in one query.
 *
 * Server Components call this directly — going through the HTTP route from the
 * server would be a pointless round trip. The API route exists for the client
 * (mobile drawer, admin) and calls this same function, so there is one source
 * of truth: a category the admin adds shows up everywhere at once.
 */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.position), asc(categories.name));

  const byId = new Map<string, CategoryNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      imageUrl: row.imageUrl,
      showOnHome: row.showOnHome,
      children: [],
    });
  }

  const tree: CategoryNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    if (row.parentId) {
      // A child of a disabled parent stays hidden with it rather than being
      // promoted to the top level, where it would look like a stray category.
      byId.get(row.parentId)?.children.push(node);
    } else {
      tree.push(node);
    }
  }

  return tree;
}

/** Resolves a slug to its display name and ancestry, for page headings and
 *  breadcrumbs. Returns null when the slug does not exist or is disabled. */
export async function getCategoryBySlug(slug: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;

  let parent = null;
  if (row.parentId) {
    const parentRows = await db
      .select({ name: categories.name, slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, row.parentId))
      .limit(1);
    parent = parentRows[0] ?? null;
  }

  return { ...row, parent };
}

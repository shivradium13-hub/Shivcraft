import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { ApiError, created, ok, readJson, route } from "@/server/api/http";
import { adminCategoryTree, uniqueCategorySlug } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2, "Give the category a name.").max(120),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().trim().max(16).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  showOnHome: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

/** GET /api/admin/categories — the tree, including disabled rows. */
export const GET = route(async () => {
  await requireAdmin();
  return ok({ categories: await adminCategoryTree() });
});

/** POST /api/admin/categories */
export const POST = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, createSchema);

  if (input.parentId) {
    const parent = await db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, input.parentId))
      .limit(1);

    if (!parent[0]) throw new ApiError("BAD_REQUEST", "That parent category does not exist.");
    // Two levels is what the browse UI renders; a third would not be visible.
    if (parent[0].parentId) {
      throw new ApiError(
        "BAD_REQUEST",
        "Subcategories can only sit under a top-level category, not under another subcategory.",
      );
    }
  }

  // New rows go to the end of their level.
  const lastRows = await db
    .select({ max: sql<number>`coalesce(max(${categories.position}), -1)::int` })
    .from(categories)
    .where(
      input.parentId
        ? eq(categories.parentId, input.parentId)
        : sql`${categories.parentId} IS NULL`,
    );

  const [row] = await db
    .insert(categories)
    .values({
      name: input.name,
      slug: await uniqueCategorySlug(input.name),
      parentId: input.parentId ?? null,
      icon: input.icon || null,
      imageUrl: input.imageUrl || null,
      description: input.description || null,
      showOnHome: input.showOnHome ?? false,
      isActive: input.isActive ?? true,
      position: (lastRows[0]?.max ?? -1) + 1,
    })
    .returning();

  return created({ category: row });
});

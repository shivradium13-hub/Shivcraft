import { eq } from "drizzle-orm";
import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import { assertCategoryDeletable, uniqueCategorySlug } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  icon: z.string().trim().max(16).nullable().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  showOnHome: z.boolean().optional(),
  /** Changing the slug breaks existing links, so it is only ever explicit. */
  slug: z.string().trim().min(2).max(140).optional(),
});

export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/admin/categories/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;
    const input = await readJson(request, patchSchema);

    const existing = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!existing[0]) throw new ApiError("NOT_FOUND", "That category does not exist.");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.icon !== undefined) patch.icon = input.icon || null;
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl || null;
    if (input.description !== undefined) patch.description = input.description || null;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.showOnHome !== undefined) patch.showOnHome = input.showOnHome;
    if (input.slug !== undefined) patch.slug = await uniqueCategorySlug(input.slug, id);

    const [row] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning();
    return ok({ category: row });
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/admin/categories/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;

    const existing = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!existing[0]) throw new ApiError("NOT_FOUND", "That category does not exist.");

    // Explains what is in the way instead of surfacing a foreign-key error.
    await assertCategoryDeletable(id);

    await db.delete(categories).where(eq(categories.id, id));
    return ok({ deleted: true, name: existing[0].name });
  },
);

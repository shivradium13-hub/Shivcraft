import { eq } from "drizzle-orm";
import { z } from "zod";

import { ok, readJson, route } from "@/server/api/http";
import { adminCategoryTree } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  order: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * POST /api/admin/categories/reorder
 *
 * Takes the ids in their new order and writes positions in one transaction, so
 * the browse UI never reads a half-applied ordering.
 */
export const POST = route(async (request: Request) => {
  await requireAdmin();
  const { order } = await readJson(request, schema);

  await db.transaction(async (tx) => {
    for (const [position, id] of order.entries()) {
      await tx.update(categories).set({ position, updatedAt: new Date() }).where(eq(categories.id, id));
    }
  });

  return ok({ categories: await adminCategoryTree() });
});

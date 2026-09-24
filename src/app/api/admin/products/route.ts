import { inArray } from "drizzle-orm";
import { z } from "zod";

import { productSchema } from "@/lib/adminValidation";
import { ApiError, created, ok, readJson, readPaging, route } from "@/server/api/http";
import { createProduct, listAdminProducts } from "@/server/admin/products";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/products — includes disabled products, which the storefront
 *  endpoint deliberately hides. */
export const GET = route(async (request: Request) => {
  await requireAdmin();
  const url = new URL(request.url);
  const paging = readPaging(url, 20, 100);

  const stateParam = url.searchParams.get("state");
  const state =
    stateParam === "active" || stateParam === "disabled" || stateParam === "low"
      ? stateParam
      : "all";

  const { rows, total } = await listAdminProducts({
    query: url.searchParams.get("q")?.trim() || undefined,
    categoryId: url.searchParams.get("categoryId") || undefined,
    state,
    page: paging.page,
    limit: paging.limit,
  });

  return ok({
    items: rows,
    page: paging.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / paging.limit)),
  });
});

/** POST /api/admin/products */
export const POST = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, productSchema);
  const row = await createProduct(input);
  return created({ product: row });
});

/**
 * DELETE /api/admin/products — bulk delete by id.
 *
 * order_items.product_id is ON DELETE SET NULL and every other reference
 * cascades, so removing a product does not damage order history. Used by the
 * "Delete selected" action on the products list.
 */
export const DELETE = route(async (request: Request) => {
  await requireAdmin();
  const { ids } = await readJson(
    request,
    z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }),
  );

  const deleted = await db
    .delete(products)
    .where(inArray(products.id, ids))
    .returning({ id: products.id });

  if (deleted.length === 0) throw new ApiError("NOT_FOUND", "No matching products to delete.");

  return ok({ deleted: deleted.length });
});

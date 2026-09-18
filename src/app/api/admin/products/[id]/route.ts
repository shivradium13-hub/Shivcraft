import { eq } from "drizzle-orm";

import { productSchema } from "@/lib/adminValidation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { getAdminProduct, productOrderCount, updateProduct } from "@/server/admin/products";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(
  async (_request: Request, context: RouteContext<"/api/admin/products/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;

    const product = await getAdminProduct(id);
    if (!product) throw new ApiError("NOT_FOUND", "That product does not exist.");

    return ok({ product, orderCount: await productOrderCount(id) });
  },
);

export const PUT = route(
  async (request: Request, context: RouteContext<"/api/admin/products/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;
    const input = await readJson(request, productSchema);
    const row = await updateProduct(id, input);
    return ok({ product: row });
  },
);

/**
 * DELETE /api/admin/products/[id]
 *
 * order_items.product_id is ON DELETE SET NULL and each line snapshots the
 * name, price and image, so deleting a product does not damage order history.
 * The response still reports how many orders referenced it, so the admin knows
 * what they detached.
 */
export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/admin/products/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;

    const rows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!rows[0]) throw new ApiError("NOT_FOUND", "That product does not exist.");

    const orderCount = await productOrderCount(id);
    await db.delete(products).where(eq(products.id, id));

    return ok({ deleted: true, name: rows[0].name, detachedFromOrders: orderCount });
  },
);

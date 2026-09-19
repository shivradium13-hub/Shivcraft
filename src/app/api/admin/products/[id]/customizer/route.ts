import { eq } from "drizzle-orm";

import { customizerConfigSchema, readConfig } from "@/lib/customizer/schema";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(
  async (_request: Request, context: RouteContext<"/api/admin/products/[id]/customizer">) => {
    await requireAdmin();
    const { id } = await context.params;

    const rows = await db
      .select({ id: products.id, name: products.name, customizer: products.customizer })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!rows[0]) throw new ApiError("NOT_FOUND", "That product does not exist.");
    return ok({ config: readConfig(rows[0].customizer) });
  },
);

/**
 * PUT — publish a configuration.
 *
 * The version is bumped here rather than taken from the request. Orders carry
 * the version they were placed against, so a republish can never reach back
 * and change a design a customer already approved.
 */
export const PUT = route(
  async (request: Request, context: RouteContext<"/api/admin/products/[id]/customizer">) => {
    await requireAdmin();
    const { id } = await context.params;
    const input = await readJson(request, customizerConfigSchema);

    const rows = await db
      .select({ customizer: products.customizer })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!rows[0]) throw new ApiError("NOT_FOUND", "That product does not exist.");

    const previous = readConfig(rows[0].customizer);

    /* Every zone a view points at has to exist, or the customer would be shown
       a slot the editor cannot render. */
    const zoneIds = new Set(input.zones.map((z) => z.id));
    for (const view of input.views) {
      for (const zoneId of view.zoneIds) {
        if (!zoneIds.has(zoneId)) {
          throw new ApiError(
            "BAD_REQUEST",
            `The ${view.label} view points at a zone that no longer exists. Remove it from that view, or add the zone back.`,
          );
        }
      }
    }

    if (input.enabled && input.views.every((v) => !v.base)) {
      throw new ApiError(
        "BAD_REQUEST",
        "Add a product image to at least one view before turning customisation on — the customer needs something to design against.",
      );
    }

    const next = { ...input, version: previous.version + 1 };

    await db
      .update(products)
      .set({ customizer: next, updatedAt: new Date() })
      .where(eq(products.id, id));

    return ok({ config: next });
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/admin/products/[id]/customizer">) => {
    await requireAdmin();
    const { id } = await context.params;

    /* Cleared rather than disabled-in-place, which is the same thing to the
       storefront and leaves no half-configuration behind. Orders already
       placed keep their own copy and are unaffected. */
    await db
      .update(products)
      .set({ customizer: null, updatedAt: new Date() })
      .where(eq(products.id, id));

    return ok({ cleared: true });
  },
);

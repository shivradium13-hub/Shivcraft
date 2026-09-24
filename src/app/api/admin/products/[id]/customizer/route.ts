import { eq } from "drizzle-orm";
import { z } from "zod";

import { customizerConfigSchema, readConfig } from "@/lib/customizer/schema";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH — turn the Frame Designer on or off for a product without rebuilding
 * its template. This is the toggle on the product editor: on makes the product
 * personalisable, off makes it a normal direct-sale product. The saved
 * template is kept either way, so turning it back on restores it.
 *
 * Turning it on is refused until a template exists (at least one view with a
 * product image), because an empty configuration would show the customer
 * nothing.
 */
export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/admin/products/[id]/customizer">) => {
    await requireAdmin();
    const { id } = await context.params;
    const { enabled } = await readJson(request, z.object({ enabled: z.boolean() }));

    const rows = await db
      .select({ customizer: products.customizer })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!rows[0]) throw new ApiError("NOT_FOUND", "That product does not exist.");

    const parsed = customizerConfigSchema.safeParse(rows[0].customizer);
    const hasTemplate =
      parsed.success && parsed.data.views.length > 0 && parsed.data.views.some((v) => v.base);

    if (enabled && !hasTemplate) {
      throw new ApiError(
        "BAD_REQUEST",
        "Set up the template in the Frame Designer first — add a view with a product image, then turn it on.",
      );
    }

    // No template and turning off: nothing to store, already a normal product.
    if (!parsed.success) return ok({ enabled: false, configured: false });

    const next = { ...parsed.data, enabled };
    await db.update(products).set({ customizer: next, updatedAt: new Date() }).where(eq(products.id, id));

    return ok({ enabled, configured: hasTemplate });
  },
);

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

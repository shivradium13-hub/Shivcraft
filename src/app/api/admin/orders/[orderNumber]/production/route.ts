import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

import { readStoredDesign } from "@/lib/customizer/design";
import { readConfig } from "@/lib/customizer/schema";
import { ApiError, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { renderQuality, renderZoneFile } from "@/server/customizer/render";
import { db } from "@/server/db";
import { orderItems, orders, uploads } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Reading a large original out of the blob store and base64ing it takes
   longer than a page render, and is worth waiting for. */
export const maxDuration = 60;

/**
 * GET /api/admin/orders/[orderNumber]/production?item=<id>&zone=<id>
 *
 * The print file for one photo area of one order line, built from the snapshot
 * frozen at checkout and the customer's untouched original.
 *
 * Admin only. Nothing here is taken from the request beyond which line and
 * which zone: the geometry, the crop and the physical size all come from the
 * order itself, so this cannot be steered into rendering something else.
 */
export const GET = route(
  async (request: Request, context: RouteContext<"/api/admin/orders/[orderNumber]/production">) => {
    await requireAdmin();
    const { orderNumber } = await context.params;
    const url = new URL(request.url);

    const itemId = url.searchParams.get("item") ?? "";
    const zoneId = url.searchParams.get("zone") ?? "";

    const rows = await db
      .select({ id: orderItems.id, design: orderItems.design })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.orderNumber, orderNumber), eq(orderItems.id, itemId)))
      .limit(1);

    const line = rows[0];
    if (!line) throw new ApiError("NOT_FOUND", "That order line does not exist.");

    const stored = readStoredDesign(line.design);
    if (!stored) throw new ApiError("NOT_FOUND", "That line has no design to render.");

    const config = readConfig(stored.config);
    const zone = config.zones.find((z) => z.id === zoneId);
    const value = stored.design.zones[zoneId];

    if (!zone || zone.kind !== "PHOTO") {
      throw new ApiError("BAD_REQUEST", "That is not a photo area on this order.");
    }
    if (value?.kind !== "PHOTO") {
      throw new ApiError("NOT_FOUND", "The customer did not put a photo in that area.");
    }

    /* The original, straight from the private store. Nothing the customer's
       browser produced ends up in the output. */
    const uploadRows = await db
      .select({ pathname: uploads.pathname, contentType: uploads.contentType })
      .from(uploads)
      .where(eq(uploads.id, value.photo.uploadId))
      .limit(1);

    if (!uploadRows[0]) {
      throw new ApiError("NOT_FOUND", "The customer's original photo is no longer in storage.");
    }

    /* The store is private, so the blob is read with an authorised get rather
       than fetched from a URL — the same call the customer-facing proxy uses. */
    const blob = await get(uploadRows[0].pathname, { access: "private" });
    if (!blob || blob.statusCode !== 200) {
      throw new ApiError("SERVER_ERROR", "The original photo could not be read from storage.");
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of blob.stream as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const base64 = Buffer.concat(chunks).toString("base64");

    const file = renderZoneFile({
      zone,
      design: stored.design,
      asset: { zoneId, base64, contentType: uploadRows[0].contentType },
    });

    const quality = renderQuality(zone, value.photo.naturalWidth, value.photo.scale);
    const safeName = `${orderNumber}-${zone.label}`.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase();

    return new Response(file.svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-disposition": `attachment; filename="${safeName}-${file.widthMm}x${file.heightMm}mm.svg"`,
        /* Honest about what the file is and whether the photo really carried
           enough detail for the size it prints at. */
        "x-print-size-mm": `${file.widthMm}x${file.heightMm}`,
        "x-photo-effective-dpi": quality.effectiveDpi != null ? String(quality.effectiveDpi) : "unknown",
        "x-photo-sufficient": quality.sufficient ? "yes" : "no",
        "x-render-warnings": file.warnings.length > 0 ? file.warnings.join(" | ") : "none",
        "cache-control": "private, no-store",
      },
    });
  },
);

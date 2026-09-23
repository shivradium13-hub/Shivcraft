import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

import { readStoredDesign } from "@/lib/customizer/design";
import { readConfig } from "@/lib/customizer/schema";
import { ApiError, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import {
  photoZonesOf,
  renderComposite,
  renderQuality,
  renderZoneFile,
  type ResolvedImage,
  type ZoneAsset,
} from "@/server/customizer/render";
import { db } from "@/server/db";
import { orderItems, orders, uploads } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Reading large originals out of the blob store and base64ing them takes
   longer than a page render, and is worth waiting for. */
export const maxDuration = 60;

/** Reads one private blob to base64, or throws a written error. */
async function readBlobBase64(pathname: string): Promise<string> {
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    throw new ApiError("SERVER_ERROR", "A file could not be read from storage.");
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of blob.stream as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("base64");
}

/** Fetches a product-art image (base/overlay) and base64s it for embedding.
 *  Returns null on any failure — a proof without its background is still
 *  useful, and the caller reports the gap rather than failing the download. */
async function resolveImage(src: string, origin: string): Promise<ResolvedImage> {
  if (!src) return null;
  try {
    const abs = /^https?:\/\//.test(src) ? src : new URL(src, origin).toString();
    const res = await fetch(abs);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), contentType };
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/orders/[orderNumber]/production
 *
 *   ?item=<id>&zone=<id>   the print file for one photo area (exact physical
 *                          size, the true artwork)
 *   ?item=<id>&sheet=<viewId?>  a one-page visual proof of the whole view,
 *                          every photo, word and colour composited as approved
 *
 * Both are built from the snapshot frozen at checkout and the customer's
 * untouched originals. Admin only. Nothing but which line, zone or view is
 * taken from the request — the geometry, crop and sizes come from the order.
 */
export const GET = route(
  async (request: Request, context: RouteContext<"/api/admin/orders/[orderNumber]/production">) => {
    await requireAdmin();
    const { orderNumber } = await context.params;
    const url = new URL(request.url);

    const itemId = url.searchParams.get("item") ?? "";
    const zoneId = url.searchParams.get("zone") ?? "";
    const sheetView = url.searchParams.get("sheet");

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

    /* --------------------------------------------- the composite proof sheet */
    if (sheetView !== null) {
      const view =
        config.views.find((v) => v.id === sheetView) ??
        config.views.find((v) => v.id === stored.design.viewId) ??
        config.views[0];
      if (!view) throw new ApiError("BAD_REQUEST", "This order has no view to proof.");

      /* Every photo the view shows, read from the private store into an asset
         map keyed by zone — the same originals the per-zone files use. */
      const assets = new Map<string, ZoneAsset>();
      for (const { zone, uploadId } of photoZonesOf(config, stored.design)) {
        if (!view.zoneIds.includes(zone.id)) continue;
        const uploadRow = (
          await db
            .select({ pathname: uploads.pathname, contentType: uploads.contentType })
            .from(uploads)
            .where(eq(uploads.id, uploadId))
            .limit(1)
        )[0];
        if (!uploadRow) continue;
        assets.set(zone.id, {
          zoneId: zone.id,
          base64: await readBlobBase64(uploadRow.pathname),
          contentType: uploadRow.contentType,
        });
      }

      const [base, overlay] = await Promise.all([
        resolveImage(view.base, url.origin),
        resolveImage(view.overlay, url.origin),
      ]);

      /* Frame PNGs shown on this view, embedded so the proof is self-contained. */
      const frameImages = new Map<string, ResolvedImage>();
      for (const zone of config.zones) {
        if (zone.kind === "FRAME" && zone.imageUrl && !zone.hidden && view.zoneIds.includes(zone.id)) {
          frameImages.set(zone.id, await resolveImage(zone.imageUrl, url.origin));
        }
      }

      const proof = renderComposite({
        config,
        design: stored.design,
        view,
        assets,
        base,
        overlay,
        frameImages,
      });
      const safeName = `${orderNumber}-${view.label}-proof`
        .replace(/[^a-zA-Z0-9-]+/g, "-")
        .toLowerCase();

      return new Response(proof.svg, {
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "content-disposition": `attachment; filename="${safeName}.svg"`,
          "x-proof-kind": "composite",
          "x-render-warnings": proof.warnings.length > 0 ? proof.warnings.join(" | ") : "none",
          "cache-control": "private, no-store",
        },
      });
    }

    /* ------------------------------------------ the single-zone print file */
    const zone = config.zones.find((z) => z.id === zoneId);
    const value = stored.design.zones[zoneId];

    if (!zone || zone.kind !== "PHOTO") {
      throw new ApiError("BAD_REQUEST", "That is not a photo area on this order.");
    }
    if (value?.kind !== "PHOTO") {
      throw new ApiError("NOT_FOUND", "The customer did not put a photo in that area.");
    }

    const uploadRows = await db
      .select({ pathname: uploads.pathname, contentType: uploads.contentType })
      .from(uploads)
      .where(eq(uploads.id, value.photo.uploadId))
      .limit(1);

    if (!uploadRows[0]) {
      throw new ApiError("NOT_FOUND", "The customer's original photo is no longer in storage.");
    }

    const base64 = await readBlobBase64(uploadRows[0].pathname);

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

import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

import { ApiError, route } from "@/server/api/http";
import { db } from "@/server/db";
import { productImages, uploads } from "@/server/db/schema";
import { isWatermarkable, watermarkImage } from "@/server/uploads/watermark";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Drain a blob's ReadableStream into a Buffer. (Wrapping it in a Response and
 *  calling arrayBuffer() trips undici's "body disturbed or locked" guard here,
 *  so we read it directly.) */
async function readStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Whether this upload is a product photo (vs. a banner or category tile, which
 *  share this route). Only product photos carry the watermark — product image
 *  rows store their url as exactly `/api/media/<id>`. */
async function isProductImage(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.url, `/api/media/${id}`))
    .limit(1);
  return rows.length > 0;
}

/**
 * GET /api/media/[id] — catalogue artwork, served to anyone.
 *
 * Deliberately has no auth check, because product images are public content —
 * but it will ONLY serve rows marked PUBLIC. A customer photo requested here is
 * a 404 no matter who asks, so the private/public split cannot be crossed by
 * guessing the other route.
 *
 * The blob id never changes once written, so the response is immutable and the
 * CDN can hold it — this route runs once per edge cache miss, not per view.
 */
export const GET = route(async (_request: Request, context: RouteContext<"/api/media/[id]">) => {
  const { id } = await context.params;
  if (!UUID.test(id)) throw new ApiError("NOT_FOUND", "That image is not available.");

  const rows = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, id), eq(uploads.visibility, "PUBLIC")))
    .limit(1);

  const row = rows[0];
  if (!row) throw new ApiError("NOT_FOUND", "That image is not available.");

  const result = await get(row.pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    throw new ApiError("NOT_FOUND", "That image is not available.");
  }

  // Product photos are stamped with the Shiv Radium watermark before they leave
  // the server, so a screenshot or a saved file carries it too. Banners,
  // category art and videos go through untouched; customer uploads never reach
  // this route (they are served, ownership-checked, from /api/uploads/[id]).
  if (isWatermarkable(row.contentType) && (await isProductImage(id))) {
    const original = await readStreamToBuffer(result.stream);
    const stamped = new Uint8Array(await watermarkImage(original, row.contentType));
    return new Response(stamped, {
      headers: {
        "Content-Type": row.contentType,
        "Content-Length": String(stamped.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

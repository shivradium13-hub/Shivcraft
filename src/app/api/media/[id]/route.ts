import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

import { ApiError, route } from "@/server/api/http";
import { db } from "@/server/db";
import { uploads } from "@/server/db/schema";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  return new Response(result.stream, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

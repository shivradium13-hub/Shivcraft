import { del, get } from "@vercel/blob";
import { eq } from "drizzle-orm";

import { ApiError, ok, route } from "@/server/api/http";
import { db } from "@/server/db";
import { uploads } from "@/server/db/schema";
import { ownsUpload, readShopper } from "@/server/shop/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadOwned(id: string) {
  // Reject a malformed id before it reaches the database.
  if (!UUID.test(id)) throw new ApiError("NOT_FOUND", "That photo is no longer available.");

  const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  const row = rows[0];
  const shopper = await readShopper();

  // A photo someone else owns is reported as missing, not forbidden: a 403
  // would confirm the id exists to anyone probing.
  if (!row || !ownsUpload(shopper, row)) {
    throw new ApiError("NOT_FOUND", "That photo is no longer available.");
  }
  return row;
}

/** Streams a private blob to its owner (or an admin reading an order). */
export const GET = route(async (_request: Request, context: RouteContext<"/api/uploads/[id]">) => {
  const { id } = await context.params;
  const row = await loadOwned(id);

  const result = await get(row.pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    throw new ApiError("NOT_FOUND", "That photo is no longer available.");
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.bytes),
      // Private to this viewer, so never cached by a shared proxy or the CDN.
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/** Lets someone remove a photo they uploaded before the order is placed. */
export const DELETE = route(async (_request: Request, context: RouteContext<"/api/uploads/[id]">) => {
  const { id } = await context.params;
  const row = await loadOwned(id);

  if (row.attachedAt) {
    throw new ApiError(
      "CONFLICT",
      "This photo is attached to an order and cannot be removed. Contact support if it is wrong.",
    );
  }

  await del(row.pathname);
  await db.delete(uploads).where(eq(uploads.id, id));

  return ok({ deleted: true });
});

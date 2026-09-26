import { put } from "@vercel/blob";
import { and, desc, eq, inArray } from "drizzle-orm";

import { ApiError, created, ok, route } from "@/server/api/http";
import { db } from "@/server/db";
import { uploads } from "@/server/db/schema";
import { ensureShopper, readShopper } from "@/server/shop/identity";
import {
  IMAGE_EXTENSION,
  IMAGE_REJECTION,
  MAX_IMAGE_BYTES,
  oversizeMessage,
  sniffImage,
} from "@/server/uploads/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/uploads — the requester's own recent photos, for the "Recent" strip
 * in the photo picker. Scoped to this signed-in user or this guest cookie, so a
 * visitor only ever sees photos they uploaded. Read-only: never issues a cookie.
 */
export const GET = route(async () => {
  const shopper = await readShopper();
  const owner = shopper.user
    ? eq(uploads.userId, shopper.user.id)
    : shopper.guestToken
      ? eq(uploads.guestToken, shopper.guestToken)
      : null;
  if (!owner) return ok({ items: [] });

  const rows = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(
      and(
        owner,
        eq(uploads.visibility, "PRIVATE"),
        inArray(uploads.contentType, ["image/jpeg", "image/png", "image/webp"]),
      ),
    )
    .orderBy(desc(uploads.createdAt))
    .limit(12);

  return ok({ items: rows.map((r) => ({ id: r.id, url: `/api/uploads/${r.id}` })) });
});

/**
 * POST /api/uploads — a customer's photo for a personalised product.
 *
 * Stored PRIVATE and readable only through /api/uploads/[id], which checks the
 * requester is the uploader or an admin.
 */
export const POST = route(async (request: Request) => {
  const shopper = await ensureShopper();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) throw new ApiError("BAD_REQUEST", "Choose a photo to upload.");
  if (file.size === 0) {
    throw new ApiError("BAD_REQUEST", "That file is empty. Pick another photo.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError("BAD_REQUEST", oversizeMessage(file.size));
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImage(buffer);
  if (!contentType) throw new ApiError("BAD_REQUEST", IMAGE_REJECTION);

  const owner = shopper.user ? `u/${shopper.user.id}` : `g/${shopper.guestToken}`;
  const blob = await put(
    `customization/${owner}/${Date.now()}.${IMAGE_EXTENSION[contentType]}`,
    Buffer.from(buffer),
    { access: "private", contentType, addRandomSuffix: true },
  );

  const [row] = await db
    .insert(uploads)
    .values({
      pathname: blob.pathname,
      contentType,
      bytes: file.size,
      originalName: file.name.slice(0, 200),
      userId: shopper.user?.id ?? null,
      guestToken: shopper.guestToken,
      visibility: "PRIVATE",
    })
    .returning({ id: uploads.id });

  // The blob store is private, so the caller gets our proxy URL, never a
  // direct blob URL — there is no direct URL that would work anyway.
  return created({
    id: row.id,
    url: `/api/uploads/${row.id}`,
    contentType,
    bytes: file.size,
  });
});

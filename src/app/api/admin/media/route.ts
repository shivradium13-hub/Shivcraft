import { put } from "@vercel/blob";

import { ApiError, created, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { uploads } from "@/server/db/schema";
import {
  IMAGE_EXTENSION,
  IMAGE_REJECTION,
  MAX_IMAGE_BYTES,
  oversizeMessage,
  sniffImage,
} from "@/server/uploads/image";

export const runtime = "nodejs";

/**
 * POST /api/admin/media — product and category artwork.
 *
 * Marked PUBLIC, because the storefront serves these to everyone. They live in
 * the same blob store as customer photos but are reachable through
 * /api/media/[id], which never checks ownership; customer photos stay on
 * /api/uploads/[id], which always does.
 */
export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) throw new ApiError("BAD_REQUEST", "Choose an image to upload.");
  if (file.size === 0) throw new ApiError("BAD_REQUEST", "That file is empty.");
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError("BAD_REQUEST", oversizeMessage(file.size));

  const buffer = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImage(buffer);
  if (!contentType) throw new ApiError("BAD_REQUEST", IMAGE_REJECTION);

  const blob = await put(
    `catalogue/${Date.now()}.${IMAGE_EXTENSION[contentType]}`,
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
      userId: admin.id,
      visibility: "PUBLIC",
      // Catalogue art is in use from the moment it is uploaded.
      attachedAt: new Date(),
    })
    .returning({ id: uploads.id });

  return created({ id: row.id, url: `/api/media/${row.id}`, contentType, bytes: file.size });
});

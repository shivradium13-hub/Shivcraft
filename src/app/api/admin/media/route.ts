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
import {
  MAX_VIDEO_BYTES,
  VIDEO_EXTENSION,
  VIDEO_REJECTION,
  oversizeVideoMessage,
  sniffVideo,
} from "@/server/uploads/video";

export const runtime = "nodejs";

/**
 * POST /api/admin/media — product and category artwork (images and short clips).
 *
 * Images are stored PRIVATE and served through /api/media/[id] (which serves
 * only PUBLIC-flagged rows and never checks ownership; customer photos stay on
 * /api/uploads/[id], which always does). Videos are stored PUBLIC in the blob
 * store and referenced by their direct CDN URL, so the browser gets native
 * range/streaming — the response returns that URL to save on the record.
 */
export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) throw new ApiError("BAD_REQUEST", "Choose a file to upload.");
  if (file.size === 0) throw new ApiError("BAD_REQUEST", "That file is empty.");
  // The absolute ceiling; images get a tighter limit once we know the type.
  if (file.size > MAX_VIDEO_BYTES) throw new ApiError("BAD_REQUEST", oversizeVideoMessage(file.size));

  const buffer = new Uint8Array(await file.arrayBuffer());

  const imageType = sniffImage(buffer);
  if (imageType) {
    if (file.size > MAX_IMAGE_BYTES) throw new ApiError("BAD_REQUEST", oversizeMessage(file.size));

    const blob = await put(
      `catalogue/${Date.now()}.${IMAGE_EXTENSION[imageType]}`,
      Buffer.from(buffer),
      { access: "private", contentType: imageType, addRandomSuffix: true },
    );

    const [row] = await db
      .insert(uploads)
      .values({
        pathname: blob.pathname,
        contentType: imageType,
        bytes: file.size,
        originalName: file.name.slice(0, 200),
        userId: admin.id,
        visibility: "PUBLIC",
        // Catalogue art is in use from the moment it is uploaded.
        attachedAt: new Date(),
      })
      .returning({ id: uploads.id });

    return created({ id: row.id, url: `/api/media/${row.id}`, kind: "image", contentType: imageType, bytes: file.size });
  }

  const videoType = sniffVideo(buffer);
  if (videoType) {
    const blob = await put(
      `catalogue/${Date.now()}.${VIDEO_EXTENSION[videoType]}`,
      Buffer.from(buffer),
      { access: "public", contentType: videoType, addRandomSuffix: true },
    );

    // Recorded for housekeeping; the storefront uses the public CDN URL directly
    // so the browser gets proper range requests / streaming for video.
    const [row] = await db
      .insert(uploads)
      .values({
        pathname: blob.pathname,
        contentType: videoType,
        bytes: file.size,
        originalName: file.name.slice(0, 200),
        userId: admin.id,
        visibility: "PUBLIC",
        attachedAt: new Date(),
      })
      .returning({ id: uploads.id });

    return created({ id: row.id, url: blob.url, kind: "video", contentType: videoType, bytes: file.size });
  }

  throw new ApiError("BAD_REQUEST", `${IMAGE_REJECTION} ${VIDEO_REJECTION}`);
});

import { put } from "@vercel/blob";

import { ApiError, created, route } from "@/server/api/http";
import { db } from "@/server/db";
import { uploads } from "@/server/db/schema";
import { ensureShopper } from "@/server/shop/identity";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Identify the file by its magic bytes, not by the filename or the
 * browser-supplied Content-Type — both of which the client controls. A .exe
 * renamed to .jpg fails here.
 */
function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12) {
    const head = String.fromCharCode(...bytes.subarray(0, 4));
    const kind = String.fromCharCode(...bytes.subarray(8, 12));
    if (head === "RIFF" && kind === "WEBP") return "image/webp";
  }
  return null;
}

const EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export const POST = route(async (request: Request) => {
  const shopper = await ensureShopper();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    throw new ApiError("BAD_REQUEST", "Choose a photo to upload.");
  }
  if (file.size === 0) {
    throw new ApiError("BAD_REQUEST", "That file is empty. Pick another photo.");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(
      "BAD_REQUEST",
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB — try a smaller version.`,
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImage(buffer);
  if (!contentType) {
    throw new ApiError(
      "BAD_REQUEST",
      "That file is not a JPG, PNG or WebP image. Screenshots and photos from your phone both work.",
    );
  }

  const owner = shopper.user ? `u/${shopper.user.id}` : `g/${shopper.guestToken}`;
  const blob = await put(`customization/${owner}/${Date.now()}.${EXTENSION[contentType]}`, Buffer.from(buffer), {
    access: "private",
    contentType,
    addRandomSuffix: true,
  });

  const [row] = await db
    .insert(uploads)
    .values({
      pathname: blob.pathname,
      contentType,
      bytes: file.size,
      originalName: file.name.slice(0, 200),
      userId: shopper.user?.id ?? null,
      guestToken: shopper.guestToken,
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

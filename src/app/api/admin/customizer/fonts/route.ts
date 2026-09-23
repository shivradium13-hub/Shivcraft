import { put } from "@vercel/blob";

import { ApiError, created, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { uploads } from "@/server/db/schema";

export const runtime = "nodejs";

const MAX_FONT_BYTES = 5 * 1024 * 1024; // 5 MB — generous for any real font.

type FontKind = { ext: string; contentType: string; format: "woff2" | "woff" | "truetype" | "opentype" };

/**
 * Identifies a font by its magic bytes, not its name.
 *
 * The extension a browser sends is a hint, not proof, so the file's own header
 * is what decides — an image renamed .ttf is rejected here rather than served
 * back to every customer as a font (§43).
 */
function sniffFont(bytes: Uint8Array): FontKind | null {
  const tag = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (tag === "wOF2") return { ext: "woff2", contentType: "font/woff2", format: "woff2" };
  if (tag === "wOFF") return { ext: "woff", contentType: "font/woff", format: "woff" };
  if (tag === "OTTO") return { ext: "otf", contentType: "font/otf", format: "opentype" };
  // TrueType: 0x00010000, or the 'true'/'ttcf' tags.
  if ((bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) || tag === "true" || tag === "ttcf") {
    return { ext: "ttf", contentType: "font/ttf", format: "truetype" };
  }
  return null;
}

/** A clean CSS family name derived from the file name. */
function familyName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return (base || "Custom font").slice(0, 80);
}

/**
 * POST /api/admin/customizer/fonts — upload a font for the Frame Designer.
 *
 * Admin only. Stored PUBLIC and served through /api/media/[id], the same way
 * catalogue art is, because the customer's browser must be able to load it via
 * @font-face. Only genuine font files are accepted.
 */
export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) throw new ApiError("BAD_REQUEST", "Choose a font file to upload.");
  if (file.size === 0) throw new ApiError("BAD_REQUEST", "That file is empty.");
  if (file.size > MAX_FONT_BYTES) {
    throw new ApiError("BAD_REQUEST", "That font is larger than 5 MB. Please use a web font file.");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFont(buffer);
  if (!kind) {
    throw new ApiError("BAD_REQUEST", "That is not a .ttf, .otf, .woff or .woff2 font file.");
  }

  const blob = await put(`fonts/${Date.now()}.${kind.ext}`, Buffer.from(buffer), {
    access: "private",
    contentType: kind.contentType,
    addRandomSuffix: true,
  });

  const [row] = await db
    .insert(uploads)
    .values({
      pathname: blob.pathname,
      contentType: kind.contentType,
      bytes: file.size,
      originalName: file.name.slice(0, 200),
      userId: admin.id,
      visibility: "PUBLIC",
      // In use as soon as it is uploaded; kept out of the sweeper's reach.
      attachedAt: new Date(),
    })
    .returning({ id: uploads.id });

  return created({
    id: row.id,
    url: `/api/media/${row.id}`,
    name: familyName(file.name),
    format: kind.format,
  });
});

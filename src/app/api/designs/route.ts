import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { designSchema } from "@/lib/customizer/design";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { getProductConfig } from "@/server/customizer/service";
import { db } from "@/server/db";
import { products, savedDesigns, uploads } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A customer keeps at most this many saved designs, so a script cannot fill
 *  the table on one account. Generous for a real shopper. */
const MAX_PER_USER = 50;

/** The upload ids a design points at, so their ownership can be checked and
 *  they can be protected from the unattached-upload sweeper. */
function photoUploadIds(design: z.infer<typeof designSchema>): string[] {
  return Object.values(design.zones).flatMap((z) => (z.kind === "PHOTO" ? [z.photo.uploadId] : []));
}

/**
 * GET — the signed-in customer's saved designs, newest first.
 *
 * Optionally filtered to one product with `?productId=`. Only ever the
 * caller's own rows; a saved design is private to the account that made it.
 */
export const GET = route(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  const rows = await db
    .select({
      id: savedDesigns.id,
      productId: savedDesigns.productId,
      name: savedDesigns.name,
      configVersion: savedDesigns.configVersion,
      createdAt: savedDesigns.createdAt,
      productName: products.name,
      productSlug: products.slug,
    })
    .from(savedDesigns)
    .innerJoin(products, eq(products.id, savedDesigns.productId))
    .where(
      productId
        ? and(eq(savedDesigns.userId, user.id), eq(savedDesigns.productId, productId))
        : eq(savedDesigns.userId, user.id),
    )
    .orderBy(desc(savedDesigns.createdAt))
    .limit(100);

  return ok({ designs: rows });
});

const saveSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1, "Give this design a name.").max(120),
  design: designSchema,
});

/**
 * POST — save the current design under a name.
 *
 * A saved design may be incomplete: the point is to come back to it, so this
 * does not demand every required zone the way add-to-cart does. It does insist
 * that every photo the design points at belongs to this customer — a saved
 * design must never be a way to reference someone else's private upload (§43,
 * §44) — and it marks those uploads attached so the sweeper leaves them alone.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const input = await readJson(request, saveSchema);

  const config = await getProductConfig(input.productId);
  if (!config.enabled) {
    throw new ApiError("BAD_REQUEST", "This product cannot be personalised, so there is nothing to save.");
  }

  const count = await db.$count(savedDesigns, eq(savedDesigns.userId, user.id));
  if (count >= MAX_PER_USER) {
    throw new ApiError(
      "BAD_REQUEST",
      `You have reached ${MAX_PER_USER} saved designs. Delete one to save another.`,
    );
  }

  const uploadIds = photoUploadIds(input.design);
  if (uploadIds.length > 0) {
    const owned = await db
      .select({ id: uploads.id })
      .from(uploads)
      .where(and(inArray(uploads.id, uploadIds), eq(uploads.userId, user.id)));
    const ownedIds = new Set(owned.map((r) => r.id));
    if (uploadIds.some((id) => !ownedIds.has(id))) {
      throw new ApiError("FORBIDDEN", "One of the photos in this design is not yours to save.");
    }

    // Keep the referenced photos out of the sweeper's reach for as long as the
    // saved design exists.
    await db
      .update(uploads)
      .set({ attachedAt: new Date() })
      .where(and(inArray(uploads.id, uploadIds), isNull(uploads.attachedAt)));
  }

  const [row] = await db
    .insert(savedDesigns)
    .values({
      userId: user.id,
      productId: input.productId,
      name: input.name,
      design: input.design,
      configVersion: input.design.configVersion,
    })
    .returning({ id: savedDesigns.id });

  return ok({ id: row.id });
});

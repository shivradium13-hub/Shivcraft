import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { getMyWishlist } from "@/server/account/queries";
import { db } from "@/server/db";
import { wishlistItems } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ productId: z.string().uuid("Unknown product.") });

export const GET = route(async () => {
  const user = await requireUser();
  return ok({ items: await getMyWishlist(user.id) });
});

/**
 * POST /api/wishlist — toggles. One endpoint rather than add/remove pair,
 * because the heart is a toggle and a double tap should not error.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const { productId } = await readJson(request, schema);

  const existing = await db
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.userId, user.id), eq(wishlistItems.productId, productId)))
    .limit(1);

  if (existing[0]) {
    await db.delete(wishlistItems).where(eq(wishlistItems.id, existing[0].id));
    return ok({ saved: false });
  }

  await db.insert(wishlistItems).values({ userId: user.id, productId }).onConflictDoNothing();
  return ok({ saved: true });
});

export const DELETE = route(async (request: Request) => {
  const user = await requireUser();
  const { productId } = await readJson(request, schema);

  await db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.userId, user.id), eq(wishlistItems.productId, productId)));

  return ok({ saved: false });
});

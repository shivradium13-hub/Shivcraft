import { eq } from "drizzle-orm";

import { couponApplySchema } from "@/lib/validation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { findCartId, getCartView } from "@/server/cart/queries";
import { db } from "@/server/db";
import { carts } from "@/server/db/schema";
import { readShopper } from "@/server/shop/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cart/coupon
 *
 * Stores the CODE, then re-reads the cart so the coupon is judged by the same
 * validator the cart uses on every read — including the category restriction,
 * which needs the cart's real category ids. If it does not hold, the code is
 * removed again and the reason is returned.
 */
export const POST = route(async (request: Request) => {
  const { code } = await readJson(request, couponApplySchema);
  const shopper = await readShopper();

  const cartId = await findCartId(shopper);
  if (!cartId) throw new ApiError("BAD_REQUEST", "Your cart is empty.");

  const before = await getCartView(shopper);
  if (before.totals.subtotalP <= 0) {
    throw new ApiError("BAD_REQUEST", "Add something to your cart before applying a coupon.");
  }

  const previous = before.coupon?.code ?? null;
  await db
    .update(carts)
    .set({ couponCode: code, updatedAt: new Date() })
    .where(eq(carts.id, cartId));

  const after = await getCartView(shopper);

  if (after.couponError || !after.coupon) {
    // Put back whatever was applied before, rather than silently dropping it.
    await db
      .update(carts)
      .set({ couponCode: previous, updatedAt: new Date() })
      .where(eq(carts.id, cartId));
    throw new ApiError("INVALID_COUPON", after.couponError ?? "That coupon cannot be applied.");
  }

  return ok(after);
});

/** DELETE /api/cart/coupon — remove the applied coupon. */
export const DELETE = route(async () => {
  const shopper = await readShopper();
  const cartId = await findCartId(shopper);
  if (!cartId) throw new ApiError("BAD_REQUEST", "Your cart is empty.");

  await db
    .update(carts)
    .set({ couponCode: null, updatedAt: new Date() })
    .where(eq(carts.id, cartId));

  return ok(await getCartView(shopper));
});

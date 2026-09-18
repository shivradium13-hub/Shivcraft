import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/server/db";
import { cartItems, carts, uploads } from "@/server/db/schema";
import { GUEST_COOKIE } from "@/server/shop/identity";

/**
 * Moves a guest's cart onto their account at sign-in.
 *
 * Without this, everything someone added before logging in silently disappears
 * at the moment they try to check out — which is exactly when it matters most.
 * Uploaded photos move too, so their customisations keep working.
 */
export async function mergeGuestCart(userId: string): Promise<void> {
  const jar = await cookies();
  const guestToken = jar.get(GUEST_COOKIE)?.value;
  if (!guestToken) return;

  const guestCarts = await db
    .select({ id: carts.id, couponCode: carts.couponCode })
    .from(carts)
    .where(eq(carts.guestToken, guestToken))
    .limit(1);

  const guestCart = guestCarts[0];

  // Uploads are re-owned regardless, so a photo uploaded before signing in is
  // still readable afterwards.
  await db
    .update(uploads)
    .set({ userId, guestToken: null })
    .where(eq(uploads.guestToken, guestToken));

  if (!guestCart) {
    jar.delete(GUEST_COOKIE);
    return;
  }

  const userCarts = await db
    .select({ id: carts.id, couponCode: carts.couponCode })
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  const userCart = userCarts[0];

  if (!userCart) {
    // No account cart yet: just re-own the guest one.
    await db
      .update(carts)
      .set({ userId, guestToken: null, updatedAt: new Date() })
      .where(eq(carts.id, guestCart.id));
    jar.delete(GUEST_COOKIE);
    return;
  }

  // Both exist: move the lines across and drop the empty guest cart. Lines are
  // appended rather than deduplicated, because two entries for one product can
  // legitimately carry different customisation.
  await db
    .update(cartItems)
    .set({ cartId: userCart.id })
    .where(eq(cartItems.cartId, guestCart.id));

  if (!userCart.couponCode && guestCart.couponCode) {
    await db
      .update(carts)
      .set({ couponCode: guestCart.couponCode, updatedAt: new Date() })
      .where(eq(carts.id, userCart.id));
  }

  await db.delete(carts).where(eq(carts.id, guestCart.id));
  jar.delete(GUEST_COOKIE);
}

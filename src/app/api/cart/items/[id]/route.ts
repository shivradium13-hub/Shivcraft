import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import { findCartId, getCartView } from "@/server/cart/queries";
import { db } from "@/server/db";
import { cartItems, products } from "@/server/db/schema";
import { readShopper, type Shopper } from "@/server/shop/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  quantity: z
    .number()
    .int("Enter a whole number.")
    .min(1, "Keep at least one, or remove the item.")
    .max(20, "You can order up to 20 of one item here. For more, contact us about a bulk order.")
    .optional(),
  savedForLater: z.boolean().optional(),
});

/**
 * Loads a line only if it belongs to the caller's own cart. Anything else is
 * reported as not found — a 403 would confirm that the id exists.
 */
async function loadOwnLine(id: string, shopper: Shopper) {
  const cartId = await findCartId(shopper);
  if (!cartId) throw new ApiError("NOT_FOUND", "That item is no longer in your cart.");

  const rows = await db
    .select({ id: cartItems.id, productId: cartItems.productId })
    .from(cartItems)
    .where(and(eq(cartItems.id, id), eq(cartItems.cartId, cartId)))
    .limit(1);

  if (!rows[0]) throw new ApiError("NOT_FOUND", "That item is no longer in your cart.");
  return rows[0];
}

export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/cart/items/[id]">) => {
    const { id } = await context.params;
    const input = await readJson(request, patchSchema);
    const shopper = await readShopper();
    const line = await loadOwnLine(id, shopper);

    if (input.quantity != null) {
      const stockRows = await db
        .select({ stock: products.stock, name: products.name })
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1);

      const product = stockRows[0];
      if (!product) throw new ApiError("NOT_FOUND", "That product is no longer available.");
      if (input.quantity > product.stock) {
        throw new ApiError(
          "OUT_OF_STOCK",
          product.stock === 0
            ? `${product.name} is out of stock.`
            : `Only ${product.stock} left in stock.`,
        );
      }
    }

    await db
      .update(cartItems)
      .set({
        ...(input.quantity != null ? { quantity: input.quantity } : {}),
        ...(input.savedForLater != null ? { savedForLater: input.savedForLater } : {}),
      })
      .where(eq(cartItems.id, line.id));

    return ok(await getCartView(shopper));
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/cart/items/[id]">) => {
    const { id } = await context.params;
    const shopper = await readShopper();
    const line = await loadOwnLine(id, shopper);

    await db.delete(cartItems).where(eq(cartItems.id, line.id));
    return ok(await getCartView(shopper));
  },
);

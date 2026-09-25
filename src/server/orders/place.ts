import { and, eq, inArray, sql } from "drizzle-orm";

import { ApiError } from "@/server/api/http";
import { checkCoupon, computeTotals, getShopSettings } from "@/server/cart/pricing";
import { getCartView } from "@/server/cart/queries";
import { db } from "@/server/db";
import {
  addresses,
  cartItems,
  carts,
  couponRedemptions,
  coupons,
  inventoryMovements,
  notifications,
  orderEvents,
  orderItems,
  orders,
  payments,
  productVariants,
  products,
  uploads,
} from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/session";

export type PaymentMethod = "UPI" | "CARD" | "NETBANKING" | "WALLET" | "COD";

export type PlacedOrder = {
  id: string;
  orderNumber: string;
  totalP: number;
  method: PaymentMethod;
  paymentId: string;
};

/**
 * Turns a cart into an order, atomically.
 *
 * Everything below happens inside ONE transaction: stock is taken with a
 * conditional UPDATE that only succeeds while enough remains, so two people
 * buying the last piece cannot both win — the loser's whole order rolls back
 * rather than overselling. Prices and the coupon are recomputed here from the
 * database and never trusted from the client.
 */
export async function placeOrder(input: {
  user: SessionUser;
  addressId: string;
  method: PaymentMethod;
  /** Optional B2B invoice details. Validated and normalised by the caller;
   *  stored as-is and never used to change what is charged. */
  gstin?: string | null;
  businessName?: string | null;
}): Promise<PlacedOrder> {
  const shopper = { user: input.user, guestToken: null };

  const view = await getCartView(shopper);
  if (view.items.length === 0) {
    throw new ApiError("BAD_REQUEST", "Your cart is empty.");
  }

  const unavailable = view.items.filter((line) => !line.isActive || line.stock <= 0);
  if (unavailable.length > 0) {
    throw new ApiError(
      "OUT_OF_STOCK",
      `${unavailable[0].name} is no longer available. Remove it to continue.`,
    );
  }

  const addressRows = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, input.user.id)))
    .limit(1);

  const address = addressRows[0];
  if (!address) throw new ApiError("BAD_REQUEST", "Choose a delivery address.");

  const shop = await getShopSettings();

  return db.transaction(async (tx) => {
    /* ---------------------------------------------------- take the stock */
    for (const line of view.items) {
      const taken = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${line.quantity}`, updatedAt: new Date() })
        .where(and(eq(products.id, line.productId), sql`${products.stock} >= ${line.quantity}`))
        .returning({ id: products.id });

      if (taken.length === 0) {
        // Someone else took it between the cart read and now.
        throw new ApiError(
          "OUT_OF_STOCK",
          `${line.name} sold out while you were checking out. Please adjust your cart.`,
        );
      }
    }

    /* ------------------------------------------------ re-price the cart */
    const subtotalP = view.items.reduce((sum, line) => sum + line.lineTotalP, 0);

    let discountP = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;

    if (view.coupon) {
      /* The cart's own categories, not an empty list. Passing [] here made
         every category-limited coupon fail CATEGORY_MISMATCH at this point,
         so the shopper saw a discount in the cart and was charged the full
         amount without being told why. */
      const recheck = await checkCoupon(view.coupon.code, {
        userId: input.user.id,
        subtotalP,
        categoryIds: [...new Set(view.items.map((line) => line.categoryId))],
      });
      if (recheck.ok) {
        discountP = recheck.discountP;
        couponCode = recheck.code;
        const rows = await tx
          .select({ id: coupons.id })
          .from(coupons)
          .where(sql`upper(${coupons.code}) = ${recheck.code.toUpperCase()}`)
          .limit(1);
        couponId = rows[0]?.id ?? null;
      }
      // A coupon that stopped qualifying is silently dropped rather than
      // failing the order; the totals below reflect what is actually charged.
    }

    const totals = computeTotals(subtotalP, discountP, shop);

    /* ------------------------------------------------------ the order */
    const numberRow = await tx.execute<{ n: string }>(
      sql`SELECT nextval('order_number_seq')::text AS n`,
    );
    /* Orders placed before the rebrand keep their GC- numbers: an order number
       is the customer's reference on an invoice, and rewriting history would
       break every link and receipt that already quotes one. */
    const orderNumber = `SR-${new Date().getFullYear()}-${numberRow.rows[0].n}`;

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId: input.user.id,
        status: "PLACED",
        shipName: address.fullName,
        shipPhone: address.phone,
        shipLine1: address.line1,
        shipLine2: address.line2,
        shipArea: address.area,
        shipCity: address.city,
        shipState: address.state,
        shipPincode: address.pincode,
        subtotalP: totals.subtotalP,
        discountP: totals.discountP,
        shippingP: totals.shippingP,
        taxP: totals.taxP,
        totalP: totals.totalP,
        couponId,
        couponCode,
        customerGstin: input.gstin || null,
        customerBusinessName: input.businessName || null,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    /* Line items snapshot the product, so renaming or deleting it later does
       not rewrite history. */
    /* One read for every customised line, before the insert, so the freeze
       below is a pure mapping. */
    const configById = new Map<string, unknown>();
    for (const line of view.items) {
      if (!line.design || configById.has(line.productId)) continue;
      const rows = await tx
        .select({ customizer: products.customizer })
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1);
      configById.set(line.productId, rows[0]?.customizer ?? null);
    }

    await tx.insert(orderItems).values(
      view.items.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        productName: line.name,
        productSlug: line.slug,
        imageUrl: line.imageUrl,
        unitPriceP: line.unitPriceP,
        quantity: line.quantity,
        lineTotalP: line.lineTotalP,
        variantLabel: line.variantLabel,
        customization: line.customization,
        /* Frozen here, design AND the configuration it was built against.
           Whatever the admin changes about the product afterwards, this order
           can still be rendered exactly as the customer approved it (§32). */
        design: line.design ? { design: line.design, config: configById.get(line.productId) ?? null } : null,
      })),
    );

    await tx.insert(inventoryMovements).values(
      view.items.map((line) => ({
        productId: line.productId,
        delta: -line.quantity,
        reason: "ORDER_PLACED" as const,
        orderId: order.id,
        actorId: input.user.id,
      })),
    );

    /* Variant stock, where a variant was chosen. */
    for (const line of view.items) {
      if (!line.variantLabel) continue;
      const rows = await tx
        .select({ id: cartItems.variantIds })
        .from(cartItems)
        .where(eq(cartItems.id, line.id))
        .limit(1);
      const ids = rows[0]?.id ?? [];
      if (ids.length > 0) {
        await tx
          .update(productVariants)
          .set({ stock: sql`greatest(0, ${productVariants.stock} - ${line.quantity})` })
          .where(inArray(productVariants.id, ids));
      }
    }

    await tx.insert(orderEvents).values({
      orderId: order.id,
      status: "PLACED",
      note: input.method === "COD" ? "Cash on delivery" : "Awaiting payment",
      actorId: input.user.id,
    });

    const [payment] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        method: input.method,
        // COD is genuinely pending until the courier collects; an online order
        // stays PENDING until the signature is verified. Nothing is marked PAID
        // here.
        status: input.method === "COD" ? "COD_PENDING" : "PENDING",
        amountP: totals.totalP,
      })
      .returning({ id: payments.id });

    /* --------------------------------------------------- coupon + cart */
    if (couponId) {
      await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(eq(coupons.id, couponId));

      await tx.insert(couponRedemptions).values({
        couponId,
        userId: input.user.id,
        orderId: order.id,
        amountP: totals.discountP,
      });
    }

    /* Uploaded photos are now part of an order and must not be deletable. */
    const uploadIds = view.items
      .flatMap((line) => Object.values(line.customization ?? {}))
      .filter((answer) => answer.type === "IMAGE")
      .map((answer) => answer.value.split("/").pop())
      .filter((id): id is string => Boolean(id));

    if (uploadIds.length > 0) {
      await tx
        .update(uploads)
        .set({ attachedAt: new Date() })
        .where(inArray(uploads.id, uploadIds));
    }

    await tx.delete(cartItems).where(
      and(
        eq(cartItems.cartId, view.id!),
        eq(cartItems.savedForLater, false),
      ),
    );
    await tx.update(carts).set({ couponCode: null }).where(eq(carts.id, view.id!));

    await tx.insert(notifications).values({
      userId: input.user.id,
      type: "ORDER_PLACED",
      title: `Order ${order.orderNumber} placed`,
      body:
        input.method === "COD"
          ? "We will confirm it shortly and send your artwork proof."
          : "Complete the payment to confirm your order.",
      href: `/order/${order.orderNumber}`,
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      totalP: totals.totalP,
      method: input.method,
      paymentId: payment.id,
    };
  });
}

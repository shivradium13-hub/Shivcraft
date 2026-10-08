import { eq, inArray } from "drizzle-orm";

import { ApiError, ok, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { STATUS_FLOW, getAdminOrder } from "@/server/admin/orders";
import { db } from "@/server/db";
import { orderEvents, orders, products } from "@/server/db/schema";
import { notifyOrderEvent } from "@/server/notify/orderNotify";
import {
  createShipment,
  fetchLabel,
  getDelhiveryConfig,
  publicTrackingUrl,
} from "@/server/delivery/delhivery";
import { getBusinessSettings } from "@/server/settings/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Grams used when a product carries no weight of its own. */
const DEFAULT_ITEM_WEIGHT_G = 500;

/**
 * Create a Delhivery shipment for an order: fetch an AWB, store it, move the
 * order to SHIPPED and tell the customer. Admin-only. Does nothing (and says so)
 * when Delhivery is not configured, so the shop can keep using the manual note.
 */
export const POST = route(
  async (_request: Request, context: RouteContext<"/api/admin/orders/[orderNumber]/delhivery">) => {
    const admin = await requireAdmin();
    const { orderNumber } = await context.params;

    if (!getDelhiveryConfig()) {
      throw new ApiError(
        "BAD_REQUEST",
        "Delhivery is not set up yet. Add the DELHIVERY_* environment variables first.",
      );
    }

    const order = await getAdminOrder(orderNumber);
    if (!order) throw new ApiError("NOT_FOUND", "That order does not exist.");

    if (order.delhiveryAwb) {
      throw new ApiError("CONFLICT", `A shipment already exists for this order (AWB ${order.delhiveryAwb}).`);
    }
    if (order.status === "CANCELLED" || order.status === "DELIVERED") {
      throw new ApiError("CONFLICT", `A ${order.status.toLowerCase()} order cannot be shipped.`);
    }

    // Parcel weight: sum the products' own weights where known, else a default.
    const productIds = order.items.map((i) => i.productId).filter((id): id is string => Boolean(id));
    const weights = productIds.length
      ? await db
          .select({ id: products.id, weightGrams: products.weightGrams })
          .from(products)
          .where(inArray(products.id, productIds))
      : [];
    const weightById = new Map(weights.map((w) => [w.id, w.weightGrams ?? 0]));
    const weightGrams = order.items.reduce((sum, item) => {
      const w = (item.productId && weightById.get(item.productId)) || DEFAULT_ITEM_WEIGHT_G;
      return sum + w * item.quantity;
    }, 0);

    const payment = order.payments[0] ?? null;
    const isCod = payment?.method === "COD";
    const business = await getBusinessSettings();

    let created: { awb: string };
    try {
      created = await createShipment({
        orderNumber: order.orderNumber,
        name: order.shipName,
        phone: order.shipPhone,
        line1: order.shipLine1,
        line2: [order.shipLine2, order.shipArea].filter(Boolean).join(", ") || null,
        city: order.shipCity,
        state: order.shipState,
        pincode: order.shipPincode,
        paymentMode: isCod ? "COD" : "Prepaid",
        codAmountRupees: isCod ? order.totalP / 100 : 0,
        totalRupees: order.totalP / 100,
        weightGrams,
        productsDesc: order.items.map((i) => i.productName).join(", ") || "Gift",
        sellerGstin: business.gstin || null,
      });
    } catch (error) {
      // Delhivery's own wording is safe enough for the admin (not a customer).
      throw new ApiError(
        "BAD_REQUEST",
        error instanceof Error ? error.message : "Delhivery could not create the shipment.",
      );
    }

    // Moving to SHIPPED unless the order is already past it.
    const shippedIndex = STATUS_FLOW.indexOf("SHIPPED");
    const currentIndex = STATUS_FLOW.indexOf(order.status);
    const moveToShipped = currentIndex >= 0 && currentIndex < shippedIndex;

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          shippingProvider: "DELHIVERY",
          delhiveryAwb: created.awb,
          ...(moveToShipped ? { status: "SHIPPED" as const } : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      await tx.insert(orderEvents).values({
        orderId: order.id,
        status: moveToShipped ? "SHIPPED" : order.status,
        note: `Delhivery shipment created · AWB ${created.awb}`,
        actorId: admin.id,
      });

    });

    // Tell the customer it shipped (in-app + email + WhatsApp when configured).
    if (moveToShipped) {
      await notifyOrderEvent("SHIPPED", {
        userId: order.customer.id,
        orderNumber,
        email: order.customer.email,
        phone: order.customer.phone,
        awb: created.awb,
      });
    }

    return ok({
      orderNumber,
      awb: created.awb,
      trackingUrl: publicTrackingUrl(created.awb),
      movedToShipped: moveToShipped,
    });
  },
);

/** The Delhivery packing-slip / label link for an already-created shipment. */
export const GET = route(
  async (_request: Request, context: RouteContext<"/api/admin/orders/[orderNumber]/delhivery">) => {
    await requireAdmin();
    const { orderNumber } = await context.params;

    const order = await getAdminOrder(orderNumber);
    if (!order) throw new ApiError("NOT_FOUND", "That order does not exist.");
    if (!order.delhiveryAwb) throw new ApiError("BAD_REQUEST", "No Delhivery shipment on this order.");

    const label = await fetchLabel(order.delhiveryAwb);
    if (!label) throw new ApiError("BAD_REQUEST", "Delhivery did not return a label for this shipment.");
    return ok({ url: label.url });
  },
);

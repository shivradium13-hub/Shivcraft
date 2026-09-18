import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { allowedNext, type OrderStatus } from "@/server/admin/orders";
import { db } from "@/server/db";
import {
  inventoryMovements,
  notifications,
  orderEvents,
  orderItems,
  orders,
  payments,
  products,
} from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum([
    "CONFIRMED",
    "PROCESSING",
    "CUSTOMIZED",
    "PACKED",
    "SHIPPED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ]),
  note: z.string().trim().max(300).optional(),
});

/** What the customer is told for each step. */
const CUSTOMER_MESSAGE: Partial<Record<OrderStatus, { title: string; body: string; type: "ORDER_CONFIRMED" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_CANCELLED" }>> = {
  CONFIRMED: {
    type: "ORDER_CONFIRMED",
    title: "Order confirmed",
    body: "We are preparing your artwork proof.",
  },
  SHIPPED: {
    type: "ORDER_SHIPPED",
    title: "Order shipped",
    body: "Your parcel is on its way.",
  },
  DELIVERED: {
    type: "ORDER_DELIVERED",
    title: "Order delivered",
    body: "Hope you like it. A review would help other buyers.",
  },
  CANCELLED: {
    type: "ORDER_CANCELLED",
    title: "Order cancelled",
    body: "Your order was cancelled. Contact us if this was unexpected.",
  },
};

export const POST = route(
  async (request: Request, context: RouteContext<"/api/admin/orders/[orderNumber]/status">) => {
    const admin = await requireAdmin();
    const { orderNumber } = await context.params;
    const input = await readJson(request, schema);

    const rows = await db
      .select({ id: orders.id, status: orders.status, userId: orders.userId })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    const order = rows[0];
    if (!order) throw new ApiError("NOT_FOUND", "That order does not exist.");

    const permitted = allowedNext(order.status);
    if (!permitted.includes(input.status)) {
      throw new ApiError(
        "CONFLICT",
        order.status === "DELIVERED" || order.status === "CANCELLED"
          ? `This order is already ${order.status.toLowerCase()} and cannot be changed.`
          : `An order at "${order.status}" cannot move to "${input.status}".`,
      );
    }

    const restocked: { name: string; quantity: number }[] = [];

    await db.transaction(async (tx) => {
      if (input.status === "CANCELLED") {
        // Give the stock back — it was taken when the order was placed.
        const lines = await tx
          .select({
            productId: orderItems.productId,
            productName: orderItems.productName,
            quantity: orderItems.quantity,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        for (const line of lines) {
          if (!line.productId) continue; // product deleted since; nothing to restore
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} + ${line.quantity}`, updatedAt: new Date() })
            .where(eq(products.id, line.productId));

          await tx.insert(inventoryMovements).values({
            productId: line.productId,
            delta: line.quantity,
            reason: "ORDER_CANCELLED",
            orderId: order.id,
            actorId: admin.id,
          });

          restocked.push({ name: line.productName, quantity: line.quantity });
        }

        await tx
          .update(orders)
          .set({
            status: "CANCELLED",
            cancelReason: input.note ?? "Cancelled by the shop",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
      } else {
        await tx
          .update(orders)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }

      // Cash on delivery settles at the door.
      if (input.status === "DELIVERED") {
        await tx
          .update(payments)
          .set({ status: "PAID", updatedAt: new Date() })
          .where(and(eq(payments.orderId, order.id), eq(payments.status, "COD_PENDING")));
      }

      await tx.insert(orderEvents).values({
        orderId: order.id,
        status: input.status,
        note: input.note ?? null,
        actorId: admin.id,
      });

      const message = CUSTOMER_MESSAGE[input.status];
      if (message) {
        await tx.insert(notifications).values({
          userId: order.userId,
          type: message.type,
          title: `${message.title} · ${orderNumber}`,
          body: message.body,
          href: `/order/${orderNumber}`,
        });
      }
    });

    /* A cancelled order that was already PAID needs a real refund in Razorpay.
       We do NOT mark it refunded here — saying so without moving money would be
       a lie in the records. */
    const paid = await db
      .select({ id: payments.id, status: payments.status, method: payments.method })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);

    const refundOwed =
      input.status === "CANCELLED" && paid[0]?.status === "PAID" && paid[0]?.method !== "COD";

    return ok({
      orderNumber,
      status: input.status,
      restocked,
      refundOwed,
      refundNote: refundOwed
        ? "This order was paid online. Issue the refund from your Razorpay dashboard — it has not been refunded automatically."
        : null,
    });
  },
);

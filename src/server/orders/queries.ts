import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { orderEvents, orderItems, orders, payments } from "@/server/db/schema";

/** The customer-facing tracking steps, in order. Cancelled sits outside it. */
export const TRACKING_STEPS = [
  { key: "PLACED", label: "Order placed" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PROCESSING", label: "Processing" },
  { key: "CUSTOMIZED", label: "Personalised" },
  { key: "PACKED", label: "Packed" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

export async function getOrderForUser(orderNumber: string, userId: string) {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.userId, userId)))
    .limit(1);

  const order = rows[0];
  if (!order) return null;

  const [items, events, paymentRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.createdAt)),
    db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.createdAt))
      .limit(1),
  ]);

  return { ...order, items, events, payment: paymentRows[0] ?? null };
}

/**
 * An order for its invoice, readable by the customer who placed it OR any admin.
 *
 * The access rule lives here, not in the page, so the invoice route cannot
 * accidentally leak one customer's order to another: a non-admin only ever sees
 * an order whose `userId` is their own.
 */
export async function getOrderForInvoice(
  orderNumber: string,
  viewer: { id: string; role: "USER" | "ADMIN" },
) {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  const order = rows[0];
  if (!order) return null;
  if (viewer.role !== "ADMIN" && order.userId !== viewer.id) return null;

  const [items, paymentRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.createdAt))
      .limit(1),
  ]);

  return { ...order, items, payment: paymentRows[0] ?? null };
}

export async function listOrdersForUser(userId: string) {
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalP: orders.totalP,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.placedAt))
    .limit(50);
}

import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  orderEvents,
  orderItems,
  orders,
  payments,
  users,
  type orderStatusEnum,
} from "@/server/db/schema";

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

/** Forward-only, plus cancel. An order cannot go back a step, because the
 *  customer has already been told it moved on. */
export const STATUS_FLOW: OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "PROCESSING",
  "CUSTOMIZED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  CUSTOMIZED: "Personalised",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Which statuses an order in `current` may move to. */
export function allowedNext(current: OrderStatus): OrderStatus[] {
  if (current === "DELIVERED" || current === "CANCELLED") return [];
  const index = STATUS_FLOW.indexOf(current);
  return [...STATUS_FLOW.slice(index + 1), "CANCELLED"];
}

export async function listAdminOrders(options: {
  status?: OrderStatus | "ALL";
  query?: string;
  page: number;
  limit: number;
}) {
  const filters = [];

  if (options.status && options.status !== "ALL") {
    filters.push(eq(orders.status, options.status));
  }

  if (options.query) {
    const term = `%${options.query}%`;
    const clause = or(
      ilike(orders.orderNumber, term),
      ilike(orders.shipName, term),
      ilike(orders.shipPhone, term),
      ilike(users.email, term),
    );
    if (clause) filters.push(clause);
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalP: orders.totalP,
        placedAt: orders.placedAt,
        shipName: orders.shipName,
        shipCity: orders.shipCity,
        customerEmail: users.email,
        itemCount: sql<number>`(
          SELECT coalesce(sum(oi.quantity), 0)::int FROM order_items oi
          WHERE oi.order_id = ${orders.id}
        )`,
        hasCustomisation: sql<boolean>`EXISTS (
          SELECT 1 FROM order_items oi
          WHERE oi.order_id = ${orders.id} AND oi.customization IS NOT NULL
        )`,
        paymentStatus: sql<string | null>`(
          SELECT p.status FROM payments p
          WHERE p.order_id = ${orders.id}
          ORDER BY p.created_at DESC LIMIT 1
        )`,
        paymentMethod: sql<string | null>`(
          SELECT p.method FROM payments p
          WHERE p.order_id = ${orders.id}
          ORDER BY p.created_at DESC LIMIT 1
        )`,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(where)
      .orderBy(desc(orders.placedAt))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db.select({ n: count() }).from(orders).innerJoin(users, eq(users.id, orders.userId)).where(where),
  ]);

  return { rows, total: counted[0]?.n ?? 0 };
}

/** Counts per status, for the filter chips. */
export async function orderStatusCounts() {
  const rows = await db
    .select({ status: orders.status, n: count() })
    .from(orders)
    .groupBy(orders.status);

  const map = new Map<string, number>();
  let all = 0;
  for (const row of rows) {
    map.set(row.status, row.n);
    all += row.n;
  }
  return { map, all };
}

export async function getAdminOrder(orderNumber: string) {
  const rows = await db
    .select({
      order: orders,
      customerId: users.id,
      customerName: users.name,
      customerEmail: users.email,
      customerPhone: users.phone,
      customerSince: users.createdAt,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  const found = rows[0];
  if (!found) return null;

  const [items, events, paymentRows, otherOrders] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, found.order.id)),
    db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, found.order.id))
      .orderBy(asc(orderEvents.createdAt)),
    db
      .select()
      .from(payments)
      .where(eq(payments.orderId, found.order.id))
      .orderBy(desc(payments.createdAt)),
    db
      .select({ n: count() })
      .from(orders)
      .where(eq(orders.userId, found.customerId)),
  ]);

  return {
    ...found.order,
    customer: {
      id: found.customerId,
      name: found.customerName,
      email: found.customerEmail,
      phone: found.customerPhone,
      since: found.customerSince,
      orderCount: otherOrders[0]?.n ?? 0,
    },
    items,
    events,
    payments: paymentRows,
  };
}

/** Bulk-safe helper used by the list page's status chips. */
export async function ordersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(orders).where(inArray(orders.id, ids));
}

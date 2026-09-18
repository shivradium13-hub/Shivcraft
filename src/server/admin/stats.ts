import { and, count, eq, gte, inArray, sql, sum } from "drizzle-orm";

import { db } from "@/server/db";
import { orders, products, users } from "@/server/db/schema";

const OPEN_STATUSES = ["PLACED", "CONFIRMED", "PROCESSING", "CUSTOMIZED", "PACKED"] as const;

export type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;

/**
 * Dashboard figures (section 14). One source of truth for the admin page and
 * the /api/admin/stats endpoint, so the screen and the API can never disagree.
 *
 * Revenue counts delivered and in-flight orders but never cancelled ones.
 */
export async function getAdminStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    salesRow,
    todayRow,
    orderCountRow,
    pendingRow,
    completedRow,
    customerRow,
    productRow,
    lowStockRows,
  ] = await Promise.all([
    db
      .select({ total: sum(orders.totalP).mapWith(Number) })
      .from(orders)
      .where(sql`${orders.status} <> 'CANCELLED'`),
    db
      .select({ total: sum(orders.totalP).mapWith(Number), count: count() })
      .from(orders)
      .where(and(gte(orders.placedAt, startOfToday), sql`${orders.status} <> 'CANCELLED'`)),
    db.select({ count: count() }).from(orders),
    db.select({ count: count() }).from(orders).where(inArray(orders.status, [...OPEN_STATUSES])),
    db.select({ count: count() }).from(orders).where(eq(orders.status, "DELIVERED")),
    db.select({ count: count() }).from(users).where(eq(users.role, "USER")),
    db.select({ count: count() }).from(products).where(eq(products.isActive, true)),
    db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        stock: products.stock,
        threshold: products.lowStockThreshold,
      })
      .from(products)
      .where(
        and(eq(products.isActive, true), sql`${products.stock} <= ${products.lowStockThreshold}`),
      )
      .orderBy(products.stock)
      .limit(20),
  ]);

  return {
    totalSalesP: salesRow[0]?.total ?? 0,
    todaySalesP: todayRow[0]?.total ?? 0,
    todayOrders: todayRow[0]?.count ?? 0,
    totalOrders: orderCountRow[0]?.count ?? 0,
    pendingOrders: pendingRow[0]?.count ?? 0,
    completedOrders: completedRow[0]?.count ?? 0,
    totalCustomers: customerRow[0]?.count ?? 0,
    totalProducts: productRow[0]?.count ?? 0,
    lowStock: lowStockRows,
  };
}

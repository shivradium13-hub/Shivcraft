import { count, desc, eq, sum } from "drizzle-orm";

import { db } from "@/server/db";
import { orders, payments } from "@/server/db/schema";

export type AdminPayment = {
  id: string;
  orderNumber: string;
  orderStatus: string;
  method: string;
  status: string;
  amountP: number;
  gatewayPaymentId: string | null;
  gatewayOrderId: string | null;
  failureReason: string | null;
  createdAt: Date;
};

/** The most recent payments, newest first, joined to their order number so the
 *  admin can jump straight to the order. Read-only. */
export async function listAdminPayments(limit = 100): Promise<AdminPayment[]> {
  const rows = await db
    .select({
      id: payments.id,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      method: payments.method,
      status: payments.status,
      amountP: payments.amountP,
      gatewayPaymentId: payments.gatewayPaymentId,
      gatewayOrderId: payments.gatewayOrderId,
      failureReason: payments.failureReason,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);

  return rows;
}

export type PaymentTotals = {
  byStatus: Record<string, number>;
  /** Total value of PAID payments, in paise. */
  paidValueP: number;
  total: number;
};

/** Counts by status and the total captured value, across all payments. */
export async function paymentTotals(): Promise<PaymentTotals> {
  const rows = await db
    .select({ status: payments.status, n: count(), value: sum(payments.amountP) })
    .from(payments)
    .groupBy(payments.status);

  const byStatus: Record<string, number> = {};
  let paidValueP = 0;
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = r.n;
    total += r.n;
    if (r.status === "PAID") paidValueP = Number(r.value ?? 0);
  }
  return { byStatus, paidValueP, total };
}

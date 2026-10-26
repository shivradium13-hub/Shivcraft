import { and, eq, lt, ne, sql } from "drizzle-orm";

import { razorpayOrderPaid } from "@/server/payments/razorpay";
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

/**
 * Auto-cancel orders that were placed but never paid.
 *
 * An online order is written at PLACED with its payment PENDING, and only moves
 * to CONFIRMED once the Razorpay signature is verified. If the customer closes
 * the gateway, the order sits at PLACED forever, holding the stock it reserved.
 * This releases that stock after a grace window.
 *
 * It only ever touches orders that are:
 *   - still PLACED (never confirmed),
 *   - paid online (never COD),
 *   - with their payment still PENDING,
 *   - older than `windowHours`.
 *
 * And, crucially, before cancelling it checks Razorpay for a payment our verify
 * step might have missed (e.g. the browser closed before the callback). An order
 * the gateway reports as paid — or that it cannot confirm as unpaid — is left
 * alone and reported, never cancelled. So money that actually moved can never be
 * cancelled out from under the customer.
 */

/** Default grace period before an unpaid order is released. */
export const ABANDON_AFTER_HOURS = 24;

export type AbandonReport = {
  scanned: number;
  windowHours: number;
  dryRun: boolean;
  cancelled: string[];
  /** Still PENDING here but PAID at the gateway — needs manual reconciliation. */
  skippedPaid: string[];
  /** Could not confirm unpaid (Razorpay down / not configured) — left for next run. */
  skippedUnknown: string[];
};

export async function cancelAbandonedOrders(options?: {
  now?: Date;
  windowHours?: number;
  dryRun?: boolean;
}): Promise<AbandonReport> {
  const now = options?.now ?? new Date();
  const windowHours = options?.windowHours ?? ABANDON_AFTER_HOURS;
  const dryRun = options?.dryRun ?? false;
  const cutoff = new Date(now.getTime() - windowHours * 3600_000);

  const candidates = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      userId: orders.userId,
      paymentId: payments.id,
      gatewayOrderId: payments.gatewayOrderId,
    })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(orders.status, "PLACED"),
        lt(orders.placedAt, cutoff),
        ne(payments.method, "COD"),
        eq(payments.status, "PENDING"),
      ),
    );

  const report: AbandonReport = {
    scanned: candidates.length,
    windowHours,
    dryRun,
    cancelled: [],
    skippedPaid: [],
    skippedUnknown: [],
  };

  for (const c of candidates) {
    // No gateway order id means payment never reached Razorpay, so it is safe to
    // release. Otherwise ask the gateway, and only cancel a confirmed "unpaid".
    const state = c.gatewayOrderId ? await razorpayOrderPaid(c.gatewayOrderId) : "unpaid";
    if (state === "paid") {
      report.skippedPaid.push(c.orderNumber);
      continue;
    }
    if (state === "unknown") {
      report.skippedUnknown.push(c.orderNumber);
      continue;
    }

    if (dryRun) {
      report.cancelled.push(c.orderNumber);
      continue;
    }

    await db.transaction(async (tx) => {
      // Give the stock back — exactly as the admin cancel does (products only;
      // variant stock is not restored on cancel in this app).
      const lines = await tx
        .select({ productId: orderItems.productId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, c.orderId));

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
          orderId: c.orderId,
          actorId: null,
        });
      }

      await tx
        .update(orders)
        .set({
          status: "CANCELLED",
          cancelReason: "Payment not completed — auto-cancelled",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, c.orderId));

      await tx
        .update(payments)
        .set({
          status: "FAILED",
          failureReason: "Payment not completed before the order expired.",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, c.paymentId));

      await tx.insert(orderEvents).values({
        orderId: c.orderId,
        status: "CANCELLED",
        note: "Auto-cancelled: payment not completed",
        actorId: null,
      });

      // In-app notice only — no WhatsApp/email cost for an abandoned checkout.
      await tx.insert(notifications).values({
        userId: c.userId,
        type: "ORDER_CANCELLED",
        title: `Order ${c.orderNumber} cancelled`,
        body: "This order was cancelled because the payment wasn't completed. You can order again any time.",
        href: `/order/${c.orderNumber}`,
      });
    });

    report.cancelled.push(c.orderNumber);
  }

  return report;
}

import { and, eq } from "drizzle-orm";

import { formatPaise } from "@/lib/money";
import { db } from "@/server/db";
import { notifications, orderEvents, payments } from "@/server/db/schema";
import { isRazorpayConfigured, refundPayment } from "@/server/payments/razorpay";

export type RefundResult = {
  /** Money was actually sent back through Razorpay. */
  refunded: boolean;
  refundId: string | null;
  /** A manual refund is still owed (auto-refund not possible / failed). */
  refundOwed: boolean;
  /** Human message for the admin (shown after a status change). */
  note: string | null;
};

const NO_REFUND: RefundResult = { refunded: false, refundId: null, refundOwed: false, note: null };

/**
 * Auto-refund the online payment of a just-cancelled order.
 *
 * Only a genuinely online-paid order is refunded (PAID + not COD). The order's
 * status machine blocks cancelling an already-cancelled order, so this runs at
 * most once per order — the payment-status check is a second guard. If Razorpay
 * isn't configured, there's no captured payment id, or the refund call fails, we
 * do NOT mark anything refunded — we flag that a manual refund is owed, exactly
 * as before. Called OUTSIDE the cancel transaction: a refund hiccup must never
 * roll back the cancellation itself.
 */
export async function refundForCancelledOrder(input: {
  orderId: string;
  orderNumber: string;
  userId: string;
  actorId: string | null;
}): Promise<RefundResult> {
  const rows = await db
    .select({
      id: payments.id,
      status: payments.status,
      method: payments.method,
      amountP: payments.amountP,
      gatewayPaymentId: payments.gatewayPaymentId,
    })
    .from(payments)
    .where(eq(payments.orderId, input.orderId))
    .limit(1);

  const payment = rows[0];
  // Nothing captured online → nothing to refund (e.g. COD, or an unpaid order).
  if (!payment || payment.status !== "PAID" || payment.method === "COD") return NO_REFUND;

  if (!payment.gatewayPaymentId || !isRazorpayConfigured()) {
    return {
      refunded: false,
      refundId: null,
      refundOwed: true,
      note: "This order was paid online. Auto-refund isn't available here — issue the refund from your Razorpay dashboard.",
    };
  }

  let refundId: string;
  try {
    const refund = await refundPayment(payment.gatewayPaymentId, payment.amountP, {
      orderNumber: input.orderNumber,
      reason: "order_cancelled",
    });
    refundId = refund.id;
  } catch (error) {
    console.error("[refund] auto-refund failed:", error);
    return {
      refunded: false,
      refundId: null,
      refundOwed: true,
      note: "Automatic refund did not go through — issue it from your Razorpay dashboard. The money has NOT been returned yet.",
    };
  }

  // Money has moved. Record it best-effort — a bookkeeping hiccup must not make
  // us report the refund as failed (which could trigger a second, duplicate one).
  try {
    await db
      .update(payments)
      .set({ status: "REFUNDED", updatedAt: new Date() })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "PAID")));

    await db.insert(orderEvents).values({
      orderId: input.orderId,
      status: "CANCELLED",
      note: `Refund issued via Razorpay (${refundId})`,
      actorId: input.actorId,
    });

    await db.insert(notifications).values({
      userId: input.userId,
      type: "SYSTEM",
      title: `Refund issued for order ${input.orderNumber}`,
      body: `${formatPaise(payment.amountP)} has been refunded to your original payment method. It usually reaches you in 3–7 working days.`,
      href: `/order/${input.orderNumber}`,
    });
  } catch (error) {
    console.error("[refund] post-refund bookkeeping failed (money WAS refunded):", error);
  }

  return {
    refunded: true,
    refundId,
    refundOwed: false,
    note: `Refunded ${formatPaise(payment.amountP)} to the customer via Razorpay.`,
  };
}

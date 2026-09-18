import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { verifyRazorpaySignature } from "@/server/payments/razorpay";
import { db } from "@/server/db";
import { notifications, orderEvents, orders, payments } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  orderNumber: z.string().min(3).max(32),
  razorpayOrderId: z.string().min(3).max(120),
  razorpayPaymentId: z.string().min(3).max(120),
  signature: z.string().min(16).max(256),
});

/**
 * POST /api/checkout/verify
 *
 * The ONLY path that can mark an order paid, and it does so only after the
 * HMAC signature proves the callback came from Razorpay. A client claiming
 * success without a valid signature is rejected and the payment is recorded as
 * FAILED — this is what stops a forged "payment succeeded" request.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const input = await readJson(request, schema);

  const orderRows = await db
    .select({ id: orders.id, number: orders.orderNumber, status: orders.status })
    .from(orders)
    .where(and(eq(orders.orderNumber, input.orderNumber), eq(orders.userId, user.id)))
    .limit(1);

  const order = orderRows[0];
  if (!order) throw new ApiError("NOT_FOUND", "That order could not be found.");

  const paymentRows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.gatewayOrderId, input.razorpayOrderId)))
    .limit(1);

  const payment = paymentRows[0];
  if (!payment) throw new ApiError("NOT_FOUND", "No matching payment for that order.");

  // Replaying a verified payment must not double-confirm anything.
  if (payment.status === "PAID") {
    return ok({ orderNumber: order.number, alreadyConfirmed: true });
  }

  const genuine = verifyRazorpaySignature({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    signature: input.signature,
  });

  if (!genuine) {
    await db
      .update(payments)
      .set({
        status: "FAILED",
        failureReason: "Signature verification failed",
        gatewayPaymentId: input.razorpayPaymentId,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    console.error("[checkout] rejected payment with a bad signature", {
      order: order.number,
      razorpayPaymentId: input.razorpayPaymentId,
    });

    throw new ApiError(
      "BAD_REQUEST",
      "We could not verify that payment. If money left your account it will be refunded automatically — contact support with your order number.",
    );
  }

  await db
    .update(payments)
    .set({
      status: "PAID",
      gatewayPaymentId: input.razorpayPaymentId,
      gatewaySignature: input.signature,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  await db
    .update(orders)
    .set({ status: "CONFIRMED", updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  await db.insert(orderEvents).values({
    orderId: order.id,
    status: "CONFIRMED",
    note: "Payment received",
  });

  await db.insert(notifications).values({
    userId: user.id,
    type: "ORDER_CONFIRMED",
    title: `Order ${order.number} confirmed`,
    body: "Payment received. We will send your artwork proof within one working day.",
    href: `/order/${order.number}`,
  });

  return ok({ orderNumber: order.number, confirmed: true });
});

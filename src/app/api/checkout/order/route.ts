import { eq } from "drizzle-orm";
import { z } from "zod";

import { ApiError, created, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { placeOrder } from "@/server/orders/place";
import {
  createRazorpayOrder,
  getRazorpayConfig,
  isRazorpayConfigured,
} from "@/server/payments/razorpay";
import { db } from "@/server/db";
import { payments } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  addressId: z.string().uuid("Choose a delivery address."),
  method: z.enum(["UPI", "CARD", "NETBANKING", "WALLET", "COD"], {
    message: "Choose how you would like to pay.",
  }),
});

/**
 * POST /api/checkout/order
 *
 * Places the order and, for an online method, opens the matching gateway
 * order. The order exists in PLACED with payment PENDING — it is NOT marked
 * paid here. Only /api/checkout/verify, after checking Razorpay's signature,
 * can do that.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const input = await readJson(request, schema);

  if (input.method !== "COD" && !isRazorpayConfigured()) {
    throw new ApiError(
      "BAD_REQUEST",
      "Online payment is not available yet. Please choose Cash on Delivery.",
    );
  }

  const order = await placeOrder({ user, addressId: input.addressId, method: input.method });

  if (input.method === "COD") {
    return created({
      orderNumber: order.orderNumber,
      totalP: order.totalP,
      method: "COD" as const,
      requiresPayment: false,
    });
  }

  const config = getRazorpayConfig()!;

  try {
    const gatewayOrder = await createRazorpayOrder(order.totalP, order.orderNumber, {
      orderNumber: order.orderNumber,
    });

    await db
      .update(payments)
      .set({ gatewayOrderId: gatewayOrder.id, updatedAt: new Date() })
      .where(eq(payments.id, order.paymentId));

    return created({
      orderNumber: order.orderNumber,
      totalP: order.totalP,
      method: input.method,
      requiresPayment: true,
      razorpay: {
        keyId: config.keyId, // publishable by design
        orderId: gatewayOrder.id,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
      },
    });
  } catch {
    // The order stands with payment PENDING so stock stays reserved and the
    // customer can retry from the order page — rather than vanishing.
    await db
      .update(payments)
      .set({ status: "FAILED", failureReason: "Could not reach the payment gateway" })
      .where(eq(payments.id, order.paymentId));

    throw new ApiError(
      "SERVER_ERROR",
      `Order ${order.orderNumber} was created but the payment gateway did not respond. Open the order to try paying again.`,
    );
  }
});

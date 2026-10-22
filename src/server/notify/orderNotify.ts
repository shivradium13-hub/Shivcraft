import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { notifications, orderItems, orders, payments, users } from "@/server/db/schema";
import { sendEmail } from "@/server/notify/channels";
import { formatPaise } from "@/lib/money";
import type { WhatsappSettings } from "@/lib/whatsapp";
import { getWhatsappSettings } from "@/server/whatsapp/settings";
import { orderMessageAlreadySent, sendOrderTemplate } from "@/server/whatsapp/service";

export type OrderEvent =
  | "CONFIRMED"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "NDR";

type NotifyContext = {
  userId: string;
  orderNumber: string;
  /** For WhatsApp dedup + logging. */
  orderId?: string | null;
  email?: string | null;
  phone?: string | null;
  awb?: string | null;
};

type EventCopy = {
  /** Must be a value in notificationTypeEnum. */
  inAppType: "ORDER_CONFIRMED" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_CANCELLED";
  title: string;
  body: (ctx: NotifyContext) => string;
};

const COPY: Record<OrderEvent, EventCopy> = {
  CONFIRMED: {
    inAppType: "ORDER_CONFIRMED",
    title: "Order confirmed",
    body: () => "Payment received. We are preparing your artwork proof.",
  },
  SHIPPED: {
    inAppType: "ORDER_SHIPPED",
    title: "Order shipped",
    body: (c) => `Your parcel is on its way with Delhivery${c.awb ? `. Tracking number ${c.awb}.` : "."}`,
  },
  OUT_FOR_DELIVERY: {
    inAppType: "ORDER_SHIPPED",
    title: "Out for delivery",
    body: () => "Your parcel is out for delivery today.",
  },
  DELIVERED: {
    inAppType: "ORDER_DELIVERED",
    title: "Order delivered",
    body: () => "Hope you like it. A review would help other buyers.",
  },
  CANCELLED: {
    inAppType: "ORDER_CANCELLED",
    title: "Order cancelled",
    body: () => "Your order was cancelled. Contact us if this was unexpected.",
  },
  NDR: {
    inAppType: "ORDER_SHIPPED",
    title: "Delivery needs your help",
    body: () => "The courier could not deliver your parcel. Please check your tracking or contact us.",
  },
};

/** The admin toggle + approved template for the events WhatsApp covers (the four
 *  in the spec). Other events stay in-app + email only. */
function whatsappFor(event: OrderEvent, s: WhatsappSettings): { enabled: boolean; template: string } | null {
  switch (event) {
    case "CONFIRMED":
      return { enabled: s.notifyConfirmed, template: s.templateConfirmed };
    case "SHIPPED":
      return { enabled: s.notifyShipped, template: s.templateShipped };
    case "OUT_FOR_DELIVERY":
      return { enabled: s.notifyOutForDelivery, template: s.templateOutForDelivery };
    case "DELIVERED":
      return { enabled: s.notifyDelivered, template: s.templateDelivered };
    case "CANCELLED":
      return { enabled: s.notifyCancelled, template: s.templateCancelled };
    default:
      return null;
  }
}

/** One WhatsApp-safe line: no newlines/tabs, collapsed spaces, capped length. */
function oneLine(s: string, max = 120): string {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * The 6 body params for the owner's `order_cancelled` template:
 * {{1}} customer name, {{2}} order number, {{3}} product(s), {{4}} amount (the
 * template already prints the ₹), {{5}} cancellation reason, {{6}} refund status.
 * Read here (after the refund has run) so the refund status is current. Returns
 * null if the order can't be read — the message is then skipped rather than sent
 * with the wrong number of variables.
 */
export async function buildCancelledParams(orderId: string, orderNumber: string): Promise<string[] | null> {
  const [ord] = await db
    .select({ totalP: orders.totalP, cancelReason: orders.cancelReason, userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!ord) return null;

  const [[u], items, [pay]] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, ord.userId)).limit(1),
    db.select({ productName: orderItems.productName, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId)),
    db.select({ status: payments.status, method: payments.method }).from(payments).where(eq(payments.orderId, orderId)).limit(1),
  ]);

  const product = items.length
    ? oneLine(items.map((i) => `${i.productName} x${i.quantity}`).join(", "))
    : "your order";
  const amount = formatPaise(ord.totalP).replace("₹", "").trim();
  const refundStatus =
    pay?.status === "REFUNDED"
      ? "Refunded to your original payment (3-7 working days)"
      : pay && pay.method !== "COD" && pay.status === "PAID"
        ? "Refund is being processed"
        : "No online payment to refund";

  return [oneLine(u?.name || "Customer", 60), orderNumber, product, amount, oneLine(ord.cancelReason || "Cancelled"), refundStatus];
}

/**
 * One place every order update goes out from: the in-app notification (always),
 * plus email and WhatsApp when those channels are configured. Each channel is
 * best-effort — a failed send is logged, never thrown, so it cannot break the
 * status change that triggered it. WhatsApp is gated by the admin's master
 * switch and the per-status toggle, deduped per order+template, and recorded in
 * the message log (mock while delivery is restricted).
 */
export async function notifyOrderEvent(event: OrderEvent, ctx: NotifyContext): Promise<void> {
  const copy = COPY[event];
  const body = copy.body(ctx);
  const href = `/order/${ctx.orderNumber}`;

  // In-app — the one that always works.
  try {
    await db.insert(notifications).values({
      userId: ctx.userId,
      type: copy.inAppType,
      title: `${copy.title} · ${ctx.orderNumber}`,
      body,
      href,
    });
  } catch (error) {
    console.error("[notify] in-app insert failed:", error);
  }

  // Email (Resend) — only if configured.
  if (ctx.email) {
    const html = `<p>${body}</p><p>Order <strong>${ctx.orderNumber}</strong>.</p>`;
    void sendEmail(ctx.email, `${copy.title} · ${ctx.orderNumber}`, html);
  }

  // WhatsApp — only when enabled by the admin, toggled on, templated, and not a
  // duplicate for this order+event.
  if (!ctx.phone) return;
  const settings = await getWhatsappSettings();
  if (!settings.enabled) return;
  const wa = whatsappFor(event, settings);
  if (!wa || !wa.enabled || !wa.template) return;
  if (ctx.orderId && (await orderMessageAlreadySent(ctx.orderId, wa.template))) return;

  // The cancellation template carries full detail (6 variables); the others take
  // the order number + a one-line status.
  let bodyParams: string[];
  if (event === "CANCELLED") {
    const params = ctx.orderId ? await buildCancelledParams(ctx.orderId, ctx.orderNumber) : null;
    if (!params) return; // can't fill the detailed template — skip rather than mis-send
    bodyParams = params;
  } else {
    bodyParams = [ctx.orderNumber, body];
  }

  await sendOrderTemplate({
    phone: ctx.phone,
    template: wa.template,
    language: settings.templateLang,
    bodyParams,
    enabled: settings.enabled,
    userId: ctx.userId,
    orderId: ctx.orderId ?? null,
    orderNumber: ctx.orderNumber,
  });
}

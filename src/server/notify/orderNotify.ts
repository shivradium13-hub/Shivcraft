import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { sendEmail, sendWhatsAppTemplate } from "@/server/notify/channels";

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
  email?: string | null;
  phone?: string | null;
  awb?: string | null;
};

type EventCopy = {
  /** Must be a value in notificationTypeEnum. */
  inAppType: "ORDER_CONFIRMED" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_CANCELLED";
  title: string;
  body: (ctx: NotifyContext) => string;
  /** Env var holding the approved WhatsApp template name for this event. */
  whatsappTemplateEnv: string;
};

const COPY: Record<OrderEvent, EventCopy> = {
  CONFIRMED: {
    inAppType: "ORDER_CONFIRMED",
    title: "Order confirmed",
    body: () => "We are preparing your artwork proof.",
    whatsappTemplateEnv: "WHATSAPP_TEMPLATE_CONFIRMED",
  },
  SHIPPED: {
    inAppType: "ORDER_SHIPPED",
    title: "Order shipped",
    body: (c) => `Your parcel is on its way with Delhivery${c.awb ? `. Tracking number ${c.awb}.` : "."}`,
    whatsappTemplateEnv: "WHATSAPP_TEMPLATE_SHIPPED",
  },
  OUT_FOR_DELIVERY: {
    inAppType: "ORDER_SHIPPED",
    title: "Out for delivery",
    body: () => "Your parcel is out for delivery today.",
    whatsappTemplateEnv: "WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY",
  },
  DELIVERED: {
    inAppType: "ORDER_DELIVERED",
    title: "Order delivered",
    body: () => "Hope you like it. A review would help other buyers.",
    whatsappTemplateEnv: "WHATSAPP_TEMPLATE_DELIVERED",
  },
  CANCELLED: {
    inAppType: "ORDER_CANCELLED",
    title: "Order cancelled",
    body: () => "Your order was cancelled. Contact us if this was unexpected.",
    whatsappTemplateEnv: "WHATSAPP_TEMPLATE_CANCELLED",
  },
  NDR: {
    inAppType: "ORDER_SHIPPED",
    title: "Delivery needs your help",
    body: () => "The courier could not deliver your parcel. Please check your tracking or contact us.",
    whatsappTemplateEnv: "WHATSAPP_TEMPLATE_NDR",
  },
};

/**
 * One place every order update goes out from: the in-app notification (always),
 * plus email and WhatsApp when those channels are configured. Each channel is
 * best-effort — a failed send is logged, never thrown, so it cannot break the
 * status change that triggered it.
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

  // WhatsApp (approved template) — only if a template name is set for this event.
  const templateName = process.env[copy.whatsappTemplateEnv];
  if (ctx.phone && templateName) {
    // Template body params, in order: order number, then the status line.
    void sendWhatsAppTemplate(ctx.phone, templateName, [ctx.orderNumber, body]);
  }
}

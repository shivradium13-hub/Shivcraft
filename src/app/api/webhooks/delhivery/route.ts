import { and, eq, sql } from "drizzle-orm";

import { ApiError, ok, route } from "@/server/api/http";
import { db } from "@/server/db";
import { orderEvents, orders, users } from "@/server/db/schema";
import {
  authorisedDelhiveryWebhook,
  DELHIVERY_WEBHOOK_HEADER,
  parseDelhiveryScan,
  shouldAdvanceTo,
  targetStatusFromScan,
} from "@/server/delivery/webhookScan";
import { notifyOrderEvent } from "@/server/notify/orderNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delhivery B2C Scan Push webhook. The client must ask Delhivery to send
 * x-delhivery-webhook-token with the secret stored in DELHIVERY_WEBHOOK_SECRET.
 *
 * Acknowledgement is returned only after the status is durably committed.
 * The external WhatsApp and email calls happen after commit; if delivery is
 * slow, Delhivery can retry. Delivery deduplication uses the existing
 * order+template message log. The 500ms P99 target MUST be load-tested before
 * registering this production endpoint; for strict fast ACK a durable outbox
 * worker is still needed.
 */
export const POST = route(async (request: Request) => {
  const secret = process.env.DELHIVERY_WEBHOOK_SECRET;
  if (!secret) throw new ApiError("SERVICE_UNAVAILABLE", "Webhook is not configured.");
  if (!authorisedDelhiveryWebhook(secret, request.headers.get(DELHIVERY_WEBHOOK_HEADER))) {
    throw new ApiError("UNAUTHORIZED", "Invalid webhook authorization.");
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 16_384) {
    throw new ApiError("BAD_REQUEST", "Webhook payload too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid JSON.");
  }

  const scan = parseDelhiveryScan(body);
  if (!scan) throw new ApiError("BAD_REQUEST", "Invalid Delhivery Scan Push payload.");

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      userId: orders.userId,
      email: users.email,
      phone: users.phone,
      awb: orders.delhiveryAwb,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(orders.delhiveryAwb, scan.awb), eq(orders.shippingProvider, "DELHIVERY")))
    .limit(1);

  // Unknown AWBs aren't customer orders. Never expose order or customer PII.
  if (!order) return ok({ accepted: true, matched: false });

  const target = targetStatusFromScan(scan.status);
  let advanced = false;

  // Atomic conditional update prevents two simultaneous duplicate/reordered
  // scans from both advancing the same order and both sending a notification.
  // Always record the shipment scan text for display, even if it does not
  // advance the order. Do not regress a terminal order's stored status.
  const changed = await db.transaction(async (tx) => {
    if (!target) {
      await tx
        .update(orders)
        .set({ shipmentStatus: scan.status, updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), sql`${orders.status} <> 'DELIVERED' AND ${orders.status} <> 'CANCELLED'`));
      return false;
    }

    const updated = await tx
      .update(orders)
      .set({ status: target, shipmentStatus: scan.status, updatedAt: new Date() })
      .where(and(
        eq(orders.id, order.id),
        sql`case ${orders.status}
          when 'PLACED' then 0 when 'CONFIRMED' then 1 when 'PROCESSING' then 2
          when 'CUSTOMIZED' then 3 when 'PACKED' then 4 when 'SHIPPED' then 5
          when 'OUT_FOR_DELIVERY' then 6 else 99 end < ${target === "DELIVERED" ? 7 : 6}`,
      ))
      .returning({ id: orders.id });

    if (!updated.length) return false;

    await tx.insert(orderEvents).values({
      orderId: order.id,
      status: target,
      note: `Delhivery: ${scan.status}`,
      actorId: null,
    });
    return true;
  });
  advanced = changed;

  // The courier's scan alone does NOT establish collection of COD funds.
  // Payment reconciliation must come from verified courier remittance data.
  if (advanced && target && shouldAdvanceTo(order.status, target)) {
    await notifyOrderEvent(target, {
      userId: order.userId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      email: order.email,
      phone: order.phone,
      awb: order.awb,
    });
  }

  return ok({ accepted: true, advanced });
});

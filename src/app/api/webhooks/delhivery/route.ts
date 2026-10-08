import { and, eq } from "drizzle-orm";

import { ok, route } from "@/server/api/http";
import { STATUS_FLOW } from "@/server/admin/orders";
import { db } from "@/server/db";
import { orderEvents, orders, payments, users } from "@/server/db/schema";
import { notifyOrderEvent, type OrderEvent } from "@/server/notify/orderNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delhivery status push (webhook). Delhivery POSTs a status whenever a parcel
 * is scanned, so the order updates itself — no polling. Guarded by a shared
 * secret in the URL (?token=…) that matches DELHIVERY_WEBHOOK_SECRET; register
 * the URL with that token in Delhivery One. Disabled (401) until the secret is
 * set.
 *
 * NOTE: Delhivery's exact webhook body differs per account. This reads the
 * waybill and a status string from the common locations and stores the raw
 * status; confirm the shape against a real push and adjust `extract` if needed.
 */

type Classified = { event: OrderEvent | null; advanceTo: "OUT_FOR_DELIVERY" | "DELIVERED" | null };

function classify(status: string): Classified {
  const s = status.toLowerCase();
  if (s.includes("delivered") && !s.includes("undelivered")) {
    return { event: "DELIVERED", advanceTo: "DELIVERED" };
  }
  if (s.includes("out for delivery") || s.includes("out-for-delivery")) {
    return { event: "OUT_FOR_DELIVERY", advanceTo: "OUT_FOR_DELIVERY" };
  }
  if (s.includes("rto") || s.includes("return")) return { event: "NDR", advanceTo: null };
  if (s.includes("undelivered") || s.includes("ndr") || s.includes("not delivered")) {
    return { event: "NDR", advanceTo: null };
  }
  if (s.includes("transit") || s.includes("dispatched") || s.includes("manifest") || s.includes("picked")) {
    return { event: "SHIPPED", advanceTo: null };
  }
  return { event: null, advanceTo: null };
}

/** Pull the waybill + status from Delhivery's (variable) webhook body. */
function extract(body: unknown): { waybill: string | null; status: string | null } {
  const b = body as Record<string, unknown>;
  const shipment = (b?.Shipment ?? b?.shipment ?? b) as Record<string, unknown> | undefined;
  const statusObj = (shipment?.Status ?? shipment?.status) as Record<string, unknown> | undefined;
  const waybill =
    (shipment?.AWB as string) ?? (shipment?.Waybill as string) ?? (b?.waybill as string) ?? (b?.AWB as string) ?? null;
  const status =
    (statusObj?.Status as string) ?? (statusObj?.status as string) ?? (b?.status as string) ?? null;
  return { waybill: waybill ? String(waybill) : null, status: status ? String(status) : null };
}

export const POST = route(async (request: Request) => {
  const secret = process.env.DELHIVERY_WEBHOOK_SECRET;
  const token = new URL(request.url).searchParams.get("token");
  // Disabled until a secret is set; and only the matching token is accepted.
  if (!secret || token !== secret) return ok({ ignored: true });

  const body = await request.json().catch(() => null);
  const { waybill, status } = extract(body);
  if (!waybill || !status) return ok({ ignored: true });

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
    .where(eq(orders.delhiveryAwb, waybill))
    .limit(1);

  if (!order) return ok({ ignored: true });

  const { event, advanceTo } = classify(status);

  // Store the raw courier status, and advance the order only forward.
  const currentIndex = STATUS_FLOW.indexOf(order.status);
  const targetIndex = advanceTo ? STATUS_FLOW.indexOf(advanceTo) : -1;
  const shouldAdvance =
    advanceTo != null && currentIndex >= 0 && targetIndex > currentIndex && order.status !== "CANCELLED";

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ shipmentStatus: status, ...(shouldAdvance ? { status: advanceTo! } : {}), updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    if (shouldAdvance) {
      await tx.insert(orderEvents).values({
        orderId: order.id,
        status: advanceTo!,
        note: `Delhivery: ${status}`,
        actorId: null,
      });
      // Cash on delivery settles at the door.
      if (advanceTo === "DELIVERED") {
        await tx
          .update(payments)
          .set({ status: "PAID", updatedAt: new Date() })
          .where(and(eq(payments.orderId, order.id), eq(payments.status, "COD_PENDING")));
      }
    }
  });

  if (event) {
    await notifyOrderEvent(event, {
      userId: order.userId,
      orderNumber: order.orderNumber,
      email: order.email,
      phone: order.phone,
      awb: order.awb,
    });
  }

  return ok({ orderNumber: order.orderNumber, status, advanced: shouldAdvance });
});

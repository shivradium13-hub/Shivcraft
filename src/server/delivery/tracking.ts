import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { trackShipment, type TrackResult } from "@/server/delivery/delhivery";

/**
 * Pull the latest courier status for an order and store it, so the customer and
 * admin see the same thing without each hitting Delhivery. Returns null when
 * Delhivery is not configured, the order has no AWB, or the courier has no scan
 * yet — callers show an honest "no update yet" state rather than inventing one.
 */
export async function refreshOrderTracking(order: {
  id: string;
  delhiveryAwb: string | null;
}): Promise<TrackResult | null> {
  if (!order.delhiveryAwb) return null;

  const result = await trackShipment(order.delhiveryAwb);
  if (!result || !result.status) return null;

  await db
    .update(orders)
    .set({ shipmentStatus: result.status, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  return result;
}

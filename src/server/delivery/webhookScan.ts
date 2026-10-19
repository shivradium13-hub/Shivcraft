import { timingSafeEqual } from "node:crypto";

/**
 * Delhivery B2C Scan Push default payload, documented in the client's
 * "Scan Push webhook requirementdocument", version 2.0 (27 Feb 2024).
 * Delhivery must be configured with the corresponding header name and value.
 */
export const DELHIVERY_WEBHOOK_HEADER = "x-delhivery-webhook-token";

export type DelhiveryScan = {
  awb: string;
  status: string;
  scannedAt: string | null;
};

export type CourierOrderStatus = "OUT_FOR_DELIVERY" | "DELIVERED";

export function authorisedDelhiveryWebhook(configured: string | undefined, supplied: string | null): boolean {
  if (!configured || !supplied) return false;
  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Fail closed for unknown shapes rather than guessing fields or status meanings. */
export function parseDelhiveryScan(value: unknown): DelhiveryScan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const shipment = (value as Record<string, unknown>).Shipment;
  if (!shipment || typeof shipment !== "object" || Array.isArray(shipment)) return null;
  const s = shipment as Record<string, unknown>;
  const statusObject = s.Status;
  if (!statusObject || typeof statusObject !== "object" || Array.isArray(statusObject)) return null;
  const statusData = statusObject as Record<string, unknown>;
  const awb = s.AWB;
  const rawStatus = statusData.Status;
  if (typeof awb !== "string" || !/^[a-z0-9-]{6,40}$/i.test(awb.trim())) return null;
  if (typeof rawStatus !== "string" || !rawStatus.trim() || rawStatus.length > 60) return null;
  const date = statusData.StatusDateTime;
  if (date != null && (typeof date !== "string" || date.length > 80)) return null;

  return { awb: awb.trim(), status: rawStatus.trim(), scannedAt: typeof date === "string" ? date : null };
}

/**
 * Do not treat "Undelivered", "Dispatched", "NDR" or "RTO" as a successful
 * customer delivery. Further Delhivery scan codes need their own validated mapping.
 */
export function targetStatusFromScan(status: string): CourierOrderStatus | null {
  const normalized = status.toLowerCase().trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (normalized === "delivered") return "DELIVERED";
  if (normalized === "out for delivery") return "OUT_FOR_DELIVERY";
  return null;
}

const STATUS_FLOW = [
  "PLACED",
  "CONFIRMED",
  "PROCESSING",
  "CUSTOMIZED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

/** Monotonic transition check; duplicate, stale and terminal events are ignored. */
export function shouldAdvanceTo(current: string, target: CourierOrderStatus | null): boolean {
  if (!target || current === "CANCELLED" || current === "DELIVERED") return false;
  const from = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
  const to = STATUS_FLOW.indexOf(target);
  return from >= 0 && to > from;
}

import { inArray } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { formatPaise } from "@/lib/money";
import { STATUS_LABEL } from "@/server/admin/orders";
import { db } from "@/server/db";
import { orderItems, orders } from "@/server/db/schema";

import { buildDailyOrdersReport, istDayRange } from "./dailyOrders";

/**
 * A PDF of the day's orders WITH their product line items, for the owner.
 *
 * Standard PDF fonts (Helvetica) only cover Latin-1, so text is sanitised to a
 * single Latin-1 line — any other script (and the rupee sign) is replaced, which
 * keeps generation from throwing on an unexpected character. Money is shown as
 * "Rs" for the same reason. Read-only.
 */

/** One printable, single-line, Latin-1-safe string. */
function safe(s: string): string {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\xFF]/g, "?")
    .trim();
}
const money = (p: number) => formatPaise(p).replace("₹", "Rs ");

export async function buildDailyOrdersPdf(now: Date = new Date()): Promise<{ bytes: Uint8Array; filename: string }> {
  const report = await buildDailyOrdersReport(now);
  const { label } = istDayRange(now);

  // Pull the line items for the day's orders in one query, grouped by order.
  const ids = report.orders.length
    ? await db
        .select({ id: orders.id, orderNumber: orders.orderNumber })
        .from(orders)
        .where(inArray(orders.orderNumber, report.orders.map((o) => o.orderNumber)))
    : [];
  const idByNumber = new Map(ids.map((r) => [r.orderNumber, r.id]));
  const orderIds = ids.map((r) => r.id);
  const itemRows = orderIds.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          productName: orderItems.productName,
          quantity: orderItems.quantity,
          variantLabel: orderItems.variantLabel,
          customization: orderItems.customization,
          lineTotalP: orderItems.lineTotalP,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
    : [];
  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const it of itemRows) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push(it);
    itemsByOrder.set(it.orderId, arr);
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.09, 0.15);
  const muted = rgb(0.42, 0.45, 0.5);

  const PAGE = { w: 595, h: 842, margin: 40 };
  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;

  const newPageIfNeeded = (need: number) => {
    if (y - need < PAGE.margin) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };
  const line = (text: string, opts: { size?: number; bold?: boolean; color?: typeof ink; x?: number } = {}) => {
    const size = opts.size ?? 10;
    newPageIfNeeded(size + 4);
    y -= size + 4;
    page.drawText(safe(text), { x: opts.x ?? PAGE.margin, y, size, font: opts.bold ? bold : font, color: opts.color ?? ink });
  };

  line("Shiv Radium — Daily Orders", { size: 16, bold: true });
  line(label, { size: 11, color: muted });
  y -= 4;
  line(
    report.count === 0
      ? "No orders were placed on this day."
      : `${report.count} order(s) - ${report.paidCount} paid (${money(report.paidRevenueP)} collected), ${report.pendingPaymentCount} awaiting payment, ${report.cancelledCount} cancelled.`,
    { size: 10, color: muted },
  );
  y -= 6;

  for (const o of report.orders) {
    newPageIfNeeded(40);
    y -= 8;
    line(`${o.orderNumber}  -  ${o.customer}`, { size: 11, bold: true });
    line(`${STATUS_LABEL[o.status as keyof typeof STATUS_LABEL] ?? o.status} | ${o.payment ?? "-"} | ${money(o.totalP)}`, {
      size: 9,
      color: muted,
    });
    const items = itemsByOrder.get(idByNumber.get(o.orderNumber) ?? "") ?? [];
    for (const it of items) {
      const custom = it.customization
        ? Object.values(it.customization as Record<string, { label: string; type: string; value: string }>)
            .map((a) => `${a.label}: ${a.type === "IMAGE" ? "photo" : a.value}`)
            .join(", ")
        : "";
      const parts = [`- ${it.productName} x ${it.quantity}`, it.variantLabel || "", custom, money(it.lineTotalP)].filter(Boolean);
      line(parts.join("  |  "), { size: 9, x: PAGE.margin + 14 });
    }
  }

  const bytes = await pdf.save();
  return { bytes, filename: `shiv-radium-orders-${label.replace(/\s+/g, "-").toLowerCase()}.pdf` };
}

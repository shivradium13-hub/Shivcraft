import { and, asc, eq, gte, lt } from "drizzle-orm";

import { formatPaise } from "@/lib/money";
import { STATUS_LABEL } from "@/server/admin/orders";
import { db } from "@/server/db";
import { orders, payments } from "@/server/db/schema";

/**
 * The daily orders digest for the shop owner.
 *
 * "Today" is a calendar day in IST (UTC+5:30), so a report sent in the evening
 * covers the day the owner has just finished — not a UTC day that would split
 * across midnight. Everything is read-only.
 */

const IST_OFFSET_MIN = 330;

/** The UTC range [start, end) covering the IST calendar day that `now` falls in. */
export function istDayRange(now: Date): { start: Date; end: Date; label: string } {
  const istWall = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
  const y = istWall.getUTCFullYear();
  const m = istWall.getUTCMonth();
  const d = istWall.getUTCDate();
  const startMs = Date.UTC(y, m, d, 0, 0, 0) - IST_OFFSET_MIN * 60000;
  const start = new Date(startMs);
  const end = new Date(startMs + 24 * 60 * 60 * 1000);
  const label = new Date(Date.UTC(y, m, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start, end, label };
}

export type DailyOrdersReport = {
  dateLabel: string;
  count: number;
  paidCount: number;
  paidRevenueP: number;
  pendingPaymentCount: number;
  cancelledCount: number;
  byStatus: { status: string; label: string; count: number }[];
  orders: { orderNumber: string; customer: string; totalP: number; status: string; payment: string | null }[];
  subject: string;
  html: string;
  text: string;
};

export async function buildDailyOrdersReport(now: Date = new Date()): Promise<DailyOrdersReport> {
  const { start, end, label } = istDayRange(now);

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      customer: orders.shipName,
      totalP: orders.totalP,
      status: orders.status,
      payment: payments.status,
    })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(and(gte(orders.placedAt, start), lt(orders.placedAt, end)))
    .orderBy(asc(orders.orderNumber));

  const count = rows.length;
  const paid = rows.filter((r) => r.payment === "PAID");
  const paidRevenueP = paid.reduce((sum, r) => sum + r.totalP, 0);
  const pendingPaymentCount = rows.filter((r) => r.payment === "PENDING" || r.payment == null).length;
  const cancelledCount = rows.filter((r) => r.status === "CANCELLED").length;

  const statusTally = new Map<string, number>();
  for (const r of rows) statusTally.set(r.status, (statusTally.get(r.status) ?? 0) + 1);
  const byStatus = [...statusTally.entries()].map(([status, c]) => ({
    status,
    label: STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status,
    count: c,
  }));

  const subject = `Shiv Radium — ${count} order${count === 1 ? "" : "s"} on ${label}`;

  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

  const headline =
    count === 0
      ? `No orders were placed on ${label}.`
      : `${count} order${count === 1 ? "" : "s"} placed on ${label}. ` +
        `${paid.length} paid (${formatPaise(paidRevenueP)} collected)` +
        `${pendingPaymentCount ? `, ${pendingPaymentCount} awaiting payment` : ""}` +
        `${cancelledCount ? `, ${cancelledCount} cancelled` : ""}.`;

  const rowsHtml = rows
    .map(
      (r) =>
        `<tr>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600">${esc(r.orderNumber)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.customer)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatPaise(r.totalP)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.payment ?? "—")}</td>` +
        `</tr>`,
    )
    .join("");

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">` +
    `<h1 style="font-size:18px;margin:0 0 6px">Daily orders — ${esc(label)}</h1>` +
    `<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px">${esc(headline)}</p>` +
    (count === 0
      ? ""
      : `<table style="width:100%;border-collapse:collapse;font-size:13px">` +
        `<thead><tr>` +
        ["Order", "Customer", "Amount", "Status", "Payment"]
          .map(
            (h, i) =>
              `<th style="padding:6px 10px;border-bottom:2px solid #ddd;text-align:${i === 2 ? "right" : "left"};font-size:11px;text-transform:uppercase;color:#6b7280">${h}</th>`,
          )
          .join("") +
        `</tr></thead><tbody>${rowsHtml}</tbody></table>`) +
    `<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Automatic daily summary from your Shiv Radium admin.</p>` +
    `</div>`;

  const text =
    `Daily orders — ${label}\n${headline}\n\n` +
    (count === 0
      ? ""
      : rows
          .map((r) => `${r.orderNumber}  ${r.customer}  ${formatPaise(r.totalP)}  ${STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}  ${r.payment ?? "—"}`)
          .join("\n") + "\n\n") +
    `Automatic daily summary from your Shiv Radium admin.`;

  return {
    dateLabel: label,
    count,
    paidCount: paid.length,
    paidRevenueP,
    pendingPaymentCount,
    cancelledCount,
    byStatus,
    orders: rows.map((r) => ({ orderNumber: r.orderNumber, customer: r.customer, totalP: r.totalP, status: r.status, payment: r.payment })),
    subject,
    html,
    text,
  };
}

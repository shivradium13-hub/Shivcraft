import type { Metadata } from "next";
import Link from "next/link";

import { PaymentStatus } from "@/components/admin/PaymentStatus";
import { formatPaise } from "@/lib/money";
import { listAdminPayments, paymentTotals } from "@/server/admin/payments";
import { requireAdmin } from "@/server/auth/guards";
import { razorpayStatus } from "@/server/payments/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };

/** Colour for each payment status badge. */
const STATUS_TONE: Record<string, string> = {
  PAID: "bg-success-soft text-success",
  AUTHORIZED: "bg-sr-gold-soft text-sr-gold",
  PENDING: "bg-sr-canvas text-sr-muted",
  COD_PENDING: "bg-sr-canvas text-sr-muted",
  FAILED: "bg-danger-soft text-danger",
  REFUNDED: "bg-sr-canvas text-sr-body",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] ?? "bg-sr-canvas text-sr-body"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const [status, rows, totals] = await Promise.all([
    Promise.resolve(razorpayStatus()),
    listAdminPayments(),
    paymentTotals(),
  ]);

  const cards: { label: string; value: string }[] = [
    { label: "Captured (paid)", value: formatPaise(totals.paidValueP) },
    { label: "Paid", value: String(totals.byStatus.PAID ?? 0) },
    { label: "Failed", value: String(totals.byStatus.FAILED ?? 0) },
    {
      label: "Pending",
      value: String((totals.byStatus.PENDING ?? 0) + (totals.byStatus.COD_PENDING ?? 0)),
    },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Payments</h1>
      <p className="mt-1 text-sm text-sr-muted">
        Payment gateway status and every payment attempt, newest first.
      </p>

      <div className="mt-4">
        <PaymentStatus status={status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-card border border-sr-line bg-sr-surface p-4">
            <p className="text-xs font-medium text-sr-muted">{c.label}</p>
            <p className="mt-1 font-display text-xl font-semibold text-sr-ink tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto rounded-card border border-sr-line bg-sr-surface">
        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-sr-muted">No payments yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-sr-line text-left text-xs text-sr-muted">
                <th className="px-4 py-2.5 font-semibold">Order</th>
                <th className="px-4 py-2.5 font-semibold">Amount</th>
                <th className="px-4 py-2.5 font-semibold">Method</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Gateway payment ID</th>
                <th className="px-4 py-2.5 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-sr-line last:border-b-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/orders/${p.orderNumber}`}
                      className="font-medium text-sr-600 hover:underline"
                    >
                      {p.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-sr-ink">{formatPaise(p.amountP)}</td>
                  <td className="px-4 py-2.5 text-sr-body">{p.method}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={p.status} />
                    {p.failureReason ? (
                      <span className="mt-0.5 block text-[11px] text-danger">{p.failureReason}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-sr-muted">
                    {p.gatewayPaymentId ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-sr-muted">
                    {new Date(p.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

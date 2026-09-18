import type { Metadata } from "next";
import Link from "next/link";

import { formatPaise } from "@/lib/money";
import {
  STATUS_LABEL,
  listAdminOrders,
  orderStatusCounts,
  type OrderStatus,
} from "@/server/admin/orders";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };

const PAGE_SIZE = 20;

const STATUS_TONE: Record<string, string> = {
  PLACED: "bg-sr-100 text-sr-700",
  CONFIRMED: "bg-info-soft text-info",
  PROCESSING: "bg-info-soft text-info",
  CUSTOMIZED: "bg-sr-gold-soft text-sr-gold",
  PACKED: "bg-sr-gold-soft text-sr-gold",
  SHIPPED: "bg-info-soft text-info",
  OUT_FOR_DELIVERY: "bg-info-soft text-info",
  DELIVERED: "bg-success-soft text-success",
  CANCELLED: "bg-danger-soft text-danger",
};

const PAYMENT_TONE: Record<string, string> = {
  PAID: "text-success",
  PENDING: "text-warn",
  FAILED: "text-danger",
  COD_PENDING: "text-sr-muted",
  REFUNDED: "text-sr-muted",
};

const CHIPS: (OrderStatus | "ALL")[] = [
  "ALL",
  "PLACED",
  "CONFIRMED",
  "PROCESSING",
  "CUSTOMIZED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  await requireAdmin();
  const search = await props.searchParams;

  const status = (typeof search.status === "string" ? search.status : "ALL") as OrderStatus | "ALL";
  const query = typeof search.q === "string" ? search.q.trim() : "";
  const page = Math.max(1, Number(typeof search.page === "string" ? search.page : 1) || 1);

  const [{ rows, total }, counts] = await Promise.all([
    listAdminOrders({ status, query, page, limit: PAGE_SIZE }),
    orderStatusCounts(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Filters live in the URL so a filtered view is shareable and refreshable. */
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = {
      status: status === "ALL" ? undefined : status,
      q: query || undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const qs = params.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Orders</h1>
      <p className="mt-1 text-sm text-sr-muted">
        {total} matching {total === 1 ? "order" : "orders"}
      </p>

      <form action="/admin/orders" className="mt-4 flex flex-wrap gap-2">
        {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
        <input
          name="q"
          defaultValue={query}
          placeholder="Order number, customer name, phone or email"
          className="min-w-0 flex-1 rounded-lg border border-sr-line-strong bg-sr-surface px-3 py-2 text-sm outline-none focus:border-sr-400"
        />
        <button
          type="submit"
          className="rounded-lg bg-sr-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Search
        </button>
        {query ? (
          <Link
            href={href({ q: undefined, page: undefined })}
            className="rounded-lg border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => {
          const n = chip === "ALL" ? counts.all : (counts.map.get(chip) ?? 0);
          const active = status === chip;
          return (
            <Link
              key={chip}
              href={href({ status: chip === "ALL" ? undefined : chip, page: undefined })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-sr-500 bg-sr-500 text-white"
                  : "border-sr-line-strong bg-sr-surface text-sr-body hover:border-sr-300"
              }`}
            >
              {chip === "ALL" ? "All" : STATUS_LABEL[chip]}
              {n > 0 ? <span className="ml-1.5 tabular-nums opacity-70">{n}</span> : null}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-sr-line-strong bg-sr-surface px-6 py-12 text-center text-sm text-sr-muted">
          No orders match this filter.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-sr-line bg-sr-surface">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-sr-line bg-sr-canvas text-left">
                {["Order", "Customer", "Date", "Items", "Amount", "Payment", "Status", ""].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-3 py-2.5 text-[11px] font-semibold tracking-wide text-sr-muted uppercase"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-sr-line last:border-0 hover:bg-sr-canvas">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/orders/${row.orderNumber}`}
                      className="font-semibold text-sr-600 hover:underline"
                    >
                      {row.orderNumber}
                    </Link>
                    {row.hasCustomisation ? (
                      <span className="ml-1.5 rounded bg-sr-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-sr-gold">
                        CUSTOM
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-sr-ink">{row.shipName}</span>
                    <span className="block text-xs text-sr-muted">{row.customerEmail}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-sr-muted">
                    {new Date(row.placedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.itemCount}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">
                    {formatPaise(row.totalP)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-xs font-semibold ${
                      PAYMENT_TONE[row.paymentStatus ?? ""] ?? "text-sr-muted"
                    }`}
                  >
                    {row.paymentStatus ?? "—"}
                    <span className="block font-normal text-sr-muted">
                      {row.paymentMethod ?? ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        STATUS_TONE[row.status] ?? ""
                      }`}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/admin/orders/${row.orderNumber}`}
                      className="rounded-lg border border-sr-line-strong px-2.5 py-1 text-xs font-semibold text-sr-body hover:border-sr-400 hover:text-sr-600"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="mt-4 flex justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href({ page: n === 1 ? undefined : String(n) })}
              aria-current={n === page ? "page" : undefined}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                n === page
                  ? "border-sr-500 bg-sr-500 text-white"
                  : "border-sr-line-strong text-sr-body"
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { formatPaise } from "@/lib/money";
import { ProductImage } from "@/components/ui/primitives";
import { getMyOrders } from "@/server/account/queries";
import { requireUser } from "@/server/auth/guards";
import { STATUS_LABEL } from "@/server/admin/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My orders", robots: { index: false, follow: false } };

/* Same four weights as the admin list, so a customer and the shop owner are
   reading the same order in the same language. */
const TONE: Record<string, string> = {
  PLACED: "border border-brand-600 text-brand-700",
  CONFIRMED: "bg-info-soft text-info",
  PROCESSING: "bg-info-soft text-info",
  CUSTOMIZED: "bg-brand-50 text-brand-700",
  PACKED: "bg-brand-50 text-brand-700",
  SHIPPED: "bg-info-soft text-info",
  OUT_FOR_DELIVERY: "bg-info-soft text-info",
  DELIVERED: "bg-success text-white",
  CANCELLED: "bg-danger text-white",
};

export default async function MyOrdersPage() {
  const user = await requireUser();
  const orders = await getMyOrders(user.id);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">My orders</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        {orders.length === 0
          ? "Nothing here yet."
          : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
      </p>

      {orders.length === 0 ? (
        <div className="rounded-card border border-dashed border-field bg-field-bg px-6 py-14 text-center">
          <span aria-hidden="true" className="text-3xl">📦</span>
          <h2 className="mt-3 font-display text-xl font-semibold text-ink">No orders yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            When you order something, it appears here with live tracking from the workshop to your
            door.
          </p>
          <Link
            href="/categories"
            className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/order/${order.orderNumber}`}
                className="flex gap-3 rounded-card border border-line bg-paper p-3 transition hover:border-brand-300 hover:shadow-card"
              >
                <span className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                  <ProductImage src={order.firstImage} alt="" sizes="64px" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-brand-700">
                      {order.orderNumber}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        TONE[order.status] ?? ""
                      }`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </span>

                  <span className="mt-1 block truncate text-sm font-medium text-ink">
                    {order.firstItem ?? "Order"}
                    {Number(order.itemCount) > 1 ? (
                      <span className="text-muted"> +{Number(order.itemCount) - 1} more</span>
                    ) : null}
                  </span>

                  <span className="mt-0.5 block text-xs text-muted">
                    Placed{" "}
                    {new Date(order.placedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {order.paymentStatus ? ` · ${order.paymentStatus.replace("_", " ").toLowerCase()}` : ""}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-ink tabular-nums">
                    {formatPaise(order.totalP)}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-brand-700">Track →</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

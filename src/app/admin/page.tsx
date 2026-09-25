import type { Metadata } from "next";
import Link from "next/link";

import { formatPaise } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { getAdminStats } from "@/server/admin/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function AdminDashboard() {
  // The layout already gated this route; calling it again keeps the page safe
  // on its own if it is ever moved.
  await requireAdmin();
  const stats = await getAdminStats();

  const cards = [
    { label: "Total sales", value: formatPaise(stats.totalSalesP), hint: "excluding cancelled" },
    { label: "Today's sales", value: formatPaise(stats.todaySalesP), hint: `${stats.todayOrders} orders today` },
    { label: "Total orders", value: String(stats.totalOrders) },
    { label: "Pending orders", value: String(stats.pendingOrders), hint: "not yet delivered" },
    { label: "Completed orders", value: String(stats.completedOrders) },
    { label: "Customers", value: String(stats.totalCustomers) },
    { label: "Live products", value: String(stats.totalProducts) },
    {
      label: "Low stock",
      value: String(stats.lowStock.length),
      hint: "at or below threshold",
      alert: stats.lowStock.length > 0,
    },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-sr-muted">Live figures, read straight from the database.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-sr-line bg-sr-surface p-4 shadow-sr-card">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-sr-muted uppercase">
              {card.label}
            </p>
            <p
              className={`mt-2 font-display text-2xl leading-none tabular-nums ${
                card.alert ? "text-danger" : "text-sr-ink"
              }`}
            >
              {card.value}
            </p>
            {card.hint ? <p className="mt-1.5 text-[11px] text-sr-muted">{card.hint}</p> : null}
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Low stock</h2>
        {stats.lowStock.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-sr-line bg-sr-surface px-4 py-8 text-center text-sm text-sr-muted">
            Nothing is running low. Everything is above its reorder threshold.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-2xl border border-sr-line bg-sr-surface">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="border-b border-sr-line bg-sr-soft text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-sr-muted uppercase">
                    Product
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-sr-muted uppercase">
                    In stock
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-sr-muted uppercase">
                    Threshold
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.lowStock.map((row) => (
                  <tr key={row.id} className="border-b border-sr-line last:border-0">
                    <td className="px-4 py-2.5 text-sm">
                      <Link href={`/product/${row.slug}`} className="text-sr-600 hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-danger tabular-nums">
                      {row.stock}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-sr-muted tabular-nums">{row.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Quick actions</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { href: "/admin/products/new", label: "Add product", hint: "New listing or Frame Designer" },
            { href: "/admin/orders", label: "Orders", hint: "Track and update" },
            { href: "/admin/payments", label: "Payments", hint: "Gateway & attempts" },
            { href: "/admin/storefront", label: "Storefront", hint: "Show / hide / reorder" },
            { href: "/admin/coupons", label: "Coupons", hint: "Discount codes" },
            { href: "/admin/categories", label: "Categories", hint: "Menu & homepage" },
            { href: "/admin/banners", label: "Banners", hint: "Hero & offers" },
            { href: "/admin/settings", label: "Settings", hint: "Shipping, tax, business" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl border border-sr-line bg-sr-surface p-4 transition hover:border-sr-400 hover:shadow-sr-card"
            >
              <p className="text-sm font-semibold text-sr-ink">{link.label}</p>
              <p className="mt-0.5 text-[11px] text-sr-muted">{link.hint}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

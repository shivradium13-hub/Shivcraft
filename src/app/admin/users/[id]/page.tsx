import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserControls } from "@/components/admin/UserControls";
import { formatPaise } from "@/lib/money";
import { STATUS_LABEL } from "@/server/admin/orders";
import { getAdminUser } from "@/server/admin/users";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customer", robots: { index: false, follow: false } };

export default async function AdminUserPage(props: PageProps<"/admin/users/[id]">) {
  const admin = await requireAdmin();
  const { id } = await props.params;

  const user = await getAdminUser(id);
  if (!user) notFound();

  return (
    <div>
      <Link href="/admin/users" className="text-sm text-sr-muted hover:text-sr-700">
        ← All customers
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sr-ink">{user.name}</h1>
          <p className="mt-0.5 text-sm text-sr-muted">
            {user.email}
            {user.phone ? ` · ${user.phone}` : ""}
          </p>
        </div>
        <span className="flex gap-1.5">
          {user.role === "ADMIN" ? (
            <span className="rounded-full bg-sr-100 px-2.5 py-1 text-xs font-semibold text-sr-700">
              Admin
            </span>
          ) : null}
          {user.isBlocked ? (
            <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
              Blocked
            </span>
          ) : null}
        </span>
      </div>

      <UserControls
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isBlocked: user.isBlocked,
          orderCount: user.orderCount,
        }}
        isSelf={user.id === admin.id}
      />

      <dl className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Orders" value={String(user.orderCount)} />
        <Stat label="Lifetime spend" value={formatPaise(user.lifetimeSpendP)} />
        <Stat label="Reviews" value={String(user.reviewCount)} />
        <Stat label="Joined" value={new Date(user.createdAt).toLocaleDateString("en-IN")} />
      </dl>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Recent orders</h2>
        {user.orders.length === 0 ? (
          <p className="mt-2 rounded-card border border-dashed border-field bg-field-bg px-4 py-6 text-center text-sm text-sr-muted">
            This account has never placed an order.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {user.orders.map((order) => (
              <li key={order.orderNumber}>
                <Link
                  href={`/admin/orders/${order.orderNumber}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-sr-line bg-sr-surface px-4 py-3 text-sm transition hover:border-sr-400"
                >
                  <span className="font-semibold text-sr-ink">{order.orderNumber}</span>
                  <span className="text-sr-muted">{STATUS_LABEL[order.status]}</span>
                  {order.paymentStatus ? (
                    <span className="text-sr-muted">{order.paymentStatus}</span>
                  ) : null}
                  <span className="ml-auto font-semibold text-sr-ink">
                    {formatPaise(order.totalP)}
                  </span>
                  <span className="text-xs text-sr-muted">
                    {new Date(order.placedAt).toLocaleDateString("en-IN")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Saved addresses</h2>
        {user.addresses.length === 0 ? (
          <p className="mt-2 text-sm text-sr-muted">None saved.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {user.addresses.map((address) => (
              <li
                key={address.id}
                className="rounded-card border border-sr-line bg-sr-surface px-4 py-3 text-sm"
              >
                <p className="font-semibold text-sr-ink">{address.fullName}</p>
                <p className="text-sr-body">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                  {address.area ? `, ${address.area}` : ""}
                </p>
                <p className="text-sr-body">
                  {address.city}, {address.state} {address.pincode}
                </p>
                <p className="mt-1 text-xs text-sr-muted">{address.phone}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Sign-in sessions</h2>
        {/* Counts and devices only. The token hash is never selected, so it
            cannot reach this page even by accident. */}
        <p className="mt-1 text-sm text-sr-muted">
          {user.sessions.length === 0
            ? "Not signed in on any device right now."
            : `Signed in on ${user.sessions.length} ${user.sessions.length === 1 ? "device" : "devices"}. Blocking this account ends all of them.`}
        </p>
        {user.sessions.length > 0 ? (
          <ul className="mt-2 grid gap-1 text-xs text-sr-muted">
            {user.sessions.map((session) => (
              <li key={session.id} className="truncate">
                {session.userAgent ?? "Unknown device"} · expires{" "}
                {new Date(session.expiresAt).toLocaleDateString("en-IN")}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-sr-line bg-sr-surface px-4 py-3">
      <dt className="text-xs tracking-wide text-sr-muted uppercase">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold text-sr-ink">{value}</dd>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { ProfileForm } from "@/components/shop/ProfileForm";
import { formatPaise } from "@/lib/money";
import { getAccountSummary } from "@/server/account/queries";
import { requireUser } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const user = await requireUser();
  const summary = await getAccountSummary(user.id);

  const tiles = [
    { label: "Orders", value: String(summary.orders), href: "/account/orders" },
    { label: "Wishlist", value: String(summary.wishlist), href: "/account/wishlist" },
    { label: "Addresses", value: String(summary.addresses), href: "/account/addresses" },
    { label: "Lifetime spend", value: formatPaise(summary.lifetimeSpendP), href: "/account/orders" },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        Hello, {user.name.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm text-muted">{user.email}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-card border border-line bg-paper p-4 transition hover:border-brand-300 hover:shadow-card"
          >
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              {tile.label}
            </p>
            <p className="mt-2 font-display text-2xl leading-none text-ink tabular-nums">
              {tile.value}
            </p>
          </Link>
        ))}
      </div>

      <section className="mt-6 rounded-card border border-line bg-paper p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Your details</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted">
          Your email identifies the account and cannot be changed here.
        </p>
        <ProfileForm initial={{ name: user.name, email: user.email, phone: user.phone ?? "" }} />
      </section>
    </div>
  );
}

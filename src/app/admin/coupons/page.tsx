import type { Metadata } from "next";

import { CouponManager } from "@/components/admin/CouponManager";
import { formatPaise } from "@/lib/money";
import { adminCategoryTree } from "@/server/admin/catalog";
import { couponSummary, listAdminCoupons } from "@/server/admin/promos";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coupons", robots: { index: false, follow: false } };

export default async function AdminCouponsPage() {
  await requireAdmin();

  const [coupons, summary, tree] = await Promise.all([
    listAdminCoupons(),
    couponSummary(),
    adminCategoryTree(),
  ]);

  /* Every category, not only subcategories: a coupon's category is compared
     against whatever category the cart's products actually sit in. */
  const categories = tree.flatMap((top) => [
    { id: top.id, label: top.name },
    ...top.children.map((child) => ({ id: child.id, label: `${top.name} → ${child.name}` })),
  ]);

  const liveCount = coupons.filter((c) => c.live).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Coupons</h1>
      <p className="mt-1 text-sm text-sr-muted">
        {coupons.length} {coupons.length === 1 ? "coupon" : "coupons"}, {liveCount} usable right now.
        Codes are checked again when the order is placed, so a coupon that runs out mid-checkout is
        not honoured.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Redemptions" value={String(summary.redemptions)} />
        <Stat label="Given away" value={formatPaise(summary.givenAwayP)} />
        <Stat label="Live codes" value={String(liveCount)} />
      </dl>

      <div className="mt-6">
        <CouponManager
          coupons={coupons.map((coupon) => ({
            ...coupon,
            startsAt: coupon.startsAt?.toISOString() ?? null,
            endsAt: coupon.endsAt?.toISOString() ?? null,
          }))}
          categories={categories}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-sr-line bg-sr-surface px-4 py-3">
      <dt className="text-xs tracking-wide text-sr-muted uppercase">{label}</dt>
      <dd className="mt-1 font-display text-xl font-semibold text-sr-ink">{value}</dd>
    </div>
  );
}

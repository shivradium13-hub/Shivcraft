import type { Metadata } from "next";

import { StorefrontForm } from "@/components/admin/StorefrontForm";
import { requireAdmin } from "@/server/auth/guards";
import { getStorefrontSettings } from "@/server/settings/storefront";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Storefront", robots: { index: false, follow: false } };

export default async function AdminStorefrontPage() {
  await requireAdmin();
  const storefront = await getStorefrontSettings();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Storefront</h1>
      <p className="mt-1 mb-6 max-w-prose text-sm text-sr-muted">
        Control what appears on the homepage and product pages — no code needed. Changes take effect
        on the next page load; nothing here changes prices, orders or products themselves.
      </p>

      <StorefrontForm initial={storefront} />
    </div>
  );
}

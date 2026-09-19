import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/SettingsForm";
import { requireAdmin } from "@/server/auth/guards";
import { getAllSettings } from "@/server/settings/shop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const { shipping, tax, support } = await getAllSettings();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Shop settings</h1>
      <p className="mt-1 mb-6 max-w-prose text-sm text-sr-muted">
        Everything here is read by the storefront. Changes apply to the next cart the shop prices —
        orders already placed keep the charges they were placed with.
      </p>

      <SettingsForm
        initial={{
          shipping: {
            flatRate: String(shipping.flatRateP / 100),
            freeAbove: String(shipping.freeAboveP / 100),
            originPincode: shipping.originPincode,
            codEnabled: shipping.codEnabled,
          },
          tax: {
            gstPercent: String(tax.gstPercent),
            pricesIncludeTax: tax.pricesIncludeTax,
          },
          support,
        }}
      />
    </div>
  );
}

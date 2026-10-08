import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";
import { PaymentStatus } from "@/components/admin/PaymentStatus";
import { DeliveryStatus } from "@/components/admin/DeliveryStatus";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { requireAdmin } from "@/server/auth/guards";
import { delhiveryStatus } from "@/server/delivery/delhivery";
import { razorpayStatus } from "@/server/payments/razorpay";
import { getAllSettings } from "@/server/settings/shop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function AdminSettingsPage() {
  const admin = await requireAdmin();
  const { shipping, tax, support, business } = await getAllSettings();
  // Read on the server; only booleans and a test/live label reach the page.
  const payments = razorpayStatus();
  const delivery = delhiveryStatus();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Shop settings</h1>
      <p className="mt-1 mb-6 max-w-prose text-sm text-sr-muted">
        Everything here is read by the storefront. Changes apply to the next cart the shop prices —
        orders already placed keep the charges they were placed with.
      </p>

      <div className="mb-6 grid gap-4">
        <PaymentStatus status={payments} />
        <DeliveryStatus status={delivery} />
      </div>

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
          business,
        }}
      />

      <div className="mt-8">
        <ChangePasswordForm email={admin.email} />
      </div>
    </div>
  );
}

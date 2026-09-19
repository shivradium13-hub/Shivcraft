import type { Metadata } from "next";

import { BannerManager } from "@/components/admin/BannerManager";
import { BANNER_PLACEMENTS, listAdminBanners } from "@/server/admin/promos";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Banners", robots: { index: false, follow: false } };

export default async function AdminBannersPage() {
  await requireAdmin();
  const banners = await listAdminBanners();
  const onSite = banners.filter((b) => b.onSite).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Homepage banners</h1>
      <p className="mt-1 text-sm text-sr-muted">
        {banners.length} in total, {onSite} currently on the homepage. Each placement shows a fixed
        number of banners; the rest sit in the queue until you reorder or switch one off.
      </p>

      <div className="mt-6">
        <BannerManager
          banners={banners.map((banner) => ({
            ...banner,
            startsAt: banner.startsAt?.toISOString() ?? null,
            endsAt: banner.endsAt?.toISOString() ?? null,
          }))}
          placements={BANNER_PLACEMENTS.map((p) => ({ ...p }))}
        />
      </div>
    </div>
  );
}

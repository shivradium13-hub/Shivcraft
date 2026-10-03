import { BottomNav } from "@/components/shop/BottomNav";
import { Footer } from "@/components/shop/Footer";
import { Header } from "@/components/shop/Header";
import { PromoPopup } from "@/components/shop/PromoPopup";
import { ShopShell } from "@/components/shop/ShopShell";
import { getCategoryTree } from "@/server/catalog/categories";
import { getStorefrontSettings } from "@/server/settings/storefront";

/**
 * The storefront chrome. The category tree is read once here and shared by the
 * header's mega-menu (desktop) and the mobile drawer, so both always agree and a
 * category the admin adds appears in both on the next request.
 */
export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const [categories, storefront] = await Promise.all([getCategoryTree(), getStorefrontSettings()]);

  return (
    <ShopShell categories={categories}>
      <Header
        categories={categories}
        logoHeight={storefront.logoHeight}
        logoHeightMobile={storefront.logoHeightMobile}
      />
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
        <main className="min-w-0">{children}</main>
      </div>
      <Footer
        logoHeight={storefront.footerLogoHeight}
        logoHeightMobile={storefront.footerLogoHeightMobile}
      />
      <BottomNav />
      <PromoPopup config={storefront.popup} />
    </ShopShell>
  );
}

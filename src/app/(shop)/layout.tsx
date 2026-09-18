import { BottomNav } from "@/components/shop/BottomNav";
import { CategorySidebar } from "@/components/shop/CategorySidebar";
import { Footer } from "@/components/shop/Footer";
import { Header } from "@/components/shop/Header";
import { ShopShell } from "@/components/shop/ShopShell";
import { getCategoryTree } from "@/server/catalog/categories";

/**
 * The storefront chrome. The category tree is read once here and shared by the
 * desktop sidebar and the mobile drawer, so both always agree and a category
 * the admin adds appears in both on the next request.
 */
export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const categories = await getCategoryTree();

  return (
    <ShopShell categories={categories}>
      <Header />
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5">
        <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
          <CategorySidebar categories={categories} />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
      <Footer />
      <BottomNav />
    </ShopShell>
  );
}

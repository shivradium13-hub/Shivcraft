import type { Metadata } from "next";

import { CategoryManager } from "@/components/admin/CategoryManager";
import { adminCategoryTree } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Categories", robots: { index: false, follow: false } };

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const tree = await adminCategoryTree();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Categories</h1>
      <p className="mt-1 mb-5 max-w-2xl text-sm text-sr-muted">
        This is the menu customers browse. Adding, renaming, reordering or hiding a category here
        changes the storefront on the next request — nothing else needs updating.
      </p>
      <CategoryManager tree={tree} />
    </div>
  );
}

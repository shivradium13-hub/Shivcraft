import type { Metadata } from "next";
import Link from "next/link";

import { EMPTY_PRODUCT, ProductForm } from "@/components/admin/ProductForm";
import { subcategoryOptions } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New product", robots: { index: false, follow: false } };

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await subcategoryOptions();

  return (
    <div>
      <Link href="/admin/products" className="text-sm font-semibold text-sr-600 hover:underline">
        ← All products
      </Link>
      <h1 className="mt-3 mb-5 font-display text-2xl font-semibold text-sr-ink">New product</h1>
      <ProductForm initial={EMPTY_PRODUCT} categories={categories} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm, type ProductFormValues } from "@/components/admin/ProductForm";
import { readConfig } from "@/lib/customizer/schema";
import { subcategoryOptions } from "@/server/admin/catalog";
import { getAdminProduct, productOrderCount } from "@/server/admin/products";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/admin/products/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const product = await getAdminProduct(id);
  return {
    title: product ? `Edit ${product.name}` : "Product not found",
    robots: { index: false, follow: false },
  };
}

export default async function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await props.params;

  const product = await getAdminProduct(id);
  if (!product) notFound();

  const [categories, orderCount] = await Promise.all([
    subcategoryOptions(),
    productOrderCount(id),
  ]);

  // Whether the Frame Designer is live (enabled) and whether a template exists.
  const customizerConfig = readConfig(product.customizer);

  /* Paise back to rupees for the form; the API converts the other way. */
  const initial: ProductFormValues = {
    name: product.name,
    sku: product.sku,
    categoryId: product.categoryId,
    shortDescription: product.shortDescription ?? "",
    description: product.description ?? "",
    price: String(product.priceP / 100),
    discountPrice: product.discountPriceP ? String(product.discountPriceP / 100) : "",
    stock: String(product.stock),
    lowStockThreshold: String(product.lowStockThreshold),
    brand: product.brand ?? "",
    material: product.material ?? "",
    color: product.color ?? "",
    size: product.size ?? "",
    weightGrams: product.weightGrams ? String(product.weightGrams) : "",
    occasion: product.occasion ?? "",
    tags: product.tags.join(", "),
    videoUrl: product.videoUrl ?? "",
    isPersonalizable: product.isPersonalizable,
    isActive: product.isActive,
    isBestSeller: product.isBestSeller,
    isTrending: product.isTrending,
    metaTitle: product.metaTitle ?? "",
    metaDescription: product.metaDescription ?? "",
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt ?? "",
      isPrimary: image.isPrimary,
    })),
    customizationFields: product.customizationFields.map((field) => ({
      id: field.id,
      type: field.type,
      label: field.label,
      helpText: field.helpText ?? "",
      isRequired: field.isRequired,
      maxLength: field.maxLength,
      options: field.options,
    })),
  };

  return (
    <div>
      <Link href="/admin/products" className="text-sm font-semibold text-sr-600 hover:underline">
        ← All products
      </Link>

      <div className="mt-3 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sr-ink">{product.name}</h1>
          <p className="mt-1 text-sm text-sr-muted">
            {product.sku}
            {orderCount > 0
              ? ` · in ${orderCount} order line${orderCount === 1 ? "" : "s"}`
              : " · never ordered"}
          </p>
        </div>
        <Link
          href={`/product/${product.slug}`}
          target="_blank"
          className="rounded-full border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body hover:border-sr-400 hover:text-sr-700"
        >
          View on storefront ↗
        </Link>
      </div>

      <ProductForm
        productId={product.id}
        initial={initial}
        categories={categories}
        orderCount={orderCount}
        customizerEnabled={customizerConfig.enabled}
        customizerConfigured={customizerConfig.views.length > 0}
      />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomizerBuilder } from "@/components/admin/CustomizerBuilder";
import { readConfig } from "@/lib/customizer/schema";
import { effectivePriceP } from "@/lib/money";
import { getAdminProduct } from "@/server/admin/products";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Frame Designer",
  robots: { index: false, follow: false },
};

/**
 * The customizer builder lives on its own page rather than inside the product
 * form, which already has enough on it. The product form links here.
 */
export default async function ProductCustomizerPage(
  props: PageProps<"/admin/products/[id]/customizer">,
) {
  await requireAdmin();
  const { id } = await props.params;

  const product = await getAdminProduct(id);
  if (!product) notFound();

  const config = readConfig(product.customizer);
  const images = product.images.map((image) => image.url);

  return (
    <div>
      <Link href={`/admin/products/${id}`} className="text-sm text-sr-muted hover:text-sr-600">
        ← Back to {product.name}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sr-ink">Frame Designer</h1>
          <p className="mt-1 max-w-prose text-sm text-sr-muted">
            Build the template for {product.name} — place image boxes, text boxes and frames, then
            decide what the customer may change. The preview here is the same renderer the customer
            uses.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            config.enabled ? "bg-success-soft text-success" : "bg-sr-canvas text-sr-muted"
          }`}
        >
          {config.enabled ? `Live · version ${config.version}` : "Not customisable"}
        </span>
      </div>

      {images.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-field bg-sr-surface px-4 py-8 text-center text-sm text-sr-muted">
          Add at least one product image first — the customer needs something to design against.
        </p>
      ) : (
        <div className="mt-6">
          <CustomizerBuilder
            productId={product.id}
            productName={product.name}
            initial={config}
            productImages={images}
            basePriceP={effectivePriceP(product)}
          />
        </div>
      )}
    </div>
  );
}

import Link from "next/link";

import { discountPercent, effectivePriceP, formatPaise } from "@/lib/money";
import type { ProductCard as ProductCardData } from "@/server/catalog/queries";

import { Badge, ProductImage, Stars } from "../ui/primitives";

const CARD_SIZES = "(min-width: 1280px) 220px, (min-width: 1024px) 20vw, (min-width: 640px) 30vw, 45vw";

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardData;
  priority?: boolean;
}) {
  const price = effectivePriceP(product);
  const off = discountPercent(product);
  const outOfStock = product.stock <= 0;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-paper shadow-card transition hover:shadow-lift">
      <Link href={`/product/${product.slug}`} className="relative block aspect-[4/5] overflow-hidden bg-brand-50">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          sizes={CARD_SIZES}
          priority={priority}
          className="transition duration-300 group-hover:scale-[1.04]"
        />
        <span className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {product.isBestSeller ? <Badge tone="marigold">Best Seller</Badge> : null}
          {product.isPersonalizable ? <Badge tone="brand">Personalise</Badge> : null}
        </span>
        {outOfStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/55">
            <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink">
              Out of stock
            </span>
          </span>
        ) : null}
      </Link>

      {/* Wishlist is wired up in the account milestone; the control is hidden
          rather than shown as a button that does nothing. */}

      <div className="flex flex-1 flex-col p-3">
        <Link
          href={`/product/${product.slug}`}
          className="line-clamp-2 text-sm leading-snug font-medium text-ink hover:text-brand-700"
        >
          {product.name}
        </Link>

        {product.ratingCount > 0 ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Stars rating={product.rating} />
            <span className="text-[11px] text-muted">
              {product.rating} ({product.ratingCount})
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted">New arrival</p>
        )}

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-base font-bold text-ink">{formatPaise(price)}</span>
          {off > 0 ? (
            <>
              <span className="text-xs text-muted line-through">{formatPaise(product.priceP)}</span>
              <span className="text-xs font-semibold text-success">{off}% OFF</span>
            </>
          ) : null}
        </div>

        {product.stock > 0 && product.stock <= 5 ? (
          <p className="mt-1 text-[11px] font-medium text-danger">
            Only {product.stock} left
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  products: ProductCardData[];
  priorityCount?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} priority={i < priorityCount} />
      ))}
    </div>
  );
}

export function ProductRail({ products }: { products: ProductCardData[] }) {
  return (
    <div className="gc-rail gc-hide-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {products.map((product) => (
        <div key={product.id} className="w-[46%] shrink-0 sm:w-[30%] lg:w-[23%] xl:w-[18.5%]">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}

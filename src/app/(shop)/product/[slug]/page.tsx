import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { discountPercent, effectivePriceP, formatPaise } from "@/lib/money";
import { PincodeCheck } from "@/components/shop/PincodeCheck";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { ProductPurchase } from "@/components/shop/ProductPurchase";
import { ProductRail } from "@/components/shop/ProductCard";
import { SectionHeading, Stars } from "@/components/ui/primitives";
import { getProductBySlug, getRelatedProducts } from "@/server/catalog/product";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  return {
    // An admin-set meta title is used verbatim; otherwise the layout template
    // appends the brand, so the product name alone goes in here.
    title: product.metaTitle ? { absolute: product.metaTitle } : product.name,
    description: product.metaDescription ?? product.shortDescription ?? undefined,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.shortDescription ?? undefined,
      type: "website",
    },
  };
}

export default async function ProductPage(props: PageProps<"/product/[slug]">) {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product.categoryId, product.id);
  const price = effectivePriceP(product);
  const off = discountPercent(product);

  const specs = [
    ["Material", product.material],
    ["Colour", product.color],
    ["Size", product.size],
    ["Occasion", product.occasion],
    ["Brand", product.brand],
    ["SKU", product.sku],
    ["Weight", product.weightGrams ? `${product.weightGrams} g` : null],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  /* Structured data so the listing can show price and rating in search. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription ?? undefined,
    sku: product.sku,
    brand: { "@type": "Brand", name: product.brand ?? "GiftCraft" },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: (price / 100).toFixed(2),
      availability:
        product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };

  return (
    <div className="pb-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Link href="/" className="hover:text-brand-700">Home</Link>
        <span aria-hidden="true">/</span>
        {product.parent ? (
          <>
            <Link href={`/category/${product.parent.slug}`} className="hover:text-brand-700">
              {product.parent.name}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <Link href={`/category/${product.category.slug}`} className="hover:text-brand-700">
          {product.category.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="line-clamp-1 font-medium text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[88px] lg:self-start">
          <ProductGallery images={product.images} name={product.name} />
        </div>

        <div>
          <h1 className="font-display text-2xl leading-tight font-semibold text-ink sm:text-3xl">
            {product.name}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {product.ratingCount > 0 ? (
              <span className="flex items-center gap-1.5">
                <Stars rating={product.rating} />
                <span className="text-sm text-muted">
                  {product.rating} · {product.ratingCount} review
                  {product.ratingCount === 1 ? "" : "s"}
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted">No reviews yet</span>
            )}
            {product.isPersonalizable ? (
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                Personalisable
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-3xl font-semibold text-ink">{formatPaise(price)}</span>
            {off > 0 ? (
              <>
                <span className="text-base text-muted line-through">{formatPaise(product.priceP)}</span>
                <span className="rounded-md bg-success-soft px-2 py-0.5 text-sm font-semibold text-success">
                  {off}% OFF
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">Inclusive of all taxes</p>

          <div className="mt-5 rounded-card border border-marigold-200 bg-marigold-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-brand-800">Available offers</p>
            <ul className="mt-1.5 space-y-1 text-xs text-ink-soft">
              <li>
                <strong className="text-ink">WELCOME150</strong> — ₹150 off your first order above ₹799
              </li>
              <li>
                <strong className="text-ink">GIFT20</strong> — 20% off up to ₹400 on orders above ₹999
              </li>
            </ul>
          </div>

          <div className="mt-6">
            <ProductPurchase product={product} />
          </div>

          <div className="mt-6">
            <PincodeCheck />
          </div>

          {product.description ? (
            <section className="mt-8">
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">
                About this product
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
                {product.description.split("\n\n").map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null}

          {specs.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">Specifications</h2>
              <dl className="overflow-hidden rounded-card border border-line">
                {specs.map(([label, value], i) => (
                  <div
                    key={label}
                    className={`flex gap-4 px-4 py-2.5 text-sm ${i % 2 === 0 ? "bg-paper" : "bg-canvas"}`}
                  >
                    <dt className="w-28 shrink-0 text-muted">{label}</dt>
                    <dd className="min-w-0 font-medium text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>

      {product.reviews.length > 0 ? (
        <section className="mt-12">
          <SectionHeading eyebrow="Ratings & reviews" title={`What buyers say about this`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {product.reviews.map((review) => (
              <figure key={review.id} className="rounded-card border border-line bg-paper p-4">
                <Stars rating={review.rating} />
                {review.title ? (
                  <figcaption className="mt-2 text-sm font-semibold text-ink">{review.title}</figcaption>
                ) : null}
                <blockquote className="mt-1.5 text-sm text-ink-soft">{review.body}</blockquote>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-ink">{review.author}</span>
                  {review.verified ? (
                    <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">
                      Verified purchase
                    </span>
                  ) : null}
                  <span>{new Date(review.createdAt).toLocaleDateString("en-IN")}</span>
                </p>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="mt-12">
          <SectionHeading eyebrow="You may also like" title={`More from ${product.category.name}`} />
          <ProductRail products={related} />
        </section>
      ) : null}
    </div>
  );
}

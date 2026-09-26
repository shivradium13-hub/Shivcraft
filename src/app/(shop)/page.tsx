import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import { CategoryGrid } from "@/components/shop/CategoryGrid";
import { ProductGrid, ProductRail } from "@/components/shop/ProductCard";
import { EmptyState, ProductImage, SectionHeading, Stars } from "@/components/ui/primitives";
import type { HomeSectionId } from "@/lib/storefront";
import { getHomepage } from "@/server/catalog/home";
import { getStorefrontSettings } from "@/server/settings/storefront";

export const dynamic = "force-dynamic";

/* A small glyph per promise card, matched to the admin-editable list by
   position. Text is admin-controlled; the decorative icon stays in code. */
const PROMISE_ICONS = ["✦", "✎", "⛉", "➤", "◷", "☎", "✚", "❖", "✺"];

export default async function HomePage() {
  const [{ hero, offers, categories, trending, bestSellers, personalised, testimonials }, storefront] =
    await Promise.all([getHomepage(), getStorefrontSettings()]);

  const promises = storefront.promises;

  /* The headline picks out its last word in orange. Splitting here rather than
     asking the admin to write markup keeps the banner form a plain text field. */
  const words = (hero?.title ?? "").trim().split(/\s+/);
  const heroAccent = words.length > 1 ? ` ${words[words.length - 1]}` : "";
  const heroLead = words.length > 1 ? words.slice(0, -1).join(" ") : (hero?.title ?? "");

  /* Each homepage block, keyed by id. The admin decides the order and which are
     shown (in Storefront settings); a block still hides itself when it has no
     data, so an enabled-but-empty section never renders an empty shell. */
  const renderers: Record<HomeSectionId, () => ReactNode> = {
    categories: () =>
      categories.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Browse" title="Shop by category" />
          <CategoryGrid categories={categories} />
        </section>
      ) : null,

    trending: () =>
      trending.length > 0 ? (
        <section>
          <SectionHeading
            eyebrow="Moving fast"
            title="Trending right now"
            action={
              <Link href="/search?sort=popularity" className="text-sm font-semibold text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          <ProductRail products={trending} />
        </section>
      ) : null,

    offers: () =>
      offers.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {offers.map((offer) => (
            <Link
              key={offer.id}
              href={offer.href ?? "/search"}
              className="flex items-center gap-4 overflow-hidden rounded-card border border-marigold-200 bg-marigold-50 p-5 transition hover:shadow-card"
            >
              <div className="min-w-0">
                <h3 className="font-display text-lg leading-snug font-semibold text-brand-800">
                  {offer.title}
                </h3>
                {offer.subtitle ? (
                  <p className="mt-1 text-sm text-ink-soft">{offer.subtitle}</p>
                ) : null}
                <span className="mt-3 inline-block text-sm font-semibold text-brand-700">
                  {offer.ctaLabel ?? "Shop offers"} →
                </span>
              </div>
              <div className="relative ml-auto hidden aspect-square w-24 shrink-0 overflow-hidden rounded-lg sm:block">
                <ProductImage src={offer.imageUrl} alt="" sizes="96px" />
              </div>
            </Link>
          ))}
        </section>
      ) : null,

    bestSellers: () =>
      bestSellers.length > 0 ? (
        <section>
          <SectionHeading
            eyebrow="Loved by customers"
            title="Best sellers"
            action={
              <Link href="/search?sort=rating" className="text-sm font-semibold text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          <ProductGrid products={bestSellers.slice(0, 10)} />
        </section>
      ) : null,

    personalised: () =>
      personalised.length > 0 ? (
        <section className="rounded-card border border-line bg-paper p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-brand-600 uppercase">
                Make it theirs
              </p>
              <h2 className="mt-1.5 font-display text-2xl leading-tight font-semibold text-ink sm:text-[1.75rem]">
                Personalised gifts, made from your photo
              </h2>
              <ol className="mt-4 space-y-2.5 text-sm text-ink-soft">
                <li><strong className="text-ink">1.</strong> Upload a photo and type the name.</li>
                <li><strong className="text-ink">2.</strong> Pick a font, colour and size.</li>
                <li><strong className="text-ink">3.</strong> Approve the proof we send you.</li>
                <li><strong className="text-ink">4.</strong> We make it and ship it, tracked.</li>
              </ol>
              <Link
                href="/search?personalized=true"
                className="mt-5 inline-block rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Start customising
              </Link>
            </div>
            <ProductRail products={personalised} />
          </div>
        </section>
      ) : null,

    promises: () =>
      promises.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Why Shiv Radium" title="What you get, every order" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {promises.map((promise, i) => (
              <div key={i} className="rounded-card border border-line bg-paper p-4">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
                >
                  {PROMISE_ICONS[i % PROMISE_ICONS.length]}
                </span>
                <h3 className="mt-2.5 text-sm font-semibold text-ink">{promise.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">{promise.body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null,

    testimonials: () =>
      testimonials.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Customer reviews" title="What buyers say" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((review) => (
              <figure key={review.id} className="rounded-card border border-line bg-paper p-4">
                <Stars rating={review.rating} />
                {review.title ? (
                  <figcaption className="mt-2 text-sm font-semibold text-ink">
                    {review.title}
                  </figcaption>
                ) : null}
                <blockquote className="mt-1.5 line-clamp-4 text-sm text-ink-soft">
                  {review.body}
                </blockquote>
                <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="font-medium text-ink">{review.author}</span>
                  {review.verified ? (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
                      Verified purchase
                    </span>
                  ) : null}
                </p>
                <Link
                  href={`/product/${review.productSlug}`}
                  className="mt-1.5 block truncate text-xs text-brand-700 hover:underline"
                >
                  on {review.productName}
                </Link>
              </figure>
            ))}
          </div>
        </section>
      ) : null,
  };

  return (
    <div className="space-y-10 pb-4">
      {/* ---------------------------------------------------------- hero */}
      {/* Light ground, near-black heading, orange only on the highlighted word
          and the call to action. A full orange panel here would spend most of
          the page's colour budget before anything has been sold. */}
      {hero ? (
        <section className="overflow-hidden rounded-card border border-line-strong bg-soft">
          <div className="grid items-center gap-6 p-6 sm:p-9 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-brand-600 uppercase">
                Handmade to order
              </p>
              <h1 className="mt-2 font-display text-3xl leading-[1.08] font-semibold text-ink sm:text-4xl lg:text-[2.9rem]">
                {heroLead}
                {heroAccent ? <span className="text-brand-600">{heroAccent}</span> : null}
              </h1>
              {hero.subtitle ? (
                <p className="mt-3 max-w-md text-sm text-ink-soft sm:text-base">{hero.subtitle}</p>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={hero.href ?? "/search"}
                  className="gc-cta rounded-full px-6 py-3 text-sm font-semibold transition"
                >
                  {hero.ctaLabel ?? "Shop Now"}
                </Link>
                <Link
                  href="/search?personalized=true"
                  className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-night-soft"
                >
                  Customize Your Gift
                </Link>
              </div>
            </div>

            <div className="relative hidden aspect-[4/3] overflow-hidden rounded-xl lg:block">
              <ProductImage
                src={hero.imageUrl}
                alt=""
                sizes="(min-width: 1024px) 420px, 0px"
                priority
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* The rest of the homepage, in the admin-chosen order and visibility. */}
      {storefront.home.map(({ id, enabled }) =>
        enabled ? <Fragment key={id}>{renderers[id]()}</Fragment> : null,
      )}

      {trending.length === 0 && bestSellers.length === 0 ? (
        <EmptyState
          title="The shelves are empty"
          message="No products are published yet. Add some from the admin panel and they will appear here straight away."
        />
      ) : null}
    </div>
  );
}

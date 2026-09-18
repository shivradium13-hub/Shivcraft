import Link from "next/link";

import { ProductGrid, ProductRail } from "@/components/shop/ProductCard";
import { EmptyState, ProductImage, SectionHeading, Stars } from "@/components/ui/primitives";
import { getHomepage } from "@/server/catalog/home";

export const dynamic = "force-dynamic";

const PROMISES = [
  { title: "Premium quality", body: "Seasoned wood, SS304 and 3 mm acrylic — never thin board.", icon: "✦" },
  { title: "Personalised", body: "Your photo, your names, your spelling. Proof before we cut.", icon: "✎" },
  { title: "Secure payments", body: "UPI, cards, net banking, wallets and cash on delivery.", icon: "⛉" },
  { title: "Fast delivery", body: "Dispatched in 3–5 working days, tracked pan-India.", icon: "➤" },
  { title: "Easy ordering", body: "Pick, personalise, pay. Reorder a past gift in two taps.", icon: "◷" },
  { title: "Real support", body: "Talk to the workshop, not a script. Mon–Sat, 10–8.", icon: "☎" },
];

export default async function HomePage() {
  const { hero, offers, categories, trending, bestSellers, personalised, testimonials } =
    await getHomepage();

  return (
    <div className="space-y-10 pb-4">
      {/* ---------------------------------------------------------- hero */}
      {hero ? (
        <section className="overflow-hidden rounded-card border border-brand-200 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800">
          <div className="grid items-center gap-6 p-6 sm:p-9 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-marigold-300 uppercase">
                Handmade to order
              </p>
              <h1 className="mt-2 font-display text-3xl leading-[1.08] font-semibold text-white sm:text-4xl lg:text-[2.9rem]">
                {hero.title} <span aria-hidden="true">❤</span>
              </h1>
              {hero.subtitle ? (
                <p className="mt-3 max-w-md text-sm text-brand-100 sm:text-base">{hero.subtitle}</p>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={hero.href ?? "/search"}
                  className="rounded-full bg-marigold-400 px-6 py-3 text-sm font-semibold text-brand-900 transition hover:bg-marigold-300"
                >
                  {hero.ctaLabel ?? "Shop Now"}
                </Link>
                <Link
                  href="/search?personalized=true"
                  className="rounded-full border border-brand-300/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
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

      {/* ---------------------------------------------------- categories */}
      {categories.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Browse" title="Shop by category" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/category/${cat.slug}`}
                className="group rounded-card border border-line bg-paper p-2.5 text-center transition hover:border-brand-300 hover:shadow-card"
              >
                <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg bg-brand-50">
                  <ProductImage
                    src={cat.imageUrl}
                    alt=""
                    sizes="(min-width: 1280px) 140px, (min-width: 640px) 18vw, 28vw"
                    className="transition duration-300 group-hover:scale-105"
                  />
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-snug font-medium text-ink">
                  {cat.icon ? <span aria-hidden="true">{cat.icon} </span> : null}
                  {cat.name}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------ trending */}
      {trending.length > 0 ? (
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
      ) : null}

      {/* -------------------------------------------------------- offers */}
      {offers.length > 0 ? (
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
      ) : null}

      {/* -------------------------------------------------- best sellers */}
      {bestSellers.length > 0 ? (
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
      ) : null}

      {/* -------------------------------------------------- personalised */}
      {personalised.length > 0 ? (
        <section className="rounded-card border border-line bg-paper p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-brand-500 uppercase">
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
                className="mt-5 inline-block rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
              >
                Start customising
              </Link>
            </div>
            <ProductRail products={personalised} />
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------- why choose us */}
      <section>
        <SectionHeading eyebrow="Why GiftCraft" title="What you get, every order" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {PROMISES.map((promise) => (
            <div key={promise.title} className="rounded-card border border-line bg-paper p-4">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
              >
                {promise.icon}
              </span>
              <h3 className="mt-2.5 text-sm font-semibold text-ink">{promise.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{promise.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------- testimonials */}
      {testimonials.length > 0 ? (
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
                    <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">
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
      ) : null}

      {trending.length === 0 && bestSellers.length === 0 ? (
        <EmptyState
          title="The shelves are empty"
          message="No products are published yet. Add some from the admin panel and they will appear here straight away."
        />
      ) : null}
    </div>
  );
}

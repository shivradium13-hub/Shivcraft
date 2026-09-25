"use client";

import Link from "next/link";
import { useRef } from "react";

import { ProductImage } from "../ui/primitives";

export type HomeCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
};

/**
 * The homepage "Shop by category" row as a swipeable slider.
 *
 * A horizontal, scroll-snapping track (swipe on touch, arrow buttons on
 * desktop). Each card shows the category's short video when the admin uploaded
 * one — autoplayed, muted and looped, with the image as its poster — otherwise
 * the image. Tapping a card opens that category, exactly as before.
 */
export function CategorySlider({ categories }: { categories: HomeCategory[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const nudge = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="gc-hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
      >
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/category/${cat.slug}`}
            className="group w-28 shrink-0 snap-start rounded-card border border-line bg-paper p-2.5 text-center transition hover:border-brand-300 hover:shadow-card sm:w-32 lg:w-36"
          >
            <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg bg-brand-50">
              {cat.videoUrl ? (
                <video
                  src={cat.videoUrl}
                  poster={cat.imageUrl ?? undefined}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <ProductImage
                  src={cat.imageUrl}
                  alt=""
                  sizes="(min-width: 1024px) 144px, 30vw"
                  className="transition duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-snug font-medium text-ink">
              {cat.icon ? <span aria-hidden="true">{cat.icon} </span> : null}
              {cat.name}
            </p>
          </Link>
        ))}
      </div>

      {/* Desktop arrows; on touch the row is swiped. */}
      <button
        type="button"
        aria-label="Previous categories"
        onClick={() => nudge(-1)}
        className="absolute top-1/2 -left-3 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper text-lg leading-none text-ink shadow-card transition hover:border-brand-300 lg:flex"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next categories"
        onClick={() => nudge(1)}
        className="absolute top-1/2 -right-3 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper text-lg leading-none text-ink shadow-card transition hover:border-brand-300 lg:flex"
      >
        ›
      </button>
    </div>
  );
}

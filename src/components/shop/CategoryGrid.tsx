"use client";

import Link from "next/link";

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
 * The homepage "Shop by category" as a clean, responsive card grid (reference
 * style): 2 per row on phones, 3 on tablets, 4 on desktop, every card the same
 * square aspect so rows never break. A card shows the category's short video
 * (autoplayed, muted, looped, image as poster) when the admin set one, else the
 * image. Tapping opens the category.
 */
export function CategoryGrid({ categories }: { categories: HomeCategory[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {categories.map((cat) => (
        <Link
          key={cat.id}
          href={`/category/${cat.slug}`}
          className="group overflow-hidden rounded-card border border-line bg-paper transition hover:border-brand-300 hover:shadow-card"
        >
          <div className="relative aspect-square w-full overflow-hidden bg-brand-50">
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
                sizes="(min-width: 1024px) 320px, (min-width: 640px) 33vw, 50vw"
                className="transition duration-300 group-hover:scale-105"
              />
            )}
          </div>
          <p className="line-clamp-1 px-3 py-3 text-center text-sm font-semibold text-ink">
            {cat.icon ? <span aria-hidden="true">{cat.icon} </span> : null}
            {cat.name}
          </p>
        </Link>
      ))}
    </div>
  );
}

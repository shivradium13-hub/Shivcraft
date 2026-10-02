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
 * square aspect so rows never break. The category image fills the whole card and
 * the name sits over its bottom in a light, frosted (translucent) band — the
 * image shows through faintly behind it. A short video (autoplayed, muted,
 * looped, image as poster) plays when the admin set one, else the image.
 */
export function CategoryGrid({ categories }: { categories: HomeCategory[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {categories.map((cat) => (
        <Link
          key={cat.id}
          href={`/category/${cat.slug}`}
          className="group relative block aspect-square overflow-hidden rounded-card border border-line bg-brand-50 transition hover:border-brand-300 hover:shadow-card"
        >
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

          {/* Frosted name band over the bottom of the image — the picture shows
              through behind the category name (50% so the image reads clearly). */}
          <div className="absolute inset-x-0 bottom-0 bg-paper/30 px-3 py-2.5 text-center backdrop-blur-sm">
            <p className="line-clamp-1 text-sm font-semibold text-ink">
              {cat.icon ? <span aria-hidden="true">{cat.icon} </span> : null}
              {cat.name}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

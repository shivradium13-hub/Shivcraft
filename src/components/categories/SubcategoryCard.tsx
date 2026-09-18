"use client";

import Image from "next/image";
import Link from "next/link";
import { memo } from "react";

import type { Subcategory } from "@/types/category";

/**
 * One subcategory tile. Links to the existing product listing at
 * /category/<slug>, which is where its products live.
 *
 * Memoised because switching parent re-renders the grid, and the cards that
 * carry over should not re-render for an unchanged prop.
 */
export const SubcategoryCard = memo(function SubcategoryCard({
  subcategory,
  highlighted = false,
  priority = false,
}: {
  subcategory: Subcategory;
  highlighted?: boolean;
  priority?: boolean;
}) {
  const { name, slug, image, icon, productCount } = subcategory;

  return (
    <Link
      href={`/category/${slug}`}
      aria-label={`Browse ${name}${productCount ? `, ${productCount} products` : ""}`}
      className={`sr-press group block overflow-hidden rounded-2xl border bg-sr-surface shadow-sr-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sr-500 ${
        highlighted ? "border-sr-400 ring-2 ring-sr-100" : "border-sr-line hover:border-sr-200"
      }`}
    >
      {/* Fixed 1:1 box so a tall image and a wide one occupy the same space. */}
      <div className="relative aspect-square w-full overflow-hidden bg-sr-50">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            loading={priority ? "eager" : "lazy"}
            priority={priority}
            sizes="(min-width: 1280px) 180px, (min-width: 1024px) 16vw, (min-width: 640px) 26vw, 40vw"
            unoptimized={image.endsWith(".svg")}
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-3xl"
          >
            {icon ?? "🎁"}
          </span>
        )}
      </div>

      <div className="px-2.5 py-2.5">
        <p className="line-clamp-2 text-center text-[13px] leading-snug font-medium text-sr-ink">
          {name}
        </p>
        {/* Only rendered when the API actually returned a count (spec 16). */}
        {productCount ? (
          <p className="mt-0.5 text-center text-[11px] text-sr-muted tabular-nums">
            {productCount} {productCount === 1 ? "Product" : "Products"}
          </p>
        ) : null}
      </div>
    </Link>
  );
});

"use client";

import type { Subcategory } from "@/types/category";

import { SubcategoryCard } from "./SubcategoryCard";

/**
 * 2 columns on phones, 3 on tablets, 4–6 on desktop depending on width
 * (spec 7 and 19). The count comes from the viewport, not from JS.
 */
export function SubcategoryGrid({
  subcategories,
  highlightSlug,
}: {
  subcategories: Subcategory[];
  highlightSlug?: string | null;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {subcategories.map((subcategory, i) => (
        <li key={subcategory.id}>
          <SubcategoryCard
            subcategory={subcategory}
            highlighted={highlightSlug === subcategory.slug}
            priority={i < 6}
          />
        </li>
      ))}
    </ul>
  );
}

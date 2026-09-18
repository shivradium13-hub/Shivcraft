"use client";

import Link from "next/link";

import type { Category } from "@/types/category";

import { CategoryEmptyState } from "./CategoryEmptyState";
import { SubcategoryGrid } from "./SubcategoryGrid";
import { SubcategorySection } from "./SubcategorySection";

/**
 * The right-hand panel. Re-keyed on the selected category so React remounts it
 * and the entry animation replays — that 180ms fade is the whole "it changed"
 * signal (spec 27).
 */
export function SubcategoryPanel({
  category,
  allCategories,
  highlightSlug,
}: {
  category: Category | null;
  allCategories: Category[];
  highlightSlug?: string | null;
}) {
  /* "All Gifts" is not a database row — it shows every top-level category. */
  if (!category) {
    const asCards = allCategories.map((c, i) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      image: c.image,
      icon: c.icon,
      sortOrder: i,
      ...(c.productCount ? { productCount: c.productCount } : {}),
    }));

    return (
      <div key="all-gifts" className="sr-enter">
        <PanelHeading title="All Gifts" subtitle={`${allCategories.length} categories`} />
        <SubcategorySection title="Shop by category">
          <SubcategoryGrid subcategories={asCards} />
        </SubcategorySection>
      </div>
    );
  }

  const { subcategories } = category;
  const popular = subcategories.slice(0, 6);
  const rest = subcategories.slice(6);

  return (
    <div key={category.id} className="sr-enter">
      <PanelHeading
        title={category.name}
        subtitle={
          category.productCount
            ? `${category.productCount} ${category.productCount === 1 ? "product" : "products"}`
            : undefined
        }
        href={`/category/${category.slug}`}
      />

      {subcategories.length === 0 ? (
        <CategoryEmptyState categoryName={category.name} />
      ) : (
        <>
          <SubcategorySection title={rest.length > 0 ? "Popular" : "Browse"}>
            <SubcategoryGrid subcategories={popular} highlightSlug={highlightSlug} />
          </SubcategorySection>

          {rest.length > 0 ? (
            <SubcategorySection title={`More in ${category.name}`}>
              <SubcategoryGrid subcategories={rest} highlightSlug={highlightSlug} />
            </SubcategorySection>
          ) : null}
        </>
      )}
    </div>
  );
}

function PanelHeading({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle?: string;
  href?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl leading-tight font-semibold text-sr-ink sm:text-2xl">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-sr-muted tabular-nums">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="shrink-0 rounded-full border border-sr-line-strong px-3.5 py-1.5 text-xs font-semibold text-sr-600 transition hover:border-sr-400 hover:bg-sr-50"
        >
          View all products
        </Link>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback } from "react";

import { useCategories } from "@/hooks/useCategories";
import { useCategoryNavigation } from "@/hooks/useCategoryNavigation";
import type { Category } from "@/types/category";

import { CategoryErrorState } from "./CategoryErrorState";
import { CategoryHeader } from "./CategoryHeader";
import { CategoryQuickScroller } from "./CategoryQuickScroller";
import { CategoryRail } from "./CategoryRail";
import { CategorySearch, type CategoryMatch } from "./CategorySearch";
import { CategorySkeleton } from "./CategorySkeleton";
import { SubcategoryPanel } from "./SubcategoryPanel";

/**
 * The Categories screen.
 *
 * The tree is fetched once (server-rendered on first paint, revalidated only on
 * an explicit retry) and every parent switch after that is local state — no
 * request, no navigation, no page reload.
 */
export function CategoriesPage({
  initialCategories,
  initialSlug,
}: {
  initialCategories: Category[];
  initialSlug?: string;
}) {
  const { state, retry } = useCategories(initialCategories);
  const categories = state.status === "ready" ? state.categories : [];

  const { selected, select, highlightSlug, isAllGifts } = useCategoryNavigation(
    categories,
    initialSlug,
  );

  const pickFromSearch = useCallback(
    (match: CategoryMatch) => {
      const hit = categories.find((c) => c.id === match.id);
      if (hit) select(hit);
    },
    [categories, select],
  );

  const search = <CategorySearch categories={categories} onPick={pickFromSearch} />;

  return (
    <div className="min-h-dvh bg-sr-canvas">
      <CategoryHeader search={search} />

      {state.status === "error" ? (
        <div className="px-4 py-12">
          <CategoryErrorState onRetry={retry} />
        </div>
      ) : state.status === "loading" ? (
        <CategorySkeleton />
      ) : (
        <>
          {/* Quick strip + search sit above the split on phones only. */}
          <div className="border-b border-sr-line bg-sr-surface px-3 lg:hidden">
            <div className="pt-2">{search}</div>
            <CategoryQuickScroller
              categories={categories}
              selectedId={selected?.id ?? null}
              onSelect={select}
              allGiftsActive={isAllGifts}
              onSelectAllGifts={() => select(null)}
            />
          </div>

          <div className="mx-auto flex w-full max-w-[1440px] items-start">
            <CategoryRail
              categories={categories}
              selectedId={selected?.id ?? null}
              onSelect={select}
              allGiftsActive={isAllGifts}
              onSelectAllGifts={() => select(null)}
            />

            <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6">
              <SubcategoryPanel
                category={selected}
                allCategories={categories}
                highlightSlug={highlightSlug}
              />
            </main>
          </div>
        </>
      )}
    </div>
  );
}

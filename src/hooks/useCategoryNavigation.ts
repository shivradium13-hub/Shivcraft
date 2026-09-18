"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ALL_GIFTS_SLUG, type Category } from "@/types/category";

/**
 * Single source of truth for which parent category is selected.
 *
 * Selecting a category updates the address bar with history.replaceState rather
 * than a router navigation: the URL stays shareable and correct on reload,
 * while tapping through the rail costs no server round trip and no re-render of
 * the page shell.
 */
export function useCategoryNavigation(categories: Category[], initialSlug?: string) {
  const resolve = useCallback(
    (slug?: string) => {
      if (!slug || slug === ALL_GIFTS_SLUG) return null;
      // A slug may name a parent, or a subcategory — in which case select its parent.
      return (
        categories.find((c) => c.slug === slug) ??
        categories.find((c) => c.subcategories.some((s) => s.slug === slug)) ??
        null
      );
    },
    [categories],
  );

  const [selectedId, setSelectedId] = useState<string | null>(() => resolve(initialSlug)?.id ?? null);

  /** The subcategory to highlight when the URL pointed straight at one. */
  const [highlightSlug, setHighlightSlug] = useState<string | null>(() => {
    if (!initialSlug) return null;
    const owner = resolve(initialSlug);
    return owner && owner.slug !== initialSlug ? initialSlug : null;
  });

  // Categories arriving after first paint (or changing) must not strand a
  // selection that no longer exists.
  useEffect(() => {
    if (categories.length === 0) return;
    setSelectedId((current) => {
      if (current && categories.some((c) => c.id === current)) return current;
      return resolve(initialSlug)?.id ?? null;
    });
  }, [categories, initialSlug, resolve]);

  const selected = useMemo(
    () => categories.find((c) => c.id === selectedId) ?? null,
    [categories, selectedId],
  );

  const select = useCallback(
    (category: Category | null) => {
      setSelectedId(category?.id ?? null);
      setHighlightSlug(null);

      const path = category ? `/categories/${category.slug}` : "/categories";
      if (typeof window !== "undefined" && window.location.pathname !== path) {
        window.history.replaceState(null, "", path);
      }
    },
    [],
  );

  return { selected, select, highlightSlug, isAllGifts: selected === null };
}

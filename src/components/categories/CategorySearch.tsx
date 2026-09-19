"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { Category } from "@/types/category";

export type CategoryMatch = {
  id: string;
  name: string;
  slug: string;
  parentName?: string;
};

/**
 * Filters the categories already in memory (spec 15).
 *
 * The tree is small and local, so searching it over the network would be
 * slower and would fail offline. The debounce is on the term that drives
 * filtering, which keeps typing smooth on a long list without a request.
 */
export function CategorySearch({
  categories,
  onPick,
}: {
  categories: Category[];
  onPick: (match: CategoryMatch) => void;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim().toLowerCase()), 160);
    return () => clearTimeout(timer);
  }, [term]);

  const matches = useMemo<CategoryMatch[]>(() => {
    if (debounced.length < 2) return [];

    const hits: CategoryMatch[] = [];
    const seen = new Set<string>();

    for (const category of categories) {
      if (category.name.toLowerCase().includes(debounced) && !seen.has(category.id)) {
        seen.add(category.id);
        hits.push({ id: category.id, name: category.name, slug: category.slug });
      }
      for (const sub of category.subcategories) {
        if (sub.name.toLowerCase().includes(debounced) && !seen.has(sub.id)) {
          seen.add(sub.id);
          hits.push({ id: sub.id, name: sub.name, slug: sub.slug, parentName: category.name });
        }
      }
    }

    // Names that start with the term are the likelier intent.
    return hits
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(debounced) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(debounced) ? 0 : 1;
        return aStarts - bStarts || a.name.length - b.name.length;
      })
      .slice(0, 10);
  }, [categories, debounced]);

  return (
    <div className="relative">
      <label htmlFor="category-search" className="sr-only">
        Search categories
      </label>
      <div className="flex items-center gap-2 rounded-full border border-field bg-sr-surface px-3.5 focus-within:border-sr-400 focus-within:ring-2 focus-within:ring-sr-100">
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-sr-muted" aria-hidden="true">
          <path
            d="M9 3.5a5.5 5.5 0 104 9.3l3.3 3.3 1.2-1.2-3.3-3.3A5.5 5.5 0 009 3.5zm0 1.6a3.9 3.9 0 110 7.8 3.9 3.9 0 010-7.8z"
            fill="currentColor"
          />
        </svg>
        <input
          id="category-search"
          type="search"
          value={term}
          placeholder="Search categories..."
          autoComplete="off"
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="h-9 w-full bg-transparent text-sm text-sr-ink outline-none placeholder:text-sr-muted"
        />
      </div>

      {open && debounced.length >= 2 ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-sr-line bg-sr-surface shadow-sr-lift">
          {matches.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto py-1">
              {matches.map((match) => (
                <li key={match.id}>
                  {match.parentName ? (
                    <Link
                      href={`/category/${match.slug}`}
                      className="flex items-center justify-between gap-3 px-3.5 py-2 text-left text-sm text-sr-ink hover:bg-sr-50"
                    >
                      <span className="truncate">{match.name}</span>
                      <span className="shrink-0 text-[11px] text-sr-muted">{match.parentName}</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onPick(match);
                        setTerm("");
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm text-sr-ink hover:bg-sr-50"
                    >
                      <span className="truncate">{match.name}</span>
                      <span className="shrink-0 text-[11px] text-sr-muted">Category</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3.5 py-3 text-sm text-sr-muted">
              No category matches “{term.trim()}”.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

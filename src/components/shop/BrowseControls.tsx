"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const SORTS = [
  { value: "popularity", label: "Popularity" },
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Customer rating" },
  { value: "discount", label: "Biggest discount" },
] as const;

/** Sorting and filtering live in the URL, so a filtered view is shareable,
 *  survives a refresh, and the back button behaves. */
function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      // Any filter change invalidates the current page number.
      if (!("page" in updates)) next.delete("page");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
}

export function SortSelect() {
  const params = useSearchParams();
  const setParam = useSetParam();
  const current = params.get("sort") ?? "popularity";

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Sort</span>
      <select
        value={current}
        onChange={(e) => setParam({ sort: e.target.value })}
        className="rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-brand-500"
      >
        {SORTS.map((sort) => (
          <option key={sort.value} value={sort.value}>
            {sort.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function QuickFilters() {
  const params = useSearchParams();
  const setParam = useSetParam();

  const chips = [
    { key: "personalized", label: "Personalisable", on: params.get("personalized") === "true" },
    { key: "inStock", label: "In stock", on: params.get("inStock") === "true" },
  ];

  const priceBands = [
    { label: "Under ₹500", min: null, max: "500" },
    { label: "₹500 – ₹1,000", min: "500", max: "1000" },
    { label: "₹1,000 – ₹2,000", min: "1000", max: "2000" },
    { label: "Above ₹2,000", min: "2000", max: null },
  ];

  const activeBand = priceBands.find(
    (band) => (params.get("minPrice") ?? null) === band.min && (params.get("maxPrice") ?? null) === band.max,
  );

  const hasAny =
    chips.some((c) => c.on) || activeBand !== undefined || params.get("rating") !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={chip.on}
          onClick={() => setParam({ [chip.key]: chip.on ? null : "true" })}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            chip.on
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-line-strong bg-paper text-ink-soft hover:border-brand-300"
          }`}
        >
          {chip.label}
        </button>
      ))}

      {priceBands.map((band) => {
        const on = activeBand === band;
        return (
          <button
            key={band.label}
            type="button"
            aria-pressed={on}
            onClick={() =>
              setParam(on ? { minPrice: null, maxPrice: null } : { minPrice: band.min, maxPrice: band.max })
            }
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              on
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-line-strong bg-paper text-ink-soft hover:border-brand-300"
            }`}
          >
            {band.label}
          </button>
        );
      })}

      <button
        type="button"
        aria-pressed={params.get("rating") === "4"}
        onClick={() => setParam({ rating: params.get("rating") === "4" ? null : "4" })}
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          params.get("rating") === "4"
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-line-strong bg-paper text-ink-soft hover:border-brand-300"
        }`}
      >
        4★ &amp; above
      </button>

      {hasAny ? (
        <button
          type="button"
          onClick={() =>
            setParam({
              personalized: null,
              inStock: null,
              minPrice: null,
              maxPrice: null,
              rating: null,
            })
          }
          className="text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const params = useSearchParams();
  const pathname = usePathname();

  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const windowed = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1,
  );

  const cell =
    "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition";

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        className={`${cell} ${
          page === 1
            ? "pointer-events-none border-line text-muted opacity-50"
            : "border-line-strong text-ink hover:border-brand-400 hover:text-brand-700"
        }`}
      >
        Previous
      </Link>

      {windowed.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - windowed[i - 1] > 1 ? <span className="px-1 text-muted">…</span> : null}
          <Link
            href={href(n)}
            aria-current={n === page ? "page" : undefined}
            className={`${cell} ${
              n === page
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-line-strong text-ink hover:border-brand-400 hover:text-brand-700"
            }`}
          >
            {n}
          </Link>
        </span>
      ))}

      <Link
        href={href(Math.min(totalPages, page + 1))}
        aria-disabled={page === totalPages}
        className={`${cell} ${
          page === totalPages
            ? "pointer-events-none border-line text-muted opacity-50"
            : "border-line-strong text-ink hover:border-brand-400 hover:text-brand-700"
        }`}
      >
        Next
      </Link>
    </nav>
  );
}

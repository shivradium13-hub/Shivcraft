import Link from "next/link";

/** A category the admin created but has not filled yet (spec 22). */
export function CategoryEmptyState({ categoryName }: { categoryName: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-field bg-field-bg px-6 py-12 text-center">
      <span aria-hidden="true" className="text-2xl">🎁</span>
      <h3 className="mt-2 font-display text-lg font-semibold text-sr-ink">
        No subcategories in {categoryName} yet
      </h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-sr-muted">
        We are still adding these. In the meantime you can browse everything in the shop.
      </p>
      <Link
        href="/search"
        className="mt-5 inline-block rounded-full bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700"
      >
        Browse all products
      </Link>
    </div>
  );
}

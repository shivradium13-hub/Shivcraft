import type { Metadata } from "next";
import Link from "next/link";

import { productQuerySchema } from "@/lib/validation";
import { Pagination, QuickFilters, SortSelect } from "@/components/shop/BrowseControls";
import { ProductGrid } from "@/components/shop/ProductCard";
import { EmptyState } from "@/components/ui/primitives";
import { findProducts } from "@/server/catalog/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export async function generateMetadata(props: PageProps<"/search">): Promise<Metadata> {
  const search = await props.searchParams;
  const q = typeof search.q === "string" ? search.q : "";
  return {
    title: q ? `${q} — search results` : "All gifts",
    // Search result pages are thin and infinite; keep them out of the index.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage(props: PageProps<"/search">) {
  const search = await props.searchParams;
  const query = productQuerySchema.parse(search);
  const page = Math.max(1, Number(Array.isArray(search.page) ? search.page[0] : search.page) || 1);

  const { items, total } = await findProducts(query, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const heading = query.q ? `Results for “${query.q}”` : "All gifts";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted">
            {total} {total === 1 ? "product" : "products"}
            {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
          </p>
        </div>
        <SortSelect />
      </div>

      <div className="mb-5">
        <QuickFilters />
      </div>

      {items.length > 0 ? (
        <>
          <ProductGrid products={items} priorityCount={5} />
          <Pagination page={page} totalPages={totalPages} />
        </>
      ) : (
        <EmptyState
          title={query.q ? `No results for “${query.q}”` : "No products match those filters"}
          message="Check the spelling, try a shorter word, or browse a category from the menu. Searching “mug”, “frame” or “name plate” is a good place to start."
          action={
            <Link
              href="/search"
              className="inline-block rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Browse all gifts
            </Link>
          }
        />
      )}
    </div>
  );
}

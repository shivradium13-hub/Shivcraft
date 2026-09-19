import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { productQuerySchema } from "@/lib/validation";
import { Pagination, QuickFilters, SortSelect } from "@/components/shop/BrowseControls";
import { ProductGrid } from "@/components/shop/ProductCard";
import { EmptyState } from "@/components/ui/primitives";
import { getCategoryBySlug, getCategoryTree } from "@/server/catalog/categories";
import { findProducts } from "@/server/catalog/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export async function generateMetadata(props: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: category.name,
    description:
      category.description ??
      `Shop ${category.name.toLowerCase()} at Shiv Radium — personalised, made to order in India.`,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

/** Pre-build the category routes that exist today; new ones the admin creates
 *  still render on demand because the page is dynamic. */
export async function generateStaticParams() {
  const tree = await getCategoryTree();
  return tree.flatMap((top) => [{ slug: top.slug }, ...top.children.map((c) => ({ slug: c.slug }))]);
}

export default async function CategoryPage(props: PageProps<"/category/[slug]">) {
  const { slug } = await props.params;
  const search = await props.searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const query = productQuerySchema.parse({ ...search, category: slug });
  const page = Math.max(1, Number(Array.isArray(search.page) ? search.page[0] : search.page) || 1);

  const { items, total } = await findProducts(query, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Link href="/" className="hover:text-brand-600">Home</Link>
        <span aria-hidden="true">/</span>
        {category.parent ? (
          <>
            <Link href={`/category/${category.parent.slug}`} className="hover:text-brand-600">
              {category.parent.name}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <span className="font-medium text-ink">{category.name}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            {category.icon ? <span aria-hidden="true">{category.icon} </span> : null}
            {category.name}
          </h1>
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
          title="Nothing here yet"
          message="No products match this category and these filters. Try clearing the filters, or browse a related category from the menu."
          action={
            <Link
              href={`/category/${slug}`}
              className="inline-block rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Clear filters
            </Link>
          }
        />
      )}
    </div>
  );
}

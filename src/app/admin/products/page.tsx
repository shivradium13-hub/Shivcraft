import type { Metadata } from "next";
import Link from "next/link";

import { ProductsTable } from "@/components/admin/ProductsTable";
import { adminCategoryTree } from "@/server/admin/catalog";
import { listAdminProducts } from "@/server/admin/products";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Products", robots: { index: false, follow: false } };

const PAGE_SIZE = 20;

export default async function AdminProductsPage(props: PageProps<"/admin/products">) {
  await requireAdmin();
  const search = await props.searchParams;

  const query = typeof search.q === "string" ? search.q.trim() : "";
  const categoryId = typeof search.categoryId === "string" ? search.categoryId : "";
  const stateParam = typeof search.state === "string" ? search.state : "all";
  const state = (["active", "disabled", "low"].includes(stateParam) ? stateParam : "all") as
    | "all" | "active" | "disabled" | "low";
  const page = Math.max(1, Number(typeof search.page === "string" ? search.page : 1) || 1);

  const [{ rows, total }, tree] = await Promise.all([
    listAdminProducts({ query, categoryId: categoryId || undefined, state, page, limit: PAGE_SIZE }),
    adminCategoryTree(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = {
      q: query || undefined,
      categoryId: categoryId || undefined,
      state: state === "all" ? undefined : state,
      ...patch,
    };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sr-ink">Products</h1>
          <p className="mt-1 text-sm text-sr-muted">{total} matching</p>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded-full bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sr-700"
        >
          + Add product
        </Link>
      </div>

      <form action="/admin/products" className="mt-4 flex flex-wrap gap-2">
        {state !== "all" ? <input type="hidden" name="state" value={state} /> : null}
        <input
          name="q"
          defaultValue={query}
          placeholder="Product name or SKU"
          className="min-w-0 flex-1 rounded-lg border border-field bg-field-bg px-3 py-2 text-sm outline-none focus:border-sr-400"
        />
        <select
          name="categoryId"
          defaultValue={categoryId}
          className="rounded-lg border border-field bg-field-bg px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {tree.map((top) => (
            <optgroup key={top.id} label={top.name}>
              {top.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-sr-600 px-4 py-2 text-sm font-semibold text-white">
          Filter
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {([["all", "All"], ["active", "Live"], ["disabled", "Hidden"], ["low", "Low stock"]] as const).map(
          ([key, label]) => (
            <Link
              key={key}
              href={href({ state: key === "all" ? undefined : key, page: undefined })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                state === key
                  ? "border-sr-600 bg-sr-600 text-white"
                  : "border-field bg-field-bg text-sr-body hover:border-sr-300"
              }`}
            >
              {label}
            </Link>
          ),
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-field bg-field-bg px-6 py-12 text-center text-sm text-sr-muted">
          No products match this filter.
        </p>
      ) : (
        <ProductsTable rows={rows} />
      )}

      {totalPages > 1 ? (
        <nav className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href({ page: n === 1 ? undefined : String(n) })}
              aria-current={n === page ? "page" : undefined}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                n === page ? "border-sr-600 bg-sr-600 text-white" : "border-sr-line-strong text-sr-body"
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

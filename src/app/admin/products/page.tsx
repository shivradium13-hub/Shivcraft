import type { Metadata } from "next";
import Link from "next/link";

import { formatPaise } from "@/lib/money";
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
          className="rounded-full bg-sr-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sr-600"
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
          className="min-w-0 flex-1 rounded-lg border border-field bg-sr-surface px-3 py-2 text-sm outline-none focus:border-sr-400"
        />
        <select
          name="categoryId"
          defaultValue={categoryId}
          className="rounded-lg border border-field bg-sr-surface px-3 py-2 text-sm"
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
        <button type="submit" className="rounded-lg bg-sr-500 px-4 py-2 text-sm font-semibold text-white">
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
                  ? "border-sr-500 bg-sr-500 text-white"
                  : "border-field bg-sr-surface text-sr-body hover:border-sr-300"
              }`}
            >
              {label}
            </Link>
          ),
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-field bg-sr-surface px-6 py-12 text-center text-sm text-sr-muted">
          No products match this filter.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-sr-line bg-sr-surface">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-sr-line bg-sr-soft text-left">
                {["", "Product", "Category", "Price", "Stock", "Status", ""].map((h, i) => (
                  <th key={i} className="px-3 py-2.5 text-[11px] font-semibold tracking-wide text-sr-muted uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const low = row.stock <= row.lowStockThreshold;
                return (
                  <tr key={row.id} className="border-b border-sr-line last:border-0 hover:bg-sr-canvas">
                    <td className="px-3 py-2">
                      <span className="block h-10 w-10 overflow-hidden rounded-lg bg-sr-50">
                        {row.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/products/${row.id}`} className="font-medium text-sr-600 hover:underline">
                        {row.name}
                      </Link>
                      <span className="block text-xs text-sr-muted">{row.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-sr-muted">{row.categoryName}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {formatPaise(row.discountPriceP ?? row.priceP)}
                      {row.discountPriceP ? (
                        <span className="block text-xs text-sr-muted line-through">
                          {formatPaise(row.priceP)}
                        </span>
                      ) : null}
                    </td>
                    <td className={`px-3 py-2.5 font-semibold tabular-nums ${low ? "text-danger" : ""}`}>
                      {row.stock}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.isActive ? "bg-success-soft text-success" : "bg-sr-canvas text-sr-muted"
                        }`}
                      >
                        {row.isActive ? "Live" : "Hidden"}
                      </span>
                      {row.isPersonalizable ? (
                        <span className="ml-1 rounded bg-sr-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-sr-gold">
                          CUSTOM
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/admin/products/${row.id}`}
                        className="rounded-lg border border-sr-line-strong px-2.5 py-1 text-xs font-semibold text-sr-body hover:border-sr-400 hover:text-sr-600"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href({ page: n === 1 ? undefined : String(n) })}
              aria-current={n === page ? "page" : undefined}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                n === page ? "border-sr-500 bg-sr-500 text-white" : "border-sr-line-strong text-sr-body"
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

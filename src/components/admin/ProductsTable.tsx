"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatPaise } from "@/lib/money";

export type AdminProductRow = {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  categoryName: string | null;
  priceP: number;
  discountPriceP: number | null;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  isPersonalizable: boolean;
};

/**
 * The admin products table with row selection and a bulk-delete action.
 *
 * Selection lives here on the client; deleting calls the collection DELETE
 * endpoint with the chosen ids, then refreshes so the list reflects it. A
 * two-step in-page confirm is used rather than window.confirm(), which some
 * in-app browsers suppress.
 */
export function ProductsTable({ rows }: { rows: AdminProductRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not delete the selected products.");
        return;
      }
      setSelected(new Set());
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* -------------------------------------------------- bulk action bar */}
      <div className="mt-4 flex min-h-[40px] flex-wrap items-center gap-2">
        {someSelected ? (
          <>
            <span className="text-sm font-semibold text-sr-ink">{selected.size} selected</span>
            {!confirming ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
                className="rounded-full border border-danger px-4 py-1.5 text-sm font-semibold text-danger transition hover:bg-danger-soft"
              >
                Delete selected
              </button>
            ) : (
              <>
                <span className="text-sm text-danger">
                  Delete {selected.size} product{selected.size === 1 ? "" : "s"}? This cannot be undone.
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={deleteSelected}
                  className="rounded-full bg-danger px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-sr-line-strong px-4 py-1.5 text-sm font-semibold text-sr-body"
                >
                  Cancel
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setConfirming(false);
              }}
              className="text-sm font-semibold text-sr-muted hover:text-sr-body"
            >
              Clear
            </button>
          </>
        ) : (
          <span className="text-sm text-sr-muted">Tick products to select, then delete them here.</span>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-2xl border border-sr-line bg-sr-surface">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-sr-line bg-sr-soft text-left">
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all products on this page"
                />
              </th>
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
              const isSel = selected.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-sr-line last:border-0 hover:bg-sr-canvas ${isSel ? "bg-sr-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select ${row.name}`}
                    />
                  </td>
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
                      <span className="block text-xs text-sr-muted line-through">{formatPaise(row.priceP)}</span>
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
                      className="rounded-lg border border-sr-line-strong px-2.5 py-1 text-xs font-semibold text-sr-body hover:border-sr-400 hover:text-sr-700"
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
    </div>
  );
}

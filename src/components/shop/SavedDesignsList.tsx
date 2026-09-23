"use client";

import Link from "next/link";
import { useState } from "react";

import type { CustomerDesign } from "@/lib/customizer/design";
import type { CustomizerConfig } from "@/lib/customizer/schema";
import { CustomizerCanvas } from "@/components/shop/customizer/CustomizerCanvas";
import { CustomizerFonts } from "@/components/shop/customizer/CustomizerFonts";

export type SavedDesignItem = {
  id: string;
  name: string;
  productName: string;
  productSlug: string;
  savedAt: string;
  config: CustomizerConfig;
  design: CustomerDesign;
  stale: boolean;
};

/**
 * The customer's saved designs, with a live preview of each.
 *
 * The preview is the same CustomizerCanvas the customizer and the workshop
 * use, fed the product's current configuration and the saved design — so a row
 * shows what opening the design would actually look like today, photos and
 * all. Rename, duplicate and delete act through the API and update this list
 * in place, so nothing here pretends to have happened that did not (§27, §38).
 */
export function SavedDesignsList({ initial }: { initial: SavedDesignItem[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  if (items.length === 0) {
    return (
      <div>
        <p className="mt-1 mb-5 text-sm text-muted">
          You haven’t saved any designs yet. Personalise a product and choose “Save this design”.
        </p>
        <Link
          href="/categories"
          className="inline-flex rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-ink-soft transition hover:border-brand-400"
        >
          Browse products to personalise
        </Link>
      </div>
    );
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/designs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "Could not delete that design.");
        return;
      }
      setItems((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/designs/${id}/duplicate`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not duplicate that design.");
        return;
      }
      const source = items.find((d) => d.id === id);
      if (source && json?.data?.id) {
        // Mirror the copy the server just made, so it appears without a reload.
        setItems((prev) => [
          {
            ...source,
            id: json.data.id,
            name: `${source.name} (copy)`.slice(0, 120),
            savedAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function rename(id: string, value: string) {
    const name = value.trim();
    if (name === "") return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/designs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not rename that design.");
        return;
      }
      setItems((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
      setRenaming(null);
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">{items.length} saved</p>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {items.map((item) => {
        const viewId = item.config.views.some((v) => v.id === item.design.viewId)
          ? item.design.viewId
          : item.config.views[0]?.id ?? "";
        const canPreview = item.config.enabled && item.config.views.length > 0;

        return (
          <div
            key={item.id}
            className="flex flex-wrap items-start gap-4 rounded-card border border-line bg-paper p-3 sm:flex-nowrap"
          >
            <div className="w-24 shrink-0">
              {canPreview ? (
                <>
                  <CustomizerFonts config={item.config} />
                  <CustomizerCanvas config={item.config} design={item.design} viewId={viewId} />
                </>
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-card bg-soft text-center text-[10px] text-muted">
                  Preview unavailable
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {renaming?.id === item.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={renaming.value}
                    onChange={(e) => setRenaming({ id: item.id, value: e.target.value })}
                    maxLength={120}
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-field bg-field-bg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    disabled={busyId === item.id || renaming.value.trim() === ""}
                    onClick={() => rename(item.id, renaming.value)}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming(null)}
                    className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="truncate font-semibold text-ink">{item.name}</p>
              )}

              <p className="mt-0.5 truncate text-sm text-muted">{item.productName}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                Saved{" "}
                {new Date(item.savedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>

              {item.stale ? (
                <p className="mt-1 rounded-lg bg-soft px-2 py-1 text-[11px] text-warn">
                  This product has changed since you saved this. Some parts may open differently.
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Link
                  href={`/product/${item.productSlug}?load=${item.id}`}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
                >
                  Open &amp; edit
                </Link>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => setRenaming({ id: item.id, value: item.name })}
                  className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft disabled:opacity-50"
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => duplicate(item.id)}
                  className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft disabled:opacity-50"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => remove(item.id)}
                  className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

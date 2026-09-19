"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatPaise } from "@/lib/money";
import type { WishlistEntry } from "@/server/account/queries";

import { notifyCartChanged } from "./CartBadge";
import { ProductImage } from "../ui/primitives";

export function WishlistClient({ initial }: { initial: WishlistEntry[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(entry: WishlistEntry) {
    setBusy(entry.id);
    setError(null);
    try {
      const res = await fetch("/api/wishlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: entry.productId }),
      });
      if (!res.ok) {
        setError("Could not remove that. Try again.");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== entry.id));
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function addToCart(entry: WishlistEntry) {
    setBusy(entry.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: entry.productId, quantity: 1 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not add that to your cart.");
        return;
      }
      notifyCartChanged();
      setNotice(`${entry.name} added to your cart.`);
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-strong bg-paper px-6 py-14 text-center">
        <span aria-hidden="true" className="text-3xl">♡</span>
        <h2 className="mt-3 font-display text-xl font-semibold text-ink">Your wishlist is empty</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Tap the heart on anything you like and it waits for you here.
        </p>
        <Link
          href="/categories"
          className="mt-6 inline-block rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          Browse gifts
        </Link>
      </div>
    );
  }

  return (
    <div>
      {notice ? (
        <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {items.map((entry) => {
          const unavailable = !entry.isActive || entry.stock <= 0;
          return (
            <li
              key={entry.id}
              className={`flex gap-3 rounded-card border bg-paper p-3 ${
                unavailable ? "border-danger/40" : "border-line"
              } ${busy === entry.id ? "opacity-60" : ""}`}
            >
              <Link
                href={`/product/${entry.slug}`}
                className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-brand-50"
              >
                <ProductImage src={entry.imageUrl} alt={entry.name} sizes="80px" />
              </Link>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/product/${entry.slug}`}
                  className="line-clamp-2 text-sm font-medium text-ink hover:text-brand-700"
                >
                  {entry.name}
                </Link>

                <p className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-base font-bold text-ink">{formatPaise(entry.unitPriceP)}</span>
                  {entry.priceP > entry.unitPriceP ? (
                    <span className="text-xs text-muted line-through">{formatPaise(entry.priceP)}</span>
                  ) : null}
                </p>

                {unavailable ? (
                  <p className="mt-1 text-xs font-semibold text-danger">
                    {entry.isActive ? "Out of stock" : "No longer available"}
                  </p>
                ) : null}

                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === entry.id || unavailable}
                    onClick={() => addToCart(entry)}
                    className="rounded-lg bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-45"
                  >
                    Add to cart
                  </button>
                  <button
                    type="button"
                    disabled={busy === entry.id}
                    onClick={() => remove(entry)}
                    className="rounded-lg border border-line-strong px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-danger hover:text-danger disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

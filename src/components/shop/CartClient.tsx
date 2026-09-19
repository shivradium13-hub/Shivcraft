"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatPaise } from "@/lib/money";
import type { CartLine, CartView } from "@/server/cart/queries";

import { ProductImage } from "../ui/primitives";
import { notifyCartChanged } from "./CartBadge";

export function CartClient({ initial }: { initial: CartView }) {
  const router = useRouter();
  const [cart, setCart] = useState(initial);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /** Every mutation returns the recomputed cart, so the client never does
   *  pricing maths of its own. */
  async function mutate(url: string, init: RequestInit, lineId?: string) {
    setBusyLine(lineId ?? "cart");
    setError(null);
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That did not work. Try again.");
        return false;
      }
      setCart(json.data as CartView);
      notifyCartChanged();
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Network problem — check your connection and try again.");
      return false;
    } finally {
      setBusyLine(null);
    }
  }

  const setQuantity = (line: CartLine, quantity: number) =>
    mutate(
      `/api/cart/items/${line.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity }),
      },
      line.id,
    );

  const setSaved = (line: CartLine, savedForLater: boolean) =>
    mutate(
      `/api/cart/items/${line.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ savedForLater }),
      },
      line.id,
    );

  const remove = (line: CartLine) =>
    mutate(`/api/cart/items/${line.id}`, { method: "DELETE" }, line.id);

  async function applyCoupon() {
    setCouponError(null);
    setBusyLine("coupon");
    try {
      const res = await fetch("/api/cart/coupon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: couponInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCouponError(json?.error?.message ?? "That coupon could not be applied.");
        return;
      }
      setCart(json.data as CartView);
      notifyCartChanged();
      setCouponInput("");
      startTransition(() => router.refresh());
    } catch {
      setCouponError("Network problem — try again.");
    } finally {
      setBusyLine(null);
    }
  }

  const removeCoupon = () => mutate("/api/cart/coupon", { method: "DELETE" }, "coupon");

  const blocked = cart.items.filter((l) => !l.isActive || l.stock <= 0);
  const canCheckout = cart.items.length > 0 && blocked.length === 0;

  if (cart.items.length === 0 && cart.saved.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-field bg-paper px-6 py-16 text-center">
        <span aria-hidden="true" className="text-3xl">🛒</span>
        <h2 className="mt-3 font-display text-xl font-semibold text-ink">Your cart is empty</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Nothing here yet. Browse the categories and add something you would want to receive.
        </p>
        <Link
          href="/categories"
          className="mt-6 inline-block rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="space-y-3">
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        {cart.items.map((line) => (
          <CartRow
            key={line.id}
            line={line}
            busy={busyLine === line.id}
            onQuantity={(q) => setQuantity(line, q)}
            onRemove={() => remove(line)}
            onSave={() => setSaved(line, true)}
          />
        ))}

        {cart.saved.length > 0 ? (
          <section className="pt-4">
            <h2 className="mb-2 font-display text-lg font-semibold text-ink">
              Saved for later ({cart.saved.length})
            </h2>
            <div className="space-y-3">
              {cart.saved.map((line) => (
                <CartRow
                  key={line.id}
                  line={line}
                  saved
                  busy={busyLine === line.id}
                  onQuantity={(q) => setQuantity(line, q)}
                  onRemove={() => remove(line)}
                  onSave={() => setSaved(line, false)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <Link
          href="/categories"
          className="inline-block pt-2 text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Continue shopping
        </Link>
      </div>

      {/* --------------------------------------------------- order summary */}
      <aside className="rounded-card border border-line bg-paper p-5 lg:sticky lg:top-[88px]">
        <h2 className="font-display text-lg font-semibold text-ink">Order summary</h2>

        <div className="mt-4 border-b border-line pb-4">
          {cart.coupon ? (
            <div className="flex items-start justify-between gap-3 rounded-lg bg-success-soft px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-success">{cart.coupon.code} applied</p>
                {cart.coupon.description ? (
                  <p className="mt-0.5 text-xs text-ink-soft">{cart.coupon.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={removeCoupon}
                disabled={busyLine === "coupon"}
                className="shrink-0 text-xs font-semibold text-danger hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <label htmlFor="coupon" className="mb-1.5 block text-xs font-semibold text-ink">
                Apply coupon
              </label>
              <div className="flex gap-2">
                <input
                  id="coupon"
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value.toUpperCase());
                    setCouponError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && couponInput && void applyCoupon()}
                  placeholder="WELCOME150"
                  className="min-w-0 flex-1 rounded-lg border border-field bg-paper px-3 py-2 text-sm uppercase outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={!couponInput || busyLine === "coupon"}
                  className="shrink-0 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-45"
                >
                  Apply
                </button>
              </div>
            </>
          )}

          {couponError ? (
            <p className="mt-2 text-xs font-medium text-danger">{couponError}</p>
          ) : null}
          {cart.couponError ? (
            <p className="mt-2 text-xs font-medium text-warn">{cart.couponError}</p>
          ) : null}
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Row label={`Subtotal (${cart.itemCount} item${cart.itemCount === 1 ? "" : "s"})`}>
            {formatPaise(cart.totals.subtotalP)}
          </Row>
          {cart.totals.discountP > 0 ? (
            <Row label="Coupon discount" tone="success">
              −{formatPaise(cart.totals.discountP)}
            </Row>
          ) : null}
          <Row label="Delivery">
            {cart.totals.shippingP === 0 ? (
              <span className="font-semibold text-success">FREE</span>
            ) : (
              formatPaise(cart.totals.shippingP)
            )}
          </Row>
          {cart.totals.taxP > 0 ? (
            <Row label="GST">{formatPaise(cart.totals.taxP)}</Row>
          ) : null}
        </dl>

        {cart.totals.freeShippingShortfallP > 0 ? (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Add {formatPaise(cart.totals.freeShippingShortfallP)} more for free delivery.
          </p>
        ) : null}

        <div className="mt-4 flex items-baseline justify-between border-t border-line-strong pt-4">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="font-display text-2xl font-semibold text-ink tabular-nums">
            {formatPaise(cart.totals.totalP)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">Inclusive of all taxes</p>

        {blocked.length > 0 ? (
          <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            Remove or save the unavailable item{blocked.length === 1 ? "" : "s"} above to continue.
          </p>
        ) : null}

        <button
          type="button"
          disabled={!canCheckout}
          onClick={() => setError("Checkout is the next milestone — it is not built yet.")}
          className="mt-4 w-full rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-45"
        >
          Proceed to Checkout
        </button>
      </aside>
    </div>
  );
}

function Row({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "success";
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${tone === "success" ? "font-semibold text-success" : "text-ink"}`}>
        {children}
      </dd>
    </div>
  );
}

function CartRow({
  line,
  busy,
  saved = false,
  onQuantity,
  onRemove,
  onSave,
}: {
  line: CartLine;
  busy: boolean;
  saved?: boolean;
  onQuantity: (q: number) => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  const unavailable = !line.isActive || line.stock <= 0;

  return (
    <article
      className={`rounded-card border bg-paper p-3 transition ${
        unavailable ? "border-danger/40" : "border-line"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex gap-3">
        <Link
          href={`/product/${line.slug}`}
          className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-brand-50"
        >
          <ProductImage src={line.imageUrl} alt={line.name} sizes="80px" />
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/product/${line.slug}`}
            className="line-clamp-2 text-sm font-medium text-ink hover:text-brand-600"
          >
            {line.name}
          </Link>

          {line.variantLabel ? (
            <p className="mt-0.5 text-xs text-muted">{line.variantLabel}</p>
          ) : null}

          {line.customization ? (
            <ul className="mt-1.5 space-y-0.5 border-l-2 border-line pl-2 text-xs text-muted">
              {Object.entries(line.customization).map(([key, answer]) => (
                <li key={key} className="flex gap-1.5">
                  <span className="shrink-0">{answer.label}:</span>
                  {answer.type === "IMAGE" ? (
                    <a
                      href={answer.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      view photo
                    </a>
                  ) : (
                    <span className="truncate font-medium text-ink-soft">{answer.value}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {unavailable ? (
            <p className="mt-1.5 text-xs font-semibold text-danger">
              {line.isActive ? "Out of stock" : "No longer available"}
            </p>
          ) : line.stock <= 5 ? (
            <p className="mt-1.5 text-xs font-medium text-warn">Only {line.stock} left</p>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-ink tabular-nums">{formatPaise(line.lineTotalP)}</p>
          {line.listPriceP > line.unitPriceP ? (
            <p className="text-xs text-muted line-through tabular-nums">
              {formatPaise(line.listPriceP * line.quantity)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {!saved && !unavailable ? (
          <div className="flex items-center rounded-lg border border-line-strong">
            <button
              type="button"
              aria-label={`Decrease quantity of ${line.name}`}
              disabled={busy || line.quantity <= 1}
              onClick={() => onQuantity(line.quantity - 1)}
              className="px-3 py-1.5 text-base leading-none text-ink disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
              {line.quantity}
            </span>
            <button
              type="button"
              aria-label={`Increase quantity of ${line.name}`}
              disabled={busy || line.quantity >= Math.min(20, line.stock)}
              onClick={() => onQuantity(line.quantity + 1)}
              className="px-3 py-1.5 text-base leading-none text-ink disabled:opacity-40"
            >
              +
            </button>
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
        >
          {saved ? "Move to cart" : "Save for later"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-danger hover:text-danger disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

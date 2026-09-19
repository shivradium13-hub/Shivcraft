"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { formatPaise } from "@/lib/money";
import type { ProductDetail } from "@/server/catalog/product";

import { notifyCartChanged } from "./CartBadge";
import { PhotoUploadField } from "./PhotoUploadField";

type Uploaded = { id: string; url: string; name: string };
type Answers = Record<string, string>;

const FONT_STACKS: Record<string, string> = {
  "Classic Serif": "var(--font-fraunces), Georgia, serif",
  "Modern Sans": "var(--font-jakarta), system-ui, sans-serif",
  Handwriting: "'Segoe Script', 'Bradley Hand', cursive",
  Devanagari: "'Nirmala UI', 'Noto Sans Devanagari', sans-serif",
};

/* Ink and finish colours the customer chooses for their own piece, not UI
   chrome — this is the one place a range of colours belongs. */
const SWATCHES = ["#0d1015", "#e57836", "#b3261e", "#1f5f7a", "#1f7a4d", "#ad6616", "#ffffff"];

export function ProductPurchase({ product }: { product: ProductDetail }) {
  const router = useRouter();

  const [chosen, setChosen] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const group of product.variantGroups) {
      const first = group.options.find((o) => o.stock > 0) ?? group.options[0];
      if (first) initial[group.name] = first.id;
    }
    return initial;
  });

  const [quantity, setQuantity] = useState(1);
  const [answers, setAnswers] = useState<Answers>({});
  const [photos, setPhotos] = useState<Record<string, Uploaded | null>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /* Price reflects the chosen options, the same way the server will compute it. */
  const unitPriceP = useMemo(() => {
    const base = product.discountPriceP ?? product.priceP;
    let delta = 0;
    for (const group of product.variantGroups) {
      const option = group.options.find((o) => o.id === chosen[group.name]);
      if (option) delta += option.priceDeltaP;
    }
    return base + delta;
  }, [product, chosen]);

  const selectedVariantIds = useMemo(() => Object.values(chosen).filter(Boolean), [chosen]);

  const availableStock = useMemo(() => {
    let stock = product.stock;
    for (const group of product.variantGroups) {
      const option = group.options.find((o) => o.id === chosen[group.name]);
      if (option && option.stock > 0) stock = Math.min(stock, option.stock);
    }
    return stock;
  }, [product, chosen]);

  const outOfStock = availableStock <= 0;

  const previewField = product.customizationFields.find((f) => f.type === "TEXT");
  const fontField = product.customizationFields.find((f) => f.type === "FONT");
  const colorField = product.customizationFields.find((f) => f.type === "COLOR");
  const imageField = product.customizationFields.find((f) => f.type === "IMAGE");

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function addToCart(thenCheckout: boolean) {
    setBusy(true);
    setNotice(null);
    setFieldErrors({});

    const customization: Record<string, { label: string; type: string; value: string }> = {};
    for (const field of product.customizationFields) {
      const value = field.type === "IMAGE" ? (photos[field.id]?.id ?? "") : (answers[field.id] ?? "");
      if (value) customization[field.id] = { label: field.label, type: field.type, value };
    }

    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          quantity,
          variantIds: selectedVariantIds,
          customization: product.isPersonalizable ? customization : undefined,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setFieldErrors(json.error.fields);
        setNotice({ tone: "bad", text: json?.error?.message ?? "Could not add this to your cart." });
        return;
      }

      setNotice({
        tone: "ok",
        text: `Added to cart · ${json.data.count} item${json.data.count === 1 ? "" : "s"}`,
      });
      notifyCartChanged();
      router.refresh();
      if (thenCheckout) router.push("/cart");
    } catch {
      setNotice({ tone: "bad", text: "Network problem — check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- variants */}
      {product.variantGroups.map((group) => (
        <div key={group.name}>
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink">
            {group.name}
            <span className="ml-2 font-normal text-muted">
              {group.options.find((o) => o.id === chosen[group.name])?.value}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => {
              const active = chosen[group.name] === option.id;
              const soldOut = option.stock <= 0;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={soldOut}
                  onClick={() => setChosen((prev) => ({ ...prev, [group.name]: option.id }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-800"
                      : "border-field bg-paper text-ink hover:border-brand-400"
                  } ${soldOut ? "cursor-not-allowed line-through opacity-45" : ""}`}
                >
                  {option.value}
                  {option.priceDeltaP !== 0 ? (
                    <span className="ml-1.5 text-xs text-muted">
                      {option.priceDeltaP > 0 ? "+" : "−"}
                      {formatPaise(Math.abs(option.priceDeltaP))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* -------------------------------------------------- customization */}
      {product.isPersonalizable && product.customizationFields.length > 0 ? (
        <section className="rounded-card border border-brand-200 bg-brand-50/60 p-4">
          <h2 className="font-display text-lg font-semibold text-brand-800">Customize Your Gift</h2>
          <p className="mt-0.5 mb-4 text-xs text-ink-soft">
            We send a to-scale artwork proof before anything is made. Nothing is cut until you approve it.
          </p>

          <div className="space-y-4">
            {product.customizationFields.map((field) => {
              if (field.type === "IMAGE") {
                return (
                  <PhotoUploadField
                    key={field.id}
                    label={field.label}
                    helpText={field.helpText}
                    required={field.isRequired}
                    value={photos[field.id] ?? null}
                    error={fieldErrors[field.id]}
                    onChange={(next) => {
                      setPhotos((prev) => ({ ...prev, [field.id]: next }));
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy[field.id];
                        return copy;
                      });
                    }}
                  />
                );
              }

              if (field.type === "COLOR") {
                return (
                  <div key={field.id}>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">
                      {field.label}
                      {field.isRequired ? <span className="ml-1 text-danger">*</span> : null}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(field.options.length ? field.options : SWATCHES).map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          aria-label={swatch}
                          aria-pressed={answers[field.id] === swatch}
                          onClick={() => setAnswer(field.id, swatch)}
                          style={{ background: swatch }}
                          className={`h-8 w-8 rounded-full border-2 transition ${
                            answers[field.id] === swatch
                              ? "border-brand-500 ring-2 ring-brand-200"
                              : "border-line-strong"
                          }`}
                        />
                      ))}
                    </div>
                    {fieldErrors[field.id] ? (
                      <p className="mt-1.5 text-xs font-medium text-danger">{fieldErrors[field.id]}</p>
                    ) : null}
                  </div>
                );
              }

              if (field.type === "FONT" || field.type === "SELECT") {
                return (
                  <div key={field.id}>
                    <label
                      htmlFor={`cf-${field.id}`}
                      className="mb-1.5 block text-xs font-semibold text-ink"
                    >
                      {field.label}
                      {field.isRequired ? <span className="ml-1 text-danger">*</span> : null}
                    </label>
                    <select
                      id={`cf-${field.id}`}
                      value={answers[field.id] ?? ""}
                      onChange={(e) => setAnswer(field.id, e.target.value)}
                      className="w-full rounded-lg border border-field bg-paper px-3 py-2 text-sm outline-none focus:border-brand-500"
                    >
                      <option value="">Choose…</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {fieldErrors[field.id] ? (
                      <p className="mt-1.5 text-xs font-medium text-danger">{fieldErrors[field.id]}</p>
                    ) : null}
                  </div>
                );
              }

              return (
                <div key={field.id}>
                  <label
                    htmlFor={`cf-${field.id}`}
                    className="mb-1.5 block text-xs font-semibold text-ink"
                  >
                    {field.label}
                    {field.isRequired ? <span className="ml-1 text-danger">*</span> : null}
                  </label>
                  <input
                    id={`cf-${field.id}`}
                    type="text"
                    maxLength={field.maxLength ?? 120}
                    value={answers[field.id] ?? ""}
                    onChange={(e) => setAnswer(field.id, e.target.value)}
                    placeholder={field.label}
                    className="w-full rounded-lg border border-field bg-paper px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                  <div className="mt-1 flex justify-between gap-3">
                    {field.helpText ? (
                      <p className="text-xs text-muted">{field.helpText}</p>
                    ) : (
                      <span />
                    )}
                    {field.maxLength ? (
                      <span className="shrink-0 text-xs text-muted">
                        {(answers[field.id] ?? "").length}/{field.maxLength}
                      </span>
                    ) : null}
                  </div>
                  {fieldErrors[field.id] ? (
                    <p className="mt-1 text-xs font-medium text-danger">{fieldErrors[field.id]}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* ------------------------------------------------------ preview */}
          {previewField ? (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold text-ink">Preview</p>
              <div className="relative flex min-h-28 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper p-4">
                {imageField && photos[imageField.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photos[imageField.id]!.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-30"
                  />
                ) : null}
                <p
                  className="relative text-center text-2xl leading-tight font-semibold break-words"
                  style={{
                    fontFamily: FONT_STACKS[answers[fontField?.id ?? ""] ?? ""] ?? "var(--font-fraunces), serif",
                    color: answers[colorField?.id ?? ""] || "var(--color-ink)",
                  }}
                >
                  {answers[previewField.id] || "Your text here"}
                </p>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                An approximation of the layout — the artwork proof is the accurate one.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------ quantity + cart */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-lg border border-line-strong">
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-3 py-2 text-lg leading-none text-ink disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-10 text-center text-sm font-semibold tabular-nums">{quantity}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={quantity >= Math.min(20, availableStock)}
            onClick={() => setQuantity((q) => Math.min(20, availableStock, q + 1))}
            className="px-3 py-2 text-lg leading-none text-ink disabled:opacity-40"
          >
            +
          </button>
        </div>

        <p className="text-sm">
          <span className="text-muted">Total </span>
          <strong className="text-base text-ink">{formatPaise(unitPriceP * quantity)}</strong>
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || outOfStock}
          onClick={() => addToCart(false)}
          className="flex-1 rounded-full border-2 border-brand-500 px-6 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
        >
          {busy ? "Adding…" : outOfStock ? "Out of stock" : "Add to Cart"}
        </button>
        <button
          type="button"
          disabled={busy || outOfStock}
          onClick={() => addToCart(true)}
          className="flex-1 gc-cta rounded-full px-6 py-3 text-sm font-semibold transition disabled:opacity-50"
        >
          Buy Now
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            notice.tone === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <p className="text-xs text-muted">
        {outOfStock
          ? "We will restock this shortly — contact the workshop if you need it sooner."
          : availableStock <= 5
            ? `Only ${availableStock} left in stock.`
            : "In stock · dispatched in 3–5 working days."}
      </p>
    </div>
  );
}

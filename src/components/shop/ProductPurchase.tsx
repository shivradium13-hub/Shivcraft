"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { CustomerDesign } from "@/lib/customizer/design";
import { isZoneVisible, readConfig } from "@/lib/customizer/schema";
import { effectivePriceP, formatPaise } from "@/lib/money";
import type { ProductDetail } from "@/server/catalog/product";

import { notifyCartChanged } from "./CartBadge";
import { publishPrice } from "./pricingBridge";
import { CustomizerCanvas } from "./customizer/CustomizerCanvas";
import { CustomizerFonts } from "./customizer/CustomizerFonts";
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
const SWATCHES = ["#0f121f", "#ee722e", "#b3261e", "#151b39", "#1f7a4d", "#ad6616", "#ffffff"];

const ProductCustomizer = dynamic(
  () => import("./customizer/ProductCustomizer").then((m) => m.ProductCustomizer),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-card border border-brand-200 bg-brand-50/50 p-4">
        <p className="text-sm text-ink-soft">Preparing the personaliser…</p>
      </div>
    ),
  },
);

export function ProductPurchase({
  product,
  signedIn = false,
  savedDesign = null,
  savedDesignName = null,
}: {
  product: ProductDetail;
  signedIn?: boolean;
  /** A design opened from the customer's account, threaded into the customizer. */
  savedDesign?: CustomerDesign | null;
  savedDesignName?: string | null;
}) {
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
  /* Full-screen design preview (the "Preview" button), from the design the
     customizer reports via onDesignChange (ProductPurchase's own state, so the
     preview never subscribes to the bridge the customizer publishes to). */
  const [previewOpen, setPreviewOpen] = useState(false);

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

  /* Publish the live unit price so the headline price above these controls moves
     with the chosen variants, exactly like the Total below. The variant delta is
     added to both the MRP and the discounted price, so the savings stay the same
     and the % off is recomputed. Cleared on unmount. */
  useEffect(() => {
    let delta = 0;
    for (const group of product.variantGroups) {
      const option = group.options.find((o) => o.id === chosen[group.name]);
      if (option) delta += option.priceDeltaP;
    }
    const unitP = (product.discountPriceP ?? product.priceP) + delta;
    const mrpP = product.priceP + delta;
    const offPercent = mrpP > unitP ? Math.round(((mrpP - unitP) / mrpP) * 100) : 0;
    publishPrice(product.id, { unitP, mrpP, offPercent });
  }, [product, chosen]);

  useEffect(() => () => publishPrice(product.id, null), [product.id]);

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

  /* A product with no configuration returns the disabled default, so every
     existing product renders exactly as it did before. */
  const customizerConfig = useMemo(() => readConfig(product.customizer), [product.customizer]);
  const [design, setDesign] = useState<CustomerDesign | null>(null);

  /* Whether the personalisation is complete — every required, visible area has
     content. Mirrors the customizer's own "ready to add to cart" check, so the
     "Buy Now" button only appears once the design is done. */
  const designReady = useMemo(() => {
    if (!customizerConfig.enabled || !design) return false;
    const required = customizerConfig.zones.filter(
      (z) =>
        z.required &&
        customizerConfig.views.some((v) => v.zoneIds.includes(z.id)) &&
        isZoneVisible(customizerConfig, z, design.options),
    );
    return required.every((z) => {
      const value = design.zones[z.id];
      return value?.kind === "PHOTO"
        ? Boolean(value.photo.uploadId)
        : value?.kind === "TEXT"
          ? value.text.value.trim().length > 0
          : false;
    });
  }, [customizerConfig, design]);

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
          design: customizerConfig.enabled ? design : undefined,
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
                      : "border-field bg-field-bg text-ink hover:border-brand-400"
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

      {/* ---------------------------------------------------- customizer */}
      {customizerConfig.enabled ? <CustomizerFonts config={customizerConfig} /> : null}
      {customizerConfig.enabled ? (
        /* Always shown (Ritwika-style): the customer personalises right away —
           no "Customize Now" gate. The product image live-preview renders the
           design via the bridge. */
        <div id="sr-personalise" className="scroll-mt-24">
          <ProductCustomizer
            productId={product.id}
            productName={product.name}
            config={customizerConfig}
            basePriceP={effectivePriceP(product)}
            onDesignChange={setDesign}
            signedIn={signedIn}
            initialDesign={savedDesign}
            initialDesignName={savedDesignName}
            /* The live preview is the product image itself (ProductLivePreview),
               fed via the bridge under this product's id — so this panel renders
               only the controls, not a second canvas. */
            integrated
            bridgeId={product.id}
            active
            onActivate={() => {}}
          />
        </div>
      ) : null}

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
                      className="w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm outline-none focus:border-brand-500"
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
                    className="w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm outline-none focus:border-brand-500"
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
              <div className="relative flex min-h-28 items-center justify-center overflow-hidden rounded-lg border border-line p-4">
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
      {customizerConfig.enabled ? (
        /* Ritwika-style: a Preview button, then quantity + Add to Cart below it
           (no separate Buy Now). Add to Cart stays disabled until the required
           photo/text areas are filled. */
        <div className="grid gap-3">
          <p className="text-sm">
            <span className="text-muted">Total </span>
            <strong className="text-base text-ink">{formatPaise(unitPriceP * quantity)}</strong>
          </p>

          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={!design}
            className="w-full rounded-full border-2 border-brand-500 px-6 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
          >
            Preview
          </button>

          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center rounded-lg border border-line-strong">
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

            <button
              type="button"
              disabled={busy || outOfStock || !designReady}
              onClick={() => addToCart(false)}
              className="flex-1 gc-cta rounded-full px-6 py-3 text-sm font-semibold transition disabled:opacity-50"
            >
              {busy
                ? "Adding…"
                : outOfStock
                  ? "Out of stock"
                  : !designReady
                    ? "Complete personalisation"
                    : "Add to Cart"}
            </button>
          </div>

          {!designReady ? (
            <p className="text-xs text-muted">
              Fill the required photo and text areas above, then “Add to Cart” turns on.
            </p>
          ) : null}
        </div>
      ) : (
        /* Plain products: quantity + Total, then Add to Cart + Buy Now. */
        <>
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
        </>
      )}

      {/* Full-screen preview of the live design (the "Preview" button). */}
      {previewOpen && design ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Design preview"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/90 p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CustomizerCanvas config={customizerConfig} design={design} viewId={design.viewId} />
          </div>
          <button
            type="button"
            onClick={() => setPreviewOpen(false)}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Close
          </button>
        </div>
      ) : null}

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

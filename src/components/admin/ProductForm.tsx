"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type CategoryOption = { id: string; label: string };

type ImageRow = { id?: string; url: string; alt: string; isPrimary: boolean };
type FieldRow = {
  id?: string;
  type: "TEXT" | "IMAGE" | "FONT" | "COLOR" | "SELECT";
  label: string;
  helpText: string;
  isRequired: boolean;
  maxLength: number | null;
  options: string[];
};

export type ProductFormValues = {
  name: string;
  sku: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  price: string;
  discountPrice: string;
  stock: string;
  lowStockThreshold: string;
  brand: string;
  material: string;
  color: string;
  size: string;
  weightGrams: string;
  occasion: string;
  tags: string;
  videoUrl: string;
  isPersonalizable: boolean;
  isActive: boolean;
  isBestSeller: boolean;
  isTrending: boolean;
  metaTitle: string;
  metaDescription: string;
  images: ImageRow[];
  customizationFields: FieldRow[];
};

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "", sku: "", categoryId: "", shortDescription: "", description: "",
  price: "", discountPrice: "", stock: "0", lowStockThreshold: "5",
  brand: "", material: "", color: "", size: "", weightGrams: "", occasion: "",
  tags: "", videoUrl: "",
  isPersonalizable: false, isActive: true, isBestSeller: false, isTrending: false,
  metaTitle: "", metaDescription: "",
  images: [], customizationFields: [],
};

const input =
  "w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

export function ProductForm({
  productId,
  initial,
  categories,
  orderCount = 0,
  customizerEnabled = false,
  customizerConfigured = false,
}: {
  productId?: string;
  initial: ProductFormValues;
  categories: CategoryOption[];
  orderCount?: number;
  /** Whether the Frame Designer is currently live for this product. */
  customizerEnabled?: boolean;
  /** Whether a template has been built (so it can be turned on). */
  customizerConfigured?: boolean;
}) {
  const router = useRouter();
  const [fdEnabled, setFdEnabled] = useState(customizerEnabled);
  const [fdBusy, setFdBusy] = useState(false);
  const [fdError, setFdError] = useState<string | null>(null);

  async function toggleFrameDesigner(next: boolean) {
    if (!productId) return;
    setFdBusy(true);
    setFdError(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}/customizer`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFdError(json?.error?.message ?? "Could not change this setting.");
        return;
      }
      setFdEnabled(Boolean(json?.data?.enabled));
      router.refresh();
    } catch {
      setFdError("Network problem — please try again.");
    } finally {
      setFdBusy(false);
    }
  }
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Two-step delete confirmation, in-page rather than a native confirm() —
  // which some in-app browsers suppress, making the button seem dead.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const copy = { ...prev };
      delete copy[key as string];
      return copy;
    });
  }

  async function uploadImages(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/admin/media", { method: "POST", body });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error?.message ?? "That image could not be uploaded.");
          break;
        }
        setValues((prev) => ({
          ...prev,
          images: [
            ...prev.images,
            { url: json.data.url, alt: "", isPrimary: prev.images.length === 0 },
          ],
        }));
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save(thenDesign = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setErrors({});

    const payload = {
      name: values.name,
      sku: values.sku,
      categoryId: values.categoryId,
      shortDescription: values.shortDescription,
      description: values.description,
      price: Number(values.price),
      discountPrice: values.discountPrice ? Number(values.discountPrice) : null,
      stock: Number(values.stock),
      lowStockThreshold: Number(values.lowStockThreshold || 5),
      brand: values.brand,
      material: values.material,
      color: values.color,
      size: values.size,
      weightGrams: values.weightGrams ? Number(values.weightGrams) : null,
      occasion: values.occasion,
      tags: values.tags.split(",").map((t) => t.trim()).filter(Boolean),
      videoUrl: values.videoUrl,
      isPersonalizable: values.isPersonalizable,
      isActive: values.isActive,
      isBestSeller: values.isBestSeller,
      isTrending: values.isTrending,
      metaTitle: values.metaTitle,
      metaDescription: values.metaDescription,
      images: values.images,
      customizationFields: values.customizationFields,
    };

    try {
      const res = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
        method: productId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setErrors(json.error.fields);
        setError(json?.error?.message ?? "Could not save this product.");
        return;
      }

      if (productId) {
        setNotice("Saved. The storefront shows the change immediately.");
        router.refresh();
      } else {
        const newId = json.data.product.id;
        // After creating, either open the Frame Designer for the new product
        // or land on its editor.
        router.replace(thenDesign ? `/admin/products/${newId}/customizer` : `/admin/products/${newId}`);
      }
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not delete this product.");
        setConfirmingDelete(false);
        return;
      }
      // refresh() clears the client router cache so the just-deleted product
      // does not linger on the list; without it the delete looks like it
      // failed. push + refresh, then land on the list.
      router.push("/admin/products");
      router.refresh();
    } catch {
      setError("Network problem — please try again.");
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const err = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs font-medium text-danger">{errors[key]}</p> : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="space-y-4">
        {/* ------------------------------------------------------ basics */}
        <Card title="Basics">
          <Row>
            <Field label="Product name" required error={err("name")}>
              <input className={input} value={values.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="SKU" required error={err("sku")}>
              <input className={input} value={values.sku} onChange={(e) => set("sku", e.target.value)} />
            </Field>
          </Row>

          <Field
            label="Category"
            required
            error={err("categoryId")}
            hint="Pick a subcategory — products filed on a top-level category will not appear in browse."
          >
            <select
              className={input}
              value={values.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Short description" hint="One line, shown on cards and in search.">
            <input
              className={input}
              maxLength={300}
              value={values.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
            />
          </Field>

          <Field label="Full description">
            <textarea
              className={`${input} min-h-32`}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
        </Card>

        {/* ------------------------------------------------------ pricing */}
        <Card title="Pricing and stock">
          <Row>
            <Field label="List price (₹)" required error={err("price")}>
              <input type="number" min="0" className={input} value={values.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label="Selling price (₹)" hint="Leave empty to sell at list price." error={err("discountPrice")}>
              <input type="number" min="0" className={input} value={values.discountPrice} onChange={(e) => set("discountPrice", e.target.value)} />
            </Field>
          </Row>
          <Row>
            <Field label="Stock" required error={err("stock")}>
              <input type="number" min="0" className={input} value={values.stock} onChange={(e) => set("stock", e.target.value)} />
            </Field>
            <Field label="Low stock warning at" error={err("lowStockThreshold")}>
              <input type="number" min="0" className={input} value={values.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} />
            </Field>
          </Row>
        </Card>

        {/* ------------------------------------------------------- images */}
        <Card title="Images" subtitle="The first image, or the one you mark, is used on cards.">
          {values.images.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {values.images.map((image, i) => (
                <li key={image.url} className="overflow-hidden rounded-xl border border-sr-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" className="aspect-square w-full object-cover" />
                  <div className="flex flex-col gap-1 p-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setValues((prev) => ({
                          ...prev,
                          images: prev.images.map((im, j) => ({ ...im, isPrimary: j === i })),
                        }))
                      }
                      className={`rounded px-1.5 py-1 text-[10px] font-semibold ${
                        image.isPrimary ? "bg-sr-600 text-white" : "bg-sr-canvas text-sr-body hover:bg-sr-100"
                      }`}
                    >
                      {image.isPrimary ? "Main image" : "Make main"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setValues((prev) => {
                          const next = prev.images.filter((_, j) => j !== i);
                          if (next.length > 0 && !next.some((im) => im.isPrimary)) next[0].isPrimary = true;
                          return { ...prev, images: next };
                        })
                      }
                      className="rounded px-1.5 py-1 text-[10px] font-semibold text-danger hover:bg-danger-soft"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-sr-line-strong px-4 py-6 text-center text-sm text-sr-muted">
              No images yet. Products without an image still work, but they sell badly.
            </p>
          )}

          <div>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded-full bg-sr-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload images"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => e.target.files && uploadImages(e.target.files)}
            />
            <p className="mt-1.5 text-xs text-sr-muted">JPG, PNG or WebP, up to 8 MB each.</p>
          </div>

          <Field label="Video URL" hint="YouTube, Vimeo or your own hosting. We do not host video.">
            <input className={input} value={values.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} />
          </Field>
        </Card>

        {/* ---------------------------------------------------- attributes */}
        <Card title="Attributes">
          <Row>
            <Field label="Brand"><input className={input} value={values.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
            <Field label="Material"><input className={input} value={values.material} onChange={(e) => set("material", e.target.value)} /></Field>
          </Row>
          <Row>
            <Field label="Colour"><input className={input} value={values.color} onChange={(e) => set("color", e.target.value)} /></Field>
            <Field label="Size"><input className={input} value={values.size} onChange={(e) => set("size", e.target.value)} /></Field>
          </Row>
          <Row>
            <Field label="Weight (grams)"><input type="number" min="0" className={input} value={values.weightGrams} onChange={(e) => set("weightGrams", e.target.value)} /></Field>
            <Field label="Occasion"><input className={input} value={values.occasion} onChange={(e) => set("occasion", e.target.value)} /></Field>
          </Row>
          <Field label="Tags" hint="Comma separated. These are matched by search.">
            <input className={input} value={values.tags} onChange={(e) => set("tags", e.target.value)} />
          </Field>
        </Card>

        {/* -------------------------------------------------- frame designer */}
        <Card title="Frame Designer">
          {!productId ? (
            <div className="grid gap-2">
              <p className="text-sm text-sr-muted">
                Design a live personalizer for this product — image boxes, text boxes, frames,
                layers, colours, fonts and more. Fill in the details above (at least a name, category
                and price), then open the Frame Designer.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => save(true)}
                className="justify-self-start rounded-full bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save & design personalizer →"}
              </button>
              <p className="text-xs text-sr-muted">
                This creates the product and opens the Frame Designer. Tip: add a product image first
                (in the sidebar) so you have a background to design on.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-sr-ink">
                    {fdEnabled
                      ? "ON — customers can personalise this product"
                      : "OFF — normal direct-sale product"}
                  </p>
                  <p className="text-xs text-sr-muted">
                    When on, the live preview &amp; “Personalise it” panel show on the product page.
                    When off, it sells as a normal product.
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    fdEnabled ? "bg-success-soft text-success" : "bg-sr-canvas text-sr-muted"
                  }`}
                >
                  {fdEnabled ? "Live" : "Off"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* The toggle is only meaningful once a template exists. */}
                {customizerConfigured || fdEnabled ? (
                  <button
                    type="button"
                    disabled={fdBusy}
                    onClick={() => toggleFrameDesigner(!fdEnabled)}
                    className={`rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                      fdEnabled
                        ? "border border-danger text-danger hover:bg-danger-soft"
                        : "bg-sr-600 text-white hover:bg-sr-700"
                    }`}
                  >
                    {fdBusy
                      ? "Saving…"
                      : fdEnabled
                        ? "Turn off personalisation"
                        : "Turn on personalisation"}
                  </button>
                ) : null}

                <Link
                  href={`/admin/products/${productId}/customizer`}
                  className="rounded-full border border-sr-line-strong px-5 py-2.5 text-sm font-semibold text-sr-body transition hover:border-sr-400"
                >
                  {customizerConfigured ? "Open Frame Designer" : "Design personalizer"}
                </Link>
              </div>

              {!customizerConfigured && !fdEnabled ? (
                <p className="text-xs text-sr-muted">
                  No template yet. Open the Frame Designer to place image/text boxes and frames, then
                  turn it on.
                </p>
              ) : null}
              {fdError ? <p className="text-xs font-medium text-danger">{fdError}</p> : null}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------ personalisation */}
        <Card title="Simple personalisation fields">
          <Toggle
            checked={values.isPersonalizable}
            onChange={(v) => set("isPersonalizable", v)}
            label="This product is personalised"
            hint="A simpler alternative to the Frame Designer: the customer fills in the fields below (name, photo, etc.) before adding to cart."
          />

          {values.isPersonalizable ? (
            <>
              {errors.customizationFields ? (
                <p className="text-xs font-medium text-danger">{errors.customizationFields}</p>
              ) : null}

              <div className="space-y-3">
                {values.customizationFields.map((field, i) => (
                  <div key={i} className="rounded-xl border border-sr-line bg-sr-canvas p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-sr-600">FIELD {i + 1}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setValues((prev) => ({
                            ...prev,
                            customizationFields: prev.customizationFields.filter((_, j) => j !== i),
                          }))
                        }
                        className="ml-auto text-xs font-semibold text-danger hover:underline"
                      >
                        Remove
                      </button>
                    </div>

                    <Row>
                      <Field label="Type">
                        <select
                          className={input}
                          value={field.type}
                          onChange={(e) => patchField(setValues, i, { type: e.target.value as FieldRow["type"] })}
                        >
                          <option value="IMAGE">Photo upload</option>
                          <option value="TEXT">Text</option>
                          <option value="FONT">Font choice</option>
                          <option value="COLOR">Colour choice</option>
                          <option value="SELECT">Dropdown</option>
                        </select>
                      </Field>
                      <Field label="Label">
                        <input className={input} value={field.label} onChange={(e) => patchField(setValues, i, { label: e.target.value })} />
                      </Field>
                    </Row>

                    <Field label="Help text">
                      <input className={input} value={field.helpText} onChange={(e) => patchField(setValues, i, { helpText: e.target.value })} />
                    </Field>

                    {field.type === "TEXT" ? (
                      <Field label="Maximum characters">
                        <input
                          type="number"
                          min="1"
                          className={input}
                          value={field.maxLength ?? ""}
                          onChange={(e) => patchField(setValues, i, { maxLength: e.target.value ? Number(e.target.value) : null })}
                        />
                      </Field>
                    ) : null}

                    {field.type === "FONT" || field.type === "SELECT" || field.type === "COLOR" ? (
                      <Field label="Choices" hint="Comma separated.">
                        <input
                          className={input}
                          value={field.options.join(", ")}
                          onChange={(e) =>
                            patchField(setValues, i, {
                              options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                            })
                          }
                        />
                      </Field>
                    ) : null}

                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.isRequired}
                        onChange={(e) => patchField(setValues, i, { isRequired: e.target.checked })}
                        className="h-4 w-4 accent-sr-500"
                      />
                      Required
                    </label>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    customizationFields: [
                      ...prev.customizationFields,
                      { type: "TEXT", label: "", helpText: "", isRequired: false, maxLength: 40, options: [] },
                    ],
                  }))
                }
                className="w-full rounded-lg border border-dashed border-sr-line-strong px-4 py-2.5 text-sm font-medium text-sr-body hover:border-sr-400 hover:text-sr-700"
              >
                + Add a customisation field
              </button>
            </>
          ) : null}
        </Card>

        <Card title="Search listing">
          <Field label="Meta title"><input className={input} value={values.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} /></Field>
          <Field label="Meta description"><textarea className={`${input} min-h-20`} value={values.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} /></Field>
        </Card>
      </div>

      {/* --------------------------------------------------------- sidebar */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <Card title="Visibility">
          <Toggle checked={values.isActive} onChange={(v) => set("isActive", v)} label="Live on the storefront" hint="Turn this off to hide it without deleting." />
          <Toggle checked={values.isBestSeller} onChange={(v) => set("isBestSeller", v)} label="Best seller" />
          <Toggle checked={values.isTrending} onChange={(v) => set("isTrending", v)} label="Trending" />
        </Card>

        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => save()}
            className="w-full rounded-full bg-sr-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : productId ? "Save changes" : "Create product"}
          </button>

          {productId && !confirmingDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirmingDelete(true);
              }}
              className="w-full rounded-full border border-danger px-6 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-50"
            >
              Delete product
            </button>
          ) : null}

          {productId && confirmingDelete ? (
            <div className="rounded-lg border border-danger bg-danger-soft p-3">
              <p className="text-sm text-danger">
                {orderCount > 0
                  ? `Delete “${values.name}”? It appears in ${orderCount} order line${orderCount === 1 ? "" : "s"}. Those orders keep their own record and are not affected, but will no longer link here. This cannot be undone — to hide it instead, turn off “Live on the storefront”.`
                  : `Delete “${values.name}”? This cannot be undone.`}
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={remove}
                  className="flex-1 rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 rounded-full border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {notice ? (
            <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{notice}</p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function patchField(
  setValues: React.Dispatch<React.SetStateAction<ProductFormValues>>,
  index: number,
  patch: Partial<FieldRow>,
) {
  setValues((prev) => ({
    ...prev,
    customizationFields: prev.customizationFields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
  }));
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
      <h2 className="font-display text-base font-semibold text-sr-ink">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-xs text-sr-muted">{subtitle}</p> : null}
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-sr-ink">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-sr-muted">{hint}</span> : null}
      {error}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sr-500"
      />
      <span className="text-sm">
        <span className="block font-medium text-sr-ink">{label}</span>
        {hint ? <span className="block text-xs text-sr-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type CategoryOption = { id: string; label: string };

type ImageRow = { id?: string; url: string; alt: string; isPrimary: boolean };
type FieldRow = {
  id?: string;
  type: "TEXT" | "IMAGE" | "FONT" | "COLOR" | "SELECT";
  label: string;
  helpText: string;
  isRequired: boolean;
  showPreview: boolean;
  textCase: "normal" | "upper";
  maxLength: number | null;
  options: string[];
};
type VariantRow = {
  id?: string;
  name: string;
  value: string;
  sku: string;
  priceDelta: string;
  stock: string;
  isActive: boolean;
};
/** One promo banner the product page rotates through: an image + optional link. */
type BannerRow = { url: string; href: string; label: string };
/** How the promo banners animate between each other. */
type BannerTransition = "flip" | "fade" | "slide" | "slide-up";

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
  promoBanners: BannerRow[];
  promoBannerTransition: BannerTransition;
  promoBannerDesktop: boolean;
  promoBannerMobile: boolean;
  cardHoverPreview: boolean;
  cardTouchPreview: boolean;
  isPersonalizable: boolean;
  variantPriceAbsolute: boolean;
  simpleUploadMode: boolean;
  isActive: boolean;
  isBestSeller: boolean;
  isTrending: boolean;
  metaTitle: string;
  metaDescription: string;
  images: ImageRow[];
  customizationFields: FieldRow[];
  variants: VariantRow[];
};

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "", sku: "", categoryId: "", shortDescription: "", description: "",
  price: "", discountPrice: "", stock: "0", lowStockThreshold: "5",
  brand: "", material: "", color: "", size: "", weightGrams: "", occasion: "",
  tags: "", videoUrl: "",
  promoBanners: [],
  promoBannerTransition: "flip",
  promoBannerDesktop: true, promoBannerMobile: true,
  cardHoverPreview: true, cardTouchPreview: true,
  // New products use full per-option prices (no "+"): the customer sees each
  // size's actual price, not an amount added to the base. Matches every
  // existing product; an admin can still switch to "+" (delta) per product.
  isPersonalizable: false, variantPriceAbsolute: true, simpleUploadMode: false, isActive: true, isBestSeller: false, isTrending: false,
  metaTitle: "", metaDescription: "",
  images: [], customizationFields: [], variants: [],
};

/* A variant attribute (e.g. "Size") and its options (e.g. S, M, L). It is stored
   flat in product_variants — one row per option, keyed by the attribute name —
   and grouped here only so the editor can nest options under their attribute. */
type OptionRow = { id?: string; value: string; priceDelta: string; stock: string; sku: string; isActive: boolean };
type AttributeRow = { key: string; name: string; options: OptionRow[]; priced: boolean };

let attrKeySeq = 0;
const newAttrKey = () => `attr-${attrKeySeq++}`;
const blankOption = (): OptionRow => ({ value: "", priceDelta: "0", stock: "0", sku: "", isActive: true });

/** Group the flat variant rows into attributes, preserving first-seen order. */
function groupVariantsToAttributes(variants: VariantRow[]): AttributeRow[] {
  const byName = new Map<string, AttributeRow>();
  const order: AttributeRow[] = [];
  for (const v of variants) {
    let a = byName.get(v.name);
    if (!a) {
      a = { key: newAttrKey(), name: v.name, options: [], priced: false };
      byName.set(v.name, a);
      order.push(a);
    }
    a.options.push({ id: v.id, value: v.value, priceDelta: v.priceDelta, stock: v.stock, sku: v.sku, isActive: v.isActive });
  }
  // An option type "has a price" when any of its choices carries a non-zero
  // price change; otherwise it is a plain selection and no price column shows.
  for (const a of order) a.priced = a.options.some((o) => Number(o.priceDelta) !== 0);
  return order;
}

/** A fresh, empty option type the admin can fill in (e.g. a new "Frame colour"). */
const blankGroup = (): AttributeRow => ({ key: newAttrKey(), name: "", options: [blankOption()], priced: false });

/** Flatten attributes back to the variant rows the save payload expects. */
function flattenAttributesToVariants(attributes: AttributeRow[]): VariantRow[] {
  const out: VariantRow[] = [];
  for (const a of attributes) {
    for (const o of a.options) {
      out.push({
        ...(o.id ? { id: o.id } : {}),
        name: a.name,
        value: o.value,
        sku: o.sku,
        // A non-priced option type saves a zero price change for every choice.
        priceDelta: a.priced ? o.priceDelta : "0",
        stock: o.stock,
        isActive: o.isActive,
      });
    }
  }
  return out;
}

const inputBase =
  "rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";
const input = `w-full ${inputBase}`;

/* Two ready-made customisation fields the admin can drop in with one tap. Both
   run through the normal customisation pipeline, so the customer's pick arrives
   on the order (shown to the workshop in the order's "Customisation" box). The
   admin can still edit the label/choices afterwards. */
const COLOUR_FIELD: FieldRow = {
  type: "COLOR",
  label: "Colour",
  helpText: "Choose a colour.",
  isRequired: false,
  showPreview: false,
  textCase: "normal",
  maxLength: null,
  // "Name #code": the swatch renders the exact shade, and the order records the
  // name + code together for the workshop. Edit these to your real finishes.
  options: [
    "Black #111111",
    "White #ffffff",
    "Gold #d4af37",
    "Silver #c0c0c0",
    "Red #e03131",
    "Blue #1971c2",
  ],
};
const WHATSAPP_PREVIEW_FIELD: FieldRow = {
  type: "TEXT",
  label: "Share your WhatsApp Number For Preview",
  helpText: "We'll send a design preview on WhatsApp before we make it.",
  isRequired: false,
  showPreview: false,
  textCase: "normal",
  maxLength: 15,
  options: [],
};

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
  const bannerFileRef = useRef<HTMLInputElement>(null);
  // Which banner row a pending image upload belongs to.
  const bannerTargetIndex = useRef<number>(0);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const copy = { ...prev };
      delete copy[key as string];
      return copy;
    });
  }

  /* The product's option types (e.g. Size, Frame colour), each with its own
     options. Stored flat in product_variants keyed by the type name and grouped
     back here for editing; flattened to variant rows on save. A product can have
     several option types, each shown to the customer as its own row of choices. */
  const [groups, setGroups] = useState<AttributeRow[]>(() => groupVariantsToAttributes(initial.variants));

  const addGroup = () => setGroups((gs) => [...gs, blankGroup()]);
  const removeGroup = (key: string) => setGroups((gs) => gs.filter((g) => g.key !== key));
  const setGroupName = (key: string, name: string) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, name } : g)));
  const addOption = (key: string) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, options: [...g.options, blankOption()] } : g)));
  const setOption = (key: string, index: number, patch: Partial<OptionRow>) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.key === key ? { ...g, options: g.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) } : g,
      ),
    );
  const removeOption = (key: string, index: number) =>
    setGroups((gs) =>
      gs.map((g) => (g.key === key ? { ...g, options: g.options.filter((_, i) => i !== index) } : g)),
    );
  // Admin decides per option type whether it changes the price. Turning it off
  // hides the price column and clears any amounts so nothing is charged for it.
  const setGroupPriced = (key: string, priced: boolean) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.key === key
          ? { ...g, priced, options: priced ? g.options : g.options.map((o) => ({ ...o, priceDelta: "0" })) }
          : g,
      ),
    );

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

  const addBanner = () =>
    setValues((prev) => ({ ...prev, promoBanners: [...prev.promoBanners, { url: "", href: "", label: "" }] }));
  const removeBanner = (index: number) =>
    setValues((prev) => ({ ...prev, promoBanners: prev.promoBanners.filter((_, i) => i !== index) }));
  const setBanner = (index: number, patch: Partial<BannerRow>) =>
    setValues((prev) => ({
      ...prev,
      promoBanners: prev.promoBanners.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));

  // Reorder product images; order drives the card preview (and the 2nd image
  // used for the desktop hover). dir is -1 (earlier) or +1 (later).
  const moveImage = (index: number, dir: -1 | 1) =>
    setValues((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.images.length) return prev;
      const next = [...prev.images];
      [next[index], next[j]] = [next[j], next[index]];
      return { ...prev, images: next };
    });

  // Reorder personalisation fields; the array order becomes each field's saved
  // position, which is the order the customer sees them in.
  const moveField = (index: number, dir: -1 | 1) =>
    setValues((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.customizationFields.length) return prev;
      const next = [...prev.customizationFields];
      [next[index], next[j]] = [next[j], next[index]];
      return { ...prev, customizationFields: next };
    });

  async function uploadBanner(file: File) {
    const index = bannerTargetIndex.current;
    setUploadingBanner(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That image could not be uploaded.");
        return;
      }
      setBanner(index, { url: json.data.url });
    } finally {
      setUploadingBanner(false);
      if (bannerFileRef.current) bannerFileRef.current.value = "";
    }
  }

  async function save(thenDesign = false) {
    // Don't silently drop a half-filled option: a row with a price or stock but
    // no name would be discarded on save (the admin's price would vanish). Tell
    // them to name it instead.
    const incompleteOption = groups
      .flatMap((g) => g.options)
      .find((o) => !o.value.trim() && (Number(o.priceDelta) !== 0 || Number(o.stock) !== 0));
    if (incompleteOption) {
      setError(
        `Give every option a name (e.g. S, M, L). An option has a price or stock but no name, so it would not be saved.`,
      );
      setNotice(null);
      return;
    }

    // An option type with choices but no name of its own would also be dropped
    // (we key variants by the type's name), so make the admin name it.
    const unnamedGroup = groups.find((g) => !g.name.trim() && g.options.some((o) => o.value.trim()));
    if (unnamedGroup) {
      setError(
        `Name every option type (e.g. "Size" or "Frame colour"). An option type has choices but no name, so they would not be saved.`,
      );
      setNotice(null);
      return;
    }

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
      // Only banners with an image are saved; label/link alone are dropped.
      promoBanners: values.promoBanners
        .filter((b) => b.url.trim())
        .map((b) => ({ url: b.url.trim(), href: b.href.trim(), label: b.label.trim() })),
      promoBannerTransition: values.promoBannerTransition,
      promoBannerDesktop: values.promoBannerDesktop,
      promoBannerMobile: values.promoBannerMobile,
      cardHoverPreview: values.cardHoverPreview,
      cardTouchPreview: values.cardTouchPreview,
      // The Frame Designer path does not use the simple personalisation fields,
      // so it is never blocked by their "add at least one field" rule — the
      // admin builds the template in the designer instead.
      isPersonalizable: thenDesign ? false : values.isPersonalizable,
      variantPriceAbsolute: values.variantPriceAbsolute,
      simpleUploadMode: thenDesign ? false : values.simpleUploadMode,
      isActive: values.isActive,
      isBestSeller: values.isBestSeller,
      isTrending: values.isTrending,
      metaTitle: values.metaTitle,
      metaDescription: values.metaDescription,
      images: values.images,
      customizationFields: thenDesign ? [] : values.customizationFields,
      variants: flattenAttributesToVariants(groups.map((g) => ({ ...g, name: g.name.trim() })))
        // Only complete options are saved: an option with no label, or one under
        // an unnamed option type, is dropped rather than persisted as a broken row.
        .filter((v) => v.name.trim() && v.value.trim())
        .map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          name: v.name.trim(),
          value: v.value.trim(),
          sku: v.sku.trim(),
          priceDelta: Number(v.priceDelta || 0),
          stock: Number(v.stock || 0),
          isActive: v.isActive,
        })),
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

  /* "Photo + text upload only": hide the Frame Designer on the storefront and
     let the customer just upload a photo and type text. Turning it on seeds a
     photo + text field (if none yet) so the admin need not build them; the
     Frame Designer template, if any, is left untouched and returns when this is
     turned back off. */
  function setSimpleUpload(on: boolean) {
    setValues((prev) => {
      if (!on) return { ...prev, simpleUploadMode: false };
      const fields = [...prev.customizationFields];
      if (!fields.some((f) => f.type === "IMAGE")) {
        fields.push({ type: "IMAGE", label: "Upload your photo", helpText: "", isRequired: true, showPreview: true, textCase: "normal", maxLength: null, options: [] });
      }
      if (!fields.some((f) => f.type === "TEXT")) {
        fields.push({ type: "TEXT", label: "Your text / name", helpText: "", isRequired: false, showPreview: true, textCase: "normal", maxLength: 60, options: [] });
      }
      return { ...prev, simpleUploadMode: true, isPersonalizable: true, customizationFields: fields };
    });
  }

  /* One-tap add for a preset field (Colour / WhatsApp-for-preview). Turns
     personalisation on and appends the field unless one just like it (same type
     + label) is already present, so tapping twice does not duplicate it. */
  function addPresetField(preset: FieldRow) {
    setValues((prev) => {
      const already = prev.customizationFields.some(
        (f) => f.type === preset.type && f.label.trim().toLowerCase() === preset.label.trim().toLowerCase(),
      );
      return {
        ...prev,
        isPersonalizable: true,
        customizationFields: already
          ? prev.customizationFields
          : [...prev.customizationFields, preset],
      };
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="min-w-0 space-y-4">
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

          {/* Searchable category picker: many subcategories exist, so a plain
              <select> is slow to scan — type to filter instead. Rendered on a
              <div> (not <Field>'s <label>) so the listbox buttons don't sit
              inside a label. */}
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold text-sr-ink">
              Category<span className="ml-0.5 text-danger">*</span>
            </span>
            <CategoryCombobox
              categories={categories}
              value={values.categoryId}
              onChange={(id) => set("categoryId", id)}
              invalid={!!errors.categoryId}
            />
            <span className="text-xs text-sr-muted">
              Pick a subcategory — products filed on a top-level category will not appear in browse.
            </span>
            {err("categoryId")}
          </div>

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

        {/* -------------------------------------------- options / variants */}
        <Card
          title="Options / variants"
          subtitle="Offer the product in choices the customer picks from — e.g. a Size and a Frame colour. Add an option type for each thing they choose. Tick “This option changes the price” only for the types that affect the price; the rest are just a choice. Leave empty for a single-version product."
        >
          {groups.some((g) => g.priced) && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5">
              <input
                type="checkbox"
                checked={values.variantPriceAbsolute}
                onChange={(e) => set("variantPriceAbsolute", e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-sr-600"
              />
              <span>
                <span className="block text-sm font-medium text-sr-ink">Option price is the full price</span>
                <span className="block text-xs text-sr-muted">
                  When on, each option’s price is used as-is as the final price (no base added, no “+”).
                  Off: the price is added to the base price.
                </span>
              </span>
            </label>
          )}

          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-sr-line-strong px-4 py-6 text-center text-sm text-sr-muted">
              No options yet. Add an option type like “Size” or “Frame colour”, then list its choices.
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((grp) => (
                <div key={grp.key} className="space-y-2.5 rounded-xl border border-sr-line bg-sr-canvas p-3">
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs font-medium text-sr-body">Option type</label>
                      <input
                        className={input}
                        value={grp.name}
                        placeholder="Size"
                        onChange={(e) => setGroupName(grp.key, e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGroup(grp.key)}
                      className="shrink-0 rounded-lg border border-sr-line px-3 py-2 text-xs font-medium text-sr-muted transition hover:border-danger hover:bg-danger-soft hover:text-danger"
                    >
                      Remove type
                    </button>
                  </div>

                  {/* Admin chooses whether this option type affects the price.
                      Off = just a choice (no price column, nothing charged). */}
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-sr-body">
                    <input
                      type="checkbox"
                      checked={grp.priced}
                      onChange={(e) => setGroupPriced(grp.key, e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-sr-600"
                    />
                    This option changes the price
                  </label>

                  {grp.options.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-sr-line-strong px-4 py-5 text-center text-sm text-sr-muted">
                      No options yet. Add one like “S”, “M” or “8×12 in”.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 pl-1 text-[11px] font-semibold text-sr-muted">
                        <span className="min-w-0 flex-1">{grp.name.trim() || "Option"}</span>
                        {grp.priced ? (
                          <span className="w-24 text-right">{values.variantPriceAbsolute ? "Price ₹" : "± ₹"}</span>
                        ) : null}
                        <span className="w-16 text-right">Stock</span>
                        <span className="w-6" />
                      </div>
                      {grp.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            className={`${inputBase} min-w-0 flex-1`}
                            value={opt.value}
                            placeholder={`${grp.name.trim() || "Option"} (e.g. M)`}
                            onChange={(e) => setOption(grp.key, i, { value: e.target.value })}
                          />
                          {grp.priced ? (
                            <input
                              type="number"
                              step="1"
                              className={`${inputBase} w-24 shrink-0`}
                              value={opt.priceDelta}
                              onChange={(e) => setOption(grp.key, i, { priceDelta: e.target.value })}
                            />
                          ) : null}
                          <input
                            type="number"
                            min="0"
                            className={`${inputBase} w-16 shrink-0`}
                            value={opt.stock}
                            onChange={(e) => setOption(grp.key, i, { stock: e.target.value })}
                          />
                          <button
                            type="button"
                            aria-label="Remove option"
                            onClick={() => removeOption(grp.key, i)}
                            className="flex h-8 w-6 shrink-0 items-center justify-center rounded-lg text-sr-muted transition hover:bg-danger-soft hover:text-danger"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => addOption(grp.key)}
                    className="w-full rounded-lg border border-dashed border-sr-line-strong px-4 py-2 text-sm font-medium text-sr-body hover:border-sr-400 hover:text-sr-700"
                  >
                    + Add option
                  </button>
                </div>
              ))}

              {groups.length > 1 && (
                <p className="px-1 text-xs text-sr-muted">
                  With more than one option type, give each at least two choices — the customer always has one
                  from every type selected, so a type with a single choice just adds its price to every order.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={addGroup}
            className="w-full rounded-lg border border-dashed border-sr-line-strong px-4 py-2.5 text-sm font-medium text-sr-body hover:border-sr-400 hover:text-sr-700"
          >
            {groups.length === 0 ? "+ Add option type" : "+ Add another option type"}
          </button>
        </Card>

        {/* ------------------------------------------------------- images */}
        <Card
          title="Images"
          subtitle="The first image, or the one you mark as main, is used on cards. On a card the customer previews the other images by hovering (desktop) or tapping/swiping (mobile) — use ← → to set the order they appear in."
        >
          {values.images.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {values.images.map((image, i) => (
                <li key={image.url} className="overflow-hidden rounded-xl border border-sr-line">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="aspect-square w-full object-cover" />
                    <span className="absolute top-1 left-1 rounded bg-ink/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {i + 1}
                    </span>
                  </div>
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
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label="Move earlier"
                        disabled={i === 0}
                        onClick={() => moveImage(i, -1)}
                        className="flex-1 rounded bg-sr-canvas px-1.5 py-1 text-[11px] font-semibold text-sr-body hover:bg-sr-100 disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label="Move later"
                        disabled={i === values.images.length - 1}
                        onClick={() => moveImage(i, 1)}
                        className="flex-1 rounded bg-sr-canvas px-1.5 py-1 text-[11px] font-semibold text-sr-body hover:bg-sr-100 disabled:opacity-40"
                      >
                        →
                      </button>
                    </div>
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

          <div>
            <p className="mb-1.5 text-xs font-medium text-sr-body">Card image preview</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={values.cardHoverPreview}
                  onChange={(e) => set("cardHoverPreview", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-sr-600"
                />
                <span className="text-sm font-medium text-sr-ink">Hover preview (desktop)</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={values.cardTouchPreview}
                  onChange={(e) => set("cardTouchPreview", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-sr-600"
                />
                <span className="text-sm font-medium text-sr-ink">Tap &amp; swipe (mobile)</span>
              </label>
            </div>
            <p className="mt-1.5 text-xs text-sr-muted">
              Only applies when the product has more than one image. Off on both shows just the main image on the card.
            </p>
          </div>

          <Field label="Video URL" hint="YouTube, Vimeo or your own hosting. We do not host video.">
            <input className={input} value={values.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} />
          </Field>
        </Card>

        {/* ------------------------------------------------- promo banner */}
        <Card
          title="Promo banners"
          subtitle="Optional clickable banners shown on the product page, just above the options. Add one or more — with several, the page flips through them automatically. Leave empty for none."
        >
          {values.promoBanners.length === 0 ? (
            <p className="rounded-lg border border-dashed border-sr-line-strong px-4 py-6 text-center text-sm text-sr-muted">
              No banners yet. Add one, upload a wide image and set where it links (the whole banner is the button).
            </p>
          ) : (
            <div className="space-y-3">
              {values.promoBanners.map((banner, i) => (
                <div key={i} className="space-y-2.5 rounded-xl border border-sr-line bg-sr-canvas p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-sr-muted">Banner {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeBanner(i)}
                      className="rounded px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger-soft"
                    >
                      Remove
                    </button>
                  </div>

                  {banner.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={banner.url} alt="" className="w-full rounded-lg border border-sr-line object-cover" />
                  ) : (
                    <p className="rounded-lg border border-dashed border-sr-line-strong px-4 py-5 text-center text-sm text-sr-muted">
                      No image yet — upload a wide banner.
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={uploadingBanner}
                    onClick={() => {
                      bannerTargetIndex.current = i;
                      bannerFileRef.current?.click();
                    }}
                    className="rounded-full bg-sr-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {uploadingBanner ? "Uploading…" : banner.url ? "Replace image" : "Upload image"}
                  </button>

                  <Field label="Link" hint="Another product on this site (e.g. /product/acrylic-…) or a full URL (https://…).">
                    <input
                      className={input}
                      value={banner.href}
                      placeholder="/product/…"
                      onChange={(e) => setBanner(i, { href: e.target.value })}
                    />
                  </Field>

                  <Field label="Banner text (for accessibility)" hint="Short description read by screen readers. Optional.">
                    <input
                      className={input}
                      value={banner.label}
                      placeholder="Also available as an Acrylic print"
                      onChange={(e) => setBanner(i, { label: e.target.value })}
                    />
                  </Field>
                </div>
              ))}
            </div>
          )}

          {/* Shared hidden file input; the clicked banner sets bannerTargetIndex. */}
          <input
            ref={bannerFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])}
          />
          <button
            type="button"
            onClick={addBanner}
            className="w-full rounded-lg border border-dashed border-sr-line-strong px-4 py-2.5 text-sm font-medium text-sr-body hover:border-sr-400 hover:text-sr-700"
          >
            + Add banner
          </button>
          <p className="text-xs text-sr-muted">
            A wide banner reads best. JPG, PNG or WebP, up to 8 MB. With more than one, they rotate automatically on the
            product page.
          </p>

          <Field label="Transition" hint="How the banners animate between each other (with two or more banners).">
            <select
              className={input}
              value={values.promoBannerTransition}
              onChange={(e) => set("promoBannerTransition", e.target.value as BannerTransition)}
            >
              <option value="flip">Flip</option>
              <option value="fade">Fade</option>
              <option value="slide">Slide (sideways)</option>
              <option value="slide-up">Slide up</option>
            </select>
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-medium text-sr-body">Show the banners on</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={values.promoBannerDesktop}
                  onChange={(e) => set("promoBannerDesktop", e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-sr-600"
                />
                <span className="text-sm font-medium text-sr-ink">Desktop / laptop</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={values.promoBannerMobile}
                  onChange={(e) => set("promoBannerMobile", e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-sr-600"
                />
                <span className="text-sm font-medium text-sr-ink">Mobile / phone</span>
              </label>
            </div>
            <p className="mt-1.5 text-xs text-sr-muted">
              Turn one off to show the banner only on the other. Both off hides it everywhere.
            </p>
          </div>
        </Card>

        {/* The "Attributes" card (brand/material/colour/size/weight/occasion/tags)
            was removed from the form on request — the values are still kept in
            state and saved, so existing products keep theirs; new ones just leave
            them blank. */}

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
            checked={values.simpleUploadMode}
            onChange={setSimpleUpload}
            label="Photo + text upload only (hide Frame Designer)"
            hint="The customer just uploads a photo and types text — no live designer. Any Frame Designer template is kept and comes back if you switch this off."
          />
          {values.simpleUploadMode ? (
            <p className="rounded-lg bg-sr-canvas px-3 py-2 text-xs text-sr-muted">
              On the storefront this product shows a photo-upload box and a text box instead of the Frame
              Designer. The photo &amp; text fields below were added automatically — edit their labels or add
              more fields if you like.
            </p>
          ) : null}

          <Toggle
            checked={values.isPersonalizable}
            onChange={(v) => set("isPersonalizable", v)}
            label="This product is personalised"
            hint="A simpler alternative to the Frame Designer: the customer fills in the fields below (name, photo, etc.) before adding to cart."
          />

          {/* One-tap shortcuts for the two most-asked options. Each turns
              personalisation on and drops in a ready-made field; the customer's
              answer comes back on the order. */}
          <div className="rounded-lg bg-sr-canvas p-3">
            <p className="mb-2 text-xs font-medium text-sr-body">
              Quick-add common options (they reach you with each order):
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addPresetField(COLOUR_FIELD)}
                className="rounded-full border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400 hover:text-sr-700"
              >
                + Colour option
              </button>
              <button
                type="button"
                onClick={() => addPresetField(WHATSAPP_PREVIEW_FIELD)}
                className="rounded-full border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400 hover:text-sr-700"
              >
                + WhatsApp number for preview
              </button>
            </div>
          </div>

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
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Move field up"
                          disabled={i === 0}
                          onClick={() => moveField(i, -1)}
                          className="rounded border border-sr-line bg-paper px-2 py-1 text-xs font-semibold text-sr-body hover:bg-sr-100 disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Move field down"
                          disabled={i === values.customizationFields.length - 1}
                          onClick={() => moveField(i, 1)}
                          className="rounded border border-sr-line bg-paper px-2 py-1 text-xs font-semibold text-sr-body hover:bg-sr-100 disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setValues((prev) => ({
                              ...prev,
                              customizationFields: prev.customizationFields.filter((_, j) => j !== i),
                            }))
                          }
                          className="text-xs font-semibold text-danger hover:underline"
                        >
                          Remove
                        </button>
                      </div>
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
                      <Row>
                        <Field label="Maximum characters">
                          <input
                            type="number"
                            min="1"
                            className={input}
                            value={field.maxLength ?? ""}
                            onChange={(e) => patchField(setValues, i, { maxLength: e.target.value ? Number(e.target.value) : null })}
                          />
                        </Field>
                        <Field label="Letter case" hint="Locks what the customer types.">
                          <select
                            className={input}
                            value={field.textCase}
                            onChange={(e) => patchField(setValues, i, { textCase: e.target.value as FieldRow["textCase"] })}
                          >
                            <option value="normal">As typed (capital + small)</option>
                            <option value="upper">UPPERCASE only</option>
                          </select>
                        </Field>
                      </Row>
                    ) : null}

                    {field.type === "FONT" || field.type === "SELECT" || field.type === "COLOR" ? (
                      <Field
                        label="Choices"
                        hint={
                          field.type === "COLOR"
                            ? "Comma separated. Add a colour code for the exact shade — e.g. “Rose Gold #b76e79”. The name + code reach you on the order."
                            : "Comma separated."
                        }
                      >
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

                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={field.isRequired}
                          onChange={(e) => patchField(setValues, i, { isRequired: e.target.checked })}
                          className="h-4 w-4 accent-sr-500"
                        />
                        Required
                      </label>
                      {field.type === "TEXT" || field.type === "IMAGE" ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={field.showPreview}
                            onChange={(e) => patchField(setValues, i, { showPreview: e.target.checked })}
                            className="h-4 w-4 accent-sr-500"
                          />
                          Show in live preview
                        </label>
                      ) : null}
                    </div>
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
                      { type: "TEXT", label: "", helpText: "", isRequired: false, showPreview: true, textCase: "normal", maxLength: 40, options: [] },
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
      <div className="min-w-0 space-y-4 lg:sticky lg:top-4">
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
      {/* grid-cols-1 (minmax(0,1fr)) rather than an implicit auto column, so wide
          children shrink instead of forcing the card — and the page — wider than
          a phone. */}
      <div className="mt-3 grid grid-cols-1 gap-3">{children}</div>
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

/** A type-to-filter category picker. Behaves like a <select> for the form
 *  (emits the chosen category id) but lets the admin search a long subcategory
 *  list. Same open/keyboard/outside-click pattern as the storefront SearchBar. */
function CategoryCombobox({
  categories,
  value,
  onChange,
  invalid,
}: {
  categories: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
}) {
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = categories.find((c) => c.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.label.toLowerCase().includes(q));
  }, [categories, query]);

  // Close when clicking outside (mirrors SearchBar).
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function openList() {
    setOpen(true);
    setQuery("");
    // Highlight the current choice (against the full list, since clearing the
    // query shows every category) so Enter keeps it.
    const i = selected ? categories.findIndex((c) => c.id === selected.id) : 0;
    setActive(i < 0 ? 0 : i);
  }

  function choose(c: CategoryOption) {
    onChange(c.id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        if (filtered[active]) choose(filtered[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  // Show the typed query while open, otherwise the chosen label.
  const shown = open ? query : (selected?.label ?? "");

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={shown}
        placeholder="Search or choose a category…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
        className={`${input} pr-9 ${invalid ? "border-danger" : ""}`}
      />
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-sr-muted"
      >
        <path
          d="M5.5 7.5 10 12l4.5-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border border-field bg-paper shadow-lift"
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-sr-muted">
                No category matches “{query.trim()}”.
              </li>
            ) : (
              filtered.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.id === value}
                    onMouseEnter={() => setActive(i)}
                    // Keep input focus so the click lands as a selection, not a blur.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(c)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                      i === active ? "bg-sr-100 text-sr-ink" : "text-sr-body"
                    }`}
                  >
                    <span className="truncate">{c.label}</span>
                    {c.id === value ? <span className="shrink-0 text-sr-600">✓</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
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

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  HOME_SECTION_META,
  LOGO_HEIGHT_MAX,
  LOGO_HEIGHT_MIN,
  MAX_PROMISES,
  POPUP_DELAY_MAX,
  POPUP_REPEAT_MAX,
  PRODUCT_FEATURE_META,
  type ProductFeatureId,
  type StorefrontSettings,
} from "@/lib/storefront";

const HOME_LABEL = new Map(HOME_SECTION_META.map((s) => [s.id, s]));

/** One labelled logo-size control: a live preview, a slider and a number box. */
function LogoSizeControl({
  label,
  value,
  onChange,
  src = "/logo.png",
  dark = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Which logo image to preview. */
  src?: string;
  /** Preview on a dark chip (for a white-wordmark logo like the footer's). */
  dark?: boolean;
}) {
  const clamp = (n: number) => Math.min(LOGO_HEIGHT_MAX, Math.max(LOGO_HEIGHT_MIN, n));
  return (
    <div className="rounded-lg border border-sr-line bg-sr-canvas p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-sr-ink">{label}</span>
        <span className="flex items-center gap-1 text-sm text-sr-body">
          <input
            type="number"
            min={LOGO_HEIGHT_MIN}
            max={LOGO_HEIGHT_MAX}
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value) || LOGO_HEIGHT_MIN))}
            className="w-16 rounded-lg border border-field bg-field-bg px-2 py-1 text-sm text-sr-ink outline-none focus:border-sr-400"
          />
          <span className="text-sr-muted">px</span>
        </span>
      </div>
      <div
        className={`mb-2 flex min-h-[64px] items-center justify-center rounded-lg border px-3 py-2 ${
          dark ? "border-night-line bg-night" : "border-sr-line bg-sr-surface"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Shiv Radium" style={{ height: value }} className="w-auto object-contain" />
      </div>
      <input
        type="range"
        min={LOGO_HEIGHT_MIN}
        max={LOGO_HEIGHT_MAX}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sr-600"
        aria-label={`${label} logo height`}
      />
    </div>
  );
}

export function StorefrontForm({ initial }: { initial: StorefrontSettings }) {
  const router = useRouter();
  const [home, setHome] = useState(initial.home);
  const [product, setProduct] = useState(initial.product);
  const [promises, setPromises] = useState(initial.promises);
  const [logoHeight, setLogoHeight] = useState(initial.logoHeight);
  const [logoHeightMobile, setLogoHeightMobile] = useState(initial.logoHeightMobile);
  const [footerLogoHeight, setFooterLogoHeight] = useState(initial.footerLogoHeight);
  const [footerLogoHeightMobile, setFooterLogoHeightMobile] = useState(
    initial.footerLogoHeightMobile,
  );
  const [popup, setPopup] = useState(initial.popup);
  const [popupUploading, setPopupUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function dirty() {
    setNotice(null);
  }

  function setPopupField<K extends keyof typeof popup>(key: K, value: (typeof popup)[K]) {
    setPopup((prev) => ({ ...prev, [key]: value }));
    dirty();
  }

  async function uploadPopupImage(file: File) {
    setPopupUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body });
      const json = await res.json();
      if (res.ok) setPopupField("imageUrl", json.data.url);
      else setError(json?.error?.message ?? "That image could not be uploaded.");
    } catch {
      setError("The upload did not finish. Try again.");
    } finally {
      setPopupUploading(false);
    }
  }

  function move(index: number, delta: number) {
    setHome((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    dirty();
  }

  function toggleHome(index: number) {
    setHome((prev) => prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s)));
    dirty();
  }

  function toggleProduct(id: ProductFeatureId) {
    setProduct((prev) => ({ ...prev, [id]: !prev[id] }));
    dirty();
  }

  function setPromise(i: number, key: "title" | "body", value: string) {
    setPromises((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));
    dirty();
  }

  function addPromise() {
    setPromises((prev) => (prev.length >= MAX_PROMISES ? prev : [...prev, { title: "", body: "" }]));
    dirty();
  }

  function removePromise(i: number) {
    setPromises((prev) => prev.filter((_, idx) => idx !== i));
    dirty();
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/storefront", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          home,
          product,
          logoHeight,
          logoHeightMobile,
          footerLogoHeight,
          footerLogoHeightMobile,
          popup,
          // Drop blank cards so an empty row does not become a blank tile.
          promises: promises.filter((p) => p.title.trim() || p.body.trim()),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not save. Try again.");
        return;
      }
      setNotice("Saved. The storefront updates on the next page load.");
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

  return (
    <div className="grid gap-6">
      {/* --------------------------------------------------------- logo */}
      <section className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Logo size</h2>
        <p className="mt-0.5 mb-3 text-sm text-sr-muted">
          How tall the logo appears in the header and the footer. Phones can use a smaller size than
          desktop. Drag to change — each preview updates live.
        </p>

        <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-sr-muted uppercase">
          Header logo
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <LogoSizeControl
            label="Desktop"
            value={logoHeight}
            onChange={(v) => {
              setLogoHeight(v);
              dirty();
            }}
          />
          <LogoSizeControl
            label="Mobile"
            value={logoHeightMobile}
            onChange={(v) => {
              setLogoHeightMobile(v);
              dirty();
            }}
          />
        </div>

        <h3 className="mt-4 mb-2 text-xs font-semibold tracking-[0.12em] text-sr-muted uppercase">
          Footer logo
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <LogoSizeControl
            label="Desktop"
            src="/logo-footer.png"
            dark
            value={footerLogoHeight}
            onChange={(v) => {
              setFooterLogoHeight(v);
              dirty();
            }}
          />
          <LogoSizeControl
            label="Mobile"
            src="/logo-footer.png"
            dark
            value={footerLogoHeightMobile}
            onChange={(v) => {
              setFooterLogoHeightMobile(v);
              dirty();
            }}
          />
        </div>
      </section>

      {/* ------------------------------------------------- promo pop-up */}
      <section className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-sr-ink">Promo pop-up</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-sr-body">
            <input
              type="checkbox"
              checked={popup.enabled}
              onChange={(e) => setPopupField("enabled", e.target.checked)}
              className="h-4 w-4 accent-sr-600"
            />
            {popup.enabled ? "On" : "Off"}
          </label>
        </div>
        <p className="mt-0.5 mb-3 text-sm text-sr-muted">
          A pop-up that eases in after the visitor has browsed a few seconds, inviting them to
          subscribe. Emails are saved under “Subscribers”. It shows once, then stays away for the
          repeat window below.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-sr-ink">Offer line (big highlight)</span>
            <input
              className={inputCls}
              value={popup.offerText}
              maxLength={80}
              placeholder="5% off your first order"
              onChange={(e) => setPopupField("offerText", e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-sr-ink">Heading</span>
            <input
              className={inputCls}
              value={popup.heading}
              maxLength={80}
              placeholder="Subscribe & save"
              onChange={(e) => setPopupField("heading", e.target.value)}
            />
          </label>
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-sr-ink">Body text</span>
            <textarea
              className={`${inputCls} resize-y`}
              rows={2}
              value={popup.body}
              maxLength={300}
              placeholder="Get new launches and offers straight to your inbox."
              onChange={(e) => setPopupField("body", e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-sr-ink">Button label</span>
            <input
              className={inputCls}
              value={popup.buttonLabel}
              maxLength={40}
              placeholder="Subscribe"
              onChange={(e) => setPopupField("buttonLabel", e.target.value)}
            />
          </label>
          <div className="grid gap-1">
            <span className="text-xs font-semibold text-sr-ink">Image (optional)</span>
            <div className="flex flex-wrap items-center gap-2">
              {popup.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={popup.imageUrl} alt="" className="h-10 w-14 rounded-lg border border-sr-line object-cover" />
              ) : null}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={popupUploading}
                onChange={(e) => e.target.files?.[0] && uploadPopupImage(e.target.files[0])}
                className="text-xs text-sr-body"
              />
              {popupUploading ? <span className="text-xs text-sr-muted">Uploading…</span> : null}
              {popup.imageUrl ? (
                <button
                  type="button"
                  onClick={() => setPopupField("imageUrl", "")}
                  className="text-xs font-semibold text-danger hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-sr-ink">Show after (seconds)</span>
            <input
              type="number"
              min={0}
              max={POPUP_DELAY_MAX}
              className={inputCls}
              value={popup.delaySeconds}
              onChange={(e) =>
                setPopupField(
                  "delaySeconds",
                  Math.min(POPUP_DELAY_MAX, Math.max(0, Number(e.target.value) || 0)),
                )
              }
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-sr-ink">Don’t show again for (days)</span>
            <input
              type="number"
              min={0}
              max={POPUP_REPEAT_MAX}
              className={inputCls}
              value={popup.repeatDays}
              onChange={(e) =>
                setPopupField(
                  "repeatDays",
                  Math.min(POPUP_REPEAT_MAX, Math.max(0, Number(e.target.value) || 0)),
                )
              }
            />
          </label>
        </div>
      </section>

      {/* ---------------------------------------------- homepage sections */}
      <section className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Homepage sections</h2>
        <p className="mt-0.5 mb-3 text-sm text-sr-muted">
          Show, hide and reorder the blocks on the homepage. The hero banner is always shown when one
          is set. A section with no content stays hidden even when switched on.
        </p>
        <ul className="space-y-2">
          {home.map((section, i) => {
            const meta = HOME_LABEL.get(section.id);
            return (
              <li
                key={section.id}
                className="flex items-center gap-3 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5"
              >
                <span className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${meta?.label ?? section.id} up`}
                    className="text-sr-muted transition hover:text-sr-ink disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === home.length - 1}
                    aria-label={`Move ${meta?.label ?? section.id} down`}
                    className="text-sr-muted transition hover:text-sr-ink disabled:opacity-30"
                  >
                    ▼
                  </button>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-sr-ink">{meta?.label ?? section.id}</span>
                  {meta?.hint ? <span className="block text-xs text-sr-muted">{meta.hint}</span> : null}
                </span>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-sr-body">
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    onChange={() => toggleHome(i)}
                    className="h-4 w-4 accent-sr-600"
                  />
                  {section.enabled ? "Shown" : "Hidden"}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------------------------------------------- product features */}
      <section className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Product page blocks</h2>
        <p className="mt-0.5 mb-3 text-sm text-sr-muted">
          Turn sections of every product page on or off. A block also hides itself when the product
          has nothing to show there.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRODUCT_FEATURE_META.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5 text-sm text-sr-body"
            >
              <input
                type="checkbox"
                checked={product[f.id]}
                onChange={() => toggleProduct(f.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-sr-600"
              />
              <span>
                <span className="block font-medium text-sr-ink">{f.label}</span>
                <span className="block text-xs text-sr-muted">{f.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------- promises text */}
      <section className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-sr-ink">“Why choose us” cards</h2>
          <button
            type="button"
            onClick={addPromise}
            disabled={promises.length >= MAX_PROMISES}
            className="rounded-full border border-sr-line-strong px-3 py-1 text-xs font-semibold text-sr-body transition hover:border-sr-400 disabled:opacity-40"
          >
            + Add card
          </button>
        </div>
        <p className="mt-0.5 mb-3 text-sm text-sr-muted">
          The promise cards shown on the homepage. Edit the text, add up to {MAX_PROMISES}, or remove
          one. Its visibility is the “Why choose us” toggle above.
        </p>
        <ul className="space-y-3">
          {promises.map((p, i) => (
            <li key={i} className="rounded-lg border border-sr-line bg-sr-canvas p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sr-muted">Card {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removePromise(i)}
                  className="text-xs font-semibold text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
              <input
                value={p.title}
                onChange={(e) => setPromise(i, "title", e.target.value)}
                placeholder="Title (e.g. Premium quality)"
                maxLength={80}
                className={`${inputCls} mt-2`}
              />
              <textarea
                value={p.body}
                onChange={(e) => setPromise(i, "body", e.target.value)}
                placeholder="A short line describing it."
                maxLength={240}
                rows={2}
                className={`${inputCls} mt-2 resize-y`}
              />
            </li>
          ))}
          {promises.length === 0 ? (
            <li className="rounded-lg border border-dashed border-sr-line px-3 py-6 text-center text-sm text-sr-muted">
              No cards. The “Why choose us” block will be empty until you add one.
            </li>
          ) : null}
        </ul>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{notice}</p>
      ) : null}

      <div>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save storefront"}
        </button>
      </div>
    </div>
  );
}

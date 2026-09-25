"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  HOME_SECTION_META,
  MAX_PROMISES,
  PRODUCT_FEATURE_META,
  type ProductFeatureId,
  type StorefrontSettings,
} from "@/lib/storefront";

const HOME_LABEL = new Map(HOME_SECTION_META.map((s) => [s.id, s]));

export function StorefrontForm({ initial }: { initial: StorefrontSettings }) {
  const router = useRouter();
  const [home, setHome] = useState(initial.home);
  const [product, setProduct] = useState(initial.product);
  const [promises, setPromises] = useState(initial.promises);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function dirty() {
    setNotice(null);
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

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SettingsValues = {
  shipping: {
    flatRate: string;
    freeAbove: string;
    originPincode: string;
    codEnabled: boolean;
  };
  tax: {
    gstPercent: string;
    pricesIncludeTax: boolean;
  };
  support: {
    email: string;
    phone: string;
    whatsapp: string;
    hours: string;
  };
};

const input =
  "w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  function set<G extends keyof SettingsValues, K extends keyof SettingsValues[G]>(
    group: G,
    key: K,
    value: SettingsValues[G][K],
  ) {
    setValues((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
    setNotice(null);
  }

  const err = (path: string) => fieldErrors[path];

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shipping: {
            flatRate: Number(values.shipping.flatRate || 0),
            freeAbove: Number(values.shipping.freeAbove || 0),
            originPincode: values.shipping.originPincode,
            codEnabled: values.shipping.codEnabled,
          },
          tax: {
            gstPercent: Number(values.tax.gstPercent || 0),
            pricesIncludeTax: values.tax.pricesIncludeTax,
          },
          support: values.support,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error?.message ?? "Those settings could not be saved.");
        setFieldErrors(json?.error?.fields ?? {});
        return;
      }

      setNotice("Saved. These apply to the next cart the shop prices.");
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  const freeAbove = Number(values.shipping.freeAbove || 0);
  const flatRate = Number(values.shipping.flatRate || 0);

  return (
    <form onSubmit={save} className="grid gap-6">
      <Section
        title="Delivery"
        note="These decide the shipping line on every cart and the PIN-code estimate on product pages."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Delivery charge (₹)" error={err("shipping.flatRate")}>
            <input
              type="number"
              min="0"
              className={input}
              value={values.shipping.flatRate}
              onChange={(e) => set("shipping", "flatRate", e.target.value)}
            />
          </Field>

          <Field
            label="Free delivery above (₹)"
            hint="0 makes delivery free on every order."
            error={err("shipping.freeAbove")}
          >
            <input
              type="number"
              min="0"
              className={input}
              value={values.shipping.freeAbove}
              onChange={(e) => set("shipping", "freeAbove", e.target.value)}
            />
          </Field>

          <Field
            label="Dispatch PIN code"
            hint="Where parcels leave from. Delivery estimates count outwards from here."
            error={err("shipping.originPincode")}
          >
            <input
              className={input}
              value={values.shipping.originPincode}
              onChange={(e) => set("shipping", "originPincode", e.target.value)}
            />
          </Field>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-sr-body">
          <input
            type="checkbox"
            checked={values.shipping.codEnabled}
            onChange={(e) => set("shipping", "codEnabled", e.target.checked)}
          />
          Offer cash on delivery
        </label>

        {/* Says what the numbers mean together, so a combination that charges
            nobody anything is obvious before it is saved. */}
        <p className="mt-3 rounded-lg bg-sr-canvas px-3 py-2 text-xs text-sr-muted">
          {flatRate === 0
            ? "Delivery is free on every order."
            : freeAbove === 0
              ? `Delivery is free on every order, because the threshold is ₹0.`
              : `Orders under ₹${freeAbove.toLocaleString("en-IN")} pay ₹${flatRate.toLocaleString("en-IN")}; at or above that, delivery is free.`}
        </p>
      </Section>

      <Section title="Tax" note="Applied when the cart total is worked out.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="GST rate (%)" error={err("tax.gstPercent")}>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={input}
              value={values.tax.gstPercent}
              onChange={(e) => set("tax", "gstPercent", e.target.value)}
            />
          </Field>
        </div>

        <label className="mt-3 flex items-start gap-2 text-sm text-sr-body">
          <input
            type="checkbox"
            className="mt-1"
            checked={values.tax.pricesIncludeTax}
            onChange={(e) => set("tax", "pricesIncludeTax", e.target.checked)}
          />
          <span>
            Catalogue prices already include GST
            <span className="mt-0.5 block text-xs text-sr-muted">
              {values.tax.pricesIncludeTax
                ? "Customers pay the listed price. No separate tax line is added."
                : `GST is added on top at checkout, so a customer pays more than the listed price and sees a separate ${values.tax.gstPercent || 0}% tax line.`}
            </span>
          </span>
        </label>
      </Section>

      <Section
        title="Support contact"
        note="Shown on the Help & Support page. Anything left empty is hidden there rather than shown blank."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Support email" error={err("support.email")}>
            <input
              type="email"
              className={input}
              value={values.support.email}
              onChange={(e) => set("support", "email", e.target.value)}
              placeholder="help@yourshop.in"
            />
          </Field>

          <Field label="Phone" error={err("support.phone")}>
            <input
              className={input}
              value={values.support.phone}
              onChange={(e) => set("support", "phone", e.target.value)}
              placeholder="+91 98765 43210"
            />
          </Field>

          <Field label="WhatsApp" hint="Digits only, with country code." error={err("support.whatsapp")}>
            <input
              className={input}
              value={values.support.whatsapp}
              onChange={(e) => set("support", "whatsapp", e.target.value)}
              placeholder="919876543210"
            />
          </Field>

          <Field label="Hours" error={err("support.hours")}>
            <input
              className={input}
              value={values.support.hours}
              onChange={(e) => set("support", "hours", e.target.value)}
              placeholder="Mon–Sat, 10am–7pm"
            />
          </Field>
        </div>
      </Section>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card">
      <h2 className="font-display text-lg font-semibold text-sr-ink">{title}</h2>
      <p className="mt-0.5 mb-3 text-sm text-sr-muted">{note}</p>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-sr-ink">{label}</span>
      {children}
      {error ? (
        <span className="text-xs font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-sr-muted">{hint}</span>
      ) : null}
    </label>
  );
}

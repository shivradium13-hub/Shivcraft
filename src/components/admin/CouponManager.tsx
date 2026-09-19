"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatPaise } from "@/lib/money";

export type AdminCouponView = {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minOrderP: number;
  maxDiscountP: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  redemptions: number;
  givenAwayP: number;
  live: boolean;
  exhausted: boolean;
  expired: boolean;
  scheduled: boolean;
};

export type CategoryOption = { id: string; label: string };

const input =
  "w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

type FormValues = {
  code: string;
  description: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: string;
  minOrder: string;
  maxDiscount: string;
  usageLimit: string;
  perUserLimit: string;
  categoryId: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const BLANK: FormValues = {
  code: "",
  description: "",
  discountType: "PERCENT",
  discountValue: "",
  minOrder: "0",
  maxDiscount: "",
  usageLimit: "",
  perUserLimit: "1",
  categoryId: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

/** A timestamp the `datetime-local` input can show, in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toForm(coupon: AdminCouponView): FormValues {
  return {
    code: coupon.code,
    description: coupon.description ?? "",
    discountType: coupon.discountType,
    // PERCENT keeps its plain number; FIXED comes back out of paise.
    discountValue:
      coupon.discountType === "PERCENT"
        ? String(coupon.discountValue)
        : String(coupon.discountValue / 100),
    minOrder: String(coupon.minOrderP / 100),
    maxDiscount: coupon.maxDiscountP != null ? String(coupon.maxDiscountP / 100) : "",
    usageLimit: coupon.usageLimit != null ? String(coupon.usageLimit) : "",
    perUserLimit: coupon.perUserLimit != null ? String(coupon.perUserLimit) : "",
    categoryId: coupon.categoryId ?? "",
    startsAt: toLocalInput(coupon.startsAt),
    endsAt: toLocalInput(coupon.endsAt),
    isActive: coupon.isActive,
  };
}

export function CouponManager({
  coupons,
  categories,
}: {
  coupons: AdminCouponView[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "NEW" | null>(null);
  const [values, setValues] = useState<FormValues>(BLANK);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  function startNew() {
    setValues(BLANK);
    setEditing("NEW");
    setError(null);
    setFieldErrors({});
    setNotice(null);
  }

  function startEdit(coupon: AdminCouponView) {
    setValues(toForm(coupon));
    setEditing(coupon.id);
    setError(null);
    setFieldErrors({});
    setNotice(null);
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That did not work.");
        setFieldErrors(json?.error?.fields ?? {});
        return null;
      }
      router.refresh();
      return json.data;
    } catch {
      setError("Network problem — try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** Empty means "no limit", which is a null column, not a zero. */
  const optionalNumber = (raw: string) => (raw.trim() === "" ? null : Number(raw));

  async function save() {
    const body = {
      code: values.code,
      description: values.description,
      discountType: values.discountType,
      discountValue: Number(values.discountValue),
      minOrder: Number(values.minOrder || 0),
      maxDiscount: optionalNumber(values.maxDiscount),
      usageLimit: optionalNumber(values.usageLimit),
      perUserLimit: optionalNumber(values.perUserLimit),
      categoryId: values.categoryId || null,
      startsAt: values.startsAt || null,
      endsAt: values.endsAt || null,
      isActive: values.isActive,
    };

    const result = await call(
      editing === "NEW" ? "/api/admin/coupons" : `/api/admin/coupons/${editing}`,
      {
        method: editing === "NEW" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      "save",
    );

    if (result) {
      setNotice(editing === "NEW" ? `Created ${result.coupon.code}.` : `Saved ${result.coupon.code}.`);
      setEditing(null);
    }
  }

  async function remove(coupon: AdminCouponView) {
    if (!window.confirm(`Delete ${coupon.code}? This cannot be undone.`)) return;
    const result = await call(`/api/admin/coupons/${coupon.id}`, { method: "DELETE" }, coupon.id);
    if (result) setNotice(`Deleted ${result.code}.`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={startNew}
          className="rounded-lg bg-sr-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sr-700"
        >
          New coupon
        </button>
        {editing !== null ? (
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded-lg border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {notice ? (
        <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {editing !== null ? (
        <CouponForm
          values={values}
          set={set}
          categories={categories}
          fieldErrors={fieldErrors}
          busy={busy === "save"}
          isNew={editing === "NEW"}
          onSave={save}
        />
      ) : null}

      {coupons.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-field bg-field-bg px-4 py-10 text-center text-sm text-sr-muted">
          No coupons yet.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {coupons.map((coupon) => (
            <li
              key={coupon.id}
              className={`rounded-card border bg-sr-surface p-4 shadow-card ${
                coupon.live ? "border-sr-line" : "border-sr-line opacity-80"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <code className="rounded-md bg-sr-canvas px-2 py-1 font-mono text-sm font-bold text-sr-ink">
                  {coupon.code}
                </code>
                <CouponBadge coupon={coupon} />
              </div>

              <p className="mt-2 text-sm font-semibold text-sr-ink">
                {coupon.discountType === "PERCENT"
                  ? `${coupon.discountValue}% off`
                  : `${formatPaise(coupon.discountValue)} off`}
                {coupon.maxDiscountP != null ? (
                  <span className="font-normal text-sr-muted">
                    {" "}
                    up to {formatPaise(coupon.maxDiscountP)}
                  </span>
                ) : null}
              </p>

              {coupon.description ? (
                <p className="mt-0.5 text-sm text-sr-body">{coupon.description}</p>
              ) : null}

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-sr-muted">
                <Row label="Minimum order">
                  {coupon.minOrderP > 0 ? formatPaise(coupon.minOrderP) : "None"}
                </Row>
                <Row label="Category">{coupon.categoryName ?? "Everything"}</Row>
                <Row label="Used">
                  {coupon.usedCount}
                  {coupon.usageLimit != null ? ` of ${coupon.usageLimit}` : " (no cap)"}
                </Row>
                <Row label="Per customer">{coupon.perUserLimit ?? "No cap"}</Row>
                <Row label="Given away">{formatPaise(coupon.givenAwayP)}</Row>
                <Row label="Redemptions">{coupon.redemptions}</Row>
                {coupon.startsAt ? (
                  <Row label="Starts">{new Date(coupon.startsAt).toLocaleString("en-IN")}</Row>
                ) : null}
                {coupon.endsAt ? (
                  <Row label="Ends">{new Date(coupon.endsAt).toLocaleString("en-IN")}</Row>
                ) : null}
              </dl>

              {/* The counter and the redemption rows should agree. If they ever
                  do not, say so rather than quietly showing one of them. */}
              {coupon.usedCount !== coupon.redemptions ? (
                <p className="mt-2 rounded-lg bg-sr-gold-soft px-2.5 py-1.5 text-xs font-medium text-sr-gold">
                  The usage counter says {coupon.usedCount} but {coupon.redemptions} redemption
                  {coupon.redemptions === 1 ? " is" : "s are"} recorded.
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => startEdit(coupon)}
                  className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy === coupon.id}
                  onClick={() =>
                    call(
                      `/api/admin/coupons/${coupon.id}`,
                      {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          ...toBody(coupon),
                          isActive: !coupon.isActive,
                        }),
                      },
                      coupon.id,
                    )
                  }
                  className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400 disabled:opacity-50"
                >
                  {coupon.isActive ? "Switch off" : "Switch on"}
                </button>
                <button
                  type="button"
                  disabled={busy === coupon.id}
                  onClick={() => remove(coupon)}
                  className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The PATCH route takes a whole coupon, so a toggle resends the current one. */
function toBody(coupon: AdminCouponView) {
  return {
    code: coupon.code,
    description: coupon.description ?? "",
    discountType: coupon.discountType,
    discountValue:
      coupon.discountType === "PERCENT" ? coupon.discountValue : coupon.discountValue / 100,
    minOrder: coupon.minOrderP / 100,
    maxDiscount: coupon.maxDiscountP != null ? coupon.maxDiscountP / 100 : null,
    usageLimit: coupon.usageLimit,
    perUserLimit: coupon.perUserLimit,
    categoryId: coupon.categoryId,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    isActive: coupon.isActive,
  };
}

function CouponBadge({ coupon }: { coupon: AdminCouponView }) {
  const [label, tone] = !coupon.isActive
    ? ["Switched off", "bg-sr-canvas text-sr-muted"]
    : coupon.expired
      ? ["Expired", "bg-danger-soft text-danger"]
      : coupon.exhausted
        ? ["Fully claimed", "bg-danger-soft text-danger"]
        : coupon.scheduled
          ? ["Scheduled", "bg-info-soft text-info"]
          : ["Live", "bg-success-soft text-success"];

  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}:</dt>
      <dd className="font-medium text-sr-ink">{children}</dd>
    </div>
  );
}

function CouponForm({
  values,
  set,
  categories,
  fieldErrors,
  busy,
  isNew,
  onSave,
}: {
  values: FormValues;
  set: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
  categories: CategoryOption[];
  fieldErrors: Record<string, string>;
  busy: boolean;
  isNew: boolean;
  onSave: () => void;
}) {
  const percent = values.discountType === "PERCENT";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      className="mt-4 rounded-card border border-sr-line bg-sr-surface p-4 shadow-card"
    >
      <h2 className="font-display text-lg font-semibold text-sr-ink">
        {isNew ? "New coupon" : `Edit ${values.code}`}
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Code" required error={fieldErrors.code}>
          <input
            className={`${input} font-mono uppercase`}
            value={values.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            placeholder="DIWALI300"
          />
        </Field>

        <Field label="Description" hint="Shown to the customer in the cart." error={fieldErrors.description}>
          <input
            className={input}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="₹300 off this Diwali"
          />
        </Field>

        <Field label="Discount type" required>
          <div className="flex gap-2">
            {(["PERCENT", "FIXED"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set("discountType", type)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  values.discountType === type
                    ? "border-sr-600 bg-sr-600 text-white"
                    : "border-sr-line-strong text-sr-body hover:border-sr-400"
                }`}
              >
                {type === "PERCENT" ? "Percentage" : "Fixed amount"}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label={percent ? "Discount (%)" : "Discount (₹)"}
          required
          error={fieldErrors.discountValue}
        >
          <input
            type="number"
            min="1"
            max={percent ? "100" : undefined}
            step={percent ? "1" : "0.01"}
            className={input}
            value={values.discountValue}
            onChange={(e) => set("discountValue", e.target.value)}
          />
        </Field>

        <Field label="Minimum order (₹)" hint="0 means no minimum." error={fieldErrors.minOrder}>
          <input
            type="number"
            min="0"
            className={input}
            value={values.minOrder}
            onChange={(e) => set("minOrder", e.target.value)}
          />
        </Field>

        {/* A cap only means something on a percentage. */}
        {percent ? (
          <Field
            label="Maximum discount (₹)"
            hint="Leave empty for no cap."
            error={fieldErrors.maxDiscount}
          >
            <input
              type="number"
              min="1"
              className={input}
              value={values.maxDiscount}
              onChange={(e) => set("maxDiscount", e.target.value)}
            />
          </Field>
        ) : null}

        <Field label="Total uses" hint="Leave empty for unlimited." error={fieldErrors.usageLimit}>
          <input
            type="number"
            min="1"
            className={input}
            value={values.usageLimit}
            onChange={(e) => set("usageLimit", e.target.value)}
          />
        </Field>

        <Field
          label="Uses per customer"
          hint="Leave empty for unlimited."
          error={fieldErrors.perUserLimit}
        >
          <input
            type="number"
            min="1"
            className={input}
            value={values.perUserLimit}
            onChange={(e) => set("perUserLimit", e.target.value)}
          />
        </Field>

        <Field
          label="Limit to a category"
          hint="The cart must contain something from it."
          error={fieldErrors.categoryId}
        >
          <select
            className={input}
            value={values.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
          >
            <option value="">Everything in the shop</option>
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Starts" hint="Leave empty to start now." error={fieldErrors.startsAt}>
          <input
            type="datetime-local"
            className={input}
            value={values.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
          />
        </Field>

        <Field label="Ends" hint="Leave empty to never expire." error={fieldErrors.endsAt}>
          <input
            type="datetime-local"
            className={input}
            value={values.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
          />
        </Field>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-sr-body">
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
        />
        Active — customers can use this code
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-lg bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-60"
      >
        {busy ? "Saving…" : isNew ? "Create coupon" : "Save changes"}
      </button>
    </form>
  );
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
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-sr-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-sr-muted">{hint}</span>
      ) : null}
    </label>
  );
}

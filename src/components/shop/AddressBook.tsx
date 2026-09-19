"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SavedAddress = {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  area: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

const input =
  "w-full rounded-lg border border-field bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand-500";

const BLANK = {
  fullName: "", phone: "", line1: "", line2: "", area: "",
  city: "", state: "", pincode: "", isDefault: false,
};

type Draft = typeof BLANK;

export function AddressBook({ initial }: { initial: SavedAddress[] }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(initial);
  const [editing, setEditing] = useState<string | "NEW" | null>(
    initial.length === 0 ? "NEW" : null,
  );
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(address: SavedAddress) {
    setEditing(address.id);
    setDraft({
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? "",
      area: address.area ?? "",
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      isDefault: address.isDefault,
    });
    setErrors({});
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setErrors({});

    const isNew = editing === "NEW";
    try {
      const res = await fetch(isNew ? "/api/addresses" : `/api/addresses/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setErrors(json.error.fields);
        setError(json?.error?.message ?? "Could not save that address.");
        return;
      }

      const saved: SavedAddress = json.data.address;
      setAddresses((prev) => {
        const next = isNew ? [...prev, saved] : prev.map((a) => (a.id === saved.id ? saved : a));
        // Only one default may be shown as such.
        return saved.isDefault ? next.map((a) => ({ ...a, isDefault: a.id === saved.id })) : next;
      });
      setEditing(null);
      setDraft(BLANK);
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(address: SavedAddress) {
    if (!window.confirm(`Delete the address for ${address.fullName}?`)) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/addresses/${address.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete that address.");
        return;
      }
      setAddresses((prev) => prev.filter((a) => a.id !== address.id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const makeDefault = async (address: SavedAddress) => {
    setBusy(true);
    try {
      await fetch(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2 ?? "",
          area: address.area ?? "",
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          isDefault: true,
        }),
      });
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === address.id })));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const err = (key: string) =>
    errors[key] ? <p className="text-xs font-medium text-danger">{errors[key]}</p> : null;

  const form = (
    <div className="grid gap-3 rounded-card border border-brand-200 bg-brand-50/50 p-4 sm:grid-cols-2">
      <Field label="Full name" required error={err("fullName")}>
        <input className={input} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
      </Field>
      <Field label="Mobile number" required error={err("phone")}>
        <input className={input} inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
      </Field>
      <Field label="House / flat" required error={err("line1")}>
        <input className={input} value={draft.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} />
      </Field>
      <Field label="Street" error={err("line2")}>
        <input className={input} value={draft.line2} onChange={(e) => setDraft({ ...draft, line2: e.target.value })} />
      </Field>
      <Field label="Area" error={err("area")}>
        <input className={input} value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} />
      </Field>
      <Field label="City" required error={err("city")}>
        <input className={input} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
      </Field>
      <Field label="State" required error={err("state")}>
        <input className={input} value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
      </Field>
      <Field label="PIN code" required error={err("pincode")}>
        <input className={input} inputMode="numeric" maxLength={6} value={draft.pincode} onChange={(e) => setDraft({ ...draft, pincode: e.target.value })} />
      </Field>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
          className="h-4 w-4 accent-brand-700"
        />
        Use this as my default delivery address
      </label>

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : editing === "NEW" ? "Save address" : "Save changes"}
        </button>
        {addresses.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setDraft(BLANK);
              setErrors({});
            }}
            className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink-soft"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {addresses.map((address) =>
        editing === address.id ? (
          <div key={address.id}>{form}</div>
        ) : (
          <div key={address.id} className="rounded-card border border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {address.fullName}
                {address.isDefault ? (
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                    Default
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-muted">{address.phone}</p>
            </div>

            <address className="mt-1 text-sm not-italic text-ink-soft">
              {[address.line1, address.line2, address.area].filter(Boolean).join(", ")}
              <br />
              {address.city}, {address.state} — {address.pincode}
            </address>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startEdit(address)}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-400 hover:text-brand-600"
              >
                Edit
              </button>
              {!address.isDefault ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => makeDefault(address)}
                  className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
                >
                  Make default
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(address)}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-danger hover:text-danger disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ),
      )}

      {editing === "NEW" ? (
        form
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing("NEW");
            setDraft(BLANK);
            setErrors({});
          }}
          className="w-full rounded-card border border-dashed border-line-strong px-4 py-3 text-sm font-semibold text-ink-soft transition hover:border-brand-400 hover:text-brand-600"
        >
          + Add a new address
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-ink">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
      {error}
    </label>
  );
}

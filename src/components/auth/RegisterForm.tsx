"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", phone: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
          ...(values.phone ? { phone: values.phone } : {}),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setFieldErrors(json.error.fields);
        setError(json?.error?.message ?? "Could not create that account.");
        return;
      }

      router.replace(next ?? "/");
      router.refresh();
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-field bg-field-bg px-3 py-2.5 text-sm text-sr-ink outline-none focus:border-sr-400 focus:ring-2 focus:ring-sr-100";

  const fields = [
    { key: "name", label: "Full name", type: "text", autoComplete: "name", required: true },
    { key: "email", label: "Email", type: "email", autoComplete: "email", required: true },
    { key: "phone", label: "Mobile (optional)", type: "tel", autoComplete: "tel", required: false },
    {
      key: "password",
      label: "Password",
      type: "password",
      autoComplete: "new-password",
      required: true,
    },
  ] as const;

  return (
    <form onSubmit={submit} className="grid gap-4">
      {fields.map((field) => (
        <div key={field.key} className="grid gap-1.5">
          <label htmlFor={field.key} className="text-xs font-semibold text-sr-ink">
            {field.label}
          </label>
          <input
            id={field.key}
            type={field.type}
            autoComplete={field.autoComplete}
            required={field.required}
            value={values[field.key]}
            onChange={(e) => set(field.key, e.target.value)}
            className={input}
          />
          {fieldErrors[field.key] ? (
            <p className="text-xs font-medium text-danger">{fieldErrors[field.key]}</p>
          ) : null}
        </div>
      ))}

      <p className="-mt-1 text-xs text-sr-muted">At least 8 characters.</p>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-sr-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-60"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

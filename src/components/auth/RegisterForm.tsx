"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthField, AuthPasswordField, LockIcon, MailIcon, PhoneIcon, UserIcon } from "./fields";

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

  async function submit(event: FormEvent) {
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

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AuthField
        id="name"
        label="Full name"
        icon={<UserIcon />}
        type="text"
        autoComplete="name"
        required
        value={values.name}
        onChange={(e) => set("name", e.target.value)}
        error={fieldErrors.name}
      />
      <AuthField
        id="email"
        label="Email"
        icon={<MailIcon />}
        type="email"
        autoComplete="email"
        required
        value={values.email}
        onChange={(e) => set("email", e.target.value)}
        placeholder="you@example.com"
        error={fieldErrors.email}
      />
      <AuthField
        id="phone"
        label="Mobile number (optional)"
        icon={<PhoneIcon />}
        type="tel"
        autoComplete="tel"
        value={values.phone}
        onChange={(e) => set("phone", e.target.value)}
        placeholder="98765 43210"
        hint="Add it to sign in with your mobile later."
        error={fieldErrors.phone}
      />
      <AuthPasswordField
        id="password"
        label="Password"
        icon={<LockIcon />}
        autoComplete="new-password"
        required
        value={values.password}
        onChange={(e) => set("password", e.target.value)}
        hint="At least 8 characters."
        error={fieldErrors.password}
      />

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center rounded-full bg-sr-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sr-700 active:scale-[.99] disabled:opacity-60"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

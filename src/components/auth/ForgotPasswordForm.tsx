"use client";

import { useState, type FormEvent } from "react";

import { AuthField, MailIcon } from "./fields";

export function ForgotPasswordForm({ initialEmail }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setFieldErrors(json.error.fields);
        setError(json?.error?.message ?? "Could not send the reset email.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
        If an account exists for <strong>{email}</strong>, we&rsquo;ve sent a reset link. Check your
        inbox (and spam) — it expires in 1 hour.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AuthField
        id="email"
        label="Email"
        icon={<MailIcon />}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        error={fieldErrors.email}
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
        {busy ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

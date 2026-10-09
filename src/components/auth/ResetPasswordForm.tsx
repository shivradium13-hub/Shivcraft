"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthPasswordField, LockIcon } from "./fields";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== confirm) {
      setFieldErrors({ confirm: "The two passwords do not match." });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setFieldErrors(json.error.fields);
        setError(json?.error?.message ?? "Could not reset your password.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <div className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          Your password has been changed. Please sign in with your new password.
        </div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-full bg-sr-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sr-700"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AuthPasswordField
        id="password"
        label="New password"
        icon={<LockIcon />}
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 8 characters."
        error={fieldErrors.password}
      />
      <AuthPasswordField
        id="confirm"
        label="Confirm new password"
        icon={<LockIcon />}
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={fieldErrors.confirm}
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
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

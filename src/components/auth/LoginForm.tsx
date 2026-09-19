"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Posts to /api/auth/login, which sets the httpOnly session cookie. Where you
 * land is decided by the role the API returns, so a customer cannot reach the
 * dashboard by typing the URL — the /admin layout re-checks server-side.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setFieldErrors(json.error.fields);
        setError(json?.error?.message ?? "Could not sign you in.");
        return;
      }

      const destination = next ?? (json.data.user.role === "ADMIN" ? "/admin" : "/");
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-field bg-sr-surface px-3 py-2.5 text-sm text-sr-ink outline-none focus:border-sr-400 focus:ring-2 focus:ring-sr-100";

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-xs font-semibold text-sr-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          placeholder="you@example.com"
        />
        {fieldErrors.email ? (
          <p className="text-xs font-medium text-danger">{fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-xs font-semibold text-sr-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
          placeholder="••••••••"
        />
        {fieldErrors.password ? (
          <p className="text-xs font-medium text-danger">{fieldErrors.password}</p>
        ) : null}
      </div>

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
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

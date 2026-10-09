"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AtIcon, AuthField, AuthPasswordField, LockIcon } from "./fields";

/**
 * Posts to /api/auth/login, which sets the httpOnly session cookie. The
 * identifier can be an email address or a mobile number — the server works out
 * which. Where you land is decided by the role the API returns.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
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

  const forgotHref = identifier.includes("@")
    ? `/forgot-password?email=${encodeURIComponent(identifier)}`
    : "/forgot-password";

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AuthField
        id="identifier"
        label="Email or mobile number"
        icon={<AtIcon />}
        type="text"
        autoComplete="username"
        required
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="you@example.com or 98765 43210"
        error={fieldErrors.identifier}
      />

      <div>
        <AuthPasswordField
          id="password"
          label="Password"
          icon={<LockIcon />}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          error={fieldErrors.password}
        />
        <div className="mt-1.5 text-right">
          <Link href={forgotHref} className="text-xs font-semibold text-sr-600 hover:underline">
            Forgot password?
          </Link>
        </div>
      </div>

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
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AtIcon, AuthField, AuthPasswordField, LockIcon } from "@/components/auth/fields";
import { AuthShell } from "@/components/auth/AuthShell";

/**
 * The admin area's own sign-in. Rendered by the admin layout whenever the
 * visitor is not an admin, so /admin always asks for ADMIN credentials — kept
 * separate from the customer sign-in on the storefront (/login). A customer
 * account cannot get in here: if one signs in, it is logged straight back out.
 */
export function AdminLogin({ alreadyLoggedIn }: { alreadyLoggedIn: boolean }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    alreadyLoggedIn ? "You are signed in as a customer. Use an admin account to open the admin panel." : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error?.message ?? "Could not sign you in.");
        return;
      }

      if (json?.data?.user?.role !== "ADMIN") {
        // Not an admin — drop the session so the admin area stays staff-only.
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        setError("That is not an admin account. Use your admin email and password.");
        return;
      }

      // Admin confirmed — reload so the layout re-renders as the dashboard.
      window.location.reload();
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Admin sign in" subtitle="Staff only. Enter your admin email and password.">
      <form onSubmit={submit} className="grid gap-4">
        <AuthField
          id="admin-identifier"
          label="Admin email"
          icon={<AtIcon />}
          type="text"
          autoComplete="username"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@example.com"
        />
        <AuthPasswordField
          id="admin-password"
          label="Password"
          icon={<LockIcon />}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          {busy ? "Signing in…" : "Sign in to admin"}
        </button>

        <div className="flex items-center justify-between text-xs">
          <Link href="/forgot-password" className="font-semibold text-sr-600 hover:underline">
            Forgot password?
          </Link>
          <Link href="/" className="text-sr-muted hover:text-sr-600">
            Back to store
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}

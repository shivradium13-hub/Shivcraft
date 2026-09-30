"use client";

import { useState } from "react";

/**
 * Lets the signed-in admin change their own login password from the admin
 * panel. Posts to /api/admin/account/password, which re-checks the current
 * password and stores only the new hash.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);

    if (next.length < 8) {
      setNotice({ tone: "bad", text: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setNotice({ tone: "bad", text: "The new passwords do not match." });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ tone: "bad", text: json?.error?.message ?? "Could not change the password." });
        return;
      }
      setNotice({ tone: "ok", text: "Password changed. Use the new password next time you sign in." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setNotice({ tone: "bad", text: "Network problem — try again." });
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-field bg-sr-surface px-3 py-2 text-sm text-sr-body outline-none focus:border-sr-500";

  return (
    <section className="rounded-card border border-sr-line bg-sr-surface p-4">
      <h2 className="font-display text-lg font-semibold text-sr-ink">Admin password</h2>
      <p className="mt-0.5 mb-4 text-sm text-sr-muted">
        Change the password for <strong className="text-sr-body">{email}</strong>. You will need your
        current password.
      </p>

      <form onSubmit={submit} className="grid max-w-md gap-3">
        {/* Username hint helps password managers associate the entry. */}
        <input type="text" name="username" autoComplete="username" defaultValue={email} className="sr-only" tabIndex={-1} aria-hidden="true" />
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-sr-body">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={input}
            required
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-sr-body">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={input}
            minLength={8}
            required
          />
          <span className="text-[11px] text-sr-muted">At least 8 characters.</span>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-sr-body">Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={input}
            minLength={8}
            required
          />
        </label>

        {notice ? (
          <p
            role="status"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              notice.tone === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={busy || !current || !next || !confirm}
            className="rounded-lg bg-sr-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-60"
          >
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}

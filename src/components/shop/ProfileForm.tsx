"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const input =
  "w-full rounded-lg border border-field bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-500";

export function ProfileForm({
  initial,
}: {
  initial: { name: string; email: string; phone: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"profile" | "password" | null>(null);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy("profile");
    setNotice(null);
    setError(null);
    setErrors({});

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: values.name, phone: values.phone || null }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setErrors(json.error.fields);
        setError(json?.error?.message ?? "Could not save your details.");
        return;
      }
      setNotice("Saved.");
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy("password");
    setNotice(null);
    setError(null);
    setErrors({});

    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(passwords),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json?.error?.fields) setErrors(json.error.fields);
        setError(json?.error?.message ?? "Could not change your password.");
        return;
      }
      setPasswords({ currentPassword: "", newPassword: "" });
      setNotice("Password changed. Any other device you were signed in on has been signed out.");
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(null);
    }
  }

  const err = (key: string) =>
    errors[key] ? <p className="text-xs font-medium text-danger">{errors[key]}</p> : null;

  return (
    <div className="grid gap-6">
      <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">Name</span>
          <input
            className={input}
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
          />
          {err("name")}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">Mobile</span>
          <input
            className={input}
            inputMode="tel"
            placeholder="98xxx xxxxx"
            value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })}
          />
          {err("phone")}
        </label>

        <label className="grid gap-1.5 sm:col-span-2">
          <span className="text-xs font-semibold text-ink">Email</span>
          <input className={`${input} cursor-not-allowed bg-canvas text-muted`} value={values.email} disabled />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {busy === "profile" ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>

      <form onSubmit={changePassword} className="grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
        <p className="text-sm font-semibold text-ink sm:col-span-2">Change password</p>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            className={input}
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
          />
          {err("currentPassword")}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            className={input}
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
          />
          {err("newPassword")}
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy !== null || !passwords.currentPassword || !passwords.newPassword}
            className="rounded-full border-2 border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-45"
          >
            {busy === "password" ? "Changing…" : "Change password"}
          </button>
          <p className="mt-1.5 text-xs text-muted">
            This signs you out everywhere else, in case someone else knew the old one.
          </p>
        </div>
      </form>

      {notice ? (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

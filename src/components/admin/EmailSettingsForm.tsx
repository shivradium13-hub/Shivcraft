"use client";

import { useState } from "react";

import type { EmailSettings } from "@/lib/email";

const input =
  "w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sr-600"
      />
      <span>
        <span className="block text-sm font-medium text-sr-ink">{label}</span>
        {hint ? <span className="block text-xs text-sr-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
      <h2 className="font-display text-base font-semibold text-sr-ink">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-xs text-sr-muted">{subtitle}</p> : null}
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function TextField({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-sr-ink">{label}</span>
      <input className={input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="text-xs text-sr-muted">{hint}</span> : null}
    </label>
  );
}

export function EmailSettingsForm({ initial }: { initial: EmailSettings }) {
  const [v, setV] = useState<EmailSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => setV((p) => ({ ...p, [key]: value }));

  async function save() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/email", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not save.");
        return;
      }
      setV(json.data);
      setNotice("Saved.");
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Section title="Integration" subtitle="Master switch for email. Off means no email is ever sent, even in live mode.">
        <Toggle
          label="Enable email integration"
          hint="Required for verification emails and email OTP. Real delivery also needs BREVO_API_KEY, a verified sender, and EMAIL_LIVE=true."
          checked={v.enabled}
          onChange={(x) => set("enabled", x)}
        />
      </Section>

      <Section title="Login (Email OTP)" subtitle="Send the login code by email too, alongside WhatsApp — only to customers with a verified email.">
        <Toggle
          label="Enable Email OTP"
          hint="Independent of WhatsApp OTP. Customers without a verified email keep logging in by WhatsApp."
          checked={v.otpEnabled}
          onChange={(x) => set("otpEnabled", x)}
        />
      </Section>

      <Section title="Sender" subtitle="Must be a verified sender address on a verified domain in your Brevo account.">
        <TextField
          label="Sender email"
          value={v.senderEmail}
          onChange={(x) => set("senderEmail", x)}
          placeholder="no-reply@shivradium.com"
          hint="Verify this address / its domain (DKIM, SPF) in Brevo before going live."
        />
        <TextField label="Sender name" value={v.senderName} onChange={(x) => set("senderName", x)} placeholder="Shiv Radium" />
        <TextField label="OTP email subject" value={v.otpSubject} onChange={(x) => set("otpSubject", x)} placeholder="Your Shiv Radium login code" />
      </Section>

      {error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{notice}</p> : null}

      <div>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full bg-sr-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save email settings"}
        </button>
      </div>
    </div>
  );
}

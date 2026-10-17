"use client";

import { useState } from "react";

import type { WhatsappSettings } from "@/lib/whatsapp";

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

function NumField({ label, value, onChange, min, max, suffix }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; suffix?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-sr-ink">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${input} w-28`}
        />
        {suffix ? <span className="text-xs text-sr-muted">{suffix}</span> : null}
      </div>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-sr-ink">{label}</span>
      <input className={input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function WhatsappSettingsForm({ initial }: { initial: WhatsappSettings }) {
  const [v, setV] = useState<WhatsappSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof WhatsappSettings>(key: K, value: WhatsappSettings[K]) => setV((p) => ({ ...p, [key]: value }));

  async function save() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/whatsapp", {
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
      <Section title="Integration" subtitle="Master switch. Off means nothing is ever sent, on any channel.">
        <Toggle
          label="Enable WhatsApp integration"
          hint="Required for both OTP login and order notifications. Real delivery also needs the server credentials and the WHATSAPP_LIVE flag."
          checked={v.enabled}
          onChange={(x) => set("enabled", x)}
        />
      </Section>

      <Section title="Login (OTP)" subtitle="WhatsApp one-time-password sign-in on the storefront.">
        <Toggle label="Enable WhatsApp OTP login" checked={v.otpEnabled} onChange={(x) => set("otpEnabled", x)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumField label="Code expiry" value={v.otpTtlMinutes} onChange={(n) => set("otpTtlMinutes", n)} min={1} max={30} suffix="min" />
          <NumField label="Resend cooldown" value={v.otpResendSeconds} onChange={(n) => set("otpResendSeconds", n)} min={15} max={300} suffix="sec" />
          <NumField label="Max attempts" value={v.otpMaxAttempts} onChange={(n) => set("otpMaxAttempts", n)} min={3} max={10} />
        </div>
      </Section>

      <Section title="Order notifications" subtitle="Independent toggles for each order status update.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle label="Order confirmed" checked={v.notifyConfirmed} onChange={(x) => set("notifyConfirmed", x)} />
          <Toggle label="Shipped" checked={v.notifyShipped} onChange={(x) => set("notifyShipped", x)} />
          <Toggle label="Out for delivery" checked={v.notifyOutForDelivery} onChange={(x) => set("notifyOutForDelivery", x)} />
          <Toggle label="Delivered" checked={v.notifyDelivered} onChange={(x) => set("notifyDelivered", x)} />
        </div>
      </Section>

      <Section title="Templates" subtitle="Approved Meta template names + language. Must match the names approved in your WhatsApp account.">
        <TextField label="OTP (authentication)" value={v.templateOtp} onChange={(x) => set("templateOtp", x)} placeholder="otp_login" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Order confirmed (utility)" value={v.templateConfirmed} onChange={(x) => set("templateConfirmed", x)} placeholder="order_confirmed" />
          <TextField label="Shipped (utility)" value={v.templateShipped} onChange={(x) => set("templateShipped", x)} placeholder="order_shipped" />
          <TextField label="Out for delivery (utility)" value={v.templateOutForDelivery} onChange={(x) => set("templateOutForDelivery", x)} placeholder="order_out_for_delivery" />
          <TextField label="Delivered (utility)" value={v.templateDelivered} onChange={(x) => set("templateDelivered", x)} placeholder="order_delivered" />
        </div>
        <TextField label="Template language" value={v.templateLang} onChange={(x) => set("templateLang", x)} placeholder="en" />
      </Section>

      <Section title="Cost rates" subtitle="For the usage estimate only — never charged. Set to your Meta per-message prices (in paise).">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumField label="Authentication / message" value={v.rateAuthPaise} onChange={(n) => set("rateAuthPaise", n)} min={0} max={100000} suffix="paise" />
          <NumField label="Utility / message" value={v.rateUtilityPaise} onChange={(n) => set("rateUtilityPaise", n)} min={0} max={100000} suffix="paise" />
        </div>
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
          {busy ? "Saving…" : "Save WhatsApp settings"}
        </button>
      </div>
    </div>
  );
}

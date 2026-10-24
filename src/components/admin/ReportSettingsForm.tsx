"use client";

import { useState } from "react";

import type { ReportSettings } from "@/server/reports/settings";

const input =
  "w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

/** "9:00 PM" style label for an IST hour, so the owner reads a clock, not 0-23. */
function hourLabel(h: number): string {
  const am = h < 12;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${am ? "AM" : "PM"}`;
}

export function ReportSettingsForm({ initial }: { initial: ReportSettings }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ReportSettings>(key: K, value: ReportSettings[K]) => setV((p) => ({ ...p, [key]: value }));

  async function save() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: v.enabled,
          whatsappTo: v.whatsappTo,
          emailTo: v.emailTo,
          sendHour: v.sendHour,
          whatsappPdf: v.whatsappPdf,
        }),
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
    <div className="mt-4 grid gap-3 border-t border-sr-line pt-4">
      {/* On / off */}
      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5">
        <input
          type="checkbox"
          checked={v.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-sr-600"
        />
        <span>
          <span className="block text-sm font-medium text-sr-ink">Send the daily report automatically</span>
          <span className="block text-xs text-sr-muted">Off = the scheduled report stops (the test button above still works).</span>
        </span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* WhatsApp number */}
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-sr-ink">WhatsApp number</span>
          <input
            className={input}
            inputMode="numeric"
            value={v.whatsappTo}
            placeholder="7400691655"
            onChange={(e) => set("whatsappTo", e.target.value)}
          />
          <span className="text-xs text-sr-muted">10-digit number the report goes to. Blank = WhatsApp off.</span>
        </label>

        {/* Send time */}
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-sr-ink">Send time (IST)</span>
          <select className={input} value={v.sendHour} onChange={(e) => set("sendHour", Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <span className="text-xs text-sr-muted">The report goes out around this hour each day.</span>
        </label>
      </div>

      {/* Attach PDF */}
      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-sr-line bg-sr-canvas px-3 py-2.5">
        <input
          type="checkbox"
          checked={v.whatsappPdf}
          onChange={(e) => set("whatsappPdf", e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-sr-600"
        />
        <span>
          <span className="block text-sm font-medium text-sr-ink">Attach the PDF of order details</span>
          <span className="block text-xs text-sr-muted">
            Only works when your WhatsApp template has a Document header. Turn off to send just the text summary.
          </span>
        </span>
      </label>

      {/* Email (optional) */}
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold text-sr-ink">Email (optional)</span>
        <input
          className={input}
          value={v.emailTo}
          placeholder="you@example.com"
          onChange={(e) => set("emailTo", e.target.value)}
        />
        <span className="text-xs text-sr-muted">Also email the report here. Blank = email off.</span>
      </label>

      {error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{notice}</p> : null}

      <div>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full bg-sr-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save report settings"}
        </button>
      </div>
    </div>
  );
}

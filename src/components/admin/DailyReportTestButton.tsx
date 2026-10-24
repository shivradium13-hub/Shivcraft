"use client";

import { useState } from "react";

/**
 * Admin "send the daily orders report now" — a one-click test so the owner can
 * check the WhatsApp/email digest on demand without waiting for the evening cron.
 * Shows the outcome (sent / not configured / mock / the exact error).
 */
export function DailyReportTestButton() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports/daily-test", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not send the report.");
        return;
      }
      const data = json.data ?? {};
      const wa = data.whatsapp;
      if (!wa) {
        setError("WhatsApp report isn't configured (set the template name + number first).");
      } else if (wa.ok && !wa.mock) {
        setNotice(`Sent! Today has ${data.count} order(s) — check the WhatsApp number now.`);
      } else if (wa.mock) {
        setError("WhatsApp is in test/mock mode, so nothing was actually sent.");
      } else {
        setError(`WhatsApp send failed: ${wa.error ?? "unknown error"}`);
      }
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="justify-self-start rounded-full bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send today's report now (test)"}
      </button>
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{notice}</p> : null}
      {error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

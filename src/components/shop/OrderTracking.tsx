"use client";

import { useState } from "react";

type Live = { status: string | null; detail: string | null; location: string | null; updatedAt: string | null };

/**
 * The customer's courier tracking block. Shows the last known status and a
 * manual refresh. It never invents a status — when the courier has not scanned
 * the parcel yet the copy says so, and it never promises a delivery date.
 */
export function OrderTracking({
  orderNumber,
  awb,
  trackingUrl,
  initialStatus,
}: {
  orderNumber: string;
  awb: string;
  trackingUrl: string;
  initialStatus: string | null;
}) {
  const [live, setLive] = useState<Live>({ status: initialStatus, detail: null, location: null, updatedAt: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/order/${orderNumber}/track`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not refresh tracking.");
        return;
      }
      setLive(json.data as Live);
      setChecked(true);
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-card border border-brand-200 bg-brand-50/60 p-5">
      <h2 className="font-display text-lg font-semibold text-brand-800">On its way with Delhivery</h2>

      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-muted">Tracking number</dt>
          <dd className="font-mono font-semibold break-all text-ink">{awb}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-muted">Status</dt>
          <dd className="font-medium text-ink">
            {live.status ? (
              <>
                {live.status}
                {live.location ? <span className="font-normal text-muted"> · {live.location}</span> : null}
              </>
            ) : checked ? (
              <span className="font-normal text-muted">
                No scan yet — the courier updates this once your parcel is picked up.
              </span>
            ) : (
              <span className="font-normal text-muted">Tap refresh for the latest.</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="rounded-full border border-brand-300 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
        >
          {busy ? "Refreshing…" : "Refresh status"}
        </button>
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-brand-600 px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Track on Delhivery
        </a>
      </div>

      {error ? <p className="mt-2.5 text-sm font-medium text-danger">{error}</p> : null}
    </section>
  );
}

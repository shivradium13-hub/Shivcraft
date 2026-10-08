"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DelhiveryShipment({
  orderNumber,
  awb,
  trackingUrl,
  shipmentStatus,
  configured,
  canShip,
}: {
  orderNumber: string;
  awb: string | null;
  trackingUrl: string | null;
  shipmentStatus: string | null;
  configured: boolean;
  canShip: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ship" | "label" | "track" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(shipmentStatus);

  async function refreshTracking() {
    setBusy("track");
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/delhivery/track`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not refresh tracking.");
        return;
      }
      setStatus(json.data.status ?? status);
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function createShipment() {
    setBusy("ship");
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/delhivery`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not create the shipment.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function openLabel() {
    setBusy("label");
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/delhivery`);
      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        setError(json?.error?.message ?? "Could not fetch the label.");
        return;
      }
      window.open(json.data.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
      <h2 className="font-display text-base font-semibold text-sr-ink">Delivery (Delhivery)</h2>

      {awb ? (
        <div className="mt-2.5 grid gap-2.5">
          <div>
            <p className="text-xs text-sr-muted">Tracking number (AWB)</p>
            <p className="font-mono text-sm font-semibold text-sr-ink">{awb}</p>
          </div>
          <div>
            <p className="text-xs text-sr-muted">Latest courier status</p>
            <p className="text-sm font-medium text-sr-ink">
              {status ?? <span className="font-normal text-sr-muted">No scan yet — refresh to check.</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshTracking}
              disabled={busy !== null}
              className="rounded-full border border-sr-line-strong px-4 py-2 text-xs font-semibold text-sr-body transition hover:border-sr-400 disabled:opacity-50"
            >
              {busy === "track" ? "Refreshing…" : "Refresh tracking"}
            </button>
            <button
              type="button"
              onClick={openLabel}
              disabled={busy !== null}
              className="rounded-full border border-sr-line-strong px-4 py-2 text-xs font-semibold text-sr-body transition hover:border-sr-400 disabled:opacity-50"
            >
              {busy === "label" ? "Opening…" : "Download label"}
            </button>
            {trackingUrl ? (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-sr-line-strong px-4 py-2 text-xs font-semibold text-sr-600 transition hover:border-sr-400"
              >
                Track parcel
              </a>
            ) : null}
          </div>
        </div>
      ) : configured ? (
        canShip ? (
          <div className="mt-2.5 grid gap-2">
            <p className="text-xs text-sr-muted">
              Creates the shipment with Delhivery, fetches a tracking number and moves the order to
              Shipped.
            </p>
            <button
              type="button"
              onClick={createShipment}
              disabled={busy !== null}
              className="justify-self-start rounded-full bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-50"
            >
              {busy === "ship" ? "Creating…" : "Create Delhivery shipment"}
            </button>
          </div>
        ) : (
          <p className="mt-2.5 rounded-lg bg-sr-canvas px-3 py-2 text-sm text-sr-muted">
            This order can no longer be shipped.
          </p>
        )
      ) : (
        <p className="mt-2.5 rounded-lg bg-sr-canvas px-3 py-2 text-xs text-sr-muted">
          Delhivery is not set up. Add the DELHIVERY_* environment variables to create shipments
          automatically. Until then, record the courier and tracking number in the status note.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-2.5 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

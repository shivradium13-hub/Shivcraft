"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status =
  | "PLACED" | "CONFIRMED" | "PROCESSING" | "CUSTOMIZED" | "PACKED"
  | "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

export function OrderStatusControl({
  orderNumber,
  current,
  options,
  labels,
}: {
  orderNumber: string;
  current: Status;
  options: Status[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [next, setNext] = useState<Status | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (options.length === 0) {
    return (
      <p className="rounded-lg bg-sr-canvas px-3 py-2.5 text-sm text-sr-muted">
        This order is {labels[current].toLowerCase()} and can no longer be changed.
      </p>
    );
  }

  async function apply() {
    if (!next) return;

    // Cancelling gives stock back and tells the customer; worth a confirmation.
    if (next === "CANCELLED" && !window.confirm(
      `Cancel ${orderNumber}? The stock goes back to the catalogue and the customer is notified.`,
    )) {
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next, note: note.trim() || undefined }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error?.message ?? "Could not update the order.");
        return;
      }

      const parts = [`Moved to ${labels[next]}.`];
      if (json.data.restocked?.length) {
        parts.push(
          `Restocked ${json.data.restocked
            .map((r: { name: string; quantity: number }) => `${r.quantity} × ${r.name}`)
            .join(", ")}.`,
        );
      }
      if (json.data.refundNote) parts.push(json.data.refundNote);

      setResult(parts.join(" "));
      setNext("");
      setNote("");
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor="next-status" className="text-xs font-semibold text-sr-ink">
          Move to
        </label>
        <select
          id="next-status"
          value={next}
          onChange={(e) => setNext(e.target.value as Status)}
          className="w-full rounded-lg border border-field bg-sr-surface px-3 py-2 text-sm outline-none focus:border-sr-400"
        >
          <option value="">Choose a status…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {labels[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="status-note" className="text-xs font-semibold text-sr-ink">
          Note {next === "CANCELLED" ? "(reason for cancelling)" : "(optional)"}
        </label>
        <input
          id="status-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={next === "SHIPPED" ? "Courier and tracking number" : "Shown on the customer's timeline"}
          className="w-full rounded-lg border border-field bg-sr-surface px-3 py-2 text-sm outline-none focus:border-sr-400"
        />
      </div>

      <button
        type="button"
        disabled={!next || busy}
        onClick={apply}
        className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-45 ${
          next === "CANCELLED" ? "bg-danger hover:opacity-90" : "bg-sr-600 hover:bg-sr-700"
        }`}
      >
        {busy ? "Updating…" : next === "CANCELLED" ? "Cancel this order" : "Update status"}
      </button>

      {result ? (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{result}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

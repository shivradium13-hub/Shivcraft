"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "APPROVED" | "PENDING" | "REJECTED";

/**
 * Moderation buttons for one review.
 *
 * Every action here changes the product's public rating, so nothing is faked in
 * the UI: the row only changes after the server has confirmed it, and the page
 * is refreshed so the counts and rating shown are the ones in the database.
 */
export function ReviewModeration({
  reviewId,
  status,
  productName,
}: {
  reviewId: string;
  status: Status;
  productName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: Status) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not update the review.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete this review of ${productName}? It is removed for good and the product rating is recalculated.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "Could not delete the review.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5">
        {status !== "APPROVED" ? (
          <Action busy={busy} onClick={() => setStatus("APPROVED")} tone="ok">
            Publish
          </Action>
        ) : null}
        {status !== "REJECTED" ? (
          <Action busy={busy} onClick={() => setStatus("REJECTED")} tone="warn">
            Take down
          </Action>
        ) : null}
        {status !== "PENDING" ? (
          <Action busy={busy} onClick={() => setStatus("PENDING")} tone="plain">
            Hold
          </Action>
        ) : null}
        <Action busy={busy} onClick={remove} tone="danger">
          Delete
        </Action>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Action({
  busy,
  onClick,
  tone,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  tone: "ok" | "warn" | "danger" | "plain";
  children: React.ReactNode;
}) {
  const tones = {
    ok: "border-sr-600 text-sr-700 hover:bg-sr-50",
    warn: "border-sr-ink text-sr-ink hover:bg-sr-canvas",
    danger: "border-danger text-danger hover:bg-danger-soft",
    plain: "border-sr-line-strong text-sr-body hover:bg-sr-canvas",
  } as const;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

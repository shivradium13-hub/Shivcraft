"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type ExistingReview = {
  id: string;
  rating: number;
  title: string;
  body: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
} | null;

export type ReviewEligibility =
  | { state: "SIGNED_OUT" }
  | { state: "CAN_REVIEW" }
  | { state: "ALREADY_REVIEWED" }
  | { state: "NOT_DELIVERED" }
  | { state: "NOT_PURCHASED" };

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          aria-pressed={value === star}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <svg viewBox="0 0 20 20" className="h-7 w-7" aria-hidden="true">
            <path
              d="M10 1.6l2.47 5.005 5.525.803-3.998 3.896.944 5.502L10 14.21l-4.94 2.596.943-5.502L2.005 7.408l5.524-.803z"
              fill={shown >= star ? "var(--color-brand-500)" : "var(--color-line-strong)"}
            />
          </svg>
        </button>
      ))}
      <span className="ml-2 text-sm text-muted">
        {shown ? `${shown} of 5` : "Tap a star"}
      </span>
    </div>
  );
}

export function ReviewForm({
  productId,
  productSlug,
  eligibility,
  existing,
}: {
  productId: string;
  productSlug: string;
  eligibility: ReviewEligibility;
  existing: ExistingReview;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(eligibility.state === "CAN_REVIEW");
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Everything except "you may write one" explains itself and stops here —
     no form shown that would be refused on submit. */
  if (eligibility.state === "SIGNED_OUT") {
    return (
      <Note>
        <Link
          href={`/login?next=${encodeURIComponent(`/product/${productSlug}`)}`}
          className="font-semibold text-brand-700 hover:underline"
        >
          Sign in
        </Link>{" "}
        to review this — we only publish reviews from people who bought it.
      </Note>
    );
  }
  if (eligibility.state === "NOT_PURCHASED") {
    return <Note>Only customers who have received this product can review it.</Note>;
  }
  if (eligibility.state === "NOT_DELIVERED") {
    return <Note>You can review this once your order has been delivered.</Note>;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1) {
      setError("Pick a rating first.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(existing ? `/api/reviews/${existing.id}` : "/api/reviews", {
        method: existing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(existing ? { rating, title, body } : { productId, rating, title, body }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error?.message ?? "Could not save your review.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm("Delete your review? This cannot be undone.")) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${existing.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete your review.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!editing && existing) {
    /* Says what is actually true of this review, including when moderation has
       taken it off the product page. */
    const standing =
      existing.status === "APPROVED"
        ? "Your review is live on this page."
        : existing.status === "PENDING"
          ? "Your review is with our team for a check."
          : "Your review was taken down because it broke our review guidelines.";

    return (
      <div className="rounded-card border border-line bg-paper p-4">
        <p className="text-sm font-semibold text-ink">{standing}</p>
        <p className="mt-1 text-xs text-muted">
          {existing.rating} of 5{existing.title ? ` · ${existing.title}` : ""}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-400 hover:text-brand-600"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-danger hover:text-danger disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-card border border-brand-200 bg-brand-50/50 p-4">
      <h3 className="font-display text-lg font-semibold text-brand-800">
        {existing ? "Edit your review" : "Write a review"}
      </h3>
      <p className="mt-0.5 mb-3 text-xs text-ink-soft">
        You bought this, so your review carries a verified purchase badge.
      </p>

      <StarPicker
        value={rating}
        onChange={(next) => {
          setRating(next);
          // The only client-side error is "pick a rating"; picking one answers it.
          setError(null);
        }}
      />

      <label className="mt-4 grid gap-1.5">
        <span className="text-xs font-semibold text-ink">Headline (optional)</span>
        <input
          value={title}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Exactly as pictured"
          className="w-full rounded-lg border border-field bg-paper px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </label>

      <label className="mt-3 grid gap-1.5">
        <span className="text-xs font-semibold text-ink">Your review (optional)</span>
        <textarea
          value={body}
          maxLength={3000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="How did it turn out? Was the engraving clean? Did it arrive on time?"
          className="min-h-24 w-full rounded-lg border border-field bg-paper px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {busy ? "Saving…" : existing ? "Save changes" : "Publish review"}
        </button>
        {existing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink-soft"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-field bg-paper px-4 py-3 text-sm text-muted">
      {children}
    </p>
  );
}

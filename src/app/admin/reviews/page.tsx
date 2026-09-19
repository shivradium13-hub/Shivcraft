import type { Metadata } from "next";
import Link from "next/link";

import { ReviewModeration } from "@/components/admin/ReviewModeration";
import { requireAdmin } from "@/server/auth/guards";
import {
  REVIEW_STATUS_LABEL,
  listAdminReviews,
  reviewStatusCounts,
  type ReviewStatus,
} from "@/server/reviews/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reviews", robots: { index: false, follow: false } };

const PAGE_SIZE = 20;

const STATUS_TONE: Record<string, string> = {
  APPROVED: "bg-success-soft text-success",
  PENDING: "bg-sr-gold-soft text-sr-gold",
  REJECTED: "bg-danger-soft text-danger",
};

const CHIPS: (ReviewStatus | "ALL")[] = ["ALL", "APPROVED", "PENDING", "REJECTED"];

export default async function AdminReviewsPage(props: PageProps<"/admin/reviews">) {
  await requireAdmin();
  const search = await props.searchParams;

  const status = (typeof search.status === "string" ? search.status : "ALL") as ReviewStatus | "ALL";
  const ratingRaw = Number(typeof search.rating === "string" ? search.rating : 0);
  const rating = ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
  const query = typeof search.q === "string" ? search.q.trim() : "";
  const page = Math.max(1, Number(typeof search.page === "string" ? search.page : 1) || 1);

  const [{ rows, total }, counts] = await Promise.all([
    listAdminReviews({ status, rating, query, page, limit: PAGE_SIZE }),
    reviewStatusCounts(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = {
      status: status === "ALL" ? undefined : status,
      rating: rating ? String(rating) : undefined,
      q: query || undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const qs = params.toString();
    return qs ? `/admin/reviews?${qs}` : "/admin/reviews";
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Reviews</h1>
      <p className="mt-1 text-sm text-sr-muted">
        {total} matching {total === 1 ? "review" : "reviews"}. Taking one down removes it from the
        product&rsquo;s star rating straight away.
      </p>

      <form action="/admin/reviews" className="mt-4 flex flex-wrap gap-2">
        {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
        {rating ? <input type="hidden" name="rating" value={rating} /> : null}
        <input
          name="q"
          defaultValue={query}
          placeholder="Product, customer name, email or review text"
          className="min-w-0 flex-1 rounded-lg border border-field bg-sr-surface px-3 py-2 text-sm outline-none focus:border-sr-400"
        />
        <button
          type="submit"
          className="rounded-lg bg-sr-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Search
        </button>
        {query ? (
          <Link
            href={href({ q: undefined, page: undefined })}
            className="rounded-lg border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => {
          const n = chip === "ALL" ? counts.all : (counts.map.get(chip) ?? 0);
          const active = status === chip;
          return (
            <Link
              key={chip}
              href={href({ status: chip === "ALL" ? undefined : chip, page: undefined })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-sr-500 bg-sr-500 text-white"
                  : "border-sr-line-strong text-sr-body hover:border-sr-400"
              }`}
            >
              {chip === "ALL" ? "All" : REVIEW_STATUS_LABEL[chip]} ({n})
            </Link>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const active = rating === star;
          return (
            <Link
              key={star}
              href={href({ rating: active ? undefined : String(star), page: undefined })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-sr-ink bg-sr-ink text-white"
                  : "border-sr-line-strong text-sr-body hover:border-sr-400"
              }`}
            >
              {star}★
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-field bg-sr-surface px-4 py-10 text-center text-sm text-sr-muted">
          No reviews match this view.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {rows.map((review) => (
            <li
              key={review.id}
              className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link
                  href={`/product/${review.productSlug}`}
                  className="text-sm font-semibold text-sr-ink hover:text-sr-600"
                >
                  {review.productName}
                </Link>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[review.status]}`}
                >
                  {REVIEW_STATUS_LABEL[review.status as ReviewStatus]}
                </span>
              </div>

              {/* role="img" so the label replaces the glyphs for a screen
                  reader, which would otherwise read five stars either way. */}
              <p
                role="img"
                aria-label={`${review.rating} out of 5`}
                className="mt-2 text-sm font-semibold text-sr-gold"
              >
                {"★".repeat(review.rating)}
                <span className="text-sr-line-strong">{"★".repeat(5 - review.rating)}</span>
              </p>

              {review.title ? (
                <p className="mt-1.5 text-sm font-semibold text-sr-ink">{review.title}</p>
              ) : null}
              {review.body ? (
                <p className="mt-1 text-sm whitespace-pre-line text-sr-body">{review.body}</p>
              ) : (
                <p className="mt-1 text-sm text-sr-muted italic">Rating only, no text.</p>
              )}

              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-sr-muted">
                <span className="font-medium text-sr-ink">{review.authorName}</span>
                <span>{review.authorEmail}</span>
                {review.verified ? (
                  <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">
                    Verified purchase
                  </span>
                ) : null}
                <span>{new Date(review.createdAt).toLocaleDateString("en-IN")}</span>
              </p>

              <ReviewModeration
                reviewId={review.id}
                status={review.status as ReviewStatus}
                productName={review.productName}
              />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={href({ page: String(page - 1) })}
              className="rounded-lg border border-sr-line-strong px-3 py-1.5 font-medium text-sr-body"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-sr-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={href({ page: String(page + 1) })}
              className="rounded-lg border border-sr-line-strong px-3 py-1.5 font-medium text-sr-body"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

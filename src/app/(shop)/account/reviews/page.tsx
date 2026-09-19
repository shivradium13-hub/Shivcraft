import type { Metadata } from "next";
import Link from "next/link";

import { Stars } from "@/components/ui/primitives";
import { getMyReviews, getReviewableProducts } from "@/server/account/queries";
import { requireUser } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My reviews", robots: { index: false, follow: false } };

export default async function ReviewsPage() {
  const user = await requireUser();
  const [written, awaiting] = await Promise.all([
    getMyReviews(user.id),
    getReviewableProducts(user.id),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">My reviews</h1>
      <p className="mt-1 mb-5 max-w-prose text-sm text-muted">
        You can review anything that has been delivered to you. That is what makes the verified
        purchase badge worth something.
      </p>

      {awaiting.length > 0 ? (
        <section className="mb-6 rounded-card border border-marigold-200 bg-marigold-50 p-4">
          <h2 className="text-sm font-semibold text-brand-800">
            {awaiting.length} item{awaiting.length === 1 ? "" : "s"} waiting for your review
          </h2>
          <ul className="mt-2 space-y-1.5">
            {awaiting.map((item) => (
              <li key={item.productId} className="text-sm">
                <Link
                  href={`/product/${item.slug}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {item.name}
                </Link>
                <span className="ml-2 text-xs text-muted">from {item.orderNumber}</span>
              </li>
            ))}
          </ul>
          {/* Said plainly rather than showing a button that does nothing. */}
          <p className="mt-3 text-xs text-ink-soft">
            Writing a review is not built yet — the form goes on the product page next.
          </p>
        </section>
      ) : null}

      {written.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-paper px-6 py-12 text-center">
          <span aria-hidden="true" className="text-3xl">★</span>
          <h2 className="mt-3 font-display text-lg font-semibold text-ink">
            You have not written a review yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Once an order is delivered, you can tell other buyers how it turned out.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {written.map((review) => (
            <li key={review.id} className="rounded-card border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/product/${review.productSlug}`}
                  className="text-sm font-semibold text-ink hover:text-brand-700"
                >
                  {review.productName}
                </Link>
                <span className="text-xs text-muted">
                  {new Date(review.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="mt-1.5">
                <Stars rating={review.rating} />
              </div>

              {review.title ? (
                <p className="mt-1.5 text-sm font-semibold text-ink">{review.title}</p>
              ) : null}
              {review.body ? <p className="mt-1 text-sm text-ink-soft">{review.body}</p> : null}

              {review.status !== "APPROVED" ? (
                <p className="mt-2 text-xs font-medium text-warn">
                  {review.status === "PENDING" ? "Awaiting moderation" : "Not published"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

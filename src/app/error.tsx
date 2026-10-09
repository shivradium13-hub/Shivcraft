"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * App-wide error boundary. Catches unexpected runtime errors in pages/segments
 * and shows a calm recovery screen instead of Next's default. Error boundaries
 * must be Client Components. (Next 16 passes `retry`, not `reset`.)
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-display text-5xl font-semibold text-ink">Oops</p>
      <h1 className="mt-3 font-display text-xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        A problem came up at our end. Please try again — if it keeps happening, contact us with your
        order number and we will sort it out.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-500"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}

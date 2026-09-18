"use client";

/** Shown when the API fails. The raw error never reaches the customer (spec 23). */
export function CategoryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-2xl border border-sr-line bg-sr-surface px-6 py-12 text-center"
    >
      <span aria-hidden="true" className="text-2xl">⚠️</span>
      <h3 className="mt-2 font-display text-lg font-semibold text-sr-ink">
        Unable to load categories
      </h3>
      <p className="mt-1.5 text-sm text-sr-muted">Please try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full bg-sr-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-600"
      >
        Retry
      </button>
    </div>
  );
}

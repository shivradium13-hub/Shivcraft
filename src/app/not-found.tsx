import Link from "next/link";

/** Branded 404 shown for any URL that does not match a route or when a page
 *  calls notFound(). */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-display text-6xl font-semibold text-brand-600">404</p>
      <h1 className="mt-3 font-display text-xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        The page you are looking for doesn&rsquo;t exist or may have moved.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Go to homepage
        </Link>
        <Link
          href="/categories"
          className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-500"
        >
          Browse gifts
        </Link>
      </div>
    </main>
  );
}

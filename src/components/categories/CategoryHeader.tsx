"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Compact header for the Categories screen (spec 13).
 * Back + title + cart on phones; wordmark + breadcrumb + search on desktop.
 */
export function CategoryHeader({ search }: { search?: ReactNode }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-sr-line bg-sr-surface/95 backdrop-blur supports-[backdrop-filter]:bg-sr-surface/85">
      <div className="mx-auto w-full max-w-[1440px] px-3 sm:px-4">
        <div className="flex h-16 items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sr-ink transition hover:bg-sr-50 lg:hidden"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
              <path
                d="M12.5 4L6.5 10l6 6"
                stroke="currentColor"
                strokeWidth="1.7"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Shiv Radium home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sr-500 text-sm font-bold text-white">
              SR
            </span>
            <span className="hidden font-display text-[17px] leading-none font-semibold tracking-tight text-sr-ink sm:block">
              SHIV <span className="text-sr-500">RADIUM</span>
            </span>
          </Link>

          <h1 className="font-display text-lg font-semibold text-sr-ink lg:hidden">Categories</h1>

          <div className="ml-auto hidden min-w-0 max-w-sm flex-1 lg:block">{search}</div>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 lg:ml-3">
            <Link
              href="/account/wishlist"
              aria-label="Wishlist"
              className="flex h-9 w-9 items-center justify-center rounded-full text-sr-ink transition hover:bg-sr-50"
            >
              <svg viewBox="0 0 22 22" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M11 18.5l-1.1-1C5.5 13.6 3 11.3 3 8.4A4.1 4.1 0 017.1 4.3c1.4 0 2.8.7 3.9 2 1.1-1.3 2.5-2 3.9-2A4.1 4.1 0 0119 8.4c0 2.9-2.5 5.2-6.9 9.1z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link
              href="/cart"
              aria-label="Cart"
              className="flex h-9 w-9 items-center justify-center rounded-full text-sr-ink transition hover:bg-sr-50"
            >
              <svg viewBox="0 0 22 22" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M3 4h2.2l1.6 9.2a1.6 1.6 0 001.6 1.3h7.3a1.6 1.6 0 001.6-1.2L19 7H6.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9.5" cy="18" r="1.3" fill="currentColor" />
                <circle cx="15.5" cy="18" r="1.3" fill="currentColor" />
              </svg>
            </Link>
          </div>
        </div>

        <nav
          aria-label="Breadcrumb"
          className="hidden items-center gap-1.5 pb-2.5 text-xs text-sr-muted lg:flex"
        >
          <Link href="/" className="hover:text-sr-600">
            Home
          </Link>
          <span aria-hidden="true">›</span>
          <span className="font-medium text-sr-ink">Categories</span>
        </nav>
      </div>
    </header>
  );
}

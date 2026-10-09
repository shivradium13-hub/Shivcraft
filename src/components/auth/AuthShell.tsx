import Link from "next/link";
import type { ReactNode } from "react";

/** The shared frame for every auth screen: centred card, Shiv Radium logo,
 *  heading and subtitle. Keeps sign in / create account / reset identical. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sr-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          aria-label="Shiv Radium home"
          className="mb-6 flex items-center justify-center"
        >
          {/* The brand logo, same asset as the storefront header. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Shiv Radium — Custom Gifts & Printing"
            className="h-16 w-auto max-w-[260px] object-contain"
          />
        </Link>

        <div className="rounded-2xl border border-sr-line bg-sr-surface p-6 shadow-sr-card">
          <h1 className="font-display text-xl font-semibold text-sr-ink">{title}</h1>
          <p className="mt-1 mb-5 text-sm text-sr-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}

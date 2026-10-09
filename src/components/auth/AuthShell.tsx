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
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sr-600 text-sm font-bold text-white">
            SR
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-sr-ink">
            SHIV <span className="text-sr-600">RADIUM</span>
          </span>
        </div>

        <div className="rounded-2xl border border-sr-line bg-sr-surface p-6 shadow-sr-card">
          <h1 className="font-display text-xl font-semibold text-sr-ink">{title}</h1>
          <p className="mt-1 mb-5 text-sm text-sr-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}

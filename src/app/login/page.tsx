import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage(props: PageProps<"/login">) {
  const search = await props.searchParams;
  const next = typeof search.next === "string" ? search.next : undefined;

  // Already signed in? Send them where they were going, or to the right home.
  const user = await getCurrentUser();
  if (user) redirect(next ?? (user.role === "ADMIN" ? "/admin" : "/"));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sr-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sr-500 text-sm font-bold text-white">
            SR
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-sr-ink">
            SHIV <span className="text-sr-500">RADIUM</span>
          </span>
        </div>

        <div className="rounded-2xl border border-sr-line bg-sr-surface p-6 shadow-sr-card">
          <h1 className="font-display text-xl font-semibold text-sr-ink">Sign in</h1>
          <p className="mt-1 mb-5 text-sm text-sr-muted">
            Customers reach their orders here. Staff accounts land on the dashboard.
          </p>
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}

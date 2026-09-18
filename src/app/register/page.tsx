import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default async function RegisterPage(props: PageProps<"/register">) {
  const search = await props.searchParams;
  const next = typeof search.next === "string" ? search.next : undefined;

  const user = await getCurrentUser();
  if (user) redirect(next ?? "/");

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
          <h1 className="font-display text-xl font-semibold text-sr-ink">Create your account</h1>
          <p className="mt-1 mb-5 text-sm text-sr-muted">
            Anything already in your cart comes with you.
          </p>
          <RegisterForm next={next} />
          <p className="mt-4 text-center text-sm text-sr-muted">
            Already have an account?{" "}
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="font-semibold text-sr-600 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

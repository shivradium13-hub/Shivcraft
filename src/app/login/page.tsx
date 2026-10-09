import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
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
    <AuthShell
      title="Sign in"
      subtitle="Use your email or mobile number. Customers reach their orders here; staff land on the dashboard."
    >
      <LoginForm next={next} />
      <p className="mt-5 border-t border-sr-line pt-4 text-center text-sm text-sr-muted">
        New to Shiv Radium?{" "}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="font-semibold text-sr-600 hover:underline"
        >
          Create account
        </Link>
      </p>
    </AuthShell>
  );
}

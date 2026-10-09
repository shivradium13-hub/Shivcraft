import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
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
    <AuthShell title="Create your account" subtitle="Anything already in your cart comes with you.">
      <RegisterForm next={next} />
      <p className="mt-5 border-t border-sr-line pt-4 text-center text-sm text-sr-muted">
        Already have an account?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-semibold text-sr-600 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

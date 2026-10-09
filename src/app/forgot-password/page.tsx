import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const search = await props.searchParams;
  const email = typeof search.email === "string" ? search.email : undefined;

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to set a new one."
    >
      <ForgotPasswordForm initialEmail={email} />
      <p className="mt-5 border-t border-sr-line pt-4 text-center text-sm text-sr-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-sr-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

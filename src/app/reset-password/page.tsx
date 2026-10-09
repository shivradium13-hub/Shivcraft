import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const search = await props.searchParams;
  const token = typeof search.token === "string" ? search.token : "";

  if (!token) {
    return (
      <AuthShell title="Reset your password" subtitle="This reset link is missing or incomplete.">
        <p className="text-sm text-sr-muted">
          Please open the link from your email again, or request a new one.
        </p>
        <p className="mt-5 border-t border-sr-line pt-4 text-center text-sm text-sr-muted">
          <Link href="/forgot-password" className="font-semibold text-sr-600 hover:underline">
            Request a new link
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a new password for your account.">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}

import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyEmailClient } from "@/components/auth/VerifyEmailClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const search = await searchParams;
  const token = typeof search.token === "string" ? search.token : "";

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Confirm this email address so you can receive login codes by email as well as WhatsApp."
    >
      <VerifyEmailClient token={token} />
    </AuthShell>
  );
}

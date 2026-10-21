"use client";

import Link from "next/link";
import { useState } from "react";

type State = "idle" | "busy" | "done" | "error";

/**
 * Confirms an email-verification link. The confirm is a POST triggered by a
 * button click, NOT an automatic GET on load — so email link scanners and
 * prefetchers can't silently verify an address; a person has to act.
 */
export function VerifyEmailClient({ token }: { token: string }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setState("error");
        setMessage(json?.error?.message ?? "This link is invalid or has expired.");
        return;
      }
      setState("done");
      setMessage(json?.data?.alreadyVerified ? "This email was already verified." : "Your email is verified.");
    } catch {
      setState("error");
      setMessage("Network problem — please try again.");
    }
  }

  if (!token) {
    return (
      <div>
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          This link is missing its verification code. Please open the link from your email again, or request a new one.
        </p>
        <Link href="/account" className="mt-4 inline-block text-sm font-semibold text-sr-600 hover:underline">
          Go to my account
        </Link>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div>
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{message}</p>
        <Link href="/account" className="mt-4 inline-block text-sm font-semibold text-sr-600 hover:underline">
          Continue to my account
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-sr-muted">
        Click below to confirm this email address belongs to you.
      </p>
      <button
        type="button"
        onClick={confirm}
        disabled={state === "busy"}
        className="rounded-full bg-sr-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {state === "busy" ? "Verifying…" : "Verify my email"}
      </button>
      {state === "error" && message ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{message}</p>
      ) : null}
    </div>
  );
}

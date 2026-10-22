"use client";

import { useState } from "react";

/**
 * Account card: shows whether the signed-in customer's email is verified and,
 * if not, lets them send themselves a verification link. Mock-first — while
 * email is not live nothing is delivered; in development the link is shown here
 * so the flow can be walked end to end without a real inbox.
 */
export function EmailVerifyCard({ email, verified }: { email: string; verified: boolean }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [done, setDone] = useState(verified);

  async function sendLink() {
    setBusy(true);
    setNotice(null);
    setError(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/auth/email/request", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not send the verification email.");
        return;
      }
      const data = json?.data ?? {};
      if (data.alreadyVerified) {
        setDone(true);
        setNotice("Your email is already verified.");
      } else if (data.sent) {
        setNotice(`We've sent a verification link to ${email}. Open it to finish.`);
      } else {
        // Mock mode (email not live yet): nothing was actually delivered.
        setNotice("Email delivery isn't switched on yet, so no email was sent. (This feature is being set up.)");
      }
      if (typeof data.devLink === "string") setDevLink(data.devLink);
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-card border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Email verification</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            done ? "bg-success-soft text-success" : "bg-field-bg text-muted"
          }`}
        >
          {done ? "Verified" : "Not verified"}
        </span>
      </div>

      {done ? (
        <p className="mt-2 text-sm text-ink-soft">
          Your email <span className="font-medium text-ink">{email}</span> is verified. You can receive login codes by
          email when email login is switched on.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            Verify <span className="font-medium text-ink">{email}</span> to receive your login code by email as well as
            WhatsApp. We&rsquo;ll send a confirmation link to that address.
          </p>
          <button
            type="button"
            onClick={sendLink}
            disabled={busy}
            className="mt-3 rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send verification link"}
          </button>
        </>
      )}

      {notice ? <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{notice}</p> : null}
      {error ? <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
      {devLink ? (
        <p className="mt-2 text-xs break-all text-muted">
          Dev link: <a href={devLink} className="font-medium text-brand-700 hover:underline">{devLink}</a>
        </p>
      ) : null}
    </section>
  );
}

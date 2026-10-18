"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthField, PhoneIcon } from "./fields";

/**
 * WhatsApp OTP sign-in. Two steps — enter the mobile number to get a code, then
 * enter the 6-digit code. The code is sent and verified entirely on the server;
 * this form only collects input. While real delivery is mocked (dev), the API
 * echoes the code back and we surface it as a dev hint.
 */
export function OtpLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const phone10 = phone.replace(/\D/g, "").slice(-10);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }

  async function sendCode(isResend = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { res, json } = await post(isResend ? "/api/auth/otp/resend" : "/api/auth/otp/send", {
        phone: phone10,
      });
      if (!res.ok) {
        setError(json?.error?.message ?? "Could not send the code. Please try again.");
        return;
      }
      if (!json?.data || (json.data.sent !== true && json.data.mock !== true)) {
        setError("Could not send the code. Please try again or sign in with your password.");
        return;
      }
      setStep("code");
      setResendIn(json?.data?.resendSeconds ?? 45);
      setDevCode(json?.data?.devCode ?? null);
      setNotice(
        json?.data?.mock
          ? "A code has been generated. (WhatsApp delivery is in test mode.)"
          : `We’ve sent a 6-digit code to +91 ${phone10} on WhatsApp.`,
      );
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoneSubmit(e: FormEvent) {
    e.preventDefault();
    if (phone10.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    await sendCode(false);
  }

  async function onCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post("/api/auth/otp/verify", { phone: phone10, code });
      if (!res.ok) {
        setError(json?.error?.message ?? "That code is not right.");
        return;
      }
      const user = json.data.user;
      router.replace(next ?? (user.role === "ADMIN" ? "/admin" : "/"));
      router.refresh();
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={onPhoneSubmit} className="grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="wa-phone" className="text-xs font-semibold text-sr-ink">
            Mobile number
          </label>
          <div className="flex gap-2">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-field bg-field-bg px-3 text-sm text-sr-body">
              <PhoneIcon /> +91
            </span>
            <input
              id="wa-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              maxLength={14}
              className="w-full rounded-xl border border-field bg-field-bg px-3.5 py-2.5 text-sm text-sr-ink outline-none transition placeholder:text-field-placeholder focus:border-sr-400 focus:bg-sr-surface focus:ring-2 focus:ring-sr-100"
            />
          </div>
          <p className="text-xs text-sr-muted">We’ll send a one-time code to this number on WhatsApp.</p>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center rounded-full bg-sr-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sr-700 active:scale-[.99] disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onCodeSubmit} className="grid gap-4">
      <AuthField
        id="wa-code"
        autoFocus
        label="6-digit code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="••••••"
        maxLength={6}
        className="tracking-[0.5em]"
        hint={notice ?? undefined}
      />

      {devCode ? (
        <p className="rounded-lg bg-sr-100 px-3 py-2 text-xs text-sr-body">
          Test mode — your code is <strong className="tracking-widest">{devCode}</strong>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="inline-flex items-center justify-center rounded-full bg-sr-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sr-700 active:scale-[.99] disabled:opacity-60"
      >
        {busy ? "Verifying…" : "Verify & sign in"}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setCode("");
            setError(null);
            setNotice(null);
            setDevCode(null);
          }}
          className="font-semibold text-sr-600 hover:underline"
        >
          ← Change number
        </button>
        <button
          type="button"
          disabled={busy || resendIn > 0}
          onClick={() => sendCode(true)}
          className="font-semibold text-sr-600 hover:underline disabled:text-sr-muted disabled:no-underline"
        >
          {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

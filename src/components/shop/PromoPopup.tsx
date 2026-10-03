"use client";

import { useEffect, useRef, useState } from "react";

import type { PromoPopup as PromoPopupConfig } from "@/lib/storefront";

/* Remembers, per browser, when the pop-up may show again — set on close and
   (far out) on subscribe, so a visitor is not nagged on every page. */
const STORAGE_KEY = "sr_popup_until";

/**
 * The storefront promo / newsletter pop-up.
 *
 * Appears once the visitor has browsed for `delaySeconds` (so it reads as
 * "after exploring", not an instant interruption), eases in with a fade + scale,
 * and collects an email into /api/newsletter. All content and timing are
 * admin-controlled (Storefront settings); when disabled nothing renders.
 */
export function PromoPopup({ config }: { config: PromoPopupConfig }) {
  const [mounted, setMounted] = useState(false); // in the DOM
  const [visible, setVisible] = useState(false); // animated in
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!config.enabled) return;
    try {
      const until = Number(localStorage.getItem(STORAGE_KEY) || 0);
      if (until && Date.now() < until) return; // still within the quiet window
    } catch {
      /* private mode / blocked storage — just show it */
    }
    timer.current = window.setTimeout(
      () => {
        setMounted(true);
        // Two frames so the initial (hidden) styles are committed before we flip
        // to visible — that is what makes the transition actually animate.
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      },
      Math.max(0, config.delaySeconds) * 1000,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [config.enabled, config.delaySeconds]);

  function remember(days: number) {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + days * 86_400_000));
    } catch {
      /* ignore */
    }
  }

  function close(days = config.repeatDays || 7) {
    setVisible(false);
    remember(days);
    window.setTimeout(() => setMounted(false), 250); // after the fade-out
  }

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    if (status === "busy" || status === "done") return;
    setStatus("busy");
    setMessage(null);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus("error");
        setMessage(json?.error?.message ?? "Please enter a valid email.");
        return;
      }
      setStatus("done");
      setMessage("You’re on the list — thank you!");
      window.setTimeout(() => close(365), 1600); // don't nag a subscriber
    } catch {
      setStatus("error");
      setMessage("Network problem — try again.");
    }
  }

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={config.heading || "Subscribe"}
      onClick={() => close()}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-300 ${
        visible ? "bg-ink/60 opacity-100" : "bg-ink/0 opacity-0"
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative grid w-full max-w-2xl overflow-hidden rounded-2xl bg-paper shadow-2xl transition-all duration-300 ease-out sm:grid-cols-2 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => close()}
          className="absolute top-2.5 right-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-paper/80 text-ink-soft transition hover:bg-brand-50 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {config.imageUrl ? (
          <div className="relative hidden min-h-[220px] bg-soft sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            {config.offerText ? (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-4">
                <p className="font-display text-xl font-semibold text-white">{config.offerText}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={`p-6 sm:p-7 ${config.imageUrl ? "" : "sm:col-span-2"}`}>
          {config.offerText && !config.imageUrl ? (
            <p className="mb-1 font-display text-2xl font-semibold text-brand-600">{config.offerText}</p>
          ) : null}
          <h2 className="font-display text-xl font-semibold text-ink">{config.heading}</h2>
          {config.body ? <p className="mt-1.5 text-sm text-ink-soft">{config.body}</p> : null}

          {status === "done" ? (
            <p className="mt-5 rounded-lg bg-success-soft px-3 py-2.5 text-sm font-medium text-success">
              {message}
            </p>
          ) : (
            <form onSubmit={subscribe} className="mt-5">
              <div className="flex overflow-hidden rounded-full border border-line-strong bg-paper focus-within:border-brand-400">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-ink outline-none"
                />
                <button
                  type="submit"
                  disabled={status === "busy"}
                  className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-night-soft disabled:opacity-60"
                >
                  {status === "busy" ? "…" : config.buttonLabel || "Subscribe"}
                </button>
              </div>
              {status === "error" && message ? (
                <p className="mt-2 text-xs font-medium text-danger">{message}</p>
              ) : null}
              <button
                type="button"
                onClick={() => close()}
                className="mt-3 text-xs font-medium text-muted hover:text-ink-soft"
              >
                No thanks
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

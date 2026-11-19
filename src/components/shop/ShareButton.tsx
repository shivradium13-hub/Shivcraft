"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lets a customer share the current product. On phones the native share sheet
 * (Web Share API) opens — the nicest path, covering WhatsApp, Instagram, SMS and
 * more. Where that is unavailable (most desktops) a small menu offers WhatsApp,
 * Facebook, X and "Copy link" instead. The shared URL is the current page.
 */
export function ShareButton({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function onShare() {
    const url = window.location.href;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: `Check out “${title}” on Shiv Radium`, url });
        return;
      } catch {
        // Cancelled or unsupported mid-call — fall back to the menu below.
      }
    }
    setOpen((o) => !o);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked (e.g. insecure context) — nothing else to do */
    }
    setOpen(false);
  }

  const url = typeof window !== "undefined" ? window.location.href : "";
  const text = `Check out “${title}” on Shiv Radium`;
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    {
      label: "X (Twitter)",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    },
  ];

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={onShare}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand-300 hover:text-brand-700"
      >
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="15" cy="5" r="2.2" />
          <circle cx="5" cy="10" r="2.2" />
          <circle cx="15" cy="15" r="2.2" />
          <path d="M7 9l6-3M7 11l6 3" />
        </svg>
        {copied ? "Link copied!" : "Share"}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-card border border-line bg-paper py-1 shadow-lift"
        >
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-ink transition hover:bg-brand-50"
            >
              {l.label}
            </a>
          ))}
          <button
            type="button"
            onClick={copyLink}
            className="block w-full px-3 py-2 text-left text-sm text-ink transition hover:bg-brand-50"
          >
            Copy link
          </button>
        </div>
      ) : null}
    </div>
  );
}

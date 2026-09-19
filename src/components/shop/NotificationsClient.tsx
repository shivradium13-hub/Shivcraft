"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const ICON: Record<string, string> = {
  ORDER_PLACED: "📦",
  ORDER_CONFIRMED: "✓",
  ORDER_SHIPPED: "🚚",
  ORDER_DELIVERED: "🎁",
  ORDER_CANCELLED: "⚠",
  COUPON: "🎟",
  OFFER: "★",
  SYSTEM: "•",
};

export function NotificationsClient({ initial }: { initial: NotificationRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);

  const unread = items.filter((n) => !n.readAt).length;

  async function markAllRead() {
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", { method: "POST" });
      if (!res.ok) return;
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-field bg-field-bg px-6 py-14 text-center">
        <span aria-hidden="true" className="text-3xl">🔔</span>
        <h2 className="mt-3 font-display text-xl font-semibold text-ink">Nothing yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Order updates land here as your gift moves through the workshop.
        </p>
      </div>
    );
  }

  return (
    <div>
      {unread > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">{unread} unread</p>
          <button
            type="button"
            disabled={busy}
            onClick={markAllRead}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
          >
            {busy ? "Marking…" : "Mark all as read"}
          </button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => {
          const inner = (
            <>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm"
              >
                {ICON[item.type] ?? "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{item.title}</span>
                  {!item.readAt ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />
                  ) : null}
                </span>
                {item.body ? (
                  <span className="mt-0.5 block text-sm text-ink-soft">{item.body}</span>
                ) : null}
                <span className="mt-1 block text-xs text-muted">
                  {new Date(item.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
            </>
          );

          const className = `flex gap-3 rounded-card border p-3 transition ${
            item.readAt ? "border-line bg-paper" : "border-brand-200 bg-brand-50/40"
          }`;

          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className={`${className} hover:border-brand-300`}>
                  {inner}
                </Link>
              ) : (
                <div className={className}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

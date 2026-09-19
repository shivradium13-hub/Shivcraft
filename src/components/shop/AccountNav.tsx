"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { notifyCartChanged } from "./CartBadge";

type Section = { href: string; label: string; icon: string; exact?: boolean };

const SECTIONS: Section[] = [
  { href: "/account", label: "My Profile", icon: "👤", exact: true },
  { href: "/account/orders", label: "My Orders", icon: "📦" },
  { href: "/account/wishlist", label: "Wishlist", icon: "♡" },
  { href: "/account/addresses", label: "Saved Addresses", icon: "📍" },
  { href: "/account/coupons", label: "Coupons", icon: "🎟" },
  { href: "/account/reviews", label: "Reviews", icon: "★" },
  { href: "/account/notifications", label: "Notifications", icon: "🔔" },
  { href: "/support", label: "Help & Support", icon: "💬" },
];

export function AccountNav({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // The badge is per-visitor; clear it so the next person does not see a
    // count from the account that just left.
    notifyCartChanged();
    router.replace("/");
    router.refresh();
  }

  return (
    /* min-w-0: the list below scrolls sideways, and without this the grid item
       takes its full 1200px scroll width and drags the whole page with it. */
    <nav aria-label="Account sections" className="min-w-0 lg:sticky lg:top-[88px]">
      {/* Scrolls sideways on a phone rather than stacking into a tall column. */}
      <ul className="gc-hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
        {SECTIONS.map((section) => {
          const active = section.exact
            ? pathname === section.href
            : pathname.startsWith(section.href);

          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap transition ${
                  active
                    ? "bg-brand-50 font-semibold text-brand-800"
                    : "text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                <span aria-hidden="true">{section.icon}</span>
                {section.label}
                {section.href === "/account/notifications" && unread > 0 ? (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1.5 text-[11px] font-bold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}

        <li className="shrink-0 lg:mt-2 lg:border-t lg:border-line lg:pt-2">
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap text-danger transition hover:bg-danger-soft disabled:opacity-60"
          >
            <span aria-hidden="true">⎋</span>
            {signingOut ? "Signing out…" : "Logout"}
          </button>
        </li>
      </ul>
    </nav>
  );
}

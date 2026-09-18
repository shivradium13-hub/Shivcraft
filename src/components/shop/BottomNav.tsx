"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCategoryDrawer } from "./ShopShell";

const iconClass = "h-5 w-5";

const icons = {
  home: (
    <svg viewBox="0 0 22 22" className={iconClass} aria-hidden="true">
      <path
        d="M3.5 9.8L11 4l7.5 5.8V18a1 1 0 01-1 1h-4v-5h-5v5h-4a1 1 0 01-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 22 22" className={iconClass} aria-hidden="true">
      <path
        d="M4 4h6v6H4zM12 4h6v6h-6zM4 12h6v6H4zM12 12h6v6h-6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 22 22" className={iconClass} aria-hidden="true">
      <path
        d="M11 18.5l-1.1-1C5.5 13.6 3 11.3 3 8.4A4.1 4.1 0 017.1 4.3c1.4 0 2.8.7 3.9 2 1.1-1.3 2.5-2 3.9-2A4.1 4.1 0 0119 8.4c0 2.9-2.5 5.2-6.9 9.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  cart: (
    <svg viewBox="0 0 22 22" className={iconClass} aria-hidden="true">
      <path
        d="M3 4h2.2l1.6 9.2a1.6 1.6 0 001.6 1.3h7.3a1.6 1.6 0 001.6-1.2L19 7H6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="18" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="18" r="1.3" fill="currentColor" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 22 22" className={iconClass} aria-hidden="true">
      <circle cx="11" cy="7.5" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 18.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
};

/** Mobile bottom bar (section 23). "Categories" opens the drawer rather than
 *  navigating, so browsing never costs you your place on the page. */
export function BottomNav() {
  const pathname = usePathname();
  const { open } = useCategoryDrawer();

  const items = [
    { key: "home", href: "/", label: "Home", icon: icons.home, active: pathname === "/" },
    { key: "cats", label: "Categories", icon: icons.grid, action: open, active: false },
    {
      key: "wish",
      href: "/account/wishlist",
      label: "Wishlist",
      icon: icons.heart,
      active: pathname.startsWith("/account/wishlist"),
    },
    { key: "cart", href: "/cart", label: "Cart", icon: icons.cart, active: pathname === "/cart" },
    {
      key: "acct",
      href: "/account",
      label: "Account",
      icon: icons.user,
      active: pathname === "/account",
    },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper shadow-bar lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="flex">
        {items.map((item) => {
          const className = `flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
            item.active ? "text-brand-700" : "text-ink-soft"
          }`;
          return (
            <li key={item.key} className="flex-1">
              {item.href ? (
                <Link href={item.href} className={className} aria-current={item.active ? "page" : undefined}>
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <button type="button" onClick={item.action} className={className}>
                  {item.icon}
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

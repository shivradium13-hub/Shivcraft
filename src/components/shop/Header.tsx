"use client";

import Link from "next/link";

import { CartBadge } from "./CartBadge";
import { CategoryMenu } from "./CategoryMenu";
import { SearchBar } from "./SearchBar";

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="GiftCraft home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-base font-bold text-marigold-300">
        G
      </span>
      <span className="font-display text-xl leading-none font-semibold tracking-tight text-ink">
        Gift<span className="text-brand-700">Craft</span>
      </span>
    </Link>
  );
}

function IconLink({
  href,
  label,
  count,
  children,
}: {
  href: string;
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-ink transition hover:bg-brand-50 hover:text-brand-700"
    >
      <span className="relative">
        {children}
        {count && count > 0 ? (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span className="hidden text-[11px] font-medium lg:block">{label}</span>
    </Link>
  );
}

const HeartIcon = () => (
  <svg viewBox="0 0 22 22" className="h-5 w-5" aria-hidden="true">
    <path
      d="M11 18.5l-1.1-1C5.5 13.6 3 11.3 3 8.4A4.1 4.1 0 017.1 4.3c1.4 0 2.8.7 3.9 2 1.1-1.3 2.5-2 3.9-2A4.1 4.1 0 0119 8.4c0 2.9-2.5 5.2-6.9 9.1z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const CartIcon = () => (
  <svg viewBox="0 0 22 22" className="h-5 w-5" aria-hidden="true">
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
);

const UserIcon = () => (
  <svg viewBox="0 0 22 22" className="h-5 w-5" aria-hidden="true">
    <circle cx="11" cy="7.5" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M4.5 18.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="mx-auto w-full max-w-[1400px] px-4">
        <div className="flex h-16 items-center gap-3">
          {/* Categories live behind the three-dot menu, at every width. */}
          <CategoryMenu />

          <Logo />

          <div className="hidden min-w-0 flex-1 md:block">
            <SearchBar />
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <span className="mr-1 hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-soft xl:flex">
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-brand-600" aria-hidden="true">
                <path
                  d="M10 2.5c-3 0-5.4 2.4-5.4 5.4 0 4 5.4 9.6 5.4 9.6s5.4-5.6 5.4-9.6c0-3-2.4-5.4-5.4-5.4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="10" cy="7.9" r="1.9" fill="currentColor" />
              </svg>
              <span>
                Deliver to <strong className="font-semibold text-ink">India</strong>
              </span>
            </span>

            <IconLink href="/account/wishlist" label="Wishlist">
              <HeartIcon />
            </IconLink>
            <IconLink href="/cart" label="Cart">
              <CartIcon />
              <CartBadge />
            </IconLink>
            <IconLink href="/account" label="Account">
              <UserIcon />
            </IconLink>
          </div>
        </div>

        <div className="pb-3 md:hidden">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}

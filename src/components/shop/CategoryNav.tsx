"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { CategoryNode } from "@/server/catalog/categories";

/**
 * The desktop category navigation: a centred row of top-level categories with a
 * wide, multi-column mega-menu that opens beneath the header.
 *
 * Data-driven from the real category tree (no hardcoded categories). A category
 * with children opens a mega-menu grouped by its children; a leaf category is a
 * plain link. Mobile keeps the existing bottom-nav drawer, so this whole bar is
 * desktop-only.
 */
export function CategoryNav({ categories }: { categories: CategoryNode[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  // Close the menu whenever the route changes (adjust-state-during-render, the
  // React-blessed pattern — no effect, no cascading render).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (open !== null) setOpen(null);
  }

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openNow(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(id);
  }
  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 120);
  }

  if (categories.length === 0) return null;

  const active = open ? categories.find((c) => c.id === open) ?? null : null;

  return (
    <nav
      aria-label="Categories"
      className="relative hidden border-t border-line md:block"
      onMouseLeave={closeSoon}
    >
      <div className="gc-hide-scrollbar mx-auto flex w-full max-w-[1400px] items-center justify-start gap-1 overflow-x-auto px-4 xl:justify-center">
        <NavItem href="/" label="Home" active={pathname === "/"} onEnter={() => openNow("__home")} />
        {categories.map((cat) => {
          const isActive = pathname === `/category/${cat.slug}` || open === cat.id;
          const hasMenu = cat.children.length > 0;
          return (
            <NavItem
              key={cat.id}
              href={`/category/${cat.slug}`}
              label={cat.name}
              active={isActive}
              hasMenu={hasMenu}
              onEnter={() => (hasMenu ? openNow(cat.id) : openNow("__leaf"))}
            />
          );
        })}
      </div>

      {/* Mega-menu panel */}
      {active && active.children.length > 0 ? (
        <div
          className="absolute inset-x-0 top-full z-50"
          onMouseEnter={() => openNow(active.id)}
          onMouseLeave={closeSoon}
        >
          <div className="mx-auto w-full max-w-[1400px] px-4">
            <div className="gc-mega mt-0 overflow-hidden rounded-b-card border border-line border-t-0 bg-paper shadow-lift">
              <div className="grid grid-cols-2 gap-x-8 gap-y-6 p-6 lg:grid-cols-4">
                {active.children.map((child) => (
                  <div key={child.id} className="min-w-0">
                    <Link
                      href={`/category/${child.slug}`}
                      className="block truncate text-sm font-semibold text-ink transition hover:text-brand-700"
                    >
                      {child.name}
                    </Link>
                    {child.children.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {child.children.map((g) => (
                          <li key={g.id}>
                            <Link
                              href={`/category/${g.slug}`}
                              className="block truncate text-[13px] text-muted transition hover:text-brand-700"
                            >
                              {g.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="border-t border-line bg-canvas px-6 py-3">
                <Link
                  href={`/category/${active.slug}`}
                  className="text-[13px] font-semibold text-brand-700 hover:underline"
                >
                  View all {active.name} →
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function NavItem({
  href,
  label,
  active,
  hasMenu,
  onEnter,
}: {
  href: string;
  label: string;
  active?: boolean;
  hasMenu?: boolean;
  onEnter?: () => void;
}) {
  return (
    <Link
      href={href}
      onMouseEnter={onEnter}
      onFocus={onEnter}
      aria-haspopup={hasMenu ? "true" : undefined}
      className={`relative whitespace-nowrap rounded-md px-3 py-3 text-[13.5px] font-medium transition ${
        active ? "text-brand-700" : "text-ink-soft hover:text-brand-700"
      }`}
    >
      {label}
      <span
        aria-hidden="true"
        className={`absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-brand-600 transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
    </Link>
  );
}

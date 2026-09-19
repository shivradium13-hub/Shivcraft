"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useCategoryDrawer } from "./ShopShell";

/**
 * The header's three-dot menu: the whole category tree in one dropdown.
 *
 * Categories come from the shell's context, which the layout already loaded —
 * opening this costs no request. Top-level rows are links in their own right;
 * the chevron beside them expands the subcategories in place rather than
 * navigating, so one tap never takes you somewhere you did not choose.
 */
export function CategoryMenu() {
  const { categories } = useCategoryDrawer();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on navigation, so the menu never hangs over the page you just opened.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Browse categories"
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
          open ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-brand-50"
        }`}
      >
        {/* Three dots */}
        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
          <circle cx="10" cy="4" r="1.6" fill="currentColor" />
          <circle cx="10" cy="10" r="1.6" fill="currentColor" />
          <circle cx="10" cy="16" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Categories"
          className="absolute top-full left-0 z-50 mt-2 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-paper shadow-lift"
        >
          <p className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Categories
          </p>

          <nav className="max-h-[min(28rem,70dvh)] overflow-y-auto overscroll-contain p-1.5">
            <Link
              href="/categories"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink hover:bg-brand-50"
            >
              <span aria-hidden="true">🎁</span> All Gifts
            </Link>

            {categories.map((category) => {
              const isExpanded = expanded === category.id;
              return (
                <div key={category.id}>
                  <div className="flex items-stretch">
                    <Link
                      href={`/category/${category.slug}`}
                      role="menuitem"
                      className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink hover:bg-brand-50"
                    >
                      {category.icon ? <span aria-hidden="true">{category.icon}</span> : null}
                      <span className="truncate">{category.name}</span>
                    </Link>

                    {category.children.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : category.id)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${category.name}`}
                        className="flex w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-brand-50 hover:text-brand-600"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        >
                          <path
                            d="M5 8l5 5 5-5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            fill="none"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <ul className="mb-1 ml-4 border-l border-line pl-2">
                      {category.children.map((sub) => (
                        <li key={sub.id}>
                          <Link
                            href={`/category/${sub.slug}`}
                            role="menuitem"
                            className="block rounded-lg px-2.5 py-1.5 text-[13px] text-ink-soft hover:bg-brand-50 hover:text-brand-600"
                          >
                            {sub.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}

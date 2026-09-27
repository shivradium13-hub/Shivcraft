"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import type { CategoryNode } from "@/server/catalog/categories";

import { WishlistProvider } from "./WishlistButton";

/* The category drawer is opened from two places — the header hamburger and the
   mobile bottom bar — so its state lives in one small context above both. */
const DrawerContext = createContext<{ open: () => void; categories: CategoryNode[] }>({
  open: () => {},
  categories: [],
});
export const useCategoryDrawer = () => useContext(DrawerContext);

export function ShopShell({
  categories,
  children,
}: {
  categories: CategoryNode[];
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Navigating away should not leave the drawer hanging open behind the page.
  // Close it as the route changes using the adjust-state-during-render pattern
  // (the React-blessed alternative to a setState-in-effect).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (isOpen) setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, close]);

  return (
    <DrawerContext.Provider value={{ open, categories }}>
      <WishlistProvider>
        {children}
        <CategoryDrawer categories={categories} isOpen={isOpen} onClose={close} />
      </WishlistProvider>
    </DrawerContext.Provider>
  );
}

function CategoryDrawer({
  categories,
  isOpen,
  onClose,
}: {
  categories: CategoryNode[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // Which category (or subcategory) is being viewed, so the drawer can mark it
  // and open its branch — matching the active state the desktop nav already has.
  const activeSlug = pathname.startsWith("/category/")
    ? pathname.slice("/category/".length)
    : null;
  const allGiftsActive = pathname === "/search";
  const activeParentId = activeSlug
    ? categories.find(
        (c) => c.slug === activeSlug || c.children.some((s) => s.slug === activeSlug),
      )?.id ?? null
    : null;

  // Auto-expand the active branch. Re-sync when the route changes (navigation
  // closes the drawer, so this simply prepares the branch for the next open)
  // using the adjust-state-during-render pattern — no effect, no extra render.
  const [expanded, setExpanded] = useState<string | null>(activeParentId);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setExpanded(activeParentId);
  }

  return (
    <div
      className={`fixed inset-0 z-[60] lg:hidden ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ink/50 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Browse categories"
        className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-paper shadow-lift transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <span className="font-display text-lg font-semibold text-ink">Categories</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close categories"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-brand-50 hover:text-brand-700"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          <Link
            href="/search"
            aria-current={allGiftsActive ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-brand-50 ${
              allGiftsActive ? "bg-brand-50 text-brand-700" : "text-ink"
            }`}
          >
            <span aria-hidden="true">🎁</span> All Gifts
          </Link>

          {categories.map((cat) => {
            const isExpanded = expanded === cat.id;
            const isCatActive = activeSlug === cat.slug;
            return (
              <div key={cat.id} className="mt-0.5">
                <div className="flex items-stretch">
                  <Link
                    href={`/category/${cat.slug}`}
                    aria-current={isCatActive ? "page" : undefined}
                    className={`flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-brand-50 ${
                      isCatActive ? "bg-brand-50 text-brand-700" : "text-ink"
                    }`}
                  >
                    {cat.icon ? <span aria-hidden="true">{cat.icon}</span> : null}
                    {cat.name}
                  </Link>
                  {cat.children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : cat.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${cat.name}`}
                      className="flex w-10 items-center justify-center rounded-lg text-muted hover:bg-brand-50"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      >
                        <path
                          d="M5 8l5 5 5-5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          fill="none"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                </div>

                {isExpanded ? (
                  <ul className="mt-0.5 mb-1 ml-5 border-l border-line pl-2">
                    {cat.children.map((sub) => {
                      const isSubActive = activeSlug === sub.slug;
                      return (
                        <li key={sub.id}>
                          <Link
                            href={`/category/${sub.slug}`}
                            aria-current={isSubActive ? "page" : undefined}
                            className={`block rounded-lg px-3 py-2 text-sm hover:bg-brand-50 hover:text-brand-700 ${
                              isSubActive ? "bg-brand-50 font-medium text-brand-700" : "text-ink-soft"
                            }`}
                          >
                            {sub.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

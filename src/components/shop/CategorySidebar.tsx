"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useState } from "react";

import type { CategoryNode } from "@/server/catalog/categories";

/**
 * The desktop left-hand category rail (section 5): sticky, independently
 * scrollable, with collapsible subcategory lists. The branch containing the
 * category you are viewing opens itself, so you always see where you are.
 */
export function CategorySidebar({ categories }: { categories: CategoryNode[] }) {
  const segments = useSelectedLayoutSegments();
  const activeSlug = segments[0] === "category" ? segments[1] : undefined;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeSlug) return;
    const owner = categories.find(
      (c) => c.slug === activeSlug || c.children.some((s) => s.slug === activeSlug),
    );
    if (owner) setExpanded((prev) => new Set(prev).add(owner.id));
  }, [activeSlug, categories]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-[76px] max-h-[calc(100dvh-96px)] overflow-y-auto overscroll-contain rounded-card border border-line bg-paper py-2">
        <p className="px-4 py-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
          Categories
        </p>

        <Link
          href="/search"
          className={`mx-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
            !activeSlug ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-brand-50"
          }`}
        >
          <span aria-hidden="true">🎁</span> All Gifts
        </Link>

        <nav className="mt-1">
          {categories.map((cat) => {
            const isExpanded = expanded.has(cat.id);
            const isActiveTop = cat.slug === activeSlug;
            return (
              <div key={cat.id}>
                <div className="mx-2 flex items-stretch">
                  <Link
                    href={`/category/${cat.slug}`}
                    className={`flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                      isActiveTop ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-brand-50"
                    }`}
                  >
                    {cat.icon ? <span aria-hidden="true">{cat.icon}</span> : null}
                    <span className="truncate">{cat.name}</span>
                  </Link>
                  {cat.children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggle(cat.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${cat.name}`}
                      className="flex w-8 items-center justify-center rounded-lg text-muted transition hover:bg-brand-50 hover:text-brand-600"
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
                  <ul className="mx-2 my-1 ml-5 border-l border-line pl-2">
                    {cat.children.map((sub) => (
                      <li key={sub.id}>
                        <Link
                          href={`/category/${sub.slug}`}
                          className={`block rounded-lg px-2.5 py-1.5 text-[13px] transition ${
                            sub.slug === activeSlug
                              ? "bg-brand-50 font-medium text-brand-800"
                              : "text-ink-soft hover:bg-brand-50 hover:text-brand-600"
                          }`}
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
    </aside>
  );
}

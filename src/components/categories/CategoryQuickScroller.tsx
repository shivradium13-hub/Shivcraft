"use client";

import { useEffect, useRef } from "react";

import type { Category } from "@/types/category";

/**
 * Horizontal quick strip of parent categories (spec 13 and 28).
 *
 * It NEVER moves on its own. The only programmatic scroll is bringing the
 * active chip into view after the selection changes somewhere else, and even
 * that is skipped while the user is touching the strip.
 */
export function CategoryQuickScroller({
  categories,
  selectedId,
  onSelect,
  allGiftsActive,
  onSelectAllGifts,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (category: Category) => void;
  allGiftsActive: boolean;
  onSelectAllGifts: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const userIsTouching = useRef(false);

  useEffect(() => {
    if (userIsTouching.current) return;
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [selectedId, allGiftsActive]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sr-500 ${
      active
        ? "border-sr-500 bg-sr-500 text-white"
        : "border-sr-line-strong bg-sr-surface text-sr-body hover:border-sr-300"
    }`;

  return (
    <div
      ref={stripRef}
      onTouchStart={() => {
        userIsTouching.current = true;
      }}
      onTouchEnd={() => {
        userIsTouching.current = false;
      }}
      /* pr-8 leaves the next chip partly visible, which is what tells people
         the strip scrolls. */
      className="gc-hide-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain py-2 pr-8"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <button
        type="button"
        ref={allGiftsActive ? activeRef : undefined}
        onClick={onSelectAllGifts}
        aria-current={allGiftsActive ? "true" : undefined}
        className={chip(allGiftsActive)}
      >
        All Gifts
      </button>

      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          ref={category.id === selectedId ? activeRef : undefined}
          onClick={() => onSelect(category)}
          aria-current={category.id === selectedId ? "true" : undefined}
          className={chip(category.id === selectedId)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}

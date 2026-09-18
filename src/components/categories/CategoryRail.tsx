"use client";

import { useEffect, useRef } from "react";

import { type Category } from "@/types/category";

import { CategoryRailItem } from "./CategoryRailItem";

/**
 * The vertical parent-category rail (spec 5 and 6).
 *
 * Scrolls independently, keeps the active row in view when the selection
 * changes from elsewhere (a direct URL, or the quick strip), and hides the
 * native scrollbar on touch.
 */
export function CategoryRail({
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
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = activeRef.current;
    const list = listRef.current;
    if (!target || !list) return;

    const targetBox = target.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    const hidden = targetBox.top < listBox.top || targetBox.bottom > listBox.bottom;

    if (hidden) {
      target.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
  }, [selectedId, allGiftsActive]);

  return (
    <nav
      aria-label="Product categories"
      className="w-[24%] max-w-[190px] min-w-[86px] shrink-0 border-r border-sr-line bg-sr-canvas lg:w-[210px] lg:max-w-none"
    >
      <div
        ref={listRef}
        className="gc-hide-scrollbar sticky top-[64px] max-h-[calc(100dvh-64px)] overflow-y-auto overscroll-contain py-1 lg:top-[88px] lg:max-h-[calc(100dvh-108px)]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div ref={allGiftsActive ? activeRef : undefined}>
          <CategoryRailItem
            name="All Gifts"
            icon="⭐"
            isActive={allGiftsActive}
            onSelect={onSelectAllGifts}
          />
        </div>

        {categories.map((category) => (
          <div key={category.id} ref={category.id === selectedId ? activeRef : undefined}>
            <CategoryRailItem
              name={category.name}
              icon={category.icon}
              image={category.image}
              productCount={category.productCount}
              isActive={category.id === selectedId}
              onSelect={() => onSelect(category)}
            />
          </div>
        ))}
      </div>
    </nav>
  );
}

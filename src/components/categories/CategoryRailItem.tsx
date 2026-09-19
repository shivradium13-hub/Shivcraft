"use client";

import Image from "next/image";
import { memo } from "react";

export const CategoryRailItem = memo(function CategoryRailItem({
  name,
  icon,
  image,
  productCount,
  isActive,
  onSelect,
}: {
  name: string;
  icon?: string | null;
  image?: string | null;
  productCount?: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Show ${name} subcategories`}
      className={`relative flex w-full flex-col items-center gap-1.5 px-2 py-3 text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sr-500 ${
        isActive ? "bg-sr-50" : "bg-transparent hover:bg-sr-canvas"
      }`}
    >
      {/* The left indicator line marks the active row without a heavy border. */}
      <span
        aria-hidden="true"
        className={`absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full transition-opacity duration-150 ${
          isActive ? "bg-sr-600 opacity-100" : "opacity-0"
        }`}
      />

      <span
        className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-lg transition ${
          isActive ? "ring-2 ring-sr-400 ring-offset-1 ring-offset-sr-50" : "ring-1 ring-sr-line"
        }`}
      >
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            loading="lazy"
            sizes="44px"
            unoptimized={image.endsWith(".svg")}
            className="object-cover"
          />
        ) : (
          <span aria-hidden="true">{icon ?? "🎁"}</span>
        )}
      </span>

      <span
        className={`text-[11px] leading-tight ${
          isActive ? "font-semibold text-sr-600" : "font-medium text-sr-body"
        }`}
      >
        {name}
      </span>

      {productCount ? (
        <span className="text-[10px] text-sr-muted tabular-nums">{productCount}</span>
      ) : null}
    </button>
  );
});

"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Badge, ProductImage } from "../ui/primitives";

/**
 * The image area of a product card. A single image behaves exactly as before (a
 * plain link to the product). With several images it previews the others without
 * leaving the page:
 *   - Desktop (mouse): hovering swaps to the next image and leaving restores the
 *     first; clicking still opens the product.
 *   - Touch: tapping cycles to the next image (wrapping back to the first), and
 *     a horizontal swipe moves between images. Vertical scrolling is unaffected,
 *     and the product title/other controls remain the way to open the product.
 * Dots show the position when there is more than one image. Fades honour
 * prefers-reduced-motion. Images load on demand (current + neighbours).
 */
export function ProductCardMedia({
  images,
  name,
  slug,
  priority = false,
  bestSeller = false,
  personalizable = false,
  outOfStock = false,
  hoverEnabled = true,
  touchEnabled = true,
  sizes,
}: {
  images: string[];
  name: string;
  slug: string;
  priority?: boolean;
  bestSeller?: boolean;
  personalizable?: boolean;
  outOfStock?: boolean;
  /** Admin switches: preview other images on hover (desktop) / on tap+swipe (mobile). */
  hoverEnabled?: boolean;
  touchEnabled?: boolean;
  sizes: string;
}) {
  const n = images.length;
  const interactive = n > 1 && (hoverEnabled || touchEnabled);
  const [index, setIndex] = useState(0);

  const start = useRef<{ x: number; y: number } | null>(null);
  const isTouch = useRef(false);
  const suppressClick = useRef(false);

  // Only mount the current image and its neighbours (plus the primary), so a
  // card never eagerly loads all of its images. Revisits hit the browser cache.
  const mounted = new Set<number>([0]);
  if (n > 1) {
    mounted.add(index);
    mounted.add((index + 1) % n);
    mounted.add((index - 1 + n) % n);
  }

  const overlays = (
    <>
      <span className="pointer-events-none absolute top-2 left-2 z-10 flex flex-col items-start gap-1">
        {bestSeller ? <Badge tone="marigold">Best Seller</Badge> : null}
        {personalizable ? <Badge tone="brand">Personalise</Badge> : null}
      </span>
      {outOfStock ? (
        <span className="absolute inset-0 z-10 flex items-center justify-center bg-ink/55">
          <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink">Out of stock</span>
        </span>
      ) : null}
    </>
  );

  // One image, or both previews switched off: plain link, no gestures/dots.
  if (!interactive) {
    return (
      <Link href={`/product/${slug}`} className="relative block aspect-[4/5] overflow-hidden bg-brand-50">
        <ProductImage
          src={images[0] ?? null}
          alt={name}
          sizes={sizes}
          priority={priority}
          className="transition duration-300 group-hover:scale-[1.04]"
        />
        {overlays}
      </Link>
    );
  }

  const hoverCapable = () =>
    typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const go = (next: number) => setIndex(((next % n) + n) % n);

  return (
    <Link
      href={`/product/${slug}`}
      aria-label={name}
      className="relative block aspect-[4/5] touch-pan-y overflow-hidden bg-brand-50"
      onMouseEnter={() => {
        if (hoverEnabled && hoverCapable()) setIndex(1);
      }}
      onMouseLeave={() => {
        if (hoverEnabled && hoverCapable()) setIndex(0);
      }}
      onPointerDown={(e) => {
        isTouch.current = e.pointerType !== "mouse";
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!touchEnabled || !start.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        start.current = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          suppressClick.current = true;
          go(dx < 0 ? index + 1 : index - 1);
          window.setTimeout(() => {
            suppressClick.current = false;
          }, 60);
        }
      }}
      onClick={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          return;
        }
        // On touch, a tap cycles images instead of opening the product (the
        // title and other controls still open it). When touch preview is off,
        // the tap opens the product as normal.
        if (touchEnabled && isTouch.current) {
          e.preventDefault();
          go(index + 1);
        }
      }}
    >
      {images.map((src, i) =>
        mounted.has(i) ? (
          <span
            key={i}
            className="absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none"
            style={{ opacity: i === index ? 1 : 0 }}
            aria-hidden={i === index ? undefined : true}
          >
            <ProductImage
              src={src}
              alt={i === 0 ? name : ""}
              sizes={sizes}
              priority={priority && i === 0}
              className="group-hover:scale-[1.04]"
            />
          </span>
        ) : null,
      )}

      {overlays}

      {/* Position dots */}
      <span className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIndex(i);
            }}
            className={`pointer-events-auto h-1.5 cursor-pointer rounded-full bg-white shadow-sm transition-all ${
              i === index ? "w-4 opacity-100" : "w-1.5 opacity-70"
            }`}
          />
        ))}
      </span>
    </Link>
  );
}

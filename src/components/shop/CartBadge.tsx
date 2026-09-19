"use client";

import { useEffect, useState } from "react";

/** Fire this after anything changes the cart so the header badge catches up
 *  without polling. */
export const CART_CHANGED = "cart:changed";

export function notifyCartChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_CHANGED));
}

/**
 * The count next to the cart icon. It refreshes on mount, whenever the tab
 * regains focus (another tab may have changed the cart), and on CART_CHANGED.
 */
export function CartBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/cart/items", { signal: controller.signal });
        if (!res.ok) return;
        const json = await res.json();
        if (live) setCount(json?.data?.count ?? 0);
      } catch {
        /* offline or aborted — leave the last known count rather than flashing 0 */
      }
    }

    void load();
    window.addEventListener(CART_CHANGED, load);
    window.addEventListener("focus", load);

    return () => {
      live = false;
      controller.abort();
      window.removeEventListener(CART_CHANGED, load);
      window.removeEventListener("focus", load);
    };
  }, []);

  if (!count) return null;

  return (
    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

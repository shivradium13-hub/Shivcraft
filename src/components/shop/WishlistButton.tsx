"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type WishlistState = {
  /** null until we know, then the set of saved product ids. */
  saved: Set<string> | null;
  signedIn: boolean;
  toggle: (productId: string) => Promise<void>;
};

const WishlistContext = createContext<WishlistState>({
  saved: null,
  signedIn: false,
  toggle: async () => {},
});

/**
 * Loads the viewer's saved product ids ONCE per page load and shares them, so a
 * grid of forty cards costs one request rather than forty.
 *
 * A signed-out visitor gets 401 here, which is not an error — the hearts simply
 * send them to sign in when tapped.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Set<string> | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    fetch("/api/wishlist", { signal: controller.signal })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 401) {
          setSignedIn(false);
          setSaved(new Set());
          return;
        }
        if (!res.ok) return;
        const json = await res.json();
        setSignedIn(true);
        setSaved(new Set<string>(json.data.items.map((i: { productId: string }) => i.productId)));
      })
      .catch(() => {
        /* offline — hearts stay in their unknown state rather than lying */
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, []);

  const toggle = useCallback(async (productId: string) => {
    // Optimistic: the heart flips at once, and reverts if the server disagrees.
    setSaved((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error("rejected");

      const json = await res.json();
      setSaved((prev) => {
        if (!prev) return prev;
        const next = new Set(prev);
        if (json.data.saved) next.add(productId);
        else next.delete(productId);
        return next;
      });
    } catch {
      setSaved((prev) => {
        if (!prev) return prev;
        const next = new Set(prev);
        if (next.has(productId)) next.delete(productId);
        else next.add(productId);
        return next;
      });
    }
  }, []);

  return (
    <WishlistContext.Provider value={{ saved, signedIn, toggle }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function WishlistButton({ productId, name }: { productId: string; name: string }) {
  const { saved, signedIn, toggle } = useContext(WishlistContext);
  const router = useRouter();
  const pathname = usePathname();

  const isSaved = saved?.has(productId) ?? false;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!signedIn) {
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        void toggle(productId);
      }}
      aria-pressed={isSaved}
      aria-label={isSaved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-paper/90 shadow-card backdrop-blur transition hover:bg-paper"
    >
      <svg
        viewBox="0 0 22 22"
        className={`h-4.5 w-4.5 transition ${isSaved ? "text-danger" : "text-ink-soft"}`}
        style={{ width: 18, height: 18 }}
        aria-hidden="true"
      >
        <path
          d="M11 18.5l-1.1-1C5.5 13.6 3 11.3 3 8.4A4.1 4.1 0 017.1 4.3c1.4 0 2.8.7 3.9 2 1.1-1.3 2.5-2 3.9-2A4.1 4.1 0 0119 8.4c0 2.9-2.5 5.2-6.9 9.1z"
          fill={isSaved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Admin-set promo "poster" banners on the product page, shown just above the
 * options. One banner sits still; several auto-rotate with a 3D flip (the strip
 * turns edge-on, swaps to the next banner, and flips back, so the image is never
 * shown mirrored). Each banner is its own clickable image with its own link.
 *
 * Links are already sanitised by the caller to an on-site path or a plain
 * http(s) URL (null = unlinked). External links open in a new tab. The glass
 * sheen overlay lives on the static wrapper, above the flipping image.
 */
export type PromoBanner = { url: string; href: string | null; external: boolean; label: string };

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

function BannerInner({ banner }: { banner: PromoBanner }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={banner.url} alt={banner.href ? "" : banner.label} className="sr-banner-face block w-full object-cover" />
  );
  if (!banner.href) return img;
  return banner.external ? (
    <a href={banner.href} target="_blank" rel="noopener noreferrer" aria-label={banner.label} className="block">
      {img}
    </a>
  ) : (
    <Link href={banner.href} aria-label={banner.label} className="block">
      {img}
    </Link>
  );
}

export function ProductPromoBanner({
  banners,
  showDesktop,
  showMobile,
}: {
  banners: PromoBanner[];
  /** Device widths the admin chose to show the banners on (md = 768px split). */
  showDesktop: boolean;
  showMobile: boolean;
}) {
  const n = banners.length;
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [deg, setDeg] = useState(0);
  const [withTransition, setWithTransition] = useState(true);

  useEffect(() => {
    if (n <= 1) return;
    // Reduced motion: swap without the 3D flip.
    if (reduced) {
      const t = setInterval(() => setIndex((i) => (i + 1) % n), 4500);
      return () => clearInterval(t);
    }
    let swap: ReturnType<typeof setTimeout>;
    let back: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      // Flip out to edge-on (invisible), then swap at the edge and flip back in.
      setWithTransition(true);
      setDeg(90);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % n);
        setWithTransition(false);
        setDeg(-90);
        back = setTimeout(() => {
          setWithTransition(true);
          setDeg(0);
        }, 30);
      }, 320);
    }, 4500);
    return () => {
      clearInterval(cycle);
      clearTimeout(swap);
      clearTimeout(back);
    };
  }, [n, reduced]);

  if (n === 0 || (!showDesktop && !showMobile)) return null;

  // Hide on the device size that was switched off (see globals.css media queries).
  const visibility =
    showDesktop && showMobile ? "" : showDesktop ? "sr-banner-desktop-only" : "sr-banner-mobile-only";

  const banner = banners[index % n];

  return (
    <div className={`sr-banner-wrap mt-5 overflow-hidden ${visibility}`}>
      <div
        className="sr-banner-flip block"
        style={{
          transform: `rotateY(${deg}deg)`,
          transition: withTransition ? "transform 320ms ease" : "none",
        }}
      >
        <BannerInner banner={banner} />
      </div>
    </div>
  );
}

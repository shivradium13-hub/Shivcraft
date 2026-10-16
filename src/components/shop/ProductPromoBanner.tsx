"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Admin-set promo "poster" banners on the product page, shown just above the
 * options. One banner sits still; several auto-rotate every few seconds using
 * the admin-chosen transition: a 3D flip, a cross-fade, a sideways slide, or a
 * slide-up. Each banner is its own clickable image with its own link.
 *
 * Links are already sanitised by the caller to an on-site path or a plain
 * http(s) URL (null = unlinked). External links open in a new tab. The glass
 * sheen overlay lives on the static wrapper, above the moving banners.
 */
export type PromoBanner = { url: string; href: string | null; external: boolean; label: string };
export type BannerTransition = "flip" | "fade" | "slide" | "slide-up";

const INTERVAL = 4500;

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

function BannerFace({ banner }: { banner: PromoBanner }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={banner.url} alt={banner.href ? "" : banner.label} className="sr-banner-face" />
  );
  const cls = "block h-full w-full";
  if (!banner.href) return <div className={cls}>{img}</div>;
  return banner.external ? (
    <a href={banner.href} target="_blank" rel="noopener noreferrer" aria-label={banner.label} className={cls}>
      {img}
    </a>
  ) : (
    <Link href={banner.href} aria-label={banner.label} className={cls}>
      {img}
    </Link>
  );
}

export function ProductPromoBanner({
  banners,
  transition = "flip",
  showDesktop,
  showMobile,
}: {
  banners: PromoBanner[];
  transition?: BannerTransition;
  /** Device widths the admin chose to show the banners on (md = 768px split). */
  showDesktop: boolean;
  showMobile: boolean;
}) {
  const n = banners.length;
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  // Flip needs its own fine-grained state (rotate out, swap at the edge, rotate in).
  const [deg, setDeg] = useState(0);
  const [flipTransition, setFlipTransition] = useState(true);

  useEffect(() => {
    if (n <= 1) return;

    if (transition === "flip" && !reduced) {
      let swap: ReturnType<typeof setTimeout>;
      let back: ReturnType<typeof setTimeout>;
      const cycle = setInterval(() => {
        setFlipTransition(true);
        setDeg(90);
        swap = setTimeout(() => {
          setIndex((i) => (i + 1) % n);
          setFlipTransition(false);
          setDeg(-90);
          back = setTimeout(() => {
            setFlipTransition(true);
            setDeg(0);
          }, 30);
        }, 320);
      }, INTERVAL);
      return () => {
        clearInterval(cycle);
        clearTimeout(swap);
        clearTimeout(back);
      };
    }

    // fade / slide / slide-up (and any pattern under reduced motion): just advance.
    const cycle = setInterval(() => setIndex((i) => (i + 1) % n), INTERVAL);
    return () => clearInterval(cycle);
  }, [n, transition, reduced]);

  if (n === 0 || (!showDesktop && !showMobile)) return null;

  // Hide on the device size that was switched off (see globals.css media queries).
  const visibility =
    showDesktop && showMobile ? "" : showDesktop ? "sr-banner-desktop-only" : "sr-banner-mobile-only";
  const wrapClass = `sr-banner-wrap mt-5 overflow-hidden ${visibility}`;

  // Single banner, or reduced-motion with instant swap: just show the current one.
  if (n === 1) {
    return (
      <div className={wrapClass}>
        <div className="sr-banner-flip h-full w-full">
          <BannerFace banner={banners[0]} />
        </div>
      </div>
    );
  }

  if (transition === "flip") {
    return (
      <div className={wrapClass}>
        <div
          className="sr-banner-flip h-full w-full"
          style={{
            transform: `rotateY(${deg}deg)`,
            transition: flipTransition && !reduced ? "transform 320ms ease" : "none",
          }}
        >
          <BannerFace banner={banners[index % n]} />
        </div>
      </div>
    );
  }

  if (transition === "fade") {
    return (
      <div className={wrapClass}>
        {banners.map((b, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: i === index ? 1 : 0, transition: reduced ? "none" : undefined }}
            aria-hidden={i === index ? undefined : true}
          >
            <BannerFace banner={b} />
          </div>
        ))}
      </div>
    );
  }

  // slide (sideways) / slide-up (vertical): a track of all banners, translated.
  const vertical = transition === "slide-up";
  const offset = `${-index * 100}%`;
  return (
    <div className={wrapClass}>
      <div
        className={`flex h-full w-full ${vertical ? "flex-col" : ""}`}
        style={{
          transform: vertical ? `translateY(${offset})` : `translateX(${offset})`,
          transition: reduced ? "none" : "transform 500ms ease",
        }}
      >
        {banners.map((b, i) => (
          <div key={i} className="h-full w-full shrink-0" aria-hidden={i === index ? undefined : true}>
            <BannerFace banner={b} />
          </div>
        ))}
      </div>
    </div>
  );
}

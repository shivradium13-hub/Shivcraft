import Link from "next/link";

/**
 * An optional admin-set promotional "poster" banner on the product page, shown
 * just above the options — e.g. "Also available as an Acrylic print — Explore
 * now". The whole image is the button. It does a 3D flip on hover (see the
 * `.sr-banner-*` rules in globals.css); the front and back faces are the same
 * image, so it always reads upright.
 *
 * `href` is already sanitised by the caller to an on-site path or a plain
 * http(s) URL (null = show the image unlinked), so no javascript: link can slip
 * through here. External links open in a new tab.
 */
export function ProductPromoBanner({
  url,
  href,
  external,
  label,
  showDesktop,
  showMobile,
}: {
  url: string;
  href: string | null;
  external: boolean;
  label: string;
  /** Device widths the admin chose to show the banner on (md = 768px split). */
  showDesktop: boolean;
  showMobile: boolean;
}) {
  // Off everywhere → render nothing at all.
  if (!showDesktop && !showMobile) return null;
  // Responsive visibility: hide on the device size that was switched off.
  const visibility =
    showDesktop && showMobile ? "" : showDesktop ? "hidden md:block" : "block md:hidden";

  const faces = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={href ? "" : label} className="sr-banner-face block w-full object-cover" />
      {/* Back face: same image, hidden from assistive tech (it is purely the flip). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" aria-hidden="true" className="sr-banner-face sr-banner-back absolute inset-0 h-full w-full object-cover" />
    </>
  );

  const inner = href ? (
    external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="sr-banner-flip block">
        {faces}
      </a>
    ) : (
      <Link href={href} aria-label={label} className="sr-banner-flip block">
        {faces}
      </Link>
    )
  ) : (
    <div className="sr-banner-flip block">{faces}</div>
  );

  return (
    <div
      className={`sr-banner-wrap mt-5 overflow-hidden rounded-card border border-line transition hover:shadow-card ${visibility}`}
    >
      {inner}
    </div>
  );
}

import Image from "next/image";
import type { ReactNode } from "react";

/** Local placeholder artwork is SVG, which the optimiser will not process —
 *  pass it straight through. Uploaded photographs still get optimised. */
export function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-brand-50 text-xs text-muted">
        No image
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={src.endsWith(".svg")}
      className={`object-cover ${className}`}
    />
  );
}

export function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`Rated ${rating} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rounded >= i ? "full" : rounded >= i - 0.5 ? "half" : "empty";
        return (
          <svg key={i} viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
            <defs>
              <linearGradient id={`half-${i}`}>
                <stop offset="50%" stopColor="var(--color-brand-500)" />
                <stop offset="50%" stopColor="var(--color-line-strong)" />
              </linearGradient>
            </defs>
            <path
              d="M10 1.6l2.47 5.005 5.525.803-3.998 3.896.944 5.502L10 14.21l-4.94 2.596.943-5.502L2.005 7.408l5.524-.803z"
              fill={
                fill === "full"
                  ? "var(--color-brand-500)"
                  : fill === "half"
                    ? `url(#half-${i})`
                    : "var(--color-line-strong)"
              }
            />
          </svg>
        );
      })}
    </span>
  );
}

export function Badge({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "marigold" | "success" | "danger";
}) {
  const tones = {
    // Two weights of the same orange rather than two hues: solid for the
    // badge that should be noticed first, tinted for the supporting one.
    brand: "bg-brand-50 text-brand-700",
    marigold: "bg-brand-500 text-white",
    success: "bg-success text-white",
    danger: "bg-danger text-white",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-brand-600 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-2xl leading-tight font-semibold text-ink sm:text-[1.75rem]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-field bg-paper px-6 py-14 text-center">
      <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{message}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-paper">
      <div className="gc-skeleton aspect-[4/5] w-full" />
      <div className="space-y-2 p-3">
        <div className="gc-skeleton h-3 w-4/5 rounded" />
        <div className="gc-skeleton h-3 w-2/5 rounded" />
        <div className="gc-skeleton h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

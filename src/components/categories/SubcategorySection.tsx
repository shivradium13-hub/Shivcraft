import type { ReactNode } from "react";

/** A titled block inside the right-hand panel ("Popular", "All in ..."). */
export function SubcategorySection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-7 last:mb-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-sr-muted uppercase">
          {title}
        </h3>
        {hint ? <span className="text-[11px] text-sr-muted">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

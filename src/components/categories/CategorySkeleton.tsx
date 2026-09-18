/** Shown while the tree loads — never a blank screen (spec 21). */
export function CategorySkeleton() {
  return (
    <div className="flex min-h-[70vh]" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading categories</span>

      <div className="w-[24%] max-w-[190px] shrink-0 border-r border-sr-line bg-sr-canvas p-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="mb-1 flex flex-col items-center gap-1.5 rounded-xl p-2.5">
            <div className="gc-skeleton h-11 w-11 rounded-full" />
            <div className="gc-skeleton h-2.5 w-4/5 rounded" />
          </div>
        ))}
      </div>

      <div className="min-w-0 flex-1 p-4">
        <div className="gc-skeleton mb-1.5 h-5 w-40 rounded" />
        <div className="gc-skeleton mb-5 h-3 w-24 rounded" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-sr-line">
              <div className="gc-skeleton aspect-square w-full" />
              <div className="p-2.5">
                <div className="gc-skeleton h-2.5 w-11/12 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

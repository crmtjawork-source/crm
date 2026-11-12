// Loading placeholders that look like the page that is coming.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function PageSkeleton({ rows = 6, cards }: { rows?: number; cards?: boolean }) {
  return (
    <div className="p-4 md:p-6 space-y-4" role="status" aria-label="טוען">
      <Skeleton className="h-7 w-40" />
      {cards && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 p-3 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24 hidden md:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden p-4 md:p-6" role="status" aria-label="טוען">
      {[0, 1, 2, 3].map((c) => (
        <div key={c} className="w-64 shrink-0 rounded-2xl bg-black/[.04] dark:bg-white/[.05] p-2 space-y-2">
          <Skeleton className="h-5 w-28 m-1" />
          {[0, 1, 2].slice(0, 3 - (c % 2)).map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}

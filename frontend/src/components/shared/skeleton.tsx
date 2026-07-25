import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-[var(--radius-sm)]", className)} aria-hidden />;
}

/** A skeleton row shaped like a typical list/table row — icon + two lines + trailing value. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-5 w-16 shrink-0" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <Skeleton className="mb-3 h-3.5 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  );
}

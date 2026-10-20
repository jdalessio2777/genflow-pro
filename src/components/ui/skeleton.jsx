import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    (<div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props} />)
  );
}

export { Skeleton }

// Placeholder for a detail screen whose record hasn't arrived yet (Feel
// Phase 3): a header band + content blocks roughly the size of the real
// screen, instead of a centered spinner that then jumps to the content.
function DetailSkeleton({ headerClassName = "h-[120px]" }) {
  return (
    <div aria-hidden="true" data-testid="detail-skeleton">
      <div className={cn("animate-pulse bg-primary/15", headerClassName)} />
      <div className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export { DetailSkeleton }

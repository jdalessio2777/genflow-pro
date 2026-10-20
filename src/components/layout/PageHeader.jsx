import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBack } from "@/hooks/useBack";

// `back`:
//   true      → the shared back (pop; or the route's logical parent when
//               there is nothing to pop) — same as the iOS edge swipe
//   "/path"   → same, with this path as the parent for a direct open
//   function  → custom in-screen step back (e.g. a wizard step)
export default function PageHeader({ title, subtitle, back, backLabel, actions, className }) {
  const goBack = useBack(typeof back === "string" ? back : undefined);

  return (
    <header className={cn(
      "sticky top-[var(--sat)] z-40 bg-background/90 backdrop-blur-xl border-b border-border/60 px-4 py-3.5",
      className
    )}>
      <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          {back && (
            <button
              type="button"
              aria-label={backLabel || "Back"}
              data-testid="back-button"
              onClick={() => (typeof back === "function" ? back() : goBack())}
              className={cn(
                "touch-target flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors shrink-0",
                backLabel ? "h-9 pl-1.5 pr-3 -ml-1 gap-1" : "w-9 h-9 -ml-1"
              )}
            >
              <ArrowLeft className="w-5 h-5" />
              {backLabel && <span className="text-sm font-medium">{backLabel}</span>}
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold tracking-tight truncate leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate mt-0.5 font-medium">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-1.5 shrink-0" data-hit44>{actions}</div>
        )}
      </div>
    </header>
  );
}

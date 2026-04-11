import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function PageHeader({ title, subtitle, back, actions, className }) {
  const navigate = useNavigate();

  return (
    <header className={cn(
      "sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/60 px-4 py-3.5",
      className
    )}>
      <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          {back && (
            <button
              onClick={() => {
              if (typeof back === "function") back();
              else if (typeof back === "string") navigate(back);
              else navigate(-1);
            }}
              className="touch-target flex items-center justify-center w-9 h-9 -ml-1 rounded-xl hover:bg-muted active:bg-muted/80 transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
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
          <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
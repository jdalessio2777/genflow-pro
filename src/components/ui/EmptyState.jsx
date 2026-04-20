import { cn } from "@/lib/utils";

export default function EmptyState({ icon: Icon, title, subtitle, description, action, className }) {
  const body = subtitle || description;
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        {Icon && <Icon className="w-8 h-8 text-muted-foreground" />}
      </div>
      <p className="text-base font-semibold text-foreground mb-1">{title}</p>
      {body && <p className="text-sm text-muted-foreground mb-5 max-w-[240px] leading-relaxed">{body}</p>}
      {action && action}
    </div>
  );
}

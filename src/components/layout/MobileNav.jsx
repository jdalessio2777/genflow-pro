import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Wrench, CalendarDays, BookOpen, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Home" },
  { path: "/customers", icon: Users, label: "Customers" },
  { path: "/jobs", icon: Wrench, label: "Jobs" },
  { path: "/inbox", icon: Inbox, label: "Inbox" },
  { path: "/schedule", icon: CalendarDays, label: "Schedule" },
  { path: "/catalog", icon: BookOpen, label: "Catalog" },
];

export default function MobileNav() {
  const location = useLocation();

  const { data: newLeadsCount = 0 } = useQuery({
    queryKey: ["service-requests-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("service_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)", paddingLeft: 16, paddingRight: 16 }}
    >
      <nav className="w-full max-w-lg bg-card/98 backdrop-blur-xl border border-border/80 rounded-2xl shadow-xl shadow-black/10 px-1 py-1.5">
        <div className="flex items-center justify-around">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
            const showBadge = path === "/inbox" && newLeadsCount > 0;
            return (
              <Link
                key={path}
                to={path}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-200 touch-target relative active:scale-95"
              >
                {isActive && (
                  <span className="absolute inset-0 bg-primary/10 rounded-xl" />
                )}
                <span className="relative z-10">
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-all duration-200",
                      isActive ? "text-primary stroke-[2.5]" : "text-muted-foreground"
                    )}
                  />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {newLeadsCount > 99 ? "99+" : newLeadsCount}
                    </span>
                  )}
                </span>
                <span className={cn(
                  "text-[10px] font-semibold relative z-10 transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

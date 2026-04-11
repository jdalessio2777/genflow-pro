import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Wrench, CalendarDays, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Home" },
  { path: "/customers", icon: Users, label: "Customers" },
  { path: "/jobs", icon: Wrench, label: "Jobs" },
  { path: "/schedule", icon: CalendarDays, label: "Schedule" },
  { path: "/catalog", icon: BookOpen, label: "Catalog" },
];

export default function MobileNav() {
  const location = useLocation();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)", paddingLeft: 16, paddingRight: 16 }}
    >
      <nav className="w-full max-w-lg bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-xl shadow-black/10 px-2 py-1.5">
        <div className="flex items-center justify-around">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-200 touch-target relative"
              >
                {isActive && (
                  <span className="absolute inset-0 bg-primary/10 rounded-xl" />
                )}
                <Icon
                  className={cn(
                    "w-5 h-5 relative z-10 transition-all duration-200",
                    isActive ? "text-primary stroke-[2.5]" : "text-muted-foreground"
                  )}
                />
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
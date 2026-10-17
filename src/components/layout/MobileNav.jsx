import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from 'framer-motion';
import { LayoutDashboard, Users, Wrench, CalendarDays, BookOpen, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import {
  TAB_ROOTS, currentEntry, defaultTabFor, entryAt, historyIdx, setPendingTab, tabLast, getAppRouter,
} from "@/lib/navigation";

const MotionLink = motion(Link);

const navItems = [
  { tab: "home", path: TAB_ROOTS.home, icon: LayoutDashboard, label: "Home" },
  { tab: "customers", path: TAB_ROOTS.customers, icon: Users, label: "Customers" },
  { tab: "jobs", path: TAB_ROOTS.jobs, icon: Wrench, label: "Jobs" },
  { tab: "inbox", path: TAB_ROOTS.inbox, icon: Inbox, label: "Inbox" },
  { tab: "schedule", path: TAB_ROOTS.schedule, icon: CalendarDays, label: "Schedule" },
  { tab: "catalog", path: TAB_ROOTS.catalog, icon: BookOpen, label: "Catalog" },
];

const pathOf = (p) => (p || "").split("?")[0];

// Each tab keeps its own place (F-09):
// - tapping another tab returns to the screen you last had open there (its
//   root first, so back from that screen lands on the tab's list);
// - tapping the tab you're on scrolls to the top on its first screen, or
//   returns to its first screen from deeper in.
async function openTab(navigate, tab, root) {
  const last = tabLast(tab);
  if (!last || pathOf(last) === root) {
    setPendingTab(tab);
    navigate(last || root);
    return;
  }
  const router = getAppRouter();
  setPendingTab(tab);
  if (router) await router.navigate(root);
  else navigate(root);
  setPendingTab(tab);
  navigate(last);
}

function popToTabRoot(navigate, tab, root) {
  // Walk back through this tab's own entries to its first screen.
  const idx = historyIdx();
  for (let i = idx - 1; i >= 0; i--) {
    const e = entryAt(i);
    if (!e || e.tab !== tab) break;
    if (pathOf(e.path) === root) { navigate(i - idx); return; }
  }
  setPendingTab(tab);
  navigate(root, { replace: true });
}

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = currentEntry()?.tab ?? defaultTabFor(location.pathname);

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
      style={{ paddingBottom: "max(var(--sab), 12px)", paddingLeft: 16, paddingRight: 16 }}
    >
      <nav className="w-full max-w-lg bg-card/98 backdrop-blur-xl border border-border/80 rounded-2xl shadow-xl shadow-black/10 px-1 py-1.5">
        <div className="flex items-center justify-around">
          {navItems.map(({ tab, path, icon: Icon, label }) => {
            const isActive = activeTab === tab;
            const showBadge = path === "/inbox" && newLeadsCount > 0;
            return (
              <MotionLink
                key={path}
                to={path}
                data-testid={`tab-${tab}`}
                aria-current={isActive ? "page" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
                  e.preventDefault();
                  if (!isActive) { openTab(navigate, tab, path); return; }
                  if (location.pathname === path) window.scrollTo({ top: 0, behavior: "smooth" });
                  else popToTabRoot(navigate, tab, path);
                }}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl touch-target relative"
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.1 }}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 bg-primary/10 rounded-xl"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
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
              </MotionLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

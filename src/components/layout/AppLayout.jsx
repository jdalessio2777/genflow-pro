import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from 'framer-motion';
import MobileNav from "./MobileNav";
import PageTransition from "./PageTransition";

export default function AppLayout() {
  const location = useLocation();
  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <main className="pb-28 max-w-lg mx-auto">
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
      <MobileNav />
    </div>
  );
}

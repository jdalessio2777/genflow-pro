import { Outlet } from "react-router-dom";
import MobileNav from "./MobileNav";

export default function AppLayout() {
  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <main className="pb-28 max-w-lg mx-auto">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}
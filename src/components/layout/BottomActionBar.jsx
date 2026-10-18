import { Children, useEffect, useRef } from "react";

// The screen's main action, fixed just above the tab bar (thumb reach).
// Publishes its height as --action-h so the page padding leaves room for it.
// Hidden while the on-screen keyboard is open (see useKeyboardAware).
// Renders nothing (and --action-h 0) when no action applies, e.g. a paid job.
export default function BottomActionBar({ children }) {
  const ref = useRef(null);
  const hasAction = Children.toArray(children).length > 0;
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!hasAction || !el) { root.style.removeProperty("--action-h"); return undefined; }
    const set = () => root.style.setProperty("--action-h", `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty("--action-h"); };
  }, [hasAction]);
  if (!hasAction) return null;
  return (
    <div
      ref={ref}
      data-testid="bottom-action-bar"
      data-fixed-bottom=""
      className="fixed left-0 right-0 z-40 px-4 pt-2 pb-2 bg-background/95 backdrop-blur-xl border-t border-border/60"
      style={{ bottom: "var(--nav-h)" }}
    >
      <div className="max-w-lg mx-auto space-y-2">{children}</div>
    </div>
  );
}

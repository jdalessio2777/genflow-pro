import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { haptics } from "@/lib/haptics";

// Feel Phase 4: pull-to-refresh on the main lists (F-15).
//
// Works WITH the single document scroller (Phase 2), never against it:
// - listeners are passive — nothing calls preventDefault, so iOS keeps its
//   own scrolling and rubber-band; we only watch the finger;
// - a pull only starts when the page is already at the very top (scrollY 0)
//   and the finger moves DOWN first; any upward or sideways first move
//   (a scroll, a row swipe) ends it;
// - touches starting in the left 24 px are the iOS back swipe: ignored;
// - nothing happens while a dialog/sheet is open or in a text field.
// Releasing past the threshold refetches every query on screen.
export const PULL_THRESHOLD = 64;
const MAX_PULL = 110;
const EDGE = 24;

export function usePullToRefresh(enabled) {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const st = useRef({ active: false, x0: 0, y0: 0, decided: false, pull: 0, busy: false });

  useEffect(() => {
    if (!enabled) return;
    const s = st.current;
    const reset = () => { s.active = false; s.decided = false; s.pull = 0; setPull(0); };
    const onStart = (e) => {
      if (s.busy || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX < EDGE) return;
      if (window.scrollY > 0) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"], [data-no-pull]')) return;
      s.active = true; s.decided = false; s.x0 = t.clientX; s.y0 = t.clientY; s.pull = 0;
    };
    const onMove = (e) => {
      if (!s.active) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x0, dy = t.clientY - s.y0;
      if (!s.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        // Down first and mostly vertical = a pull; anything else is a scroll
        // or a row swipe and is left alone.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { reset(); return; }
        s.decided = true;
      }
      if (window.scrollY > 0) { reset(); return; }
      const p = Math.min(MAX_PULL, Math.max(0, dy * 0.5));
      if ((s.pull < PULL_THRESHOLD) !== (p < PULL_THRESHOLD) && p >= PULL_THRESHOLD) haptics.light();
      s.pull = p;
      setPull(p);
    };
    const onEnd = () => {
      if (!s.active) return;
      const go = s.decided && s.pull >= PULL_THRESHOLD;
      reset();
      if (!go) return;
      s.busy = true;
      setRefreshing(true);
      const minShow = new Promise((r) => setTimeout(r, 450));
      Promise.all([queryClient.invalidateQueries(), minShow])
        .catch(() => {})
        .finally(() => { s.busy = false; setRefreshing(false); });
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      reset();
    };
  }, [enabled, queryClient]);

  return { pull, refreshing };
}

// The round indicator under the status bar.
export function PullToRefreshIndicator({ pull, refreshing }) {
  if (!pull && !refreshing) return null;
  const shown = refreshing ? PULL_THRESHOLD : pull;
  const ready = refreshing || pull >= PULL_THRESHOLD;
  return (
    <div
      data-testid="pull-to-refresh"
      data-state={refreshing ? "refreshing" : ready ? "release" : "pulling"}
      aria-live="polite"
      className="fixed left-1/2 z-[55] pointer-events-none"
      style={{ top: "calc(var(--sat) + 8px)", transform: `translate(-50%, ${Math.round(shown * 0.6)}px)`, opacity: Math.min(1, shown / 40) }}
    >
      <div className={`w-10 h-10 rounded-full bg-card border border-border shadow-lg flex items-center justify-center ${ready ? "text-primary" : "text-muted-foreground"}`}>
        <RefreshCw
          className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${Math.round(pull * 3)}deg)` }}
        />
      </div>
      {refreshing && <span className="sr-only">Refreshing</span>}
    </div>
  );
}

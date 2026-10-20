import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchJob, prefetchCustomer } from "@/lib/queries";

// Feel Phase 3: start loading a job / customer the moment a finger touches a
// link to it (pointerdown fires ~100-300 ms before the click), so the screen
// opens with its data instead of a spinner. One document-level listener
// covers every list (Jobs, Dashboard, Schedule, customer history, ...).
// Rows that aren't links can opt in with data-prefetch-job="<id>".
const JOB = /^\/jobs\/([0-9a-f-]{8,})\/?$/i;
const CUSTOMER = /^\/customers\/([0-9a-f-]{8,})\/?$/i;

export function usePressPrefetch() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const seen = new Map();
    const onDown = (e) => {
      const el = e.target?.closest?.("a[href], [data-prefetch-job]");
      if (!el) return;
      let jobId = el.getAttribute("data-prefetch-job");
      let customerId = null;
      if (!jobId) {
        let path;
        try { path = new URL(el.getAttribute("href"), window.location.href).pathname; } catch { return; }
        jobId = path.match(JOB)?.[1] ?? null;
        customerId = jobId ? null : path.match(CUSTOMER)?.[1] ?? null;
      }
      const key = jobId ? "j" + jobId : customerId ? "c" + customerId : null;
      if (!key) return;
      // At most once per row per 5 s.
      // A drag that starts on a row is a scroll, not a tap: wait 60 ms and
      // skip if the pointer moved or iOS cancelled it (scroll took over).
      const now = Date.now();
      if (now - (seen.get(key) || 0) < 5000) return;
      const x0 = e.clientX, y0 = e.clientY;
      let cancelled = false;
      const onMove = (m) => { if (Math.abs(m.clientX - x0) > 10 || Math.abs(m.clientY - y0) > 10) cancelled = true; };
      const onCancel = () => { cancelled = true; };
      document.addEventListener("pointermove", onMove, { passive: true, capture: true });
      document.addEventListener("pointercancel", onCancel, { capture: true });
      setTimeout(() => {
        document.removeEventListener("pointermove", onMove, { capture: true });
        document.removeEventListener("pointercancel", onCancel, { capture: true });
        if (cancelled) return;
        seen.set(key, Date.now());
        if (jobId) prefetchJob(queryClient, jobId);
        else prefetchCustomer(queryClient, customerId);
      }, 60);
    };
    document.addEventListener("pointerdown", onDown, { passive: true, capture: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true });
  }, [queryClient]);
}

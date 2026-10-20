import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarX2, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getCalendarStatus, onCalendarStatus, pendingCalendarOps, retryPendingCalendarSync } from "@/lib/calendarSync";

// B3: non-blocking notice when a job's Google Calendar event couldn't be
// written. Sits above the tab bar; never covers the screen. "Reconnect Google"
// re-runs Google sign-in and comes back to this screen; the queued jobs are
// then synced automatically.
export default function CalendarSyncBanner() {
  const [status, setStatus] = useState(getCalendarStatus);
  const [dismissedAt, setDismissedAt] = useState(0);
  const { signInWithGoogle } = useAuth();
  const location = useLocation();

  useEffect(() => onCalendarStatus(setStatus), []);
  // Anything left from before (e.g. after coming back from reconnecting): retry once.
  useEffect(() => { if (pendingCalendarOps().length) retryPendingCalendarSync(); }, []);

  if (status.state === "ok" || (status.at && status.at <= dismissedAt)) return null;
  const n = pendingCalendarOps().length;
  const reconnect = status.state === "reconnect";

  return (
    <div
      role="status"
      data-testid="calendar-sync-banner"
      className="fixed left-0 right-0 z-40 flex justify-center px-3 pointer-events-none"
      style={{ bottom: "calc(var(--nav-h) + var(--action-h) + 8px + var(--kb-h, 0px))" }}
    >
      <div className="pointer-events-auto max-w-lg w-full rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 shadow-lg p-3 flex items-start gap-2">
        <CalendarX2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{status.message}</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
            The job is saved.{n > 1 ? ` ${n} jobs are waiting for the calendar.` : status.job ? ` ${status.job} is waiting for the calendar.` : ""}
          </p>
          <div className="flex gap-2 mt-2">
            {reconnect ? (
              <button
                type="button"
                data-testid="calendar-reconnect"
                className="rounded-lg bg-amber-600 text-white text-sm font-medium px-3 py-1.5"
                onClick={() => signInWithGoogle({ returnTo: location.pathname + location.search })}
              >
                Reconnect Google
              </button>
            ) : (
              <button
                type="button"
                data-testid="calendar-retry"
                className="rounded-lg bg-amber-600 text-white text-sm font-medium px-3 py-1.5 flex items-center gap-1"
                onClick={() => retryPendingCalendarSync()}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            )}
          </div>
        </div>
        <button type="button" aria-label="Dismiss" className="p-1 text-amber-700" onClick={() => setDismissedAt(status.at || Date.now())}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

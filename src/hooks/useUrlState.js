import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAppRouter } from "@/lib/navigation";

// Screen state kept in the URL (list tab, search, filters, calendar view), so
// coming back to a screen — by the arrow, the edge swipe or the tab bar —
// shows it exactly as it was (F-08). Updates replace the current entry and
// never reset the scroll position. The default value is left out of the URL.
// Several updates in the same tick (e.g. switch tab + clear search) are
// merged into one navigation.
let pending = null;

export function useUrlState(key, defaultValue = "") {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const value = params.get(key) ?? defaultValue;
  const setValue = useCallback((next) => {
    if (!pending) {
      pending = new URLSearchParams(window.location.search);
      queueMicrotask(() => {
        const p = pending;
        pending = null;
        const search = p.toString();
        navigate({ search: search ? `?${search}` : "" }, {
          replace: true,
          preventScrollReset: true,
          state: getAppRouter()?.state.location.state,
        });
      });
    }
    const v = typeof next === "function" ? next(pending.get(key) ?? defaultValue) : next;
    if (v == null || v === "" || v === defaultValue) pending.delete(key);
    else pending.set(key, String(v));
  }, [key, defaultValue, navigate]);
  return [value, setValue];
}

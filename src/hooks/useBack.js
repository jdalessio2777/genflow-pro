import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAppRouter, historyIdx, isNavigating, onSettled, parentFor } from "@/lib/navigation";

// Back = pop, exactly like the iOS edge swipe, so the arrow and the swipe
// always agree. With nothing to pop (cold start, reload landing, a link from
// outside) it replaces the screen with its logical parent instead, so back
// never dead-ends. An open sheet's history entry is popped along with it.
// Reads the location at call time (a save that finishes after its dialog
// closed must not act on the render-time location).
export function goBack(navigate, location, fallback) {
  // A pop still landing (e.g. a sheet's entry being removed): wait for it,
  // or the two would add up.
  if (isNavigating()) {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      off();
      goBack(navigate, location, fallback);
    };
    const off = onSettled(() => setTimeout(run, 0));
    setTimeout(run, 1600);
    return;
  }
  location = getAppRouter()?.state.location ?? location;
  const steps = location?.state?.__sheet ? 2 : 1;
  if (historyIdx() >= steps) {
    navigate(-steps);
    return;
  }
  navigate(fallback || parentFor(location) || "/", { replace: true });
}

// `fallback` overrides the route's logical parent (e.g. a checklist's job).
export function useBack(fallback) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => goBack(navigate, location, fallback), [navigate, location, fallback]);
}

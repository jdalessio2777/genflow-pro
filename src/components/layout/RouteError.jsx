import { useRouteError } from "react-router-dom";

// Shown instead of the router's raw "Unexpected Application Error!" page when
// a screen crashes. In the home-screen app there is no browser chrome, so it
// always offers a way out. Uses full loads (the crashed tree is not reused).
export default function RouteError() {
  const error = useRouteError();
  console.error("[RouteError]", error);
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background" style={{ paddingTop: "var(--sat)" }}>
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-lg font-bold">Something went wrong on this screen</h1>
        <p className="text-sm text-muted-foreground">Nothing was lost. Go back, or open the home screen.</p>
        <div className="flex gap-2">
          <button type="button" data-testid="route-error-back" className="flex-1 h-11 rounded-xl border border-border font-semibold"
            onClick={() => { if ((window.history.state?.idx ?? 0) > 0) window.history.back(); else window.location.assign("/"); setTimeout(() => window.location.reload(), 300); }}>
            Back
          </button>
          <button type="button" className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
            onClick={() => window.location.assign("/")}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
}

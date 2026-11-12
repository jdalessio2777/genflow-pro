import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";

// Only Claude may be approved here, whatever the OAuth client calls itself.
export const ALLOWED_REDIRECT_HOSTS = ["claude.ai", "claude.com"];
export function redirectHostAllowed(uri) {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" && ALLOWED_REDIRECT_HOSTS.includes(u.hostname);
  } catch { return false; }
}

/**
 * The page Supabase's OAuth server sends someone to when Claude asks to connect to
 * GenFlow (Run 12, Part B). Outside the normal sign-in gate so it can send them
 * through Google sign-in and back here with the request intact.
 */
export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id");
  const { isAuthenticated, isLoadingAuth, signInWithGoogle, authError, staffStatus } = useAuth();
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authorizationId || !isAuthenticated) return;
    let live = true;
    (async () => {
      const { data, error: e } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!live) return;
      if (e) { setError(e.message); return; }
      // Already approved earlier: straight back to Claude.
      if (!("authorization_id" in data)) {
        if (redirectHostAllowed(data.redirect_url)) window.location.assign(data.redirect_url);
        else setError("This request doesn't go back to Claude, so GenFlow refused it.");
        return;
      }
      setDetails(data);
    })().catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [authorizationId, isAuthenticated]);

  const decide = async (fn) => {
    setBusy(true);
    const { data, error: e } = await supabase.auth.oauth[fn](authorizationId);
    if (e) { setBusy(false); setError(e.message); return; }
    window.location.assign(data.redirect_url);
  };

  let body;
  if (!authorizationId) body = <p className="text-sm text-muted-foreground">This link is missing its sign-in request. Start again from Claude.</p>;
  else if (error) body = <p className="text-sm text-destructive" data-testid="consent-error">{error}</p>;
  else if (isLoadingAuth) body = <p className="text-sm text-muted-foreground">Loading…</p>;
  else if (!isAuthenticated) body = (
    <>
      <p className="text-sm text-muted-foreground">Sign in to GenFlow to continue.</p>
      {authError && authError.type !== "auth_required" && <p className="text-sm text-destructive">{authError.message}</p>}
      <Button className="w-full rounded-xl h-12" data-testid="consent-sign-in"
        onClick={() => signInWithGoogle({ returnTo: `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}` })}>
        Sign in with Google
      </Button>
    </>
  );
  else if (!details || staffStatus !== "staff") body = <p className="text-sm text-muted-foreground">Loading…</p>;
  else if (!redirectHostAllowed(details.redirect_uri)) body = (
    <p className="text-sm text-destructive" data-testid="consent-refused">
      This request came from something other than Claude, so GenFlow refused it. It would have gone to {details.redirect_uri}.
    </p>
  );
  else body = (
    <>
      <p className="text-sm"><span className="font-semibold">{details.client?.name || "Claude"}</span> wants to act as you in GenFlow.</p>
      <p className="text-xs text-muted-foreground" data-testid="consent-host">It goes back to {new URL(details.redirect_uri).hostname}.</p>
      <ul className="text-sm list-disc pl-5 space-y-1">
        <li>Look up customers, jobs and the schedule</li>
        <li>Add customers, and change their contact and generator info</li>
        <li>Schedule jobs, and email a confirmation only when asked</li>
      </ul>
      <p className="text-xs text-muted-foreground">It can't delete anything through this connection, and every action is logged under your name.</p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 rounded-xl h-12" disabled={busy} data-testid="consent-deny" onClick={() => decide("denyAuthorization")}>Deny</Button>
        <Button className="flex-1 rounded-xl h-12" disabled={busy} data-testid="consent-allow" onClick={() => decide("approveAuthorization")}>Allow</Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
        <h1 className="text-lg font-bold">Connect Claude to GenFlow</h1>
        {body}
      </div>
    </div>
  );
}

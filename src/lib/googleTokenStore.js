// Google Calendar access for this device (B3).
//
// Why: Supabase hands out the Google tokens (provider_token /
// provider_refresh_token) ONLY in the session right after the Google sign-in
// redirect. Its own hourly session refresh drops them, so the old app lost
// calendar access ~1 hour after sign-in (or on the next app start) and silently
// skipped every sync. Now the tokens are captured the moment they appear and
// kept here (localStorage, per device, tied to the signed-in user). Access
// tokens are refreshed through the staff-only /api/refresh-google-token route;
// the refresh token is useless without the server's client secret.
//
// getAccessToken() → { token } or { token: null, reason, code }:
//   code "reconnect"     — no usable Google grant on this device: sign in with Google again
//   code "server_config" — the server's GOOGLE_CLIENT_SECRET is wrong (Vercel env fix)
//   code "error"         — temporary (network) problem
import { supabase } from "@/lib/supabaseClient";

export const TOKEN_KEY = "genflow_google_tokens_v1";
const EARLY_MS = 2 * 60 * 1000; // refresh 2 min before Google's expiry
const DEFAULT_LIFETIME_S = 3600;

const listeners = new Set();
let inflight = null;

// undefined = storage unavailable (private mode) → fall back to memory.
function read() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch { return undefined; }
}
function write(rec) {
  try {
    if (rec) localStorage.setItem(TOKEN_KEY, JSON.stringify(rec));
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: in-memory only for this page */ }
  memory = rec;
  listeners.forEach(fn => { try { fn(rec); } catch { /* ignore */ } });
}
let memory = null;
const current = () => { const r = read(); return r === undefined ? memory : r; };

export function onGoogleTokenChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Called with every Supabase session (AuthContext.applySession). Captures the
// Google tokens when they're present (right after the Google redirect); forgets
// them on sign-out or when a different user signs in on this device.
export function captureGoogleTokens(session, { now = Date.now() } = {}) {
  if (!session?.user) { if (current()) write(null); return null; }
  let rec = current();
  const otherUser = !!(rec && rec.userId !== session.user.id);
  if (otherUser) rec = null;
  if (session.provider_token) {
    rec = {
      ...(rec || {}),
      userId: session.user.id,
      email: session.user.email,
      accessToken: session.provider_token,
      // Supabase doesn't say when the Google token expires; Google's are 1 h.
      expiresAt: now + DEFAULT_LIFETIME_S * 1000,
      refreshToken: session.provider_refresh_token || rec?.refreshToken || null,
      capturedAt: now,
      needsReconnect: false,
    };
    write(rec);
  } else if (otherUser) {
    write(null);
  }
  return rec;
}

export function clearGoogleTokens() { write(null); }

export function googleConnection() {
  const rec = current();
  return {
    connected: !!(rec && (rec.refreshToken || (rec.accessToken && rec.expiresAt > Date.now()))) && !rec?.needsReconnect,
    email: rec?.email || null,
    hasRefreshToken: !!rec?.refreshToken,
  };
}

// The token Google just rejected (401): never hand it out again.
export function invalidateAccessToken(token) {
  const rec = current();
  if (rec && rec.accessToken === token) write({ ...rec, accessToken: null, expiresAt: 0 });
}

async function refresh(rec) {
  const { data } = await supabase.auth.getSession();
  const staffToken = data?.session?.access_token;
  if (!staffToken) return { token: null, code: "reconnect", reason: "Not signed in" };
  let res, body;
  try {
    res = await fetch("/api/refresh-google-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ refresh_token: rec.refreshToken }),
    });
    body = await res.json().catch(() => ({}));
  } catch (e) {
    return { token: null, code: "error", reason: `Couldn't reach the server (${e.message})` };
  }
  if (res.ok && body.access_token) {
    const latest = current();
    if (latest?.userId === rec.userId) {
      write({ ...latest, accessToken: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || DEFAULT_LIFETIME_S) * 1000, needsReconnect: false });
    }
    return { token: body.access_token };
  }
  if (body.code === "reconnect") {
    // Google revoked the grant: only a new Google sign-in fixes it.
    write({ ...rec, accessToken: null, expiresAt: 0, refreshToken: null, needsReconnect: true });
    return { token: null, code: "reconnect", reason: "Google access expired" };
  }
  if (body.code === "server_config") {
    return { token: null, code: "server_config", reason: "the server's Google settings need fixing" };
  }
  return { token: null, code: "error", reason: body.error || `refresh failed (${res.status})` };
}

export async function getAccessToken({ now = Date.now() } = {}) {
  const rec = current();
  if (!rec) return { token: null, code: "reconnect", reason: "Google not connected on this device" };
  if (rec.accessToken && rec.expiresAt - EARLY_MS > now) return { token: rec.accessToken };
  if (!rec.refreshToken) return { token: null, code: "reconnect", reason: "Google access expired" };
  if (!inflight) inflight = refresh(rec).finally(() => { inflight = null; });
  return inflight;
}

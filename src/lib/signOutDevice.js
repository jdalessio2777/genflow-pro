// What "Sign out" (Settings) clears on THIS device, besides the Supabase
// session itself:
// - the stored Google tokens (googleTokenStore) and the Jobs calendar choice,
//   the device's pending calendar updates and last-sync time (calendarSync,
//   Schedule);
// - every other app key in localStorage — including the Supabase session key,
//   so an offline sign-out (Supabase keeps the session when its logout call
//   fails) still leaves nobody signed in after the reload;
// - sessionStorage (back-stack memory, "return to" after Google sign-in);
// - the React Query cache (customers, jobs, invoices… in memory).
// Kept: genflow_preferences — dark mode, 24 h time and "Confirm before
// deleting" are settings of the phone, not of the account.
import { queryClientInstance } from "@/lib/query-client";
import { clearGoogleTokens } from "@/lib/googleTokenStore";

export const KEEP_LOCAL_KEYS = ["genflow_preferences"];

const isSupabaseKey = (k) => k.startsWith("sb-");

function sweep(storage, keep = () => false) {
  if (!storage) return;
  for (let i = storage.length - 1; i >= 0; i--) {
    const k = storage.key(i);
    if (k != null && !keep(k)) storage.removeItem(k);
  }
}

// keepSession: true for the pass BEFORE supabase.auth.signOut(), which needs
// the stored session to revoke it on the server; the pass after removes it.
export function clearDeviceData({ keepSession = false, queryClient = queryClientInstance } = {}) {
  clearGoogleTokens(); // also tells the screens showing "Google connected"
  const keep = (k) => KEEP_LOCAL_KEYS.includes(k) || (keepSession && isSupabaseKey(k));
  try { sweep(localStorage, keep); } catch { /* storage unavailable */ }
  try { sweep(sessionStorage); } catch { /* storage unavailable */ }
  try { queryClient?.clear(); } catch { /* ignore */ }
}

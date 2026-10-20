// Browser-only (uses the Supabase client). Kept out of jobDuration.js, which
// the server-side email templates import.
// ── Does jobs.estimated_minutes exist yet? ────────────────────────────────
// The column comes from .qa-scratch/fixes/B2-estimated-minutes.sql. Until it
// is applied, saves leave it out (PostgREST rejects unknown columns) and the
// job falls back to 2 hours; the picked value is still used for the
// confirmation email and the calendar event of the same save. Probed once per
// app load; a network failure is not cached (asked again next time).
let columnProbe = null;
export function hasEstimateColumn() {
  if (columnProbe) return columnProbe;
  columnProbe = (async () => {
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { error } = await supabase.from("jobs").select("estimated_minutes").limit(0);
      if (!error) return true;
      const missing = error.code === "42703" || /estimated_minutes/.test(error.message || "");
      if (!missing) columnProbe = null; // unknown failure: ask again later
      return false;
    } catch {
      columnProbe = null;
      return false;
    }
  })();
  return columnProbe;
}
export function __setEstimateColumnForTests(value) {
  columnProbe = value == null ? null : Promise.resolve(!!value);
}

// Adds estimated_minutes to a jobs payload only when the column exists.
export async function withEstimate(payload, minutes) {
  if (!(Number(minutes) > 0)) return payload;
  return (await hasEstimateColumn()) ? { ...payload, estimated_minutes: Math.round(Number(minutes)) } : payload;
}


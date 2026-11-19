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
      // One whole row tells us without an error: asking for a missing column
      // by name is a 400 that shows as a console error on every app load.
      const row = await supabase.from("jobs").select("*").limit(1);
      if (!row.error && row.data?.length) return "estimated_minutes" in row.data[0];
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


// ── Does jobs.service_address exist yet? (Run 14, A) ─────────────────────
// From .qa-scratch/run14/A-job-service-address.sql. Same probe as above. Until
// it is applied, saves leave the column out and jobAddress() falls back to the
// job's generator's current address (src/lib/generatorInfo.js).
let addressProbe = null;
export function hasServiceAddressColumn() {
  if (addressProbe) return addressProbe;
  addressProbe = (async () => {
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const row = await supabase.from("jobs").select("*").limit(1);
      if (!row.error && row.data?.length) return "service_address" in row.data[0];
      const { error } = await supabase.from("jobs").select("service_address").limit(0);
      if (!error) return true;
      const missing = error.code === "42703" || /service_address/.test(error.message || "");
      if (!missing) addressProbe = null;
      return false;
    } catch {
      addressProbe = null;
      return false;
    }
  })();
  return addressProbe;
}
export function __setServiceAddressColumnForTests(value) {
  addressProbe = value == null ? null : Promise.resolve(!!value);
}

// Adds service_address (the generator's own address, or null = the
// customer's) to a jobs payload, only when the column exists.
export async function withServiceAddress(payload, serviceAddress) {
  return (await hasServiceAddressColumn()) ? { ...payload, service_address: serviceAddress || null } : payload;
}

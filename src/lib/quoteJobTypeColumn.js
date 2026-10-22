// Browser-only (uses the Supabase client), like jobEstimateColumn.js.
// ── Does quotes.job_type exist yet? (Run 8, A5) ───────────────────────────
// The column comes from .qa-scratch/fixes/R8-A5-quote-job-type.sql. Until it
// is applied, a quote save leaves it out (PostgREST rejects unknown columns):
// the Service Type picked in the Quote Builder is still used in that quote's
// email, and the job made at Approve falls back to the type its lines make
// obvious (inferServiceType). Probed once per app load; a network failure is
// not cached.
let probe = null;
export function hasQuoteJobTypeColumn() {
  if (probe) return probe;
  probe = (async () => {
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const row = await supabase.from("quotes").select("*").limit(1);
      if (!row.error && row.data?.length) return "job_type" in row.data[0];
      const { error } = await supabase.from("quotes").select("job_type").limit(0);
      if (!error) return true;
      const missing = error.code === "42703" || /job_type/.test(error.message || "");
      if (!missing) probe = null;
      return false;
    } catch {
      probe = null;
      return false;
    }
  })();
  return probe;
}
export function __setQuoteJobTypeColumnForTests(value) {
  probe = value == null ? null : Promise.resolve(!!value);
}

// Adds job_type to a quotes payload only when the column exists and a type was picked.
export async function withQuoteJobType(payload, jobType) {
  if (!jobType) return payload;
  return (await hasQuoteJobTypeColumn()) ? { ...payload, job_type: jobType } : payload;
}

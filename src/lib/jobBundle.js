// B4 (Run 9): the job screen's records in ONE request.
//
// Opening a job used to make a request per record type (job, parts, labor,
// invoice, documents, photos, agreement, customer, the customer's jobs) plus
// the catalog/rates/settings — about 12. PostgREST embeds the related rows
// (foreign keys to jobs / customers), so one select returns all of them.
// Every existing query key (["job", id], ["job-parts", id], …) keeps its own
// cache entry and shape: each one's queryFn reads its slice of the shared
// bundle, so screens, invalidations and optimistic updates work unchanged.
// Queries that fire together (opening the screen, or several invalidations
// after a save) share one in-flight request. If the embedded select fails
// (e.g. a relationship is missing) each slice falls back to its own request.
import { supabase } from "@/lib/supabaseClient";
import { normalizeRow, normalizeRows } from "@/lib/db";

export const JOB_BUNDLE_SELECT = [
  "*",
  "job_parts(*)",
  "job_labor(*)",
  "invoices!invoices_job_id_fkey(*)",
  "job_documents!job_documents_job_id_fkey(*)",
  "job_photos(*)",
  "job_agreements!job_agreements_job_id_fkey(*)",
  "customer:customers!jobs_customer_id_fkey(*, history:jobs!jobs_customer_id_fkey(*))",
].join(",");

// Requests started within this window of each other share one round trip;
// a refetch after a save starts a new one (never reuses a pre-save answer).
const SHARE_MS = 40;
const inflight = new Map(); // id -> { at, promise }
let requestCount = 0; // for tests

const byNewest = (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""));

export function splitJobBundle(row) {
  if (!row) return null;
  const { job_parts, job_labor, invoices, job_documents, job_photos, job_agreements, customer, ...job } = row;
  const { history, ...cust } = customer || {};
  return {
    job: normalizeRow(job),
    parts: normalizeRows(job_parts || []),
    labor: normalizeRows(job_labor || []),
    invoices: normalizeRows(invoices || []),
    documents: normalizeRows(job_documents || []),
    photos: normalizeRows(job_photos || []),
    agreement: normalizeRow((job_agreements || [])[0] || null),
    customer: customer ? normalizeRow(cust) : undefined,
    customerHistory: customer ? normalizeRows([...(history || [])].sort(byNewest)) : undefined,
  };
}

export function loadJobBundle(id) {
  const now = Date.now();
  const hit = inflight.get(id);
  if (hit && now - hit.at <= SHARE_MS) return hit.promise;
  requestCount++;
  const promise = supabase.from("jobs").select(JOB_BUNDLE_SELECT).eq("id", id).maybeSingle()
    .then(({ data, error }) => { if (error) throw error; return splitJobBundle(data); });
  inflight.set(id, { at: now, promise });
  promise.finally(() => { if (inflight.get(id)?.promise === promise) setTimeout(() => { if (inflight.get(id)?.promise === promise) inflight.delete(id); }, SHARE_MS); }).catch(() => {});
  return promise;
}

// A slice of the bundle, or its own request if the bundle can't be loaded.
export async function jobSlice(id, key, fallback) {
  try {
    const b = await loadJobBundle(id);
    if (b === null) return key === "job" || key === "agreement" ? (key === "job" ? undefined : null) : [];
    return b[key];
  } catch {
    return fallback();
  }
}

export const __jobBundleRequests = () => requestCount;
export const __resetJobBundle = () => { inflight.clear(); requestCount = 0; };

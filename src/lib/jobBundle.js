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

// One answer is shared by every slice that asks while it is in flight or
// for REUSE_MS after it lands (opening a job: the touch-down prefetch, the
// route loader and the screen's own queries). Any invalidation of a job key
// (a save, a pull-to-refresh) bumps the job's generation, so the next ask
// always makes a new request — a post-save refetch never gets a pre-save
// answer. watchJobInvalidations() connects that to the query cache.
const REUSE_MS = 1500;
const inflight = new Map(); // id -> { at, gen, promise, done }
const generation = new Map(); // id -> n
let requestCount = 0; // for tests
const JOB_KEYS = new Set(["job", "job-parts", "job-labor", "job-invoice", "job-docs", "job-photos", "job-agreement"]);

export function bumpJobBundle(id) { generation.set(id, (generation.get(id) || 0) + 1); }

let watched = null;
export function watchJobInvalidations(queryClient) {
  if (!queryClient || watched === queryClient) return;
  watched = queryClient;
  queryClient.getQueryCache().subscribe((e) => {
    if (e?.type !== "updated" || e.action?.type !== "invalidate") return;
    const [k, id] = e.query.queryKey || [];
    if (JOB_KEYS.has(k) && id) bumpJobBundle(id);
  });
}

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
  const gen = generation.get(id) || 0;
  const hit = inflight.get(id);
  if (hit && hit.gen === gen && (!hit.done || now - hit.done <= REUSE_MS)) return hit.promise;
  requestCount++;
  const entry = { at: now, gen, done: 0, promise: null };
  entry.promise = supabase.from("jobs").select(JOB_BUNDLE_SELECT).eq("id", id).maybeSingle()
    .then(({ data, error }) => { if (error) throw error; return splitJobBundle(data); });
  inflight.set(id, entry);
  entry.promise.then(() => { entry.done = Date.now(); }, () => { if (inflight.get(id) === entry) inflight.delete(id); });
  return entry.promise;
}

// A slice of the bundle, or its own request if the bundle can't be loaded.
export async function jobSlice(id, key, fallback) {
  try {
    const b = await loadJobBundle(id);
    if (b === null) return key === "job" || key === "agreement" ? (key === "job" ? undefined : null) : [];
    // customer slices are undefined when the job has no customer: ask directly
    if (b[key] === undefined && (key === "customer" || key === "customerHistory")) return fallback();
    return b[key];
  } catch {
    return fallback();
  }
}

export const __jobBundleRequests = () => requestCount;
export const __resetJobBundle = () => { inflight.clear(); generation.clear(); requestCount = 0; watched = null; };

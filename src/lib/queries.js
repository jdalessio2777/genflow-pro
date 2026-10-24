// Feel Phase 3 (speed): shared query definitions.
//
// One definition per cached list/record, so every screen that shows the same
// data uses the same cache entry with the same shape — and screens that load
// DIFFERENT slices (newest 100 vs 200 vs 500 jobs, customers by name vs by
// date) get DIFFERENT keys instead of overwriting each other's cache (A-09).
// Keys keep the old first element ("jobs", "customers", "invoices",
// "parts-catalog", "job", ...), so every existing
// invalidateQueries({ queryKey: ["jobs"] }) still matches them by prefix.
import { db } from "@/lib/db";
import { jobSlice, loadJobBundle, watchJobInvalidations } from "@/lib/jobBundle";

// Catalog, labor rates and settings change rarely (and every screen that
// edits them invalidates them): kept for 5 minutes instead of refetched on
// every job opened (B4).
export const REFERENCE_STALE_MS = 5 * 60_000;

// ---- Lists -----------------------------------------------------------------
export const jobsListQuery = (limit) => ({
  queryKey: ["jobs", "list", limit],
  queryFn: () => db.Job.list("-created_date", limit),
});

export const customersListQuery = (order = "name") => ({
  queryKey: ["customers", "list", order],
  queryFn: () => db.Customer.list(order),
});

export const invoicesListQuery = (limit = null) => ({
  queryKey: ["invoices", "list", limit],
  queryFn: () => db.Invoice.list("-created_date", limit ?? undefined),
});

// Old category keys still stored on some parts rows → the current category
// folders. Applied to EVERY cached copy of the parts catalog (Catalog, job
// part picker, Dashboard low stock, Quote Builder) so the one cache entry has
// one shape whichever screen loaded it first.
const LEGACY_CATEGORY_MAP = {
  air_filter: "air_filters",
  oil_filter: "oil_filters",
  oil:        "oils_fluids",
  spark_plug: "spark_plugs",
  battery:    "batteries",
};
export const normalizePart = (p) =>
  LEGACY_CATEGORY_MAP[p?.category]
    ? { ...p, category: LEGACY_CATEGORY_MAP[p.category] }
    : p;

export const partsCatalogQuery = () => ({
  queryKey: ["parts-catalog"],
  queryFn: () => db.Part.list("name").then((rows) => rows.map(normalizePart)),
  staleTime: REFERENCE_STALE_MS,
});

// Same key and shape as useSettings() (src/lib/useSettings.js).
export const appSettingsQuery = () => ({
  queryKey: ["app-settings"],
  queryFn: () => db.AppSettings.list("key"),
  staleTime: REFERENCE_STALE_MS,
});

export const laborRatesQuery = () => ({
  queryKey: ["labor-rates"],
  queryFn: () => db.LaborRate.list("name"),
  staleTime: REFERENCE_STALE_MS,
});

// ---- Job screen ------------------------------------------------------------
// Job/money records are kept fresh for a shorter time than lists: a prefetch
// on pressing a job row (below) is reused when the screen opens a moment
// later, but reopening a job after 10 s refreshes it in the background.
export const DETAIL_STALE_MS = 10_000;

export const jobQuery = (id) => ({
  queryKey: ["job", id],
  queryFn: () => jobSlice(id, "job", async () => (await db.Job.filter({ id }))[0]),
  staleTime: DETAIL_STALE_MS,
});
export const jobPartsQuery = (id) => ({
  queryKey: ["job-parts", id],
  queryFn: () => jobSlice(id, "parts", () => db.JobPart.filter({ job_id: id })),
  staleTime: DETAIL_STALE_MS,
});
export const jobLaborQuery = (id) => ({
  queryKey: ["job-labor", id],
  queryFn: () => jobSlice(id, "labor", () => db.JobLabor.filter({ job_id: id })),
  staleTime: DETAIL_STALE_MS,
});
export const jobInvoiceQuery = (id) => ({
  queryKey: ["job-invoice", id],
  queryFn: () => jobSlice(id, "invoices", () => db.Invoice.filter({ job_id: id })),
  staleTime: DETAIL_STALE_MS,
});

export const jobDocsQuery = (id) => ({
  queryKey: ["job-docs", id],
  queryFn: () => jobSlice(id, "documents", () => db.JobDocument.filter({ job_id: id })),
  staleTime: DETAIL_STALE_MS,
});
export const jobPhotosQuery = (id) => ({
  queryKey: ["job-photos", id],
  queryFn: () => jobSlice(id, "photos", () => db.JobPhoto.filter({ job_id: id })),
  staleTime: DETAIL_STALE_MS,
});
// The signed-agreement row for this job (job_agreements, migration 0022).
export const jobAgreementQuery = (id) => ({
  queryKey: ["job-agreement", id],
  queryFn: () => jobSlice(id, "agreement", async () => {
    try { const r = await db.JobAgreement.filter({ job_id: id }); return r[0] || null; }
    catch { return null; }
  }),
  staleTime: DETAIL_STALE_MS,
});
export const jobCustomerQuery = (customerId) => ({
  queryKey: ["job-customer", customerId],
  queryFn: async () => { const r = await db.Customer.filter({ id: customerId }); return r[0]; },
  staleTime: DETAIL_STALE_MS,
});
export const customerHistoryQuery = (customerId) => ({
  queryKey: ["customer-history", customerId],
  queryFn: () => db.Job.filter({ customer_id: customerId }, "-created_date"),
  staleTime: DETAIL_STALE_MS,
});

// Everything the job screen loads, started together: the main records are
// returned (the route loader waits for those), the rest just start loading —
// including the job's customer and history as soon as the job row is in.
// B4: all the per-job records come from one request (lib/jobBundle.js); the
// bundle also carries the customer and their jobs, which seed those caches so
// they need no request of their own.
export function startJobQueries(queryClient, id) {
  watchJobInvalidations(queryClient);
  const main = [jobQuery(id), jobPartsQuery(id), jobLaborQuery(id), jobInvoiceQuery(id)]
    .map((q) => queryClient.ensureQueryData(q).catch(() => null));
  for (const q of [jobDocsQuery(id), jobPhotosQuery(id), jobAgreementQuery(id), partsCatalogQuery(), laborRatesQuery(), appSettingsQuery()]) queryClient.prefetchQuery(q).catch(() => {});
  seedJobCustomer(queryClient, id);
  return main;
}

// Customer + history from the bundle into their own cache entries (unless
// fresher data is already there); fetched separately only if that fails.
export function seedJobCustomer(queryClient, id) {
  loadJobBundle(id).then((b) => {
    const cid = b?.job?.customer_id;
    if (!cid || !b.customer) return;
    const fresh = (key) => { const s = queryClient.getQueryState(key); return s?.dataUpdatedAt && Date.now() - s.dataUpdatedAt < DETAIL_STALE_MS; };
    if (!fresh(["job-customer", cid])) queryClient.setQueryData(["job-customer", cid], b.customer);
    if (!fresh(["customer-history", cid])) queryClient.setQueryData(["customer-history", cid], b.customerHistory);
  }).catch(() => {});
}

// Prefetch the job screen on touch-down on a job row (~100-300 ms before the
// click lands). Also warms the job screen's code.
export function prefetchJob(queryClient, id) {
  if (!id) return;
  import("@/lib/lazyPages").then((m) => m.preloadPage("/jobs/:id")).catch(() => {});
  startJobQueries(queryClient, id);
}

export const customerQuery = (id) => ({
  queryKey: ["customer", id],
  queryFn: async () => { const r = await db.Customer.filter({ id }); return r[0]; },
  staleTime: DETAIL_STALE_MS,
});
export const customerJobsQuery = (id) => ({
  queryKey: ["customer-jobs", id],
  queryFn: () => db.Job.filter({ customer_id: id }, "-created_date"),
  staleTime: DETAIL_STALE_MS,
});

export const customerInvoicesQuery = (id) => ({
  queryKey: ["customer-invoices", id],
  queryFn: () => db.Invoice.filter({ customer_id: id }),
  staleTime: DETAIL_STALE_MS,
});

export function startCustomerQueries(queryClient, id) {
  return [customerQuery(id), customerJobsQuery(id), customerInvoicesQuery(id)]
    .map((q) => queryClient.ensureQueryData(q).catch(() => null));
}

export function prefetchCustomer(queryClient, id) {
  if (!id) return;
  import("@/lib/lazyPages").then((m) => m.preloadPage("/customers/:id")).catch(() => {});
  startCustomerQueries(queryClient, id);
}

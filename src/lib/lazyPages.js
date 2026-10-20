// Feel Phase 3 (speed): route-level code splitting.
//
// Each screen is its own chunk. The data router's route `lazy` loads a
// screen's chunk BEFORE committing the navigation, so the screen you're on
// stays visible until the next one can render — no blank frame and no
// spinner between screens. After the first screen is up, the tab screens and
// the job screen are preloaded while the phone is idle, and the job screen /
// customer screen chunk is also warmed on touch-down on a row.
const loaders = {
  "/": () => import("@/pages/Dashboard"),
  "/customers": () => import("@/pages/Customers"),
  "/customers/new": () => import("@/pages/CustomerForm"),
  "/customers/:id": () => import("@/pages/CustomerDetail"),
  "/customers/:id/edit": () => import("@/pages/CustomerForm"),
  "/customers/:id/membership": () => import("@/pages/MembershipAgreement"),
  "/jobs": () => import("@/pages/Jobs"),
  "/jobs/new": () => import("@/pages/JobForm"),
  "/jobs/:id": () => import("@/pages/JobDetail"),
  "/jobs/:id/edit": () => import("@/pages/JobForm"),
  "/invoices": () => import("@/pages/Invoices"),
  "/invoices/:id": () => import("@/pages/InvoiceDetail"),
  "/invoices/:id/send": () => import("@/pages/InvoicePDF"),
  "/quotes/new": () => import("@/pages/QuoteBuilder"),
  "/quotes/:id": () => import("@/pages/QuoteDetail"),
  "/documents": () => import("@/pages/Documents"),
  "/documents/new": () => import("@/pages/DocumentTemplateForm"),
  "/documents/:id/edit": () => import("@/pages/DocumentTemplateForm"),
  "/documents/fill/:id": () => import("@/pages/DocumentFill"),
  "/catalog": () => import("@/pages/Catalog"),
  "/catalog/documents/new": () => import("@/pages/DocumentTemplateForm"),
  "/catalog/documents/:id": () => import("@/pages/DocumentTemplateForm"),
  "/schedule": () => import("@/pages/Schedule"),
  "/route": () => import("@/pages/RouteMap"),
  "/inbox": () => import("@/pages/Inbox"),
  "/call-list": () => import("@/pages/Inbox"),
  "/finance": () => import("@/pages/Finance"),
  "/settings": () => import("@/pages/Settings"),
  "/referrals": () => import("@/pages/Referrals"),
};

export function hasPage(path) {
  return Object.prototype.hasOwnProperty.call(loaders, path);
}

// Route `lazy` for a route path: resolves to { Component }.
export function lazyRoute(path) {
  const load = loaders[path];
  return () => load().then((m) => ({ Component: m.default }));
}

export function preloadPage(path) {
  const load = loaders[path];
  return load ? load().catch(() => {}) : Promise.resolve();
}

// Most likely next screens. The tab screens are small and are warmed as soon
// as the first screen is idle. The detail screens come later (DETAIL_DELAY_MS):
// the job and invoice screens carry the Stripe payment code, whose script
// download + start-up is the biggest single piece of work in the app — warmed
// right away it lands on top of the tech's first taps (measured: Jobs tab
// 363-872 ms at 4x CPU, vs ~340 when it isn't running). A press on a job row
// still warms the job screen at once (usePressPrefetch).
const TABS = ["/jobs", "/customers", "/schedule", "/inbox", "/catalog", "/"];
const DETAILS = ["/jobs/:id", "/customers/:id", "/jobs/new", "/invoices/:id", "/invoices", "/finance"];
export const DETAIL_DELAY_MS = 4000;

let started = false;
export function preloadLikelyPages() {
  if (started || typeof window === "undefined") return;
  started = true;
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
  const run = (queue) => {
    const next = () => {
      const path = queue.shift();
      if (!path) return;
      preloadPage(path).finally(() => idle(next, { timeout: 2000 }));
    };
    idle(next, { timeout: 2000 });
  };
  run([...TABS]);
  setTimeout(() => run([...DETAILS]), DETAIL_DELAY_MS);
}

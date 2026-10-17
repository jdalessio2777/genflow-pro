// The app's navigation model (feel redesign, Phase 1).
//
// One history stack (the browser's), managed by React Router's data router.
// Every back arrow and the iOS edge swipe do the same thing: pop. When there
// is nothing to pop (cold start, reload landing, a link from outside), back
// goes to the screen's logical PARENT with a replace, so it never dead-ends.
//
// This module also remembers, per history entry, which tab it belongs to
// (a screen belongs to the tab you opened it from), and each tab's last
// screen, so the tab bar can restore it (F-09).
import { matchPath } from "react-router-dom";

export const TAB_ROOTS = {
  home: "/",
  customers: "/customers",
  jobs: "/jobs",
  inbox: "/inbox",
  schedule: "/schedule",
  catalog: "/catalog",
};

const sectionParent = (search) => {
  const p = new URLSearchParams(search || "");
  const section = p.get("section");
  if (!section) return null;
  return p.get("sub") ? `/catalog?section=${section}` : "/catalog";
};

// Route table: logical parent (where back goes when there is no history to
// pop) and the tab the screen belongs to when opened directly. Most specific
// patterns first.
export const ROUTE_META = [
  { path: "/", tab: "home" },
  { path: "/customers", tab: "customers" },
  { path: "/customers/new", parent: "/customers", tab: "customers" },
  { path: "/customers/:id/edit", parent: ({ id }) => `/customers/${id}`, tab: "customers" },
  { path: "/customers/:id/membership", parent: ({ id }) => `/customers/${id}`, tab: "customers" },
  { path: "/customers/:id", parent: "/customers", tab: "customers" },
  { path: "/jobs", tab: "jobs" },
  { path: "/jobs/new", parent: "/jobs", tab: "jobs" },
  { path: "/jobs/:id/edit", parent: ({ id }) => `/jobs/${id}`, tab: "jobs" },
  { path: "/jobs/:id", parent: "/jobs", tab: "jobs" },
  { path: "/invoices", parent: "/", tab: "home" },
  { path: "/invoices/:id/send", parent: ({ id }) => `/invoices/${id}`, tab: "home" },
  { path: "/invoices/:id", parent: "/invoices", tab: "home" },
  { path: "/quotes/new", parent: "/", tab: "home" },
  { path: "/quotes/:id", parent: "/inbox", tab: "inbox" },
  { path: "/documents", parent: "/catalog?section=documents", tab: "catalog" },
  { path: "/documents/new", parent: "/documents", tab: "catalog" },
  { path: "/documents/:id/edit", parent: "/documents", tab: "catalog" },
  { path: "/documents/fill/:id", parent: "/jobs", tab: "jobs" },
  { path: "/catalog", tab: "catalog", parent: (_params, search) => sectionParent(search) },
  { path: "/catalog/documents/new", parent: "/catalog?section=documents", tab: "catalog" },
  { path: "/catalog/documents/:id", parent: "/catalog?section=documents", tab: "catalog" },
  { path: "/schedule", tab: "schedule" },
  { path: "/route", parent: "/", tab: "home" },
  { path: "/inbox", tab: "inbox" },
  { path: "/call-list", parent: "/inbox", tab: "inbox" },
  { path: "/finance", parent: "/", tab: "home" },
  { path: "/settings", parent: "/", tab: "home" },
  { path: "/referrals", parent: "/", tab: "home" },
];

export function routeMetaFor(pathname) {
  for (const meta of ROUTE_META) {
    const m = matchPath({ path: meta.path, end: true }, pathname);
    if (m) return { meta, params: m.params };
  }
  return null;
}

// Logical parent of a location ({ pathname, search }) or null (tab root).
export function parentFor(location) {
  const found = routeMetaFor(location.pathname);
  if (!found) return "/";
  const { meta, params } = found;
  if (typeof meta.parent === "function") return meta.parent(params, location.search);
  return meta.parent ?? null;
}

export function defaultTabFor(pathname) {
  return routeMetaFor(pathname)?.meta.tab ?? "home";
}

export function isTabRoot(pathname) {
  return Object.values(TAB_ROOTS).includes(pathname);
}

// ── Per-entry memory (sessionStorage: survives reloads of the same tab) ────
const KEY = "gf-nav-v1";
let store = load();
function load() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (s && typeof s === "object" && s.entries && s.tabLast) return s;
  } catch { /* storage unavailable */ }
  return { entries: {}, tabLast: {} };
}
function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

export const historyIdx = () => {
  const idx = typeof window !== "undefined" ? window.history.state?.idx : 0;
  return Number.isInteger(idx) ? idx : 0;
};

export const entryAt = (idx) => store.entries[idx] || null;
export const currentEntry = () => entryAt(historyIdx());
export const tabLast = (tab) => store.tabLast[tab] || null;

// The entry a back press would land on, skipping the current sheet entry.
export function previousEntry(location) {
  const steps = location?.state?.__sheet ? 2 : 1;
  const idx = historyIdx() - steps;
  return idx >= 0 ? { entry: entryAt(idx), steps } : null;
}

// Set by the tab bar right before it navigates, so the new entry belongs to
// the tapped tab instead of the tab it was pushed from.
let pendingTab = null;
export const setPendingTab = (tab) => { pendingTab = tab; };

// Called by the router subscriber after every completed navigation.
export function recordNavigation(action, location) {
  const idx = historyIdx();
  const path = location.pathname + (location.search || "");
  const prev = store.entries[idx];
  let tab;
  if (pendingTab) tab = pendingTab;
  else if (action === "PUSH") tab = store.entries[idx - 1]?.tab;
  // POP / page load: trust the stored entry only if it is this same screen
  // (a new page load reuses idx 0); REPLACE keeps the entry's tab.
  else if (action === "REPLACE") tab = prev?.tab;
  else if (prev && prev.path.split("?")[0] === location.pathname) tab = prev.tab;
  if (!tab) tab = defaultTabFor(location.pathname);
  pendingTab = null;
  if (action === "PUSH") {
    for (const k of Object.keys(store.entries)) if (Number(k) > idx) delete store.entries[k];
  }
  store.entries[idx] = { path, tab, sheet: !!location.state?.__sheet };
  if (!location.state?.__sheet) store.tabLast[tab] = path;
  save();
}

// ── Navigations in flight (POPs are async: history.go fires popstate later) ─
// Cleared when the location changes; expires after 1.5 s in case a
// navigation never lands (e.g. held by the unsaved-changes prompt).
let inFlightAt = 0;
const settledListeners = new Set();
export const markNavigating = () => { inFlightAt = Date.now(); };
export const isNavigating = () => inFlightAt > 0 && Date.now() - inFlightAt < 1500;
export function markSettled() {
  inFlightAt = 0;
  settledListeners.forEach(fn => fn());
}
export function onSettled(fn) {
  settledListeners.add(fn);
  return () => settledListeners.delete(fn);
}

// The app's data router (set once in src/router.jsx). Kept here, not
// imported, so UI modules can reach it without an import cycle.
let appRouter = null;
export const setAppRouter = (r) => { appRouter = r; };
export const getAppRouter = () => appRouter;

// For tests only.
export function __resetNavigationStore() {
  store = { entries: {}, tabLast: {} };
  pendingTab = null;
  inFlightAt = 0;
  save();
}

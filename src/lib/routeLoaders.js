// Feel Phase 3 (speed): keep the current screen up while the next one's data
// loads, instead of switching to a spinner.
//
// Each main screen's route loader asks React Query for the data that screen
// shows first (ensureQueryData: instant when it's cached, even if stale — the
// screen then refreshes it in the background). The navigation commits when
// that data is in, or after HOLD_MS at most, so a slow network never makes a
// tap feel ignored: past HOLD_MS the next screen appears with its
// placeholders, as before.
import { queryClientInstance } from "@/lib/query-client";
import {
  jobsListQuery, customersListQuery, invoicesListQuery,
  startJobQueries, startCustomerQueries,
} from "@/lib/queries";

export const HOLD_MS = 350;

// Loaders do nothing until the signed-in session is up (AuthGate calls
// setLoadersReady): a request sent before the session is restored would run
// as anonymous, get [] back from row-level security, and cache it.
let ready = false;
export function setLoadersReady(v) { ready = !!v; }

function holdFor(promises) {
  return Promise.race([Promise.all(promises), new Promise((r) => setTimeout(r, HOLD_MS))]).then(() => null);
}
function hold(queries) {
  if (!ready) return null;
  return holdFor(queries.map((q) => queryClientInstance.ensureQueryData(q).catch(() => null)));
}

const LOADERS = {
  "/": () => hold([jobsListQuery(100), customersListQuery("name"), invoicesListQuery(100)]),
  "/jobs": () => hold([jobsListQuery(200), customersListQuery("name")]),
  // The job screen's other data (documents, photos, customer, history) starts
  // loading at the same time; only the main records are waited for.
  "/jobs/:id": ({ params }) => (ready ? holdFor(startJobQueries(queryClientInstance, params.id)) : null),
  "/customers": () => hold([customersListQuery("-created_date")]),
  "/customers/:id": ({ params }) => (ready ? holdFor(startCustomerQueries(queryClientInstance, params.id)) : null),
  "/schedule": () => hold([jobsListQuery(200)]),
  "/inbox": () => hold([jobsListQuery(200), customersListQuery("name")]),
  "/invoices": () => hold([invoicesListQuery(null)]),
};

export function loaderFor(path) {
  return LOADERS[path];
}

// Only a change of screen (pathname) re-runs a loader — not list state held
// in the URL (search box, tab, filter), so typing never waits on a loader.
export function shouldRevalidate({ currentUrl, nextUrl }) {
  return currentUrl.pathname !== nextUrl.pathname;
}

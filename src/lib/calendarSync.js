// The one entry point every job save / reschedule / cancel / delete calls for
// Google Calendar (B1-B3). It never throws and never blocks a save; it returns
// { status: "synced" | "removed" | "skipped" | "failed" | "pending", reason?, eventId? }.
//
// B3 behaviour:
// - One event per job on the user's Jobs calendar (Settings → "Jobs calendar";
//   default: the shared "GenShield Schedule" calendar when the user can write
//   to it, else their primary calendar).
// - Before creating, the job's event is looked for by its stored id, then by
//   the GenFlow marker, then an assistant / old-app event for the same customer
//   on the same date is ADOPTED (moved to the Jobs calendar and updated) — in
//   the Jobs calendar AND the primary calendar. Nothing else is ever touched.
// - Cancel / delete REMOVES the job's event (only an event carrying this job's
//   marker is ever deleted).
// - No Google access → nothing is lost: the job id is queued on this device,
//   a non-blocking "Calendar not updated — reconnect Google" banner shows
//   (CalendarSyncBanner) and the queue is retried after reconnecting.
import {
  buildEvent, belongsToJob, isAdoptableFor, genflowJobIdOf, JOBS_CALENDAR_NAME,
  listWritableCalendars, getEvent, findEventsForJobMarker, listEventsAround,
  insertEvent, patchEvent, moveEvent, deleteEvent,
} from "@/lib/googleCalendar";
import { getAccessToken, invalidateAccessToken, googleConnection, onGoogleTokenChange } from "@/lib/googleTokenStore";
import { db } from "@/lib/db";
import { toast } from "sonner";

const AWAIT_MS = 8000; // callers wait at most this long; the sync itself carries on
const CANCELED = ["canceled", "cancelled"];

// Kept for AuthContext's old wiring; tokens now live in googleTokenStore.
export function setCalendarAccessToken() {}

// ── per-user Jobs calendar choice (localStorage; no schema change) ──────────
export const CHOICE_KEY = "genflow_jobs_calendar_v1";
const AUTO = "auto";
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const userKey = () => googleConnection().email || "default";

export function getJobsCalendarChoice() { return readJson(CHOICE_KEY, {})[userKey()] || AUTO; }
export function setJobsCalendarChoice(calendarId) {
  const all = readJson(CHOICE_KEY, {});
  all[userKey()] = calendarId || AUTO;
  writeJson(CHOICE_KEY, all);
  calendarsCache = null;
}

let calendarsCache = null; // { at, token, list }
export async function getWritableCalendars(token, { fresh = false } = {}) {
  if (!fresh && calendarsCache && calendarsCache.token === token && Date.now() - calendarsCache.at < 10 * 60e3) return calendarsCache.list;
  const list = await listWritableCalendars(token);
  calendarsCache = { at: Date.now(), token, list };
  return list;
}

export function defaultJobsCalendar(list) {
  const shared = list.find(c => String(c.name).trim().toLowerCase() === JOBS_CALENDAR_NAME.toLowerCase());
  return shared || list.find(c => c.primary) || { id: "primary", name: "Primary calendar", primary: true };
}

// The calendar new events go to: the user's choice if they can still write to
// it, else "GenShield Schedule", else primary.
export async function resolveJobsCalendar(token) {
  const list = await getWritableCalendars(token);
  const choice = getJobsCalendarChoice();
  const chosen = choice !== AUTO && list.find(c => c.id === choice);
  return chosen || defaultJobsCalendar(list);
}

// ── status for the banner ───────────────────────────────────────────────────
let status = { state: "ok" };
const statusListeners = new Set();
export function getCalendarStatus() { return status; }
export function onCalendarStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(next) { status = { ...next, at: Date.now() }; statusListeners.forEach(fn => { try { fn(status); } catch { /* ignore */ } }); }

// ── pending queue (this device) ─────────────────────────────────────────────
export const PENDING_KEY = "genflow_calendar_pending_v1";
export function pendingCalendarOps() { return readJson(PENDING_KEY, []); }
function queue(op) {
  const list = pendingCalendarOps().filter(p => p.jobId !== op.jobId);
  list.push({ ...op, at: new Date().toISOString() });
  writeJson(PENDING_KEY, list.slice(-50));
}
function unqueue(jobId) { writeJson(PENDING_KEY, pendingCalendarOps().filter(p => p.jobId !== jobId)); }

// ── helpers ─────────────────────────────────────────────────────────────────
const known = new Map(); // jobId → { eventId, calendarId } learned this session
const chains = new Map(); // jobId → promise: one calendar operation per job at a time

function serialize(jobId, fn) {
  const prev = chains.get(jobId) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  chains.set(jobId, next);
  next.finally(() => { if (chains.get(jobId) === next) chains.delete(jobId); }).catch(() => {});
  return next;
}

function withCap(promise) {
  let timer;
  const cap = new Promise(resolve => { timer = setTimeout(() => resolve({ status: "pending", reason: "still syncing" }), AWAIT_MS); });
  return Promise.race([promise, cap]).finally(() => clearTimeout(timer));
}

const uniq = arr => [...new Set(arr.filter(Boolean))];

// Runs fn(token); on a 401 forgets that token, refreshes once and retries.
async function withToken(fn) {
  let t = await getAccessToken();
  if (!t.token) return { noToken: t };
  try {
    return { value: await fn(t.token) };
  } catch (e) {
    if (e?.status !== 401) throw e;
    invalidateAccessToken(t.token);
    t = await getAccessToken();
    if (!t.token) return { noToken: t };
    return { value: await fn(t.token) };
  }
}

function reportNoToken(t, jobLabel) {
  const serverConfig = t.code === "server_config";
  setStatus({
    state: "reconnect",
    message: serverConfig
      ? "Calendar not updated — Google sign-in needs to be renewed (server settings)."
      : "Calendar not updated — reconnect Google",
    detail: t.reason, job: jobLabel,
  });
}

function reportError(e, jobLabel) {
  const forbidden = e?.status === 403 || e?.status === 404;
  setStatus({
    state: "error",
    message: forbidden ? "Calendar not updated — no permission on the Jobs calendar (check Settings)" : "Calendar not updated — will retry",
    detail: e?.message, job: jobLabel,
  });
}

async function customerFor(job, customer) {
  if (customer) return customer;
  if (!job?.customer_id) return null;
  try { return (await db.Customer.filter({ id: job.customer_id }))[0] || null; } catch { return null; }
}

// Finds this job's existing event: stored id → marker search → adoptable event.
export async function findJobEvent(token, job, customerName, targetId) {
  const calendars = uniq([targetId, "primary"]);
  const stored = known.get(job.id) || (job.calendar_event_id ? { eventId: job.calendar_event_id, calendarId: job.calendar_id } : null);
  if (stored?.eventId) {
    for (const c of uniq([stored.calendarId, ...calendars])) {
      const e = await getEvent(token, c, stored.eventId);
      if (e && belongsToJob(e, job, customerName)) return { calendarId: c, event: e };
    }
  }
  for (const c of calendars) {
    const hit = (await findEventsForJobMarker(token, c, job.id)).find(e => e.status !== "cancelled" && genflowJobIdOf(e) === String(job.id));
    if (hit) return { calendarId: c, event: hit };
  }
  for (const c of calendars) {
    const hit = (await listEventsAround(token, c, job.scheduled_date)).find(e => isAdoptableFor(e, job, customerName));
    if (hit) return { calendarId: c, event: hit, adopted: true };
  }
  return null;
}

async function saveLink(job, eventId, calendarId) {
  known.set(job.id, { eventId, calendarId });
  if (job.calendar_event_id === eventId && (!("calendar_id" in job) || job.calendar_id === calendarId)) return;
  const patch = { calendar_event_id: eventId, last_synced_at: new Date().toISOString() };
  if ("calendar_id" in job) patch.calendar_id = calendarId; // only once the B3 column exists
  try { await db.Job.update(job.id, patch); } catch { /* the marker search still finds it next time */ }
}

async function doSync(job, customer) {
  const label = customer?.name || job.customer_name || "job";
  try {
    const r = await withToken(async (token) => {
      const target = await resolveJobsCalendar(token);
      const name = customer?.name || job.customer_name || "";
      const body = buildEvent(job, customer);
      let found = await findJobEvent(token, job, name, target.id);
      if (found && found.calendarId !== target.id && !(found.calendarId === "primary" && target.primary)) {
        // Adopted / old event in the primary calendar: move it to the Jobs calendar.
        try {
          const moved = await moveEvent(token, found.calendarId, found.event.id, target.id);
          found = { ...found, calendarId: target.id, event: moved || found.event };
        } catch { /* keep it where it is and just update it */ }
      }
      const saved = found
        ? await patchEvent(token, found.calendarId, found.event.id, body)
        : await insertEvent(token, target.id, body);
      const calendarId = found ? found.calendarId : target.id;
      await saveLink(job, saved?.id || found?.event.id, calendarId);
      return { eventId: saved?.id || found?.event.id, calendarId, action: found ? (found.adopted ? "adopted" : "updated") : "created" };
    });
    if (r.noToken) {
      queue({ op: "sync", jobId: job.id });
      reportNoToken(r.noToken, label);
      return { status: "skipped", reason: r.noToken.reason, code: r.noToken.code };
    }
    unqueue(job.id);
    if (status.state !== "ok" && pendingCalendarOps().length === 0) setStatus({ state: "ok" });
    toast.success(r.value.action === "created" ? "Added to Google Calendar" : "Google Calendar updated", { duration: 2000 });
    return { status: "synced", ...r.value };
  } catch (e) {
    queue({ op: "sync", jobId: job.id });
    reportError(e, label);
    return { status: "failed", reason: e?.message };
  }
}

async function doRemove(job) {
  const label = job.customer_name || "job";
  try {
    const r = await withToken(async (token) => {
      let target = null;
      try { target = await resolveJobsCalendar(token); } catch { /* still try stored + primary */ }
      const stored = known.get(job.id) || (job.calendar_event_id ? { eventId: job.calendar_event_id, calendarId: job.calendar_id } : null);
      const calendars = uniq([stored?.calendarId, target?.id, "primary"]);
      let removed = 0;
      if (stored?.eventId) {
        for (const c of calendars) {
          const e = await getEvent(token, c, stored.eventId);
          // Only an event carrying THIS job's marker is ever deleted.
          if (e && e.status !== "cancelled" && genflowJobIdOf(e) === String(job.id)) { await deleteEvent(token, c, e.id); removed++; break; }
        }
      }
      for (const c of uniq([target?.id, "primary"])) {
        for (const e of await findEventsForJobMarker(token, c, job.id)) {
          if (e.status !== "cancelled" && genflowJobIdOf(e) === String(job.id)) { await deleteEvent(token, c, e.id); removed++; }
        }
      }
      return removed;
    });
    if (r.noToken) {
      queue({ op: "remove", jobId: job.id, eventId: job.calendar_event_id || known.get(job.id)?.eventId || null, calendarId: job.calendar_id || known.get(job.id)?.calendarId || null, customerName: job.customer_name || null });
      reportNoToken(r.noToken, label);
      return { status: "skipped", reason: r.noToken.reason, code: r.noToken.code };
    }
    known.delete(job.id);
    unqueue(job.id);
    if (job.calendar_event_id) db.Job.update(job.id, { calendar_event_id: null }).catch(() => {}); // job may already be deleted
    if (status.state !== "ok" && pendingCalendarOps().length === 0) setStatus({ state: "ok" });
    if (r.value > 0) toast.success("Removed from Google Calendar", { duration: 2000 });
    return { status: r.value > 0 ? "removed" : "skipped", reason: r.value > 0 ? undefined : "no event" };
  } catch (e) {
    queue({ op: "remove", jobId: job.id, eventId: job.calendar_event_id || null, calendarId: job.calendar_id || null, customerName: job.customer_name || null });
    reportError(e, label);
    return { status: "failed", reason: e?.message };
  }
}

// ── public interface ────────────────────────────────────────────────────────
export function syncJobToCalendar({ job, customer } = {}) {
  try {
    if (!job?.id) return Promise.resolve({ status: "skipped", reason: "no job" });
    if (CANCELED.includes(job.status)) return removeJobFromCalendar({ job });
    if (!job.scheduled_date) {
      if (job.calendar_event_id || known.has(job.id)) return removeJobFromCalendar({ job });
      return Promise.resolve({ status: "skipped", reason: "not scheduled" });
    }
    const run = serialize(job.id, async () => doSync(job, await customerFor(job, customer)));
    return withCap(run).catch(e => ({ status: "failed", reason: e?.message }));
  } catch (e) {
    return Promise.resolve({ status: "failed", reason: e?.message });
  }
}

export function removeJobFromCalendar({ job } = {}) {
  try {
    if (!job?.id) return Promise.resolve({ status: "skipped", reason: "no job" });
    const run = serialize(job.id, () => doRemove(job));
    return withCap(run).catch(e => ({ status: "failed", reason: e?.message }));
  } catch (e) {
    return Promise.resolve({ status: "failed", reason: e?.message });
  }
}

// Retries everything queued on this device (after a reconnect, or Retry).
let retrying = null;
export function retryPendingCalendarSync() {
  if (retrying) return retrying;
  retrying = (async () => {
    const ops = pendingCalendarOps();
    let done = 0;
    for (const op of ops) {
      if (op.op === "remove") {
        const r = await removeJobFromCalendar({ job: { id: op.jobId, calendar_event_id: op.eventId, calendar_id: op.calendarId, customer_name: op.customerName } });
        if (r.status === "removed" || r.status === "skipped" && r.reason === "no event") done++;
        else if (r.code) break; // still no Google access
      } else {
        let job = null;
        try { job = (await db.Job.filter({ id: op.jobId }))[0]; } catch { break; }
        if (!job) { unqueue(op.jobId); continue; }
        const r = await syncJobToCalendar({ job });
        if (r.status === "synced" || r.status === "removed") done++;
        else if (r.code) break;
      }
    }
    if (pendingCalendarOps().length === 0 && status.state !== "ok") setStatus({ state: "ok" });
    return done;
  })().finally(() => { retrying = null; });
  return retrying;
}

// A fresh Google sign-in on this device → push whatever was waiting.
onGoogleTokenChange(rec => { if (rec?.accessToken && pendingCalendarOps().length) retryPendingCalendarSync(); });

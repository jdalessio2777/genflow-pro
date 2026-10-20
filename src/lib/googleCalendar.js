// Google Calendar API + the pure rules for GenFlow job events (B3).
//
// The jobs calendar ("GenShield Schedule") is shared and also holds other
// GenShield tasks, so the app only ever touches events that belong to a GenFlow
// job: an event is ours when it carries the job's marker
// (extendedProperties.private.genflowJobId, or the older "GENFLOW_JOB_ID:<id>"
// line in the description). Events the assistant made from confirmation emails
// and the old app's "GenShield Generator Service Appointment" events are
// ADOPTED only when they're for the same customer on the same date; anything
// else (a generic task, another job's event) is never modified or deleted.
import { estimateMinutes } from "@/lib/jobDuration";

export const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const TIME_ZONE = "America/New_York";
// The link in each event always points at production: events live for months in
// a shared calendar, Preview URLs don't.
export const APP_ORIGIN = "https://genflow-pro.vercel.app";
export const JOBS_CALENDAR_NAME = "GenShield Schedule";
export const ASSISTANT_PREFIX = "GenShield job (added from the appointment confirmation email)";
export const OLD_APP_TITLE = "GenShield Generator Service Appointment";

const JOB_TYPE_LABELS = {
  maintenance: "Maintenance",
  diagnostic_repair: "Diagnostic/Repair",
  emergency: "Emergency",
  battery_replacement: "Battery Replacement",
  warranty: "Warranty",
  quote: "Quote",
  inspection: "Inspection",
  other: "Service",
};

export function serviceTypeLabel(jobType) {
  if (!jobType) return "Service";
  return JOB_TYPE_LABELS[jobType] || String(jobType).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function techFirstName(job) {
  return String(job?.assigned_to_name || "").trim().split(/\s+/)[0] || "Unassigned";
}

// Jeremy = Blueberry (9), Alex = Basil (10), anyone else = Graphite (8).
export function techColorId(job) {
  const t = techFirstName(job).toLowerCase();
  if (t === "jeremy") return "9";
  if (t === "alex") return "10";
  return "8";
}

export function jobLink(jobId) { return `${APP_ORIGIN}/jobs/${jobId}`; }

function generatorText(customer) {
  if (!customer) return "";
  const kw = customer.generator_kw ? `${String(customer.generator_kw).replace(/\s*kw$/i, "")}kW` : "";
  return [customer.generator_brand, customer.generator_model, kw].filter(Boolean).join(" ")
    + (customer.generator_serial ? ` (S/N ${customer.generator_serial})` : "");
}

export function buildEvent(job, customer) {
  const start = new Date(job.scheduled_date);
  const end = new Date(start.getTime() + estimateMinutes(job) * 60 * 1000);
  const customerName = customer?.name || job.customer_name || "Customer";
  const type = serviceTypeLabel(job.job_type);
  const service = [job.title, job.customer_description].filter(Boolean).join(" — ") || type;
  const description = [
    `Service: ${service}`,
    `Generator: ${[generatorText(customer), job.generator_notes].filter(Boolean).join(" — ") || "—"}`,
    `Notes: ${job.notes || "—"}`,
    `Customer phone: ${customer?.phone || "—"}`,
    `Open in GenFlow: ${jobLink(job.id)}`,
    "",
    `GENFLOW_JOB_ID:${job.id}`,
  ].join("\n");
  return {
    summary: `${type} — ${customerName} (${techFirstName(job)})`,
    description,
    location: customer?.address || "",
    start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
    colorId: techColorId(job),
    extendedProperties: { private: { genflowJobId: String(job.id), genflowApp: "genflow-pro" } },
  };
}

// ── which events are ours ──────────────────────────────────────────────────

export function genflowJobIdOf(event) {
  const p = event?.extendedProperties?.private?.genflowJobId;
  if (p) return String(p);
  const m = String(event?.description || "").match(/GENFLOW_JOB_ID:([A-Za-z0-9-]+)/);
  return m ? m[1] : null;
}

export function nyDate(value) {
  if (!value) return null;
  // All-day events carry a plain date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Every word of the customer's name (2+ letters) appears in the title or description.
export function mentionsCustomer(event, customerName) {
  const words = norm(customerName).split(" ").filter(w => w.length >= 2);
  if (!words.length) return false;
  const hay = ` ${norm(`${event?.summary || ""} ${event?.description || ""}`)} `;
  return words.every(w => hay.includes(` ${w} `));
}

export function isAssistantOrOldAppEvent(event) {
  return String(event?.description || "").trimStart().startsWith(ASSISTANT_PREFIX)
    || String(event?.summary || "").trim().toLowerCase().startsWith(OLD_APP_TITLE.toLowerCase());
}

// An existing event we may take over for this job instead of creating a new one.
export function isAdoptableFor(event, job, customerName) {
  if (!event || event.status === "cancelled") return false;
  const owner = genflowJobIdOf(event);
  if (owner) return owner === String(job.id); // another job's event: never
  if (!isAssistantOrOldAppEvent(event)) return false; // generic task: never
  const startOf = event.start?.dateTime || event.start?.date;
  return nyDate(startOf) === nyDate(job.scheduled_date) && mentionsCustomer(event, customerName);
}

// An event we found by a stored id may be updated only if it is this job's.
export function belongsToJob(event, job, customerName) {
  if (!event || event.status === "cancelled") return false;
  const owner = genflowJobIdOf(event);
  if (owner) return owner === String(job.id);
  return isAdoptableFor(event, job, customerName);
}

// ── API ────────────────────────────────────────────────────────────────────

export class GoogleApiError extends Error {
  constructor(status, message) { super(`${status}: ${message}`); this.status = status; }
}

async function call(token, method, path, { query, body } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : "";
  const res = await fetch(`${CALENDAR_API}${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleApiError(res.status, data?.error?.message || `Calendar API error ${res.status}`);
  return data;
}

const cal = id => `/calendars/${encodeURIComponent(id)}`;
const ev = (calId, eventId) => `${cal(calId)}/events/${encodeURIComponent(eventId)}`;

// Calendars this user can add events to (owner/writer).
export async function listWritableCalendars(token) {
  const data = await call(token, "GET", "/users/me/calendarList", { query: { minAccessRole: "writer", maxResults: "250" } });
  return (data?.items || [])
    .filter(c => c.accessRole === "owner" || c.accessRole === "writer")
    .map(c => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary, accessRole: c.accessRole }));
}

export async function getEvent(token, calendarId, eventId) {
  try { return await call(token, "GET", ev(calendarId, eventId)); }
  catch (e) { if (e.status === 404 || e.status === 410) return null; throw e; }
}

export async function listEvents(token, calendarId, query) {
  const data = await call(token, "GET", `${cal(calendarId)}/events`, { query: { singleEvents: "true", maxResults: "250", ...query } });
  return data?.items || [];
}

export async function findEventsForJobMarker(token, calendarId, jobId) {
  return listEvents(token, calendarId, { privateExtendedProperty: `genflowJobId=${jobId}`, showDeleted: "false" });
}

export async function listEventsAround(token, calendarId, iso) {
  const t = new Date(iso).getTime();
  return listEvents(token, calendarId, {
    timeMin: new Date(t - 20 * 3600e3).toISOString(),
    timeMax: new Date(t + 20 * 3600e3).toISOString(),
  });
}

// sendUpdates=none: never email anyone.
export async function insertEvent(token, calendarId, body) {
  return call(token, "POST", `${cal(calendarId)}/events`, { query: { sendUpdates: "none" }, body });
}

export async function patchEvent(token, calendarId, eventId, body) {
  return call(token, "PATCH", ev(calendarId, eventId), { query: { sendUpdates: "none" }, body });
}

export async function moveEvent(token, fromCalendarId, eventId, toCalendarId) {
  return call(token, "POST", `${ev(fromCalendarId, eventId)}/move`, { query: { destination: toCalendarId, sendUpdates: "none" } });
}

export async function deleteEvent(token, calendarId, eventId) {
  try { await call(token, "DELETE", ev(calendarId, eventId), { query: { sendUpdates: "none" } }); }
  catch (e) { if (e.status === 404 || e.status === 410) return; throw e; }
}

// Events moved/edited in Google since `since`, ONLY GenFlow job events.
export async function getRecentCalendarChanges(token, sinceTimestamp, calendarId = "primary") {
  const updatedMin = sinceTimestamp
    ? new Date(sinceTimestamp).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const items = await listEvents(token, calendarId, { updatedMin, orderBy: "updated" });
  return items.reduce((acc, event) => {
    const jobId = genflowJobIdOf(event);
    if (jobId && event.status !== "cancelled") {
      acc.push({
        jobId,
        newStartTime: event.start?.dateTime || event.start?.date,
        newEndTime: event.end?.dateTime || event.end?.date,
        calendarEventId: event.id,
        calendarId,
      });
    }
    return acc;
  }, []);
}

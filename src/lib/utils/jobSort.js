// One shared ordering for every job list in the app (Jobs tabs, Dashboard,
// Schedule, Route map, Customer job history, Job > previous jobs).
//
// Rules (calendar days are America/New_York, the business's timezone):
//   1. Open jobs (anything not completed / invoiced / canceled):
//        a. overdue first (scheduled on an ET day before today), oldest first
//        b. then today and future, soonest first by date AND time
//        c. then jobs with no date
//   2. Closed jobs (completed / invoiced / canceled): most recent first
//      (completed_date, else scheduled_date, else created date).
//   A list that mixes both always shows open jobs above closed ones.
//   Ties: created date (older first for open jobs, newer first for closed).
//
// scheduled_date is a single timestamptz (date + time), so comparing the
// instants orders by date and time together; DST is handled because both
// sides are absolute instants. Only the "which ET day is it?" question needs
// the timezone, which is what etDateKey answers.

export const BUSINESS_TZ = "America/New_York";

const CLOSED_STATUSES = new Set(["completed", "invoiced", "canceled", "cancelled"]);

export function isClosedJob(job) {
  return CLOSED_STATUSES.has(job?.status);
}

function toMs(value) {
  if (value == null || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

const etKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "YYYY-MM-DD" of the ET calendar day an instant falls on, or null.
export function etDateKey(value) {
  const ms = toMs(value);
  return ms == null ? null : etKeyFormatter.format(new Date(ms));
}

// "YYYY-MM-DD" for a calendar cell built from local Date parts (Schedule
// grid days). The cell represents a calendar day, not an instant.
export function localDateKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isJobOverdue(job, now = new Date()) {
  if (!job || isClosedJob(job)) return false;
  const key = etDateKey(job.scheduled_date);
  return key != null && key < etDateKey(now);
}

function createdMs(job) {
  return toMs(job.created_date ?? job.created_at) ?? 0;
}

function closedRecencyMs(job) {
  return toMs(job.completed_date) ?? toMs(job.scheduled_date) ?? createdMs(job);
}

// 0 overdue, 1 today/future, 2 open with no date, 3 closed.
function group(job, todayKey) {
  if (isClosedJob(job)) return 3;
  const key = etDateKey(job.scheduled_date);
  if (key == null) return 2;
  return key < todayKey ? 0 : 1;
}

export function compareJobs(a, b, now = new Date()) {
  const todayKey = etDateKey(now);
  const ga = group(a, todayKey);
  const gb = group(b, todayKey);
  if (ga !== gb) return ga - gb;
  if (ga === 3) {
    return closedRecencyMs(b) - closedRecencyMs(a) || createdMs(b) - createdMs(a);
  }
  if (ga !== 2) {
    const d = toMs(a.scheduled_date) - toMs(b.scheduled_date);
    if (d !== 0) return d;
  }
  return createdMs(a) - createdMs(b);
}

// Returns a new sorted array; never mutates the input (React Query data).
export function sortJobs(jobs, now = new Date()) {
  return [...(jobs || [])].sort((a, b) => compareJobs(a, b, now));
}

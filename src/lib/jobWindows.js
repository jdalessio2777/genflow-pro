// Which open jobs count as "current workload" versus "upcoming" (B4).
//
// Jobs booked far ahead (e.g. next year's maintenance renewal) clutter the
// Jobs > Active list and inflate the Dashboard's Active Jobs count. They go to
// Jobs > Upcoming instead and move back into Active on their own once they
// are within the window — this is computed at render from the current date,
// nothing is written to the job.
//
// The rule, in calendar days in the business timezone (America/New_York, the
// same days etDateKey / isJobOverdue use):
//
//   An open job is "far future" when the ET calendar day of its
//   scheduled_date is AFTER (today's ET day + UPCOMING_AFTER_DAYS).
//
//   Today Oct 21: Dec 5 (day 45) stays Active; Dec 6 (day 46) is Upcoming.
//   The time of day never matters; only the ET calendar day does.
//
// Everything else is untouched: overdue, today, days 1-45, jobs with no date
// ("Not scheduled") and closed jobs (completed / invoiced / canceled) are never
// far future. The day arithmetic is done on "YYYY-MM-DD" keys in UTC, so DST
// changes cannot shift the boundary by a day.

import { etDateKey, isClosedJob, sortJobs } from "@/lib/utils/jobSort";

export const UPCOMING_AFTER_DAYS = 45;

// Statuses shown on Jobs > Active / Dashboard Active Jobs.
export const ACTIVE_STATUSES = ["scheduled", "dispatched", "on_site", "in_progress"];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// ET day key of a scheduled_date. scheduled_date is a timestamptz, but a bare
// "YYYY-MM-DD" is taken as that calendar day as written (Date.parse would read
// it as UTC midnight, which is the previous evening in ET).
export function scheduledDayKey(value) {
  if (typeof value === "string" && DATE_ONLY.test(value)) return value;
  return etDateKey(value);
}

// "YYYY-MM-DD" + n calendar days.
export function addDaysToKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// Last ET day that still counts as Active (today + UPCOMING_AFTER_DAYS).
export function activeWindowEndKey(now = new Date()) {
  return addDaysToKey(etDateKey(now), UPCOMING_AFTER_DAYS);
}

export function isFarFuture(job, now = new Date()) {
  if (!job || isClosedJob(job)) return false;
  const key = scheduledDayKey(job.scheduled_date);
  if (key == null) return false;
  return key > activeWindowEndKey(now);
}

export function isActiveStatus(job) {
  return ACTIVE_STATUSES.includes(job?.status);
}

// Open jobs (ACTIVE_STATUSES) split into current workload and far-future.
// Both lists are sorted with the app's shared order (sortJobs), so upcoming
// is soonest first.
export function splitActive(jobs, now = new Date()) {
  const active = [];
  const upcoming = [];
  for (const j of jobs || []) {
    if (!isActiveStatus(j)) continue;
    (isFarFuture(j, now) ? upcoming : active).push(j);
  }
  return { active: sortJobs(active, now), upcoming: sortJobs(upcoming, now) };
}

// Estimated time on site (B2), in minutes. Until a job has its own estimate
// (or the estimated_minutes column exists) everything uses 2 hours.
export const DEFAULT_ESTIMATE_MINUTES = 120;
export const FULL_DAY_MINUTES = 480;

export const ESTIMATE_QUICK_PICKS = [
  { minutes: 60, label: "1 hr" },
  { minutes: 90, label: "1.5 hr" },
  { minutes: 120, label: "2 hr" },
  { minutes: 180, label: "3 hr" },
  { minutes: 240, label: "4 hr" },
  { minutes: FULL_DAY_MINUTES, label: "Full day" },
];

export function estimateMinutes(job) {
  const m = Number(job?.estimated_minutes);
  return Number.isFinite(m) && m > 0 ? m : DEFAULT_ESTIMATE_MINUTES;
}

// "about 2 hours", "about 1.5 hours", "about 1 hour", "a full day"
export function formatEstimate(minutes) {
  const m = Number(minutes) > 0 ? Number(minutes) : DEFAULT_ESTIMATE_MINUTES;
  if (m >= FULL_DAY_MINUTES) return "a full day";
  const h = Math.round((m / 60) * 4) / 4;
  if (h < 1) return `about ${m} minutes`;
  return `about ${h} ${h === 1 ? "hour" : "hours"}`;
}

// Custom value typed by the tech, in hours ("2.5", "3") -> minutes, or null.
export function minutesFromHoursInput(text) {
  const h = Number(String(text ?? "").trim().replace(",", "."));
  if (!Number.isFinite(h) || h <= 0 || h > 24) return null;
  return Math.round(h * 60);
}

export function estimateLabel(minutes) {
  const m = Number(minutes) > 0 ? Number(minutes) : DEFAULT_ESTIMATE_MINUTES;
  const pick = ESTIMATE_QUICK_PICKS.find(p => p.minutes === m);
  if (pick) return pick.label;
  const h = Math.round((m / 60) * 100) / 100;
  return `${h} hr`;
}

// The job as the confirmation email / calendar should see it: the saved row
// plus the picked estimate even when the column couldn't store it. The
// interim calendar code reads estimated_duration (hours), so both are set.
export function jobWithEstimate(job, minutes) {
  const m = Number(minutes) > 0 ? Math.round(Number(minutes)) : estimateMinutes(job);
  return { ...job, estimated_minutes: m, estimated_duration: m / 60 };
}

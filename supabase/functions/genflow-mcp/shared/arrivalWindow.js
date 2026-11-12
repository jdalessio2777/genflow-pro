// Arrival windows (Run 12, A2). A job's window is stored as two real times:
//   jobs.scheduled_date      = window start (or the exact time)
//   jobs.arrival_window_end  = window end; empty = an exact-time job
// so sorting, the day views and every older job keep working untouched.
// Pure, no app imports (also used on the server). Times are business time (ET).
export const TIME_ZONE = "America/New_York";

export const WINDOW_PRESETS = [
  { key: "08-10", start: "08:00", end: "10:00", label: "8–10 AM" },
  { key: "10-12", start: "10:00", end: "12:00", label: "10 AM–12 PM" },
  { key: "12-14", start: "12:00", end: "14:00", label: "12–2 PM" },
  { key: "14-16", start: "14:00", end: "16:00", label: "2–4 PM" },
  { key: "16-18", start: "16:00", end: "18:00", label: "4–6 PM" },
];
export const MODE_CUSTOM = "custom";
export const MODE_EXACT = "exact";

function tzOffsetMs(utcMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}

// "YYYY-MM-DD" + "HH:MM" in ET -> ISO instant, or null.
export function etIso(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  const t = /^(\d{2}):(\d{2})/.exec(String(time ?? ""));
  if (!d || !t) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  if (Number.isNaN(guess)) return null;
  // Twice, so a date just across a clock change lands on the right offset.
  const first = guess - tzOffsetMs(guess);
  return new Date(guess - tzOffsetMs(first)).toISOString();
}

// ISO instant -> { date: "YYYY-MM-DD", time: "HH:MM" } in ET.
export function etParts(iso) {
  const ms = new Date(iso).getTime();
  if (!iso || Number.isNaN(ms)) return { date: "", time: "" };
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// "10 AM", "10:30 AM" (or "10:00" / "14:30" in 24-hour mode).
function clock(iso, use24h) {
  const { time } = etParts(iso);
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (use24h) return time;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export function hasArrivalWindow(job) {
  return !!(job?.scheduled_date && job?.arrival_window_end);
}

// "10 AM – 12 PM"; "" for a job with no window.
export function windowLabel(job, use24h = false) {
  if (!hasArrivalWindow(job)) return "";
  return `${clock(job.scheduled_date, use24h)} – ${clock(job.arrival_window_end, use24h)}`;
}

// The time to show anywhere a job's time shows: its window, else its exact time.
export function jobTimeLabel(job, use24h = false) {
  if (!job?.scheduled_date) return "";
  return windowLabel(job, use24h) || clock(job.scheduled_date, use24h);
}

// "Nov 5, 10 AM – 12 PM"
export function jobDateTimeLabel(job, use24h = false) {
  if (!job?.scheduled_date) return "";
  const day = new Date(job.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TIME_ZONE });
  return `${day}, ${jobTimeLabel(job, use24h)}`;
}

// Calendar block (A2): window start to (window end + estimated time on site),
// the latest the tech could still be there. Exact-time jobs: time + estimate.
export function calendarEndMs(job, estimateMinutes) {
  const from = hasArrivalWindow(job) ? job.arrival_window_end : job.scheduled_date;
  return new Date(from).getTime() + estimateMinutes * 60 * 1000;
}

// The job's event was moved in Google to a new start: the window moves with it,
// keeping its length.
export function movedJobPatch(job, newStartIso) {
  const patch = { scheduled_date: newStartIso };
  if (hasArrivalWindow(job)) {
    const length = new Date(job.arrival_window_end).getTime() - new Date(job.scheduled_date).getTime();
    patch.arrival_window_end = new Date(new Date(newStartIso).getTime() + length).toISOString();
  }
  return patch;
}

// ── the picker's state: { date, mode, start, end } ─────────────────────────────
export const emptyPicker = () => ({ date: "", mode: "", start: "", end: "" });

// What the picker should show for a saved job.
export function pickerFromJob(job) {
  if (!job?.scheduled_date) return emptyPicker();
  const { date, time } = etParts(job.scheduled_date);
  if (!hasArrivalWindow(job)) return { date, mode: MODE_EXACT, start: time, end: "" };
  const end = etParts(job.arrival_window_end).time;
  const preset = WINDOW_PRESETS.find((p) => p.start === time && p.end === end);
  return { date, mode: preset ? preset.key : MODE_CUSTOM, start: time, end };
}

// Picker -> { scheduled_date, arrival_window_end } or { error } in plain words.
// No date = not scheduled (both empty).
export function appointmentFromPicker(picker) {
  const { date, mode, start, end } = picker || {};
  if (!date) return { scheduled_date: null, arrival_window_end: null };
  const preset = WINDOW_PRESETS.find((p) => p.key === mode);
  if (preset) return { scheduled_date: etIso(date, preset.start), arrival_window_end: etIso(date, preset.end) };
  if (mode === MODE_EXACT) {
    const at = etIso(date, start);
    return at ? { scheduled_date: at, arrival_window_end: null } : { error: "Pick the exact time" };
  }
  if (mode === MODE_CUSTOM) {
    const from = etIso(date, start);
    const to = etIso(date, end);
    if (!from || !to) return { error: "Pick the window's start and end" };
    if (new Date(to) <= new Date(from)) return { error: "The window must end after it starts" };
    return { scheduled_date: from, arrival_window_end: to };
  }
  return { error: "Pick an arrival window" };
}

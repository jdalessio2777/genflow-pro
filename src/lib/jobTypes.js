// Job types (jobs.job_type). "quote" is a legacy value: quote-approved jobs
// used to be saved as "quote" and the customer's confirmation email then said
// "Service Type: Quote". New jobs from a quote get a real service type.
export const JOB_TYPES = [
  { value: "maintenance",         label: "Maintenance" },
  { value: "diagnostic_repair",   label: "Diagnostic/Repair" },
  { value: "emergency",           label: "Emergency" },
  { value: "battery_replacement", label: "Battery Replacement" },
  { value: "warranty",            label: "Warranty" },
  { value: "quote",               label: "Quote" },
  { value: "other",               label: "Other" },
];

// What a tech picks when scheduling (never "Quote").
export const SERVICE_TYPES = JOB_TYPES.filter(t => t.value !== "quote");

const isServiceType = (v) => SERVICE_TYPES.some(t => t.value === v);

// Service type from a quote's / job's line descriptions, only when it's
// obvious; otherwise null and the tech picks. Order matters: an emergency
// call with a battery is still an emergency; a maintenance agreement or
// tune-up job is maintenance even if it also replaces a filter.
const RULES = [
  ["emergency", /\bemergency\b/i],
  ["maintenance", /service agreement|tune-?up|oil change|maintenance|valve adjustment/i],
  ["battery_replacement", /\bbattery\b/i],
  ["diagnostic_repair", /diagnos|repair|replace|first ½ hour|service call|standard (½ )?hour|board|starter|switch|controller/i],
];
export function inferServiceType(lineNames = []) {
  const text = lineNames.filter(Boolean).join("\n");
  if (!text.trim()) return null;
  for (const [type, re] of RULES) if (re.test(text)) return type;
  return null;
}

// Prefill for the schedule sheet: the job's own type if it's a real one,
// else the type its lines make obvious, else "" (tech must pick).
export function serviceTypePrefill(jobType, lineNames) {
  if (isServiceType(jobType)) return jobType;
  return inferServiceType(lineNames) || "";
}

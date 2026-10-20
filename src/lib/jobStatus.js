// The job header's status word. An approved job with no date is saved as
// status "scheduled" + scheduled_date null (B1); it must read "Not scheduled",
// like the Jobs list and the Overview badge, never "Scheduled".
const LABELS = { on_site: "On Site", dispatched: "Dispatched", completed: "Completed", invoiced: "Invoiced", canceled: "Canceled" };
export function jobHeaderStatus(job) {
  if (!job) return "";
  if (job.status === "scheduled" && !job.scheduled_date) return "Not scheduled";
  return LABELS[job.status] || String(job.status || "").replace(/_/g, " ");
}

import { cn } from "@/lib/utils";

const statusStyles = {
  quote:       "bg-violet-100 text-violet-700 border border-violet-200/60",
  quote_sent:  "bg-sky-100 text-sky-700 border border-sky-200/60",
  scheduled:   "bg-blue-100 text-blue-700 border border-blue-200/60",
  in_progress: "bg-amber-100 text-amber-700 border border-amber-200/60",
  completed:   "bg-green-100 text-green-700 border border-green-200/60",
  invoiced:    "bg-emerald-100 text-emerald-700 border border-emerald-200/60",
  dispatched:  "bg-cyan-100 text-cyan-700 border border-cyan-200/60",
  on_site:     "bg-amber-100 text-amber-700 border border-amber-200/60",
  canceled:    "bg-red-100 text-red-600 border border-red-200/60",
  draft:       "bg-gray-100 text-gray-600 border border-gray-200/60",
  sent:        "bg-blue-100 text-blue-700 border border-blue-200/60",
  paid:        "bg-green-100 text-green-700 border border-green-200/60",
  overdue:     "bg-red-100 text-red-700 border border-red-200/60",
  active:      "bg-green-100 text-green-700 border border-green-200/60",
  inactive:    "bg-gray-100 text-gray-500 border border-gray-200/60",
  maintenance:          "bg-blue-100 text-blue-700 border border-blue-200/60",
  diagnostic_repair:   "bg-orange-100 text-orange-700 border border-orange-200/60",
  emergency:           "bg-red-100 text-red-700 border border-red-200/60",
  battery_replacement: "bg-amber-100 text-amber-700 border border-amber-200/60",
  warranty:            "bg-violet-100 text-violet-700 border border-violet-200/60",
  inspection:          "bg-purple-100 text-purple-700 border border-purple-200/60",
  other:               "bg-gray-100 text-gray-600 border border-gray-200/60",
};

const labels = {
  in_progress: "In Progress",
  quote: "Quote",
  quote_sent: "Awaiting Approval",
  scheduled: "Scheduled",
  completed: "Completed",
  invoiced: "Invoiced",
  dispatched: "Dispatched",
  on_site: "On Site",
  canceled: "Canceled",
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  active: "Active",
  inactive: "Inactive",
  maintenance:          "Maintenance",
  diagnostic_repair:   "Diagnostic/Repair",
  emergency:           "Emergency",
  battery_replacement: "Battery Replacement",
  warranty:            "Warranty",
  inspection:          "Inspection",
  other:               "Other",
};

export default function StatusBadge({ status, className }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold capitalize whitespace-nowrap",
      statusStyles[status] || "bg-gray-100 text-gray-600 border border-gray-200/60",
      className
    )}>
      {labels[status] || status}
    </span>
  );
}
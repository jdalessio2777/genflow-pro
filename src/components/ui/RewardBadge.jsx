import { Gift } from "lucide-react";

export default function RewardBadge({ show, compact }) {
  if (!show) return null;
  return (
    <span
      title={compact ? "10% OFF — pending reward" : undefined}
      className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0 leading-none ${compact ? "p-1" : "px-1.5 py-0.5"}`}
    >
      <Gift className="w-2.5 h-2.5" /> {!compact && "10% OFF"}
    </span>
  );
}

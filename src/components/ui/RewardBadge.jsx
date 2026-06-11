import { Gift } from "lucide-react";

export default function RewardBadge({ show }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0 leading-none">
      <Gift className="w-2.5 h-2.5" /> 10% OFF
    </span>
  );
}

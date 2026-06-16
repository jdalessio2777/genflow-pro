import { motion } from 'framer-motion';
import { Gift } from "lucide-react";

export default function RewardBadge({ show }) {
  if (!show) return null;
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0 leading-none"
    >
      <Gift className="w-2.5 h-2.5" /> 10% OFF
    </motion.span>
  );
}

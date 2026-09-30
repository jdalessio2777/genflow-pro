import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sanitizeStockInput } from "@/lib/utils/stockDraft";

/**
 * Shared stock-count text field used by both Catalog stock modes:
 * the day-to-day StockEditor (draft + Save) and Bulk Count Entry
 * (commit on blur). Holds a raw string so it can be cleared while typing;
 * callers decide what blur means.
 */
const StockCountInput = forwardRef(function StockCountInput(
  { value, onChange, onBlur, onFocus, unsaved = false, className, ...props },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
      autoComplete="off"
      value={value}
      onFocus={(e) => { e.target.select(); onFocus?.(e); }}
      onChange={(e) => onChange(sanitizeStockInput(e.target.value))}
      onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={cn(
        "h-11 w-16 rounded-xl text-center text-base font-bold px-1",
        unsaved && "border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-400 dark:bg-amber-900/30 dark:text-amber-100",
        className,
      )}
      {...props}
    />
  );
});

export default StockCountInput;

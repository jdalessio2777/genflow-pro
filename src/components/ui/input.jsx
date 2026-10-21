import * as React from "react"

import { cn } from "@/lib/utils"

// Number fields (money, hours, quantities) open the decimal keypad on
// iPhone unless the caller picks another inputMode (F-19).
// Run 8 (A3): every single-line field is at least 44 pt tall with 16 px text
// (below 16 px iOS zooms the page on focus). Applied after the caller's
// classes so a compact h-7 / text-sm can't undo it.
const Input = React.forwardRef(({ className, type, inputMode, ...props }, ref) => {
  return (
    (<input
      type={type}
      inputMode={inputMode ?? (type === "number" ? "decimal" : undefined)}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
        "min-h-11 text-base"
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }

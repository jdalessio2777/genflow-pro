import * as React from "react"

import { cn } from "@/lib/utils"
import { FIELD } from "@/components/ui/fieldStyles"

// Number fields (money, hours, quantities) open the decimal keypad on
// iPhone unless the caller picks another inputMode (F-19).
// Run 8 (A3): every single-line field is at least 44 pt tall with 16 px text
// (below 16 px iOS zooms the page on focus). Applied after the caller's
// classes so a compact h-7 / text-sm can't undo it.
// Run 9 (B1): the shared FIELD look (fieldStyles.js), also used by selects.
const Input = React.forwardRef(({ className, type, inputMode, ...props }, ref) => {
  return (
    (<input
      type={type}
      inputMode={inputMode ?? (type === "number" ? "decimal" : undefined)}
      className={cn(
        FIELD,
        "transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
        "min-h-11 min-w-0 text-base"
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }

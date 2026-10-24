import * as React from "react"

import { cn } from "@/lib/utils"
import { FIELD_BOX } from "@/components/ui/fieldStyles"

// Text boxes grow with their text instead of scrolling inside themselves, so
// a drag that starts on one scrolls the page (F-13 / H-4): the page stays the
// one scroller. `rows` sets the starting height (Run 8: callers use 5+ lines,
// 10 for Scope of Work / Service Summary; LongTextField adds Expand).
//
// Measuring needs height:auto for a moment. Run 8: the parent's height is held
// while measuring, so the page never gets shorter for that instant — iOS
// would clamp the scroll position and the page would jump on every keystroke
// near the end of a long page. Nothing here ever scrolls the page.
export function autoGrow(el) {
  if (!el) return
  const parent = el.parentElement
  const held = parent ? parent.style.minHeight : null
  if (parent) parent.style.minHeight = `${parent.offsetHeight}px`
  const before = el.style.height
  el.style.height = "auto"
  const next = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
  el.style.height = next === before ? before : next
  if (parent) parent.style.minHeight = held
}

const Textarea = React.forwardRef(({ className, style, onInput, ...props }, ref) => {
  const innerRef = React.useRef(null)
  const setRefs = React.useCallback((el) => {
    innerRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }, [ref])
  React.useLayoutEffect(() => { autoGrow(innerRef.current) }, [props.value])
  React.useEffect(() => {
    const el = innerRef.current
    if (!el || typeof ResizeObserver === "undefined") return undefined
    // Re-measure when the width changes or text reflows (late web fonts).
    let w = el.clientWidth
    const check = () => {
      if (el.clientWidth !== w || el.scrollHeight > el.clientHeight + 1) { w = el.clientWidth; autoGrow(el) }
    }
    const ro = new ResizeObserver(check)
    ro.observe(el)
    document.fonts?.ready?.then(check).catch(() => {})
    return () => ro.disconnect()
  }, [])
  return (
    (<textarea
      className={cn(
        FIELD_BOX,
        "flex min-h-[60px] py-2.5 leading-6",
        className
      )}
      style={{ overflowY: "hidden", resize: "none", ...style }}
      ref={setRefs}
      onInput={(e) => { autoGrow(e.currentTarget); onInput?.(e) }}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }

import * as React from "react"

import { cn } from "@/lib/utils"

// Text boxes grow with their text instead of scrolling inside themselves, so
// a drag that starts on one scrolls the page (F-13 / H-4). `rows` / min-h
// still set the starting height.
function autoGrow(el) {
  if (!el) return
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
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
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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

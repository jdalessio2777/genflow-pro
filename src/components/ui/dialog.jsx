"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useSheetHistory } from "@/lib/sheetHistory"
import { useSheetDrag } from "@/hooks/useSheetDrag"

// Root with a history entry while open (src/lib/sheetHistory.js): a back
// swipe closes the dialog instead of leaving the screen (F-10).
// history={false} opts out (e.g. the unsaved-changes prompt, which is
// itself shown for a held navigation).
function Dialog({ open: openProp, defaultOpen, onOpenChange, history = true, ...props }) {
  const [innerOpen, setInnerOpen] = React.useState(defaultOpen ?? false)
  const controlled = openProp !== undefined
  const isOpen = controlled ? !!openProp : innerOpen
  const onChangeRef = React.useRef(onOpenChange)
  onChangeRef.current = onOpenChange
  const handleOpenChange = React.useCallback((next) => {
    if (!controlled) setInnerOpen(next)
    onChangeRef.current?.(next)
  }, [controlled])
  useSheetHistory(isOpen, () => handleOpenChange(false), history)
  return <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange} {...props} />
}

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("m-overlay fixed inset-0 z-50 bg-black/40", className)}
    {...props} />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// A tap on a toast (e.g. "Retry" on a save error) must not count as a tap
// outside the dialog, or the dialog closes and the Retry is lost.
const isToastEvent = (e) => !!e?.target?.closest?.("[data-sonner-toaster]");

// Drop width caps written for the old centred box (max-w-sm etc.): a bottom
// sheet is as wide as the screen (up to max-w-lg on a tablet).
const sheetBodyClasses = (className) =>
  (className || "").split(/\s+/).filter(c => c && !/^(sm:)?max-w-/.test(c)).join(" ")

function composeRefs(...refs) {
  return (el) => refs.forEach(r => { if (typeof r === "function") r(el); else if (r) r.current = el; })
}

// variant="sheet" (Run 9, A3 + C2): an iPhone bottom sheet. Slides up on a
// spring over a dimmed page, closes sliding down, swipe down to dismiss
// (useSheetDrag). It sits between the status bar and the keyboard: never
// taller than the visible area, top always below the clock/Dynamic Island
// (--sat), bottom on the keyboard (--kb-h) — so its very top can always be
// scrolled to. Its body is the one scroller; the page underneath is locked.
// variant="center" (default for now): a centred box that fades + scales.
const DialogContent = React.forwardRef(({ className, children, onPointerDownOutside, onInteractOutside, variant = "center", style, ...props }, ref) => {
  if (variant === "sheet") return <SheetContent ref={ref} className={className} style={style} onPointerDownOutside={onPointerDownOutside} onInteractOutside={onInteractOutside} {...props}>{children}</SheetContent>
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        onPointerDownOutside={(e) => { if (isToastEvent(e)) e.preventDefault(); onPointerDownOutside?.(e); }}
        onInteractOutside={(e) => { if (isToastEvent(e)) e.preventDefault(); onInteractOutside?.(e); }}
        style={style}
        className={cn(
          "m-dialog fixed left-[50%] top-[calc(50%+(var(--sat,0px)-var(--sab,0px)-var(--kb-h,0px))/2)] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-5 shadow-lg rounded-2xl max-h-[calc(100dvh-var(--sat,0px)-var(--sab,0px)-var(--kb-h,0px)-2rem)] overflow-y-auto overscroll-contain",
          className
        )}
        {...props}>
        {children}
        {/* A real 44x44 button; the 16px X sits where it always did (24px from the corner). */}
        <DialogPrimitive.Close
          className="absolute right-0.5 top-0.5 flex h-11 w-11 items-center justify-center rounded-xl opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const SheetContent = React.forwardRef(({ className, children, onPointerDownOutside, onInteractOutside, style, ...props }, ref) => {
  const [sheet, setSheet] = React.useState(null)
  const scrollRef = React.useRef(null)
  const grabberRef = React.useRef(null)
  const overlayRef = React.useRef(null)
  const closeRef = React.useRef(null)
  const onClose = React.useCallback(() => closeRef.current?.click(), [])
  useSheetDrag({ sheet, scrollRef, grabberRef, overlayRef, onClose })
  return (
    <DialogPortal>
      <DialogOverlay ref={overlayRef} />
      <DialogPrimitive.Content
        ref={composeRefs(ref, setSheet)}
        data-sheet=""
        onPointerDownOutside={(e) => { if (isToastEvent(e)) e.preventDefault(); onPointerDownOutside?.(e); }}
        onInteractOutside={(e) => { if (isToastEvent(e)) e.preventDefault(); onInteractOutside?.(e); }}
        className="m-sheet fixed inset-x-0 z-50 mx-auto flex w-full max-w-lg flex-col rounded-t-[20px] border-t bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none"
        style={{ bottom: "var(--kb-h, 0px)", maxHeight: "calc(100dvh - var(--sat, 0px) - 8px - var(--kb-h, 0px))", ...style }}
        {...props}>
        <div ref={grabberRef} data-sheet-grabber="" className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2" aria-hidden="true">
          <div className="h-[5px] w-9 rounded-full bg-muted-foreground/30" />
        </div>
        <div
          ref={scrollRef}
          data-sheet-scroll=""
          className={cn("grid min-h-0 flex-1 gap-4 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pt-1", sheetBodyClasses(className))}
          style={{ paddingBottom: "max(1.25rem, calc(var(--sab, 0px) + 0.5rem))" }}>
          {children}
        </div>
        <DialogPrimitive.Close ref={closeRef}
          className="absolute right-1.5 top-2 flex h-11 w-11 items-center justify-center rounded-xl opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
SheetContent.displayName = "SheetContent"

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { afterSheetPushed, useSheetHistory } from "@/lib/sheetHistory";
import { writeDraft } from "@/lib/textDrafts";
import { useSheetDrag } from "@/hooks/useSheetDrag";

// iOS opens the keyboard only for a focus() made inside the tap itself. The
// editor mounts a moment later, so Expand focuses this hidden field during
// the tap; the editor then moves focus to its own text and the keyboard stays.
export function primeKeyboard() {
  try {
    let el = document.getElementById("kb-primer");
    if (!el) {
      el = document.createElement("input");
      el.id = "kb-primer";
      el.setAttribute("aria-hidden", "true");
      el.tabIndex = -1;
      el.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none;";
      document.body.appendChild(el);
    }
    el.focus({ preventScroll: true });
  } catch { /* ignore */ }
}

// Full-screen editor for long text, like iPhone Notes (Run 8, A3).
// Run 9 (C2): an iPhone page sheet — it slides up over the dimmed screen
// (the keyboard rises with it), leaves a sliver of the screen showing above
// it, and slides back down on Done / Cancel / a swipe down on its header,
// instead of swapping to another screen.
// - Cancel (asks first when changed) · title · Done (keeps the text).
// - The text fills the screen above the keyboard and scrolls inside itself;
//   the page underneath is held still, so nothing behind it can jump.
// - A back swipe keeps the text, like Notes (it never throws text away).
// - What is typed here is also kept as the field's local draft (draftKey).
const CLOSE_MS = 260; // --dur-sheet-out

export default function FullScreenTextEditor({ open, title, value, placeholder, draftKey, draftBase, onDone, onCancel }) {
  const [text, setText] = useState(value ?? "");
  // Stays mounted while it slides away after open turns false.
  const [rendered, setRendered] = useState(open);
  const [sheet, setSheet] = useState(null);
  const headerRef = useRef(null);
  const overlayRef = useRef(null);
  useEffect(() => {
    if (open) { setRendered(true); return undefined; }
    if (!rendered) return undefined;
    taRef.current?.blur(); // the keyboard goes down with the sheet
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const t = setTimeout(() => setRendered(false), reduce ? 120 : CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [askDiscard, setAskDiscard] = useState(false);
  const [box, setBox] = useState(() => ({ top: 0, height: typeof window !== "undefined" ? window.innerHeight : 0 }));
  const taRef = useRef(null);
  const textRef = useRef(text);
  textRef.current = text;
  const changed = text !== (value ?? "");

  // Fresh text each time it opens.
  useEffect(() => { if (open) { setText(value ?? ""); setAskDiscard(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back swipe = Done (keeps the text).
  useSheetHistory(open, () => onDone?.(textRef.current));

  // Hold the page still underneath (no background scroll, no jump on close).
  // Locked once the editor's history entry is in (afterSheetPushed): the
  // router saves the screen's scroll position at that push, and it must save
  // the real one, not the locked page's 0, or closing jumps to the top (Run 9).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const b = document.body.style;
    let lock = null;
    const cancel = afterSheetPushed(() => {
      const y = window.scrollY;
      lock = { y, prev: { position: b.position, top: b.top, left: b.left, right: b.right, overflow: b.overflow } };
      Object.assign(b, { position: "fixed", top: `-${y}px`, left: "0", right: "0", overflow: "hidden" });
    });
    return () => {
      cancel();
      if (!lock) return;
      Object.assign(b, lock.prev);
      window.scrollTo(0, lock.y);
    };
  }, [open]);

  // Size to the visible area (above the keyboard). Only sizes the editor —
  // never scrolls anything.
  useEffect(() => {
    if (!open) return undefined;
    const vv = window.visualViewport;
    const set = () => setBox({ top: vv ? vv.offsetTop : 0, height: vv ? vv.height : window.innerHeight });
    set();
    vv?.addEventListener("resize", set);
    vv?.addEventListener("scroll", set);
    return () => { vv?.removeEventListener("resize", set); vv?.removeEventListener("scroll", set); };
  }, [open]);

  // Focus with the caret at the end, the end in view.
  useLayoutEffect(() => {
    if (!open) return;
    const el = taRef.current;
    if (!el) return;
    const end = el.value.length;
    try { el.focus({ preventScroll: true }); el.setSelectionRange(end, end); } catch { /* ignore */ }
    // Again once the editor has its final size (visible area measured).
    const toEnd = () => { el.scrollTop = el.scrollHeight; };
    toEnd();
    const raf = requestAnimationFrame(toEnd);
    const t = setTimeout(toEnd, 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [open]);

  // Keep a draft of what is typed here too.
  useEffect(() => {
    if (!open || !draftKey) return undefined;
    const t = setTimeout(() => { if (text !== (draftBase ?? "")) writeDraft(draftKey, text, draftBase); }, 400);
    return () => clearTimeout(t);
  }, [open, text, draftKey, draftBase]);

  // Swipe down on the header = Done (keeps the text, like a back swipe).
  const swipeDone = useCallback(() => onDone?.(textRef.current), [onDone]);
  useSheetDrag({ sheet: open ? sheet : null, grabberRef: headerRef, overlayRef, onClose: swipeDone, grabberOnly: true });

  if (!open && !rendered) return null;
  const cancel = () => { if (changed) setAskDiscard(true); else onCancel?.(); };
  const state = open ? "open" : "closed";
  // A sliver of the screen stays visible above the sheet, under the clock.
  const gap = "calc(var(--sat, 0px) + 10px)";

  return createPortal(
    <>
    <div ref={overlayRef} data-state={state} className="m-overlay fixed inset-0 z-[69] bg-black/40" aria-hidden="true" />
    <div
      ref={setSheet}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="fullscreen-editor"
      data-no-kb-scroll=""
      data-state={state}
      className="m-sheet fixed left-0 right-0 z-[70] mx-auto flex max-w-lg flex-col overflow-hidden rounded-t-[14px] bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.18)]"
      style={{ top: `calc(${box.top}px + ${gap})`, height: `calc(${box.height}px - ${gap})`, pointerEvents: open ? undefined : "none" }}
    >
      <div ref={headerRef} className="shrink-0 border-b border-border bg-background touch-none">
        <div className="flex justify-center pt-1.5" aria-hidden="true"><div className="h-[5px] w-9 rounded-full bg-muted-foreground/30" /></div>
        <div className="max-w-lg mx-auto flex items-center justify-between h-11 px-2">
          <button type="button" className="h-11 min-w-[72px] px-3 text-base text-primary text-left" onClick={cancel}>Cancel</button>
          <p className="flex-1 text-center text-base font-semibold truncate px-2">{title}</p>
          <button type="button" data-testid="fullscreen-editor-done" className="h-11 min-w-[72px] px-3 text-base font-semibold text-primary text-right" onClick={() => onDone?.(text)}>Done</button>
        </div>
      </div>
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        data-testid="fullscreen-editor-text"
        className="flex-1 w-full max-w-lg mx-auto block bg-transparent px-4 pt-3 text-base leading-7 outline-none resize-none placeholder:text-muted-foreground"
        style={{ overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", paddingBottom: "max(16px, var(--sab))" }}
      />
      <AlertDialog open={askDiscard} onOpenChange={setAskDiscard}>
        <AlertDialogContent className="max-w-sm rounded-2xl z-[80]" overlayClassName="z-[80]">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your changes to {title} will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11 rounded-xl">Keep editing</AlertDialogCancel>
            <AlertDialogAction className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setAskDiscard(false); onCancel?.(); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>,
    document.body
  );
}

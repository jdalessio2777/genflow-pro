import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import FullScreenTextEditor, { primeKeyboard } from "@/components/ui/FullScreenTextEditor";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { clearDraft, draftToRestore, onDraftsSaved, readDraft, writeDraft } from "@/lib/textDrafts";
import { cn } from "@/lib/utils";

// Every multi-line field in the app (Run 8, A3 + A4):
// - comfortable inline box (rows: 10 for Scope of Work / Service Summary,
//   5 for other notes), 16 px text, grows with its text — the page is the one
//   scroller, nothing scrolls inside the box, nothing moves the page for you;
// - "Expand" opens the full-screen editor (FullScreenTextEditor);
// - a local draft per record and field (draftKey) is written as you type and
//   restored after a reload / crash with "Restored unsaved text" + Discard;
// - leaving the screen (back arrow, tab bar, swipe back) with text that isn't
//   saved asks first (guard; off for boxes that autosave on their own).
//
// savedValue: the text as last saved (undefined while it is still loading —
// pass ready={false} then). After a successful save call
// markDraftsSaved(prefix) (lib/textDrafts) for "new" screens that navigate
// away, so the draft is removed and leaving doesn't ask.
export default function LongTextField({
  value, onChange, savedValue, draftKey, ready = true, title, rows = 5,
  expandable = true, guard = true, placeholder, className, id, disabled,
  textareaRef, onBlur, "data-testid": testId,
}) {
  const text = value ?? "";
  const saved = savedValue ?? "";
  const [editorOpen, setEditorOpen] = useState(false);
  const [restored, setRestored] = useState(null); // { from } when a draft was put back
  const [savedSnapshot, setSavedSnapshot] = useState(null); // text at markDraftsSaved
  const checkedKey = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Restore a draft once per record, as soon as the saved text is known.
  useEffect(() => {
    if (!ready || !draftKey || checkedKey.current === draftKey) return;
    checkedKey.current = draftKey;
    const d = readDraft(draftKey);
    const put = draftToRestore(d, text);
    if (put == null) { if (d) clearDraft(draftKey); return; }
    setRestored({ from: text });
    onChangeRef.current?.(put);
  }, [ready, draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = savedSnapshot ?? saved;
  const dirty = ready && text !== base;
  const latest = useRef({ text, base, dirty });
  latest.current = { text, base, dirty };

  useEffect(() => { setSavedSnapshot(null); }, [savedValue]);
  useEffect(() => onDraftsSaved((prefix) => {
    if (!draftKey || !draftKey.startsWith(prefix)) return;
    // Saved: no draft and nothing to warn about, even if the screen closes
    // before the next render.
    latest.current = { text, base: text, dirty: false };
    setSavedSnapshot(text); setRestored(null);
  }), [draftKey, text]);


  // Keep the draft as you type (debounced) and right away when the app is
  // hidden; drop it once the text matches what is saved.
  const editorOpenRef = useRef(false);
  const persist = useCallback((force = false) => {
    if (!draftKey || checkedKey.current !== draftKey) return;
    if (editorOpenRef.current && !force) return; // the editor keeps its own draft
    const { text: t, base: b, dirty: d } = latest.current;
    if (d) writeDraft(draftKey, t, b); else clearDraft(draftKey);
  }, [draftKey]);
  useEffect(() => {
    if (!ready || !draftKey) return undefined;
    const tm = setTimeout(persist, 400);
    return () => clearTimeout(tm);
  }, [text, base, ready, draftKey, persist]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") persist(); };
    const onPageHide = () => persist();
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", onPageHide); document.removeEventListener("visibilitychange", onHide); persist(); };
  }, [persist]);

  const leaveGuard = useUnsavedChangesGuard(guard && dirty && !editorOpen);

  const discardRestored = () => {
    const from = restored?.from ?? "";
    setRestored(null);
    clearDraft(draftKey);
    onChange?.(from);
  };

  return (
    <div className="space-y-1.5">
      {restored && (
        <div data-testid="draft-restored" className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-1.5 text-sm text-amber-900 dark:text-amber-200">
          <span>Restored unsaved text</span>
          <button type="button" className="h-11 -my-2 px-2 font-semibold underline underline-offset-2" onClick={discardRestored}>Discard</button>
        </div>
      )}
      <div className="relative">
        <Textarea
          id={id}
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onBlur}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          data-testid={testId}
          data-long-text=""
          className={cn("rounded-xl", className, "text-base leading-6", expandable && "pr-12")}
        />
        {expandable && !disabled && (
          <button
            type="button"
            aria-label={`Expand ${title || "text"}`}
            data-testid="expand-text"
            className="hit-44 absolute top-1.5 right-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground bg-background/80 border border-border"
            onClick={() => { primeKeyboard(); editorOpenRef.current = true; setEditorOpen(true); }}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {expandable && (
        <FullScreenTextEditor
          open={editorOpen}
          title={title || "Edit text"}
          value={text}
          placeholder={placeholder}
          draftKey={draftKey}
          draftBase={base}
          onDone={(t) => { editorOpenRef.current = false; setEditorOpen(false); if (t !== text) onChange?.(t); }}
          onCancel={() => { editorOpenRef.current = false; setEditorOpen(false); persist(true); }}
        />
      )}
      {guard && (
        <AlertDialog history={false} open={leaveGuard.blocked} onOpenChange={(o) => { if (!o) leaveGuard.stay(); }}>
          <AlertDialogContent className="max-w-sm rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
              <AlertDialogDescription>
                {title ? `${title} has` : "You have"} text that isn't saved yet. It stays on this phone as a draft and comes back when you return here.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="h-11 rounded-xl" onClick={leaveGuard.stay}>Stay</AlertDialogCancel>
              <AlertDialogAction className="h-11 rounded-xl" onClick={leaveGuard.leave}>Leave</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

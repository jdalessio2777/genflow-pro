import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import StockCountInput from "@/components/catalog/StockCountInput";
import {
  isStockDraftDirty,
  parseStockDraft,
  resolveStockDraftOnBlur,
  stepStockDraft,
} from "@/lib/utils/stockDraft";

/**
 * Day-to-day stock editor for one catalog part.
 * The typed value and the -/+ steppers only edit a local draft; the Save
 * button (shown only when the draft differs from the DB value) is the single
 * commit point. States: unsaved (amber), saving, saved (green), error (red).
 *
 * onSave(newStock) must return a promise that rejects on failure.
 */
export default function StockEditor({ part, onSave }) {
  const saved = part.in_stock ?? 0;
  const [draft, setDraft] = useState(String(saved));
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState("");
  const lastSavedRef = useRef(saved);
  const focusValueRef = useRef(String(saved));

  // DB value changed (our save landed, or someone else edited): adopt it
  // unless the user is holding an unsaved edit.
  useEffect(() => {
    const prevSaved = lastSavedRef.current;
    lastSavedRef.current = saved;
    setDraft((d) => {
      const n = parseStockDraft(d);
      return n === null || n === prevSaved ? String(saved) : d;
    });
  }, [saved]);

  const dirty = isStockDraftDirty(draft, saved);
  const saving = status === "saving";
  const isOut = saved <= 0;
  const isLow = saved <= 2;

  const edit = (next) => {
    setDraft(next);
    if (status !== "saving") setStatus("idle");
  };

  const handleSave = async () => {
    const n = parseStockDraft(draft);
    if (n === null || saving) return;
    setStatus("saving");
    setErrorMsg("");
    try {
      await onSave(n);
      lastSavedRef.current = n;
      setDraft(String(n));
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message || "Could not save");
    }
  };

  let statusEl;
  if (saving) {
    statusEl = <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Saving…</span>;
  } else if (status === "error") {
    statusEl = <span role="alert" className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Not saved — tap Save to retry</span>;
  } else if (dirty) {
    statusEl = <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Unsaved (was {saved})</span>;
  } else if (status === "saved") {
    statusEl = <span role="status" className="text-xs font-semibold text-green-600 dark:text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>;
  } else {
    statusEl = (
      <span className={`text-xs font-medium ${isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-muted-foreground"}`}>
        {isOut ? "OUT of stock" : isLow ? "LOW stock" : "In stock"}
      </span>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/60" data-testid="stock-editor">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1" aria-live="polite">
          {statusEl}
          {status === "error" && errorMsg && (
            <p className="text-[10px] text-red-600/80 truncate">{errorMsg}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button" variant="outline" aria-label="Decrease stock"
            className="h-11 w-11 rounded-xl p-0"
            disabled={saving || (parseStockDraft(draft) ?? saved) <= 0}
            onClick={() => edit(stepStockDraft(draft, -1, saved))}
          >
            <Minus className="w-5 h-5" />
          </Button>
          <StockCountInput
            aria-label={`In stock for ${part.name}`}
            value={draft}
            unsaved={dirty}
            disabled={saving}
            onFocus={() => { focusValueRef.current = draft; }}
            onChange={edit}
            onBlur={() => setDraft((d) => resolveStockDraftOnBlur(d, parseStockDraft(focusValueRef.current) ?? saved))}
          />
          <Button
            type="button" variant="outline" aria-label="Increase stock"
            className="h-11 w-11 rounded-xl p-0"
            disabled={saving}
            onClick={() => edit(stepStockDraft(draft, +1, saved))}
          >
            <Plus className="w-5 h-5" />
          </Button>
          {(dirty || saving || status === "error") && (
            <Button
              type="button"
              className="h-11 rounded-xl px-3 font-semibold"
              disabled={saving || !dirty}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

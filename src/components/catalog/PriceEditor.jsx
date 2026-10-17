import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import {
  PRICE_FIELDS,
  isAutoSuggestEligible,
  isPriceDraftDirty,
  parsePriceDraft,
  sanitizePriceInput,
  suggestedSalePrice,
  toPriceDraft,
} from "@/lib/utils/catalogPrice";
import { applySavedPrice, saveCatalogPrice } from "@/lib/catalogPrices";

function MoneyInput({ value, onChange, onBlur, unsaved, label, ...props }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="relative mt-0.5">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          value={value}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(sanitizePriceInput(e.target.value))}
          onBlur={onBlur}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className={cn(
            "h-11 rounded-xl pl-6 pr-2 text-base font-semibold tabular-nums",
            unsaved && "border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-400 dark:bg-amber-900/30 dark:text-amber-100",
          )}
          {...props}
        />
      </div>
    </label>
  );
}

/**
 * In-place permanent price editor for one catalog item (part, hourly labor
 * rate or flat rate). Same model as StockEditor: typing only edits a local
 * draft; Save (shown only while there is an unsaved change) is the single
 * commit point. States: unsaved (amber), saving, saved (green, shows
 * old → new), error (red).
 *
 * kind: "part" | "hourly" | "flat"
 * onDirtyChange(isDirty) lets the list guard navigation while unsaved.
 */
export default function PriceEditor({ item, kind, onDirtyChange }) {
  const queryClient = useQueryClient();
  const f = PRICE_FIELDS[kind];
  const savedPrice = Number(item[f.price]) || 0;
  const savedCost = Number(item[f.cost]) || 0;
  const [priceDraft, setPriceDraft] = useState(toPriceDraft(savedPrice));
  const [costDraft, setCostDraft] = useState(toPriceDraft(savedCost));
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [message, setMessage] = useState("");
  // Captured once, from the item as it stood before any edit: only a
  // never-priced, never-managed part gets the ×1.35 suggestion.
  const [autoSuggest, setAutoSuggest] = useState(() => kind === "part" && isAutoSuggestEligible(item));
  const [priceTouched, setPriceTouched] = useState(false);
  const lastSaved = useRef({ price: savedPrice, cost: savedCost });

  // DB value changed (our save landed, or someone else edited): adopt it
  // unless the user is holding an unsaved edit of that field.
  useEffect(() => {
    const prev = lastSaved.current;
    lastSaved.current = { price: savedPrice, cost: savedCost };
    setPriceDraft((d) => { const n = parsePriceDraft(d); return n === null || n === prev.price ? toPriceDraft(savedPrice) : d; });
    setCostDraft((d) => { const n = parsePriceDraft(d); return n === null || n === prev.cost ? toPriceDraft(savedCost) : d; });
  }, [savedPrice, savedCost]);

  const priceDirty = isPriceDraftDirty(priceDraft, savedPrice);
  const costDirty = isPriceDraftDirty(costDraft, savedCost);
  const dirty = priceDirty || costDirty;
  const saving = status === "saving";

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => { onDirtyChangeRef.current?.(dirty); }, [dirty]);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  const touch = () => { if (!saving) setStatus("idle"); };

  const onCostChange = (v) => {
    setCostDraft(v);
    touch();
    if (autoSuggest && !priceTouched) {
      const c = parsePriceDraft(v);
      setPriceDraft(c && c > 0 ? String(suggestedSalePrice(c)) : "0");
    }
  };
  const onPriceChange = (v) => { setPriceDraft(v); setPriceTouched(true); touch(); };

  const handleSave = async () => {
    const price = parsePriceDraft(priceDraft);
    const cost = parsePriceDraft(costDraft);
    if (price === null || cost === null) { setStatus("error"); setMessage("Enter amounts like 12.50 (no negatives, 2 decimals max)"); return; }
    if (saving) return;
    setStatus("saving");
    try {
      const res = await saveCatalogPrice(kind, item, { price, cost });
      applySavedPrice(queryClient, kind, item.id, res.patch);
      setPriceDraft(toPriceDraft(price));
      setCostDraft(toPriceDraft(cost));
      setAutoSuggest(false);
      setPriceTouched(false);
      setMessage(res.message);
      setStatus("saved");
      if (res.message) toast.success(`Saved: ${res.message}`);
    } catch (err) {
      console.error("Price save failed", item.id, err);
      setMessage("Not saved — check signal and tap Save to retry");
      setStatus("error");
      toast.error(`Price not saved for "${item.name}"`);
    }
  };

  const suggesting = autoSuggest && !priceTouched && (parsePriceDraft(costDraft) || 0) > 0;
  let statusEl = null;
  if (saving) {
    statusEl = <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Saving…</span>;
  } else if (status === "error") {
    statusEl = <span role="alert" className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{message}</span>;
  } else if (dirty) {
    statusEl = (
      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
        Unsaved (was {formatCurrency(savedCost)} cost / {formatCurrency(savedPrice)}{kind === "hourly" ? "/hr" : ""})
        {suggesting && <span className="font-medium text-blue-600 dark:text-blue-400"> · price suggested at cost ×1.35</span>}
      </span>
    );
  } else if (status === "saved" && message) {
    statusEl = <span role="status" className="text-xs font-semibold text-green-600 dark:text-green-400 flex items-start gap-1"><Check className="w-3 h-3 mt-0.5 shrink-0" />Saved: {message}</span>;
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/60" data-testid="price-editor">
      <div className="flex items-end gap-2">
        <MoneyInput label={f.costLabel} aria-label={`${f.costLabel} for ${item.name}`} value={costDraft} unsaved={costDirty} disabled={saving}
          onChange={onCostChange} onBlur={() => { if (parsePriceDraft(costDraft) === null) setCostDraft(toPriceDraft(savedCost)); }} />
        <MoneyInput label={f.priceLabel} aria-label={`${f.priceLabel} for ${item.name}`} value={priceDraft} unsaved={priceDirty} disabled={saving}
          onChange={onPriceChange} onBlur={() => { if (parsePriceDraft(priceDraft) === null) setPriceDraft(toPriceDraft(savedPrice)); }} />
        {(dirty || saving || status === "error") && (
          <Button type="button" className="h-11 rounded-xl px-3 font-semibold shrink-0" disabled={saving || !dirty} onClick={handleSave}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        )}
      </div>
      {statusEl && <div className="mt-1" aria-live="polite">{statusEl}</div>}
    </div>
  );
}

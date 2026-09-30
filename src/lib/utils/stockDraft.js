// Draft/parse helpers for editing a part's in_stock count in the Catalog.
//
// The stock field holds a raw *string* draft while the user types so it can be
// cleared (Backspace to empty) without snapping back to a number mid-edit.
// Unlike job-part quantity (min 1), stock may legitimately be 0.
import { sanitizeQuantityInput } from "@/lib/utils/partsSearch";
import { firstManagedPatch } from "@/lib/utils/partsManaged";

export const MAX_STOCK = 9999;

// Keystroke filter: digits only, max 4 chars (same rule as job-part quantity).
export const sanitizeStockInput = sanitizeQuantityInput;

// Parsed stock count, or null when the draft is empty / not a number.
export function parseStockDraft(draft) {
  const s = String(draft ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? Math.min(MAX_STOCK, Math.max(0, n)) : null;
}

// On blur: a valid draft is normalized ("007" -> "7"); an empty/invalid draft
// reverts to `fallback` (the last valid value before this edit).
export function resolveStockDraftOnBlur(draft, fallback) {
  const n = parseStockDraft(draft);
  return String(n ?? Math.max(0, Number(fallback) || 0));
}

// +/- stepper: edits the draft only (no save). An empty draft steps from
// `fallback`. Clamped to 0..MAX_STOCK.
export function stepStockDraft(draft, delta, fallback) {
  const base = parseStockDraft(draft) ?? Math.max(0, Number(fallback) || 0);
  return String(Math.min(MAX_STOCK, Math.max(0, base + delta)));
}

// True when the draft holds a valid number different from the saved DB value.
// An empty (mid-typing) draft is not savable, so it is not "dirty".
export function isStockDraftDirty(draft, saved) {
  const n = parseStockDraft(draft);
  return n !== null && n !== (Number(saved) || 0);
}

// DB patch for a manual stock change. Keeps parity with the pre-existing
// Catalog paths:
//  - day-to-day (+/- steppers, now draft + Save): reorder_flagged set true
//    when stock hits 0, otherwise left as-is.
//  - Bulk Count Entry (clearReorderWhenStocked: true): reorder_flagged is
//    exactly (stock === 0), i.e. a positive count clears the flag.
// Both mark the part as managed (first_managed_at, set once).
export function stockUpdatePatch(part, newStock, { clearReorderWhenStocked = false } = {}) {
  const reorder_flagged = newStock === 0
    ? true
    : (clearReorderWhenStocked ? false : (part?.reorder_flagged || false));
  return { in_stock: newStock, reorder_flagged, ...firstManagedPatch(part) };
}

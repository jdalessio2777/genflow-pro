// A part becomes "managed" the first time staff actively engage with it —
// a real cost/default_price entered where none existed, or a real in_stock
// count manually entered via the Catalog +/- steppers or Bulk Count Entry.
// Once set, first_managed_at is never cleared and never re-triggers.
//
// NOT a trigger: the automatic in_stock decrement when a part is added to a
// job (JobPartsTab.jsx) — that's a system deduction, not a manual staff count.
//
// Used to gate the buy-price -> sale-price (x1.35) auto-suggest, and to
// exclude legacy/never-touched parts from low-stock alerts.

export function firstManagedPatch(part) {
  return part?.first_managed_at ? {} : { first_managed_at: new Date().toISOString() };
}

export function isManaged(part) {
  return !!part?.first_managed_at;
}

export const SUGGESTED_MARKUP = 1.35;

export function suggestedSalePrice(cost) {
  return Math.round((cost || 0) * SUGGESTED_MARKUP * 100) / 100;
}

// Run 14 (B): parts in the catalog's "Custom" folder (saved from a custom flat
// rate entered as a Part) have no stock: never counted, never decremented,
// never in low-stock / reorder alerts.
export const CUSTOM_PART_CATEGORY = "custom";
export function isStockTracked(part) {
  return part?.category !== CUSTOM_PART_CATEGORY;
}

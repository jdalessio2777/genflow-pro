// Draft/parse helpers for editing catalog prices in place (parts, hourly
// labor rates, flat rates). Mirrors stockDraft.js: the field holds a raw
// string while typing; Save is the single commit point.
//
// Rules: no negatives, at most 2 decimals, max 99,999.99. The ×1.35
// auto-suggest only ever fills the FIRST price of a never-priced,
// never-managed part; any other edit saves exactly what was typed.
import { firstManagedPatch, suggestedSalePrice } from "@/lib/utils/partsManaged";
import { formatCurrency } from "@/lib/utils/format";

export const MAX_PRICE = 99999.99;

// Which columns hold the price and cost for each kind of catalog item.
export const PRICE_FIELDS = {
  part:   { price: "default_price", cost: "cost",      priceLabel: "Price",    costLabel: "Cost" },
  hourly: { price: "rate",          cost: "cost_rate", priceLabel: "Rate/hr",  costLabel: "Cost/hr" },
  flat:   { price: "flat_price",    cost: "flat_cost", priceLabel: "Price",    costLabel: "Cost" },
};

export function priceKindFor(item, isPart = false) {
  if (isPart) return "part";
  return item?.type === "hourly" ? "hourly" : "flat";
}

// Keystroke filter: digits and one ".", max 2 decimals, max 5 whole digits.
// A "-" can't be typed, so negatives are impossible.
export function sanitizePriceInput(raw) {
  let s = String(raw ?? "").replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  let [whole, frac] = s.split(".");
  whole = whole.slice(0, 5);
  if (frac !== undefined) return `${whole}.${frac.slice(0, 2)}`;
  return whole;
}

// Parsed amount (rounded to cents), or null when empty / invalid.
export function parsePriceDraft(draft) {
  const s = String(draft ?? "").trim();
  if (!/^\d{0,5}(\.\d{0,2})?$/.test(s) || s === "" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE) return null;
  return Math.round(n * 100) / 100;
}

export function toPriceDraft(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return String(Math.round(n * 100) / 100);
}

export function isPriceDraftDirty(draft, saved) {
  const n = parsePriceDraft(draft);
  return n !== null && n !== Math.round((Number(saved) || 0) * 100) / 100;
}

// True when a part has never been priced or managed: only then may the
// sale price be auto-suggested from cost ×1.35.
export function isAutoSuggestEligible(part) {
  return !part?.first_managed_at && !(Number(part?.default_price) > 0);
}

export { suggestedSalePrice };

// DB patch for a price/cost change: only the fields that changed. A part
// that gets a real sale price is marked managed (first_managed_at, set once).
export function buildPricePatch(kind, item, { price, cost }) {
  const f = PRICE_FIELDS[kind];
  const patch = {};
  const old = (k) => Math.round((Number(item?.[k]) || 0) * 100) / 100;
  if (price != null && price !== old(f.price)) patch[f.price] = price;
  if (cost != null && cost !== old(f.cost)) patch[f.cost] = cost;
  if (kind === "part" && patch[f.price] > 0) Object.assign(patch, firstManagedPatch(item));
  return patch;
}

// "Price $13.50 → $15.25 · Cost $10.00 → $11.00"
export function describePriceChange(kind, item, patch) {
  const f = PRICE_FIELDS[kind];
  const parts = [];
  if (f.price in patch) parts.push(`${f.priceLabel} ${formatCurrency(item?.[f.price] || 0)} → ${formatCurrency(patch[f.price])}`);
  if (f.cost in patch) parts.push(`${f.costLabel} ${formatCurrency(item?.[f.cost] || 0)} → ${formatCurrency(patch[f.cost])}`);
  return parts.join(" · ");
}

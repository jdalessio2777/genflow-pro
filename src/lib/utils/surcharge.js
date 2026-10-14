// Credit card surcharge — ONE config and ONE formula for every path: the
// invoice screen's "Credit card surcharge" button (incl. Stripe App), the
// in-app card form and its server routes, the webhook and every template.
// Plain ESM, no aliases: used by src/ and api/.
//
// Rate and "is the surcharge taxable" come from app_settings keys
//   card_surcharge_rate     percent, e.g. "3"   (default 3)
//   card_surcharge_taxable  "true" | "false"    (default false)
// No rows exist by default — the code defaults below apply. Change them in
// Settings › Card surcharge (writes those two rows).
import { TAX_RATE } from './jobFinancials.js';

export const SURCHARGE_DEFAULTS = Object.freeze({ rate: 0.03, taxable: false });
// Card networks cap credit surcharges at 3%; never apply more than 4% even if
// a bad setting is saved.
const MAX_RATE = 0.04;

// settings: array of { key, value } rows, or a plain { key: value } object.
export function surchargeConfig(settings) {
  const get = (k) => Array.isArray(settings)
    ? settings.find(s => s?.key === k)?.value
    : settings?.[k];
  const rawRate = parseFloat(get('card_surcharge_rate'));
  let rate = SURCHARGE_DEFAULTS.rate;
  if (Number.isFinite(rawRate)) {
    const r = rawRate > 1 ? rawRate / 100 : rawRate; // "3" or "0.03"
    if (r >= 0 && r <= MAX_RATE) rate = r;
  }
  const t = String(get('card_surcharge_taxable') ?? '').trim().toLowerCase();
  const taxable = t === 'true' ? true : t === 'false' ? false : SURCHARGE_DEFAULTS.taxable;
  return { rate, taxable };
}

export function surchargeLabel(config = SURCHARGE_DEFAULTS) {
  const pct = Math.round(config.rate * 10000) / 100;
  return `Credit card surcharge (${pct}%)`;
}

// Surcharge in cents on the FINAL amount owed (after discounts and tax).
// Not taxed unless the setting says so; then its tax is part of the line.
export function surchargeCents(baseCents, config = SURCHARGE_DEFAULTS) {
  if (!(baseCents > 0)) return 0;
  const s = Math.round(baseCents * config.rate);
  return config.taxable ? s + Math.round(s * TAX_RATE) : s;
}

// Owed before any surcharge: parts + labor + tax — what every view adds up.
export function owedCentsOf(invoice) {
  if (!invoice) return 0;
  const c = (n) => Math.round(Number(n || 0) * 100);
  return c(invoice.parts_total) + c(invoice.labor_total) + c(invoice.tax_amount);
}

// The invoice's surcharge in dollars for its current totals (0 for $0 or
// negative invoices).
export function surchargeFor(invoice, config = SURCHARGE_DEFAULTS) {
  return surchargeCents(owedCentsOf(invoice), config) / 100;
}

// When an invoice that already carries a surcharge is re-synced (parts or
// labor changed), recompute it from the new totals; never add one.
export function withResyncedSurcharge(patch, existing, config = SURCHARGE_DEFAULTS) {
  if (!(Number(existing?.surcharge_amount) > 0) || existing?.status === 'paid') return patch;
  return { ...patch, surcharge_amount: surchargeFor({ ...existing, ...patch }, config) };
}

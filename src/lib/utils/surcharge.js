// Credit card surcharge — ONE config and ONE formula for every path: the
// invoice screen's "Credit card surcharge" button (incl. Stripe App), the
// in-app card form and its server routes, the webhook and every template.
// Plain ESM, no aliases: used by src/ and api/.
//
// NJ P.L. 2023, c.146 caps a credit card surcharge at the merchant's actual
// processing cost. So the surcharge is exactly Stripe's ROUNDED fee on the
// amount actually charged (T + surcharge), never more: the largest s with
//   s <= round(rate x (T + s) + fixed)
// That s always equals the rounded fee, so the business nets exactly T
// (e.g. $514.47 -> $14.33, total $528.80; Stripe keeps $14.33).
//
// Rate, fixed fee and "is the surcharge taxable" come from app_settings keys
//   card_surcharge_rate     percent, e.g. "2.7"   (default 2.7)
//   card_surcharge_fixed    dollars, e.g. "0.05"  (default 0.05)
//   card_surcharge_taxable  "true" | "false"      (default false)
// No rows exist by default — the code defaults below apply. Change them in
// Settings › Card surcharge.
import { TAX_RATE } from './jobFinancials.js';

export const SURCHARGE_DEFAULTS = Object.freeze({ rate: 0.027, fixed: 0.05, taxable: false });
export const SURCHARGE_SETTING_KEYS = Object.freeze(['card_surcharge_rate', 'card_surcharge_fixed', 'card_surcharge_taxable']);
// Guard rails against a bad saved setting.
const MAX_RATE = 0.04;
const MAX_FIXED = 1;

// settings: array of { key, value } rows, or a plain { key: value } object.
export function surchargeConfig(settings) {
  const get = (k) => Array.isArray(settings)
    ? settings.find(s => s?.key === k)?.value
    : settings?.[k];
  const rawRate = parseFloat(get('card_surcharge_rate'));
  let rate = SURCHARGE_DEFAULTS.rate;
  if (Number.isFinite(rawRate)) {
    const r = rawRate >= 0.1 ? rawRate / 100 : rawRate; // "2.7" or "0.027"
    if (r >= 0 && r <= MAX_RATE) rate = r;
  }
  const rawFixed = parseFloat(get('card_surcharge_fixed'));
  const fixed = Number.isFinite(rawFixed) && rawFixed >= 0 && rawFixed <= MAX_FIXED ? rawFixed : SURCHARGE_DEFAULTS.fixed;
  const t = String(get('card_surcharge_taxable') ?? '').trim().toLowerCase();
  const taxable = t === 'true' ? true : t === 'false' ? false : SURCHARGE_DEFAULTS.taxable;
  return { rate, fixed, taxable };
}

// A dollar amount, no % (the amount is the fee, not a percentage).
export function surchargeLabel() {
  return 'Credit card surcharge';
}

// Stripe's fee in cents on a charge of `chargeCents` (Stripe rounds to the cent).
export function processingFeeCents(chargeCents, config = SURCHARGE_DEFAULTS) {
  // toFixed: 0.027 x 1500 is 40.49999… in floating point; Stripe sees 40.5.
  return Math.round(Number((config.rate * chargeCents + Math.round(config.fixed * 100)).toFixed(6)));
}

// The surcharge itself in cents for a final amount owed of `baseCents` (after
// discounts and tax): Stripe's rounded fee on (base + surcharge), never more.
// The cap is checked against that rounded fee. Each extra cent of surcharge
// raises the fee by 0 or 1 cent, so scanning down from just above the
// estimate stops at the first s the fee covers, and there s equals the fee.
export function feeSurchargeCents(baseCents, config = SURCHARGE_DEFAULTS) {
  if (!(baseCents > 0)) return 0;
  const r = config.rate;
  const f = Math.round(config.fixed * 100);
  if (!(r > 0) && !(f > 0)) return 0;
  let s = Math.ceil((r * baseCents + f) / (1 - r)) + 2;
  while (s > 0 && s > processingFeeCents(baseCents + s, config)) s -= 1;
  return s;
}

// Surcharge in cents including its tax when the setting says it is taxable
// (default: not taxed).
export function surchargeCents(baseCents, config = SURCHARGE_DEFAULTS) {
  const s = feeSurchargeCents(baseCents, config);
  return config.taxable ? s + Math.round(s * TAX_RATE) : s;
}

// Owed before any surcharge: parts + labor + tax — what every view adds up.
export function owedCentsOf(invoice) {
  if (!invoice) return 0;
  const c = (n) => Math.round(Number(n || 0) * 100);
  return c(invoice.parts_total) + c(invoice.labor_total) + c(invoice.tax_amount);
}

// Partial payments (needs the invoices.amount_paid column — migration
// batch3-partial-payments.sql). Before that column exists the field is simply
// absent and everything below treats the invoice as nothing-paid-yet.
// amount_paid counts payments toward the owed amount only (never surcharge).
export const supportsPartialPayments = (invoice) => !!invoice && Object.prototype.hasOwnProperty.call(invoice, 'amount_paid');
export function amountPaidCentsOf(invoice) {
  if (!invoice || invoice.status === 'paid') return invoice?.status === 'paid' ? owedCentsOf(invoice) : 0;
  return Math.max(0, Math.round(Number(invoice.amount_paid || 0) * 100));
}
// What is still owed (before any card surcharge).
export function balanceCentsOf(invoice) {
  if (!invoice || invoice.status === 'paid') return 0;
  return Math.max(0, owedCentsOf(invoice) - amountPaidCentsOf(invoice));
}

// The invoice's surcharge in dollars on what is still owed (0 for $0,
// negative or fully paid invoices).
export function surchargeFor(invoice, config = SURCHARGE_DEFAULTS) {
  return surchargeCents(balanceCentsOf(invoice), config) / 100;
}

// When an invoice that already carries a surcharge is re-synced (parts or
// labor changed), recompute it from the new totals; never add one.
export function withResyncedSurcharge(patch, existing, config = SURCHARGE_DEFAULTS) {
  if (!(Number(existing?.surcharge_amount) > 0) || existing?.status === 'paid') return patch;
  return { ...patch, surcharge_amount: surchargeFor({ ...existing, ...patch }, config) };
}

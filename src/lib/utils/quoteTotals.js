// Quote totals use the SAME function as job/invoice totals (H-3 / B-01):
// quote lines are mapped onto job_parts/job_labor rows exactly as approval
// creates them, then computeJobFinancials adds NJ tax the same way.
import { computeJobFinancials } from './jobFinancials.js';
import { memberPrice, memberLabel, round2 } from './laborPricing.js';

export function quoteLinesAsJobRows(lines = []) {
  const parts = [];
  const labor = [];
  for (const l of lines) {
    if (l.type === 'part') parts.push({ total_price: Number(l.total_price) || 0, total_cost: 0, charge_for_part: true });
    else labor.push({ total_price: Number(l.total_price) || 0, total_cost: 0 });
  }
  return { parts, labor };
}

export function computeQuoteTotals(lines = []) {
  const { parts, labor } = quoteLinesAsJobRows(lines);
  const f = computeJobFinancials(parts, labor);
  return { subtotal: round2(f.subtotal), taxAmount: f.taxAmount, total: round2(f.total) };
}

// A Quote Builder line is kept with its catalog base price so it can be
// re-priced if the customer changes. Member pricing follows the job rules:
// catalog parts and labor/flat rates get the member price (to the cent);
// service agreements, discount rows and typed custom lines never do.
export function priceQuoteLine(line, memberDiscountRate = 1.0) {
  const discount = line.discountable && memberDiscountRate < 1.0;
  const qty = Number(line.quantity) || 1;
  const unit = discount ? memberPrice(line.base_unit_price, memberDiscountRate) : round2(line.base_unit_price);
  return {
    ...line,
    description: line.base_description + (discount ? ` (${memberLabel(memberDiscountRate)})` : ''),
    unit_price: unit,
    total_price: round2(unit * qty),
  };
}

export function memberSavings(lines = [], memberDiscountRate = 1.0) {
  if (memberDiscountRate >= 1.0) return 0;
  return round2(lines.reduce((s, l) => s + (l.discountable
    ? round2(l.base_unit_price * (Number(l.quantity) || 1)) - priceQuoteLine(l, memberDiscountRate).total_price
    : 0), 0));
}

// Service agreement plan key for an agreement catalog row (same name rule as
// JobDetail's addServiceAgreement): only air-cooled plans exist.
export function agreementTypeForRate(rate) {
  if (rate?.category !== 'service_agreements') return null;
  const name = String(rate.name || '').toLowerCase();
  if (!name.includes('air-cooled')) return null;
  return name.includes('semi') ? 'semi_annual_air_cooled' : 'annual_air_cooled';
}

export const TAX_RATE = 0.06625; // NJ sales tax

// Single source of truth for job financials — used by the Overview tab's live
// running total, the invoice (buildInvoiceData), and the discount auto-pricing
// on add, so none of them can ever drift apart. Discount lines are just
// job_labor rows with a negative total_price (per the discount feature);
// discountLines/discountTotal pull them out individually for display,
// laborGross is labor before discounts.
// What a job_parts row adds to the customer's bill. A "No Charge" line
// (charge_for_part === false) is hidden on the invoice, so it must never add
// to any total — even if an older edit left a non-zero total_price on the row.
export function partChargeTotal(p) {
  if (!p || p.charge_for_part === false) return 0;
  return p.total_price || 0;
}

export function computeJobFinancials(parts, labor) {
  const partsCost = parts.reduce((s, p) => s + (p.total_cost || 0), 0);
  const partsTotal = parts.reduce((s, p) => s + partChargeTotal(p), 0);
  const laborCost = labor.reduce((s, l) => s + (l.total_cost || 0), 0);
  const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0);
  const discountLines = labor
    .filter(l => (l.total_price || 0) < 0)
    .map(l => ({ description: l.description, amount: l.total_price || 0 }));
  const discountTotal = discountLines.reduce((s, d) => s + d.amount, 0);
  const laborGross = laborTotal - discountTotal;
  // NJ sales tax is on the whole subtotal: parts, labor, flat rates AND the
  // Service Agreement lines (all 4 agreement catalog items are taxable — owner
  // decision, Run 7). Agreement lines are job_labor rows, so they are in
  // laborTotal. Nothing is tax-exempt; locked by src/test/agreementTax.test.js.
  const subtotal = partsTotal + laborTotal;
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = subtotal + taxAmount;
  const cost = partsCost + laborCost;
  const profit = subtotal - cost;
  return { partsCost, partsTotal, laborCost, laborTotal, laborGross, discountLines, discountTotal, subtotal, taxAmount, total, cost, profit };
}

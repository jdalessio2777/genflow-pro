export const TAX_RATE = 0.06625; // NJ sales tax

// Single source of truth for job financials — used by the Overview tab's live
// running total, the invoice (buildInvoiceData), and the discount auto-pricing
// on add, so none of them can ever drift apart. Discount lines are just
// job_labor rows with a negative total_price (per the discount feature);
// discountLines/discountTotal pull them out individually for display,
// laborGross is labor before discounts.
export function computeJobFinancials(parts, labor) {
  const partsCost = parts.reduce((s, p) => s + (p.total_cost || 0), 0);
  const partsTotal = parts.reduce((s, p) => s + (p.total_price || 0), 0);
  const laborCost = labor.reduce((s, l) => s + (l.total_cost || 0), 0);
  const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0);
  const discountLines = labor
    .filter(l => (l.total_price || 0) < 0)
    .map(l => ({ description: l.description, amount: l.total_price || 0 }));
  const discountTotal = discountLines.reduce((s, d) => s + d.amount, 0);
  const laborGross = laborTotal - discountTotal;
  const subtotal = partsTotal + laborTotal;
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = subtotal + taxAmount;
  const cost = partsCost + laborCost;
  const profit = subtotal - cost;
  return { partsCost, partsTotal, laborCost, laborTotal, laborGross, discountLines, discountTotal, subtotal, taxAmount, total, cost, profit };
}

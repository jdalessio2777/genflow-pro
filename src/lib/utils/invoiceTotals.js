// Plain ESM, no aliases/browser deps — imported by both the client (src/) and
// Vercel functions (api/).

// The invoice's final total in integer cents: parts + labor + tax + card
// surcharge — exactly what every invoice view/email renders as "Total".
// Stored columns are numeric dollars (floats in JS), so compare in cents.
export function invoiceTotalCents(invoice) {
  if (!invoice) return 0;
  const dollars =
    Number(invoice.parts_total || 0) +
    Number(invoice.labor_total || 0) +
    Number(invoice.tax_amount || 0) +
    Number(invoice.surcharge_amount || 0);
  return Math.round(dollars * 100);
}

// True ONLY when the final total is exactly $0.00. Negative totals (a credit
// larger than the charges) are NOT $0 and keep the normal paid/unpaid path.
export function isZeroDollarInvoice(invoice) {
  return !!invoice && invoiceTotalCents(invoice) === 0;
}

// Same guard for live job data (parts/labor rows) before an invoice snapshot
// exists or while the stored one may be stale.
export function isZeroDollarJob(financials) {
  const cents = Math.round(Number(financials?.total || 0) * 100);
  return cents === 0;
}

// Customer-facing invoice line items from job_parts/job_labor rows.
// charge_for_part:false parts are normally hidden from the customer (they're
// $0 by design). On a $0 invoice they ARE shown, flagged no_charge so the
// template renders "No charge" — otherwise a free visit's summary would list
// nothing that was done. For any invoice > $0 the output is identical to the
// historical buildInvoiceData() output.
export function buildInvoiceLineItems(parts, labor, { includeNoChargeParts = false } = {}) {
  return [
    ...parts
      .filter(p => includeNoChargeParts || p.charge_for_part !== false)
      .map(p => (p.charge_for_part === false
        ? { type: "part", description: p.name, quantity: p.quantity, unit_price: 0, total: 0, no_charge: true }
        : { type: "part", description: p.name, quantity: p.quantity, unit_price: p.price, total: p.total_price })),
    ...labor.map(l => ({ type: "labor", description: l.description, quantity: l.is_flat_rate ? 1 : l.hours, unit_price: l.is_flat_rate ? l.flat_rate_amount : l.rate, total: l.total_price })),
  ];
}

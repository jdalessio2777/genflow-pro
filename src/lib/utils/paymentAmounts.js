// Card-payment amounts, decided on the server from the invoice row — never
// from the request. Plain ESM, no aliases: used by api/create-payment-intent,
// api/update-payment-intent, api/stripe-webhook and the client modal.

export const SURCHARGE_RATE = 0.03;

const cents = (n) => Math.round(Number(n || 0) * 100);

// What the customer owes before any card surcharge: parts + labor + tax, the
// same components every invoice view renders as the total.
export function owedCents(invoice) {
  if (!invoice) return 0;
  return cents(invoice.parts_total) + cents(invoice.labor_total) + cents(invoice.tax_amount);
}

// Surcharge policy (unchanged): 3% on CREDIT cards only. Debit, prepaid and
// unknown funding are never surcharged.
export function surchargeCentsFor(baseCents, funding) {
  return funding === 'credit' ? Math.round(baseCents * SURCHARGE_RATE) : 0;
}

// The charge for an invoice. Refuses paid invoices, $0/negative amounts, and
// invoices whose stored `total` disagrees with its parts/labor/tax (stale
// snapshot — reopening the job re-syncs it) rather than guessing.
export function computeCharge(invoice, funding = null) {
  if (!invoice) return { ok: false, status: 404, error: 'Invoice not found' };
  if (invoice.status === 'paid') return { ok: false, status: 400, error: 'Invoice is already paid' };
  const baseCents = owedCents(invoice);
  if (baseCents <= 0) return { ok: false, status: 400, error: 'Invoice has no amount due' };
  if (Math.abs(cents(invoice.total) - baseCents) > 1) {
    return { ok: false, status: 409, error: 'Invoice total is out of date. Open the job to refresh it, then try again.' };
  }
  const surchargeCents = surchargeCentsFor(baseCents, funding);
  return { ok: true, baseCents, surchargeCents, totalCents: baseCents + surchargeCents };
}

// The client may still send its own surcharge figure (older app versions).
// It is never used for the amount, but a negative or non-numeric value is a
// tampered request and is rejected outright.
export function validateClientSurcharge(value) {
  if (value === undefined || value === null) return { ok: true };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { ok: false, status: 400, error: 'Invalid surcharge' };
  return { ok: true };
}

// Webhook: mark paid only if Stripe actually received at least what's owed.
export function paymentCoversInvoice(amountReceivedCents, invoice) {
  const base = owedCents(invoice);
  return base > 0 && Number(amountReceivedCents) >= base;
}

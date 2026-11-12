// Stripe processing fees → expenses (Run 13, Part F).
//
// Called from the existing Stripe webhook (api/stripe-webhook.js) for EVERY
// successful card payment: in-app payments, which carry our invoice_id, and
// Stripe App / Dashboard charges, which carry nothing of ours. The fee is the
// exact `fee` on the charge's balance transaction, never an estimate. If
// Stripe hasn't attached the balance transaction yet, we retry a few times
// and then leave it for the catch-up (scripts/stripe/fee-catchup.mjs).
//
// The database does the rest in one function, public.record_stripe_fee():
// UNIQUE stripe_charge_id (a fee can never be recorded twice), the
// "Card processing fees" category, and linking to an invoice only when
// exactly one card-paid invoice matches the amount and day.

export const FEE_RETRY_DELAYS_MS = [1000, 2000, 4000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cents → dollars, exact to the cent.
export const centsToDollars = (c) => Math.round(Number(c)) / 100;

// The charge id on a PaymentIntent (string or expanded object).
export function chargeIdOf(pi) {
  const c = pi?.latest_charge;
  if (!c) return null;
  return typeof c === 'string' ? c : c.id || null;
}

// The fee in cents from a charge with balance_transaction expanded, or null.
export function feeCentsOf(charge) {
  const bt = charge?.balance_transaction;
  if (!bt || typeof bt !== 'object') return null;
  return Number.isFinite(bt.fee) ? bt.fee : null;
}

// Fetch the charge with its balance transaction, retrying while the fee is missing.
export async function fetchChargeWithFee(stripe, chargeId, { delays = FEE_RETRY_DELAYS_MS, wait = sleep } = {}) {
  let charge = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await wait(delays[attempt - 1]);
    charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
    if (feeCentsOf(charge) !== null) return { charge, feeCents: feeCentsOf(charge) };
  }
  return { charge, feeCents: null };
}

// Record the fee for one successful PaymentIntent. Returns what happened; throws only
// when the database call fails (so the webhook answers 500 and Stripe retries).
export async function recordFeeForPaymentIntent({ stripe, supabase, pi, log = console, retry } = {}) {
  const chargeId = chargeIdOf(pi);
  if (!chargeId) {
    log.warn('[stripe-fee] no charge on payment intent, left for catch-up:', pi?.id);
    return { status: 'no_charge' };
  }
  const { charge, feeCents } = await fetchChargeWithFee(stripe, chargeId, retry);
  if (feeCents === null) {
    log.warn('[stripe-fee] fee not available after retries, left for catch-up:', chargeId);
    return { status: 'fee_missing', chargeId };
  }
  if (charge.status !== 'succeeded' || charge.paid !== true) {
    return { status: 'not_paid', chargeId };
  }
  const { data, error } = await supabase.rpc('record_stripe_fee', {
    p_charge_id: chargeId,
    p_charge_amount: centsToDollars(charge.amount),
    p_fee: centsToDollars(feeCents),
    p_paid_at: new Date(charge.created * 1000).toISOString(),
    p_invoice_id: pi.metadata?.invoice_id || null,
  });
  if (error) throw new Error(`record_stripe_fee failed: ${error.message}`);
  log.log('[stripe-fee]', chargeId, data);
  return { status: data, chargeId };
}

// charge.refunded: note the refund on the fee expense; never delete it.
export async function noteRefund({ supabase, charge, log = console }) {
  const { data, error } = await supabase.rpc('note_stripe_refund', {
    p_charge_id: charge.id,
    p_refunded_amount: centsToDollars(charge.amount_refunded || 0),
    p_refunded_at: new Date().toISOString(),
  });
  if (error) throw new Error(`note_stripe_refund failed: ${error.message}`);
  log.log('[stripe-fee] refund noted', charge.id, data);
  return data;
}

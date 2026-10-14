import { createClient } from '@supabase/supabase-js';
import { applyCors, isAllowedOrigin, requireStaff } from './_lib/staffAuth.js';
import { computeCharge, validateClientSurcharge } from '../src/lib/utils/paymentAmounts.js';
import { surchargeConfig } from '../src/lib/utils/surcharge.js';

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// Staff-only. Locks the final amount before the card is charged: the server
// reads the card's funding type from Stripe (credit → 3% surcharge; debit,
// prepaid, unknown → none) and the base from the invoice row. Any amount or
// surcharge in the request is ignored; a negative/non-numeric surcharge is
// rejected as tampering.
export default async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(isAllowedOrigin(req.headers.origin) ? 204 : 403).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed' });

  const auth = await requireStaff(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { payment_intent_id, invoice_id, payment_method_id, surcharge_amount } = await readJsonBody(req);

  if (!payment_intent_id || !invoice_id || !payment_method_id) {
    return res.status(400).json({ error: 'payment_intent_id, invoice_id, and payment_method_id required' });
  }
  const clientCheck = validateClientSurcharge(surcharge_amount);
  if (!clientCheck.ok) return res.status(clientCheck.status).json({ error: clientCheck.error });

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, total, parts_total, labor_total, tax_amount, status')
      .eq('id', invoice_id)
      .single();

    if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    });

    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (pi.metadata?.invoice_id !== invoice_id) {
      return res.status(403).json({ error: 'PaymentIntent does not match invoice' });
    }
    if (pi.status === 'succeeded' || pi.status === 'canceled') {
      return res.status(400).json({ error: `Payment already ${pi.status}` });
    }

    const pm = await stripe.paymentMethods.retrieve(payment_method_id);
    const funding = pm?.card?.funding || 'unknown';

    // Same rate/taxable settings as the invoice screen's surcharge button.
    const { data: settingsRows } = await supabase
      .from('app_settings').select('key, value')
      .in('key', ['card_surcharge_rate', 'card_surcharge_taxable']);
    const charge = computeCharge(invoice, funding, surchargeConfig(settingsRows || []));
    if (!charge.ok) return res.status(charge.status).json({ error: charge.error });

    // Pin the card that was checked, so the amount matches the card charged.
    await stripe.paymentIntents.update(payment_intent_id, {
      amount: charge.totalCents,
      payment_method: payment_method_id,
      metadata: {
        surcharge_amount: (charge.surchargeCents / 100).toFixed(2),
        base_amount: (charge.baseCents / 100).toFixed(2),
        card_funding: funding,
      },
    });

    return res.status(200).json({
      ok: true,
      funding,
      surcharge: charge.surchargeCents / 100,
      total: charge.totalCents / 100,
    });
  } catch (err) {
    console.error('[update-payment-intent]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

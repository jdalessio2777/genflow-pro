import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { payment_intent_id, invoice_id, surcharge_amount } = await readJsonBody(req);

  if (!payment_intent_id || !invoice_id || surcharge_amount === undefined) {
    return res.status(400).json({ error: 'payment_intent_id, invoice_id, and surcharge_amount required' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Re-fetch invoice server-side — never trust client-sent amounts
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, total')
      .eq('id', invoice_id)
      .single();

    if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Verify the PaymentIntent belongs to this invoice before updating
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (pi.metadata?.invoice_id !== invoice_id) {
      return res.status(403).json({ error: 'PaymentIntent does not match invoice' });
    }

    // Recompute surcharge server-side (3% of base, capped at client's requested surcharge)
    const maxSurcharge = Math.round(invoice.total * 0.03 * 100) / 100;
    const appliedSurcharge = Math.min(Number(surcharge_amount), maxSurcharge);
    const newAmountCents = Math.round((invoice.total + appliedSurcharge) * 100);

    await stripe.paymentIntents.update(payment_intent_id, {
      amount: newAmountCents,
      metadata: { surcharge_amount: String(appliedSurcharge) },
    });

    return res.status(200).json({ ok: true, surcharge: appliedSurcharge, total: invoice.total + appliedSurcharge });
  } catch (err) {
    console.error('[update-payment-intent]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

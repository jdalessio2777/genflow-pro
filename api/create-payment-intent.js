import { createClient } from '@supabase/supabase-js';
import { applyCors, isAllowedOrigin, requireStaff } from './_lib/staffAuth.js';
import { computeCharge } from '../src/lib/utils/paymentAmounts.js';

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

// Staff-only (the invoice screen's "Charge Card Online"). The amount comes
// from the invoice row; nothing amount-related is read from the request.
export default async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(isAllowedOrigin(req.headers.origin) ? 204 : 403).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed' });

  const auth = await requireStaff(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { invoice_id } = await readJsonBody(req);
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id required' });

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, total, parts_total, labor_total, tax_amount, customer_name, invoice_number, status')
      .eq('id', invoice_id)
      .single();

    if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });
    const charge = computeCharge(invoice);
    if (!charge.ok) return res.status(charge.status).json({ error: charge.error });

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: charge.baseCents,
      currency: 'usd',
      payment_method_types: ['card'],
      payment_method_options: {
        card: { request_three_d_secure: 'automatic' },
      },
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number || '',
        customer_name: invoice.customer_name || '',
        base_amount: (charge.baseCents / 100).toFixed(2),
        tax_amount: String(invoice.tax_amount || 0),
        created_by: auth.user.email,
      },
    });

    return res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      base_amount: charge.baseCents / 100,
    });
  } catch (err) {
    console.error('[create-payment-intent]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

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
  console.log('[create-payment-intent] handler invoked', req.method);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { invoice_id } = await readJsonBody(req);
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id required' });

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, total, customer_name, invoice_number, status')
      .eq('id', invoice_id)
      .single();

    if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice is already paid' });
    if (!invoice.total || invoice.total <= 0) return res.status(400).json({ error: 'Invoice has no amount due' });

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const baseAmountCents = Math.round(invoice.total * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: baseAmountCents,
      currency: 'usd',
      capture_method: 'automatic',
      automatic_payment_methods: { enabled: true },
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number || '',
        customer_name: invoice.customer_name || '',
        base_amount: String(invoice.total),
      },
    });

    return res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      base_amount: invoice.total,
    });
  } catch (err) {
    console.error('[create-payment-intent]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

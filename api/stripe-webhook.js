import { createClient } from '@supabase/supabase-js';

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  console.log('[stripe-webhook] handler invoked', req.method);
  if (req.method !== 'POST') return res.status(405).end();

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const invoiceId = pi.metadata?.invoice_id;

    if (!invoiceId) {
      console.warn('[stripe-webhook] payment_intent.succeeded: no invoice_id in metadata, pi:', pi.id);
      return res.status(200).json({ received: true });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('id', invoiceId)
      .single();

    if (!invoice) {
      console.warn('[stripe-webhook] invoice not found:', invoiceId);
      return res.status(200).json({ received: true });
    }

    if (invoice.status === 'paid') {
      return res.status(200).json({ received: true, skipped: 'already_paid' });
    }

    const surchargeAmount = parseFloat(pi.metadata?.surcharge_amount || '0');

    await supabase.from('invoices').update({
      status: 'paid',
      payment_method: 'stripe',
      paid_date: new Date().toISOString(),
      stripe_payment_intent_id: pi.id,
      surcharge_amount: surchargeAmount,
    }).eq('id', invoiceId);

    console.log('[stripe-webhook] invoice marked paid via webhook:', invoiceId, 'pi:', pi.id);
  }

  return res.status(200).json({ received: true });
}

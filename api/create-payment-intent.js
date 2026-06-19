export default async function handler(req, res) {
  console.log('HANDLER START');

  try {
    console.log('KEY:', !!process.env.STRIPE_SECRET_KEY);
    console.log('KEY LENGTH:', (process.env.STRIPE_SECRET_KEY || '').length);
    console.log('KEY PREFIX:', (process.env.STRIPE_SECRET_KEY || '').slice(0, 7));

    const Stripe = (await import('stripe')).default;
    console.log('STRIPE IMPORTED');

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log('STRIPE INITIALIZED');

    const pi = await stripe.paymentIntents.create({
      amount: 10000,
      currency: 'usd',
    });
    console.log('PI CREATED:', pi.id);

    return res.status(200).json({ ok: true, id: pi.id });

  } catch (err) {
    console.log('ERROR TYPE:', err.constructor.name);
    console.log('ERROR MESSAGE:', err.message);
    console.log('ERROR CODE:', err.code);
    return res.status(500).json({ error: err.message });
  }
}

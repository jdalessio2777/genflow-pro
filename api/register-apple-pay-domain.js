// One-time endpoint: registers genflow-pro.vercel.app with Stripe Apple Pay.
// Call once: GET /api/register-apple-pay-domain?secret=<CRON_SECRET>
// Safe to leave in place — no-ops if domain is already registered.
export default async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    });

    const domain = await stripe.applePayDomains.create({
      domain_name: 'genflow-pro.vercel.app',
    });

    return res.status(200).json({ ok: true, domain });
  } catch (err) {
    // "already exists" is not a failure
    if (err.message?.includes('already')) {
      return res.status(200).json({ ok: true, note: err.message });
    }
    console.error('[register-apple-pay-domain]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

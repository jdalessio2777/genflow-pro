import { createClient } from '@supabase/supabase-js';
import { renewalEmailHTML, renewalEmailSubject } from '../src/lib/emailTemplates/renewalEmail.js';

const INTERNAL_EMAIL = 'contact@genshieldservice.com';
const FROM = 'GenShield <contact@genshieldservice.com>';

function planLabel(plan) {
  return plan === 'semi_annual' ? 'Semi-Annual' : 'Annual';
}

async function sendEmail({ to, subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Resend error ${resp.status}: ${JSON.stringify(err)}`);
  }
  return resp.json();
}

function internalAlertHTML({ customer, days }) {
  const expired = days <= 0;
  const expiryStr = new Date(customer.membership_expiry).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const statusLine = expired
    ? `<strong style="color:#991b1b;">EXPIRED ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago</strong>`
    : `Expires in <strong>${days} day${days !== 1 ? 's' : ''}</strong>`;

  return `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
  <div style="background:#1a1a1c;padding:16px 20px;border-radius:6px 6px 0 0;">
    <p style="margin:0;color:#fff;font-size:15px;font-weight:700;">
      Gen<span style="color:#D32C2C;">Shield</span> — Renewal Alert
    </p>
  </div>
  <div style="background:#f9f9f9;padding:18px 20px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 6px 6px;">
    <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#333;width:100%;">
      <tr><td style="padding:4px 0;width:130px;color:#888;">Customer</td><td style="padding:4px 0;font-weight:700;">${customer.name}</td></tr>
      <tr><td style="padding:4px 0;color:#888;">Plan</td><td style="padding:4px 0;">${planLabel(customer.membership_plan)} Protection Plan</td></tr>
      <tr><td style="padding:4px 0;color:#888;">Expiry Date</td><td style="padding:4px 0;">${expiryStr}</td></tr>
      <tr><td style="padding:4px 0;color:#888;">Status</td><td style="padding:4px 0;">${statusLine}</td></tr>
      ${customer.phone ? `<tr><td style="padding:4px 0;color:#888;">Phone</td><td style="padding:4px 0;">${customer.phone}</td></tr>` : ''}
      ${customer.email ? `<tr><td style="padding:4px 0;color:#888;">Email</td><td style="padding:4px 0;">${customer.email}</td></tr>` : ''}
    </table>
    <p style="margin:14px 0 0;font-size:12px;color:#888;">Call or email to schedule renewal.</p>
  </div>
</div>`;
}

export default async function handler(req, res) {
  const isVercelCron =
    !!req.headers['x-vercel-cron-authorization'] ||
    (process.env.CRON_SECRET && req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`);
  const isManual =
    !!process.env.REPORT_SECRET &&
    req.headers['x-report-secret'] === process.env.REPORT_SECRET;

  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const stats = { processed: 0, reminded_30: 0, reminded_7: 0, expired_alerts: 0, errors: [] };

  try {
    const now = new Date();
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    today.setHours(0, 0, 0, 0);

    const d7  = new Date(today); d7.setDate(today.getDate() + 7);
    const d30 = new Date(today); d30.setDate(today.getDate() + 30);
    const d14ago = new Date(today); d14ago.setDate(today.getDate() - 14);

    console.log(`[renewals] running at ${today.toISOString()} ET`);

    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, name, email, phone, membership_plan, membership_expiry, renewal_reminder_7_sent_at, renewal_reminder_30_sent_at, renewal_expired_reminder_sent_at')
      .eq('membership_signed', true)
      .not('membership_expiry', 'is', null);

    if (error) throw new Error(`customers query failed: ${error.message}`);

    console.log(`[renewals] ${customers.length} active members to check`);

    for (const c of customers) {
      stats.processed++;
      const expiry = new Date(c.membership_expiry);
      const days = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

      try {
        // ── 7-day reminder ────────────────────────────────────────────────────
        if (days >= 0 && days <= 7 && !c.renewal_reminder_7_sent_at) {
          console.log(`[renewals] 7-day: ${c.name} (${days}d)`);
          if (c.email) {
            await sendEmail({
              to: c.email,
              subject: renewalEmailSubject(),
              html: renewalEmailHTML({
                customerName: c.name,
                plan: planLabel(c.membership_plan),
                expiryDate: c.membership_expiry,
              }),
            });
          }
          await sendEmail({
            to: INTERNAL_EMAIL,
            subject: `Renewal Alert — ${c.name} (${days} day${days !== 1 ? 's' : ''})`,
            html: internalAlertHTML({ customer: c, days }),
          });
          await supabase.from('customers').update({ renewal_reminder_7_sent_at: now.toISOString() }).eq('id', c.id);
          stats.reminded_7++;

        // ── 30-day reminder ───────────────────────────────────────────────────
        } else if (days > 7 && days <= 30 && !c.renewal_reminder_30_sent_at) {
          console.log(`[renewals] 30-day: ${c.name} (${days}d)`);
          if (c.email) {
            await sendEmail({
              to: c.email,
              subject: renewalEmailSubject(),
              html: renewalEmailHTML({
                customerName: c.name,
                plan: planLabel(c.membership_plan),
                expiryDate: c.membership_expiry,
              }),
            });
          }
          await sendEmail({
            to: INTERNAL_EMAIL,
            subject: `Renewal Alert — ${c.name} (${days} days)`,
            html: internalAlertHTML({ customer: c, days }),
          });
          await supabase.from('customers').update({ renewal_reminder_30_sent_at: now.toISOString() }).eq('id', c.id);
          stats.reminded_30++;

        // ── expired (within last 14 days) — internal only ─────────────────────
        } else if (days < 0 && days >= -14 && !c.renewal_expired_reminder_sent_at) {
          console.log(`[renewals] expired: ${c.name} (${Math.abs(days)}d ago)`);
          await sendEmail({
            to: INTERNAL_EMAIL,
            subject: `Renewal Alert — ${c.name} (EXPIRED ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago)`,
            html: internalAlertHTML({ customer: c, days }),
          });
          await supabase.from('customers').update({ renewal_expired_reminder_sent_at: now.toISOString() }).eq('id', c.id);
          stats.expired_alerts++;
        }
      } catch (err) {
        console.error(`[renewals] error for ${c.name}:`, err.message);
        stats.errors.push({ customer: c.name, error: err.message });
      }
    }

    console.log('[renewals] done:', stats);
    return res.status(200).json({ ok: true, ...stats });

  } catch (err) {
    console.error('[renewals] fatal:', err.message);
    return res.status(500).json({ error: err.message, ...stats });
  }
}

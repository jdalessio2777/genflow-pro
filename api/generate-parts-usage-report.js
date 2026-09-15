import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './lib/sendEmail.js';

// ─── period helper ─────────────────────────────────────────────────────────
// "Past 7 days" is a literal rolling window ending at send time — NOT the
// prior-complete-Sun–Sat-week logic generate-report.js uses (that helper
// assumes the cron fires Sunday *morning*, right after the week just ended;
// this report fires Sunday *evening*, so "today" is still mostly in range
// and a rolling 7-day-back window is the correct read of "past 7 days").
function getPastWeekRange(now = new Date()) {
  const end = now;
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function periodLabel(start, end) {
  const o = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', o)} – ${end.toLocaleDateString('en-US', o)}`;
}

function fmtMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

// ─── data ───────────────────────────────────────────────────────────────────

async function fetchUsage(supabase, start, end) {
  const { data, error } = await supabase
    .from('parts_usage_log')
    .select('part_id, quantity, used_at, parts(name, part_number, in_stock, first_managed_at, default_price)')
    .gte('used_at', start.toISOString())
    .lte('used_at', end.toISOString());
  if (error) throw error;
  return data ?? [];
}

function aggregateByPart(rows) {
  const byPart = new Map();
  for (const row of rows) {
    if (!row.part_id || !row.parts) continue; // FK was ON DELETE SET NULL — skip orphaned rows
    const existing = byPart.get(row.part_id);
    if (existing) {
      existing.quantity += row.quantity || 0;
    } else {
      byPart.set(row.part_id, {
        name: row.parts.name,
        part_number: row.parts.part_number,
        in_stock: row.parts.in_stock,
        first_managed_at: row.parts.first_managed_at,
        default_price: row.parts.default_price,
        quantity: row.quantity || 0,
      });
    }
  }
  return [...byPart.values()].sort((a, b) => b.quantity - a.quantity);
}

// ─── email ──────────────────────────────────────────────────────────────────

function stockBadge(part) {
  // Respect the first_managed_at exclusion: never show a status badge for a
  // legacy/never-actively-managed part, even if it happens to show up here.
  if (!part.first_managed_at) return '';
  const isOut = part.in_stock <= 0;
  const isLow = part.in_stock > 0 && part.in_stock <= 2;
  if (isOut) return `<span style="color:#991b1b;font-weight:700;">OUT (${part.in_stock})</span>`;
  if (isLow) return `<span style="color:#9a3412;font-weight:700;">LOW (${part.in_stock})</span>`;
  return `<span style="color:#166534;">${part.in_stock} in stock</span>`;
}

function buildHTML(usage, label) {
  const rows = usage.length
    ? usage.map(p => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e5e5e5;">${p.name}${p.part_number ? ` <span style="color:#999;">#${p.part_number}</span>` : ''}</td>
        <td style="padding:6px 10px;border:1px solid #e5e5e5;text-align:center;font-weight:700;">${p.quantity}</td>
        <td style="padding:6px 10px;border:1px solid #e5e5e5;text-align:right;">${stockBadge(p)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#888;">No parts logged as used this week.</td></tr>`;

  return `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#1a1a1c;padding:16px 20px;border-radius:6px 6px 0 0;">
    <p style="margin:0;color:#fff;font-size:15px;font-weight:700;">Gen<span style="color:#D32C2C;">Shield</span> &mdash; Weekly Parts Usage</p>
    <p style="margin:2px 0 0;color:#ccc;font-size:12px;">${label}</p>
  </div>
  <div style="background:#f9f9f9;padding:18px 20px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 6px 6px;">
    <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr style="background:#fff;">
        <td style="padding:6px 10px;border:1px solid #e5e5e5;font-weight:700;">Part</td>
        <td style="padding:6px 10px;border:1px solid #e5e5e5;font-weight:700;text-align:center;">Qty Used</td>
        <td style="padding:6px 10px;border:1px solid #e5e5e5;font-weight:700;text-align:right;">Current Stock</td>
      </tr>
      ${rows}
    </table>
    <p style="margin:14px 0 0;font-size:11px;color:#aaa;">Stock status only shown for parts that have been actively managed (a real count or price entered) — legacy uncounted parts are omitted from the stock column even if used.</p>
  </div>
</div>`;
}

// ─── handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Same pattern as generate-report.js: Vercel cron auth requires the real
  // CRON_SECRET bearer token (x-vercel-cron-authorization alone is just a
  // marker, not a verified signature). Manual trigger via x-report-secret.
  const isVercelCron =
    !!process.env.CRON_SECRET &&
    req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const isManual =
    !!process.env.REPORT_SECRET &&
    req.headers['x-report-secret'] === process.env.REPORT_SECRET;

  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { start, end } = getPastWeekRange();
    const label = periodLabel(start, end);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const rows = await fetchUsage(supabase, start, end);
    const usage = aggregateByPart(rows);

    console.log(`[parts-usage-report] ${label} | ${rows.length} log rows | ${usage.length} distinct parts`);

    const html = buildHTML(usage, label);
    const result = await sendEmail({
      from: 'GenShield Reports <contact@genshieldservice.com>',
      to: 'contact@genshieldservice.com',
      subject: `GenShield Weekly Parts Usage — ${label}`,
      html,
      internal: true,
    });

    return res.status(200).json({ ok: true, id: result.id, partsCounted: usage.length, logRows: rows.length });
  } catch (err) {
    console.error('[parts-usage-report]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

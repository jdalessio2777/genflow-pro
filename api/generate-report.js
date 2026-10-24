import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './_lib/sendEmail.js';
import { fetchReportData, buildReport, buildWorkbook, buildReportHtml, REPORT_RECIPIENTS } from './_lib/financeReport.js';

// Weekly (Sunday 12:00 UTC cron) / monthly financial report email + Excel.
// The data, workbook and HTML live in api/_lib/financeReport.js.

// ─── handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Vercel cron: Authorization: Bearer <CRON_SECRET>, per
  // https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
  // (x-vercel-cron-authorization is just a marker header, not a verified
  // signature - do not trust it on its own)
  const isVercelCron =
    !!process.env.CRON_SECRET &&
    req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;

  // Manual trigger: x-report-secret header must match REPORT_SECRET env var
  const isManual =
    !!process.env.REPORT_SECRET &&
    req.headers['x-report-secret'] === process.env.REPORT_SECRET;

  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const type = String(req.query.type || 'monthly').toLowerCase();
  if (type !== 'weekly' && type !== 'monthly') {
    return res.status(400).json({ error: 'type must be "weekly" or "monthly"' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Run 9 (D3): numbers from the shared finance module (api/_lib/financeReport.js
    // -> src/lib/finance/core.js), periods in New York time.
    const data = await fetchReportData(supabase);
    const report = buildReport(data, type);
    console.log(`[report] ${type} | ${report.range.label} | ${report.f.paidInvoices} paid, ${report.f.warrantyClaims} warranty, ${report.f.expenseCount} expenses, ${report.f.jobsCompleted} jobs`);

    const buffer = Buffer.from(await buildWorkbook(report));
    console.log(`[report] workbook: ${buffer.length} bytes`);

    await sendEmail({
      from: 'GenShield Reports <contact@genshieldservice.com>',
      to: REPORT_RECIPIENTS,
      subject: report.subject,
      html: buildReportHtml(report),
      attachments: [{ filename: report.filename, content: buffer.toString('base64') }],
      internal: true,
    });
    console.log('[report] email sent via Resend');

    return res.status(200).json({
      ok: true,
      period: report.range.label,
      filename: report.filename,
      paid_invoices: report.f.paidInvoices,
      warranty_claims: report.f.warrantyClaims,
      expenses: report.f.expenseCount,
      revenue: report.f.revenue,
      net_profit: report.f.net,
    });
  } catch (err) {
    console.error('[report] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
